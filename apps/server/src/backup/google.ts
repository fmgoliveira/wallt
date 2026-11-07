import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { decrypt, encrypt } from "../auth/crypto";
import type { BackupStorage } from "./storage";

export type FetchLike = typeof fetch;
export type GoogleClient = { clientId: string; clientSecret: string };

const SCOPE = "https://www.googleapis.com/auth/drive.file";
const FOLDER_NAME = "Wallt backups";
const FOLDER_MIME = "application/vnd.google-apps.folder";

/** The refresh token was revoked or expired: `drive-auth` has to be run again. */
export class DriveAuthError extends Error {}

async function apiError(what: string, res: Response): Promise<Error> {
  let detail = "";
  try {
    const body = (await res.json()) as {
      error?: { message?: string } | string;
      error_description?: string;
    };
    detail = typeof body.error === "string" ? body.error : (body.error?.message ?? "");
  } catch {
    // not JSON; the status is enough
  }
  return new Error(`${what} failed (${res.status}${detail ? `: ${detail.slice(0, 200)}` : ""})`);
}

const form = (data: Record<string, string>) => ({
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams(data).toString(),
});

// ---------------------------------------------------------------- OAuth (device flow)

export type DeviceCode = {
  deviceCode: string;
  userCode: string;
  verificationUrl: string;
  expiresIn: number;
  interval: number;
};

export async function startDeviceFlow(g: GoogleClient, f: FetchLike = fetch): Promise<DeviceCode> {
  const res = await f(
    "https://oauth2.googleapis.com/device/code",
    form({ client_id: g.clientId, scope: SCOPE }),
  );
  if (!res.ok) throw await apiError("Starting Google authorisation", res);
  const b = (await res.json()) as {
    device_code: string;
    user_code: string;
    verification_url: string;
    expires_in: number;
    interval?: number;
  };
  return {
    deviceCode: b.device_code,
    userCode: b.user_code,
    verificationUrl: b.verification_url,
    expiresIn: b.expires_in,
    interval: b.interval ?? 5,
  };
}

/** Polls until the user approves; returns the long-lived refresh token. */
export async function pollDeviceFlow(
  g: GoogleClient,
  device: DeviceCode,
  opts: { fetch?: FetchLike; sleep?: (ms: number) => Promise<void>; now?: () => number } = {},
): Promise<{ refreshToken: string }> {
  const f = opts.fetch ?? fetch;
  const sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const now = opts.now ?? Date.now;
  const deadline = now() + device.expiresIn * 1000;
  let interval = device.interval;
  while (now() < deadline) {
    await sleep(interval * 1000);
    const res = await f(
      "https://oauth2.googleapis.com/token",
      form({
        client_id: g.clientId,
        client_secret: g.clientSecret,
        device_code: device.deviceCode,
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      }),
    );
    const body = (await res.json()) as { error?: string; refresh_token?: string };
    if (res.ok && body.refresh_token) return { refreshToken: body.refresh_token };
    if (body.error === "authorization_pending") continue;
    if (body.error === "slow_down") interval += 5;
    else throw new Error(`Google authorisation failed: ${body.error ?? res.status}`);
  }
  throw new Error("Google authorisation timed out; run drive-auth again");
}

// ---------------------------------------------------------------- encrypted token store

export type DriveSecrets = { refreshToken: string; folderId?: string };

/** `<dataDir>/secrets/gdrive.enc`: AES-256-GCM under a key derived from ENCRYPTION_KEY. */
export function createSecretStore(dataDir: string, encKey: Buffer) {
  const file = join(dataDir, "secrets", "gdrive.enc");
  return {
    read(): DriveSecrets | null {
      if (!existsSync(file)) return null;
      return JSON.parse(decrypt(encKey, readFileSync(file, "utf8"))) as DriveSecrets;
    },
    write(secrets: DriveSecrets): void {
      mkdirSync(dirname(file), { recursive: true });
      const tmp = `${file}.tmp`;
      writeFileSync(tmp, encrypt(encKey, JSON.stringify(secrets)), { mode: 0o600 });
      renameSync(tmp, file);
      try {
        chmodSync(file, 0o600);
      } catch {
        // not supported on every platform
      }
    },
  };
}

// ---------------------------------------------------------------- Drive storage

/** Backups in a "Wallt backups" folder; with the `drive.file` scope only files this app created are visible. */
export function createDriveStorage(opts: {
  google: GoogleClient;
  secrets: ReturnType<typeof createSecretStore>;
  fetch?: FetchLike;
  now?: () => number;
}): BackupStorage {
  const f = opts.fetch ?? fetch;
  const now = opts.now ?? Date.now;
  let access: { token: string; expiresAt: number } | null = null;

  async function accessToken(force = false): Promise<string> {
    if (!force && access && access.expiresAt - 60_000 > now()) return access.token;
    const secrets = opts.secrets.read();
    if (!secrets) throw new DriveAuthError("Google Drive is not linked; run drive-auth");
    const res = await f(
      "https://oauth2.googleapis.com/token",
      form({
        client_id: opts.google.clientId,
        client_secret: opts.google.clientSecret,
        refresh_token: secrets.refreshToken,
        grant_type: "refresh_token",
      }),
    );
    if (!res.ok) {
      const body = (await res
        .clone()
        .json()
        .catch(() => ({}))) as { error?: string };
      if (body.error === "invalid_grant") {
        throw new DriveAuthError(
          "Google refresh token was revoked or expired; run drive-auth again",
        );
      }
      throw await apiError("Refreshing the Google access token", res);
    }
    const b = (await res.json()) as { access_token: string; expires_in: number };
    access = { token: b.access_token, expiresAt: now() + b.expires_in * 1000 };
    return access.token;
  }

  /** Authorised request; retries once with a fresh token on 401. */
  async function api(url: string, init: RequestInit = {}): Promise<Response> {
    const send = async (token: string) =>
      f(url, {
        ...init,
        headers: { ...(init.headers as Record<string, string>), authorization: `Bearer ${token}` },
      });
    const res = await send(await accessToken());
    return res.status === 401 ? send(await accessToken(true)) : res;
  }

  async function folderId(): Promise<string> {
    const secrets = opts.secrets.read();
    if (!secrets) throw new DriveAuthError("Google Drive is not linked; run drive-auth");
    if (secrets.folderId) return secrets.folderId;
    const q = `mimeType='${FOLDER_MIME}' and name='${FOLDER_NAME}' and trashed=false`;
    const found = await api(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)`,
    );
    if (!found.ok) throw await apiError("Looking up the backup folder", found);
    let id = ((await found.json()) as { files: { id: string }[] }).files[0]?.id;
    if (!id) {
      const created = await api("https://www.googleapis.com/drive/v3/files?fields=id", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: FOLDER_NAME, mimeType: FOLDER_MIME }),
      });
      if (!created.ok) throw await apiError("Creating the backup folder", created);
      id = ((await created.json()) as { id: string }).id;
    }
    opts.secrets.write({ ...secrets, folderId: id });
    return id;
  }

  return {
    async upload(name, bytes) {
      const parent = await folderId();
      // Resumable protocol, whole file in one PUT (works for any size, unlike multipart's 5 MB advice).
      const start = await api(
        "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id",
        {
          method: "POST",
          headers: {
            "content-type": "application/json; charset=UTF-8",
            "x-upload-content-type": "application/octet-stream",
            "x-upload-content-length": String(bytes.length),
          },
          body: JSON.stringify({ name, parents: [parent] }),
        },
      );
      const session = start.headers.get("location");
      if (!start.ok || !session) throw await apiError("Starting the upload", start);
      const put = await f(session, {
        method: "PUT",
        headers: { "content-type": "application/octet-stream" },
        body: bytes,
      });
      if (!put.ok) throw await apiError("Uploading the backup", put);
      return { id: ((await put.json()) as { id: string }).id };
    },

    async list() {
      const parent = await folderId();
      const out: { id: string; name: string; sizeBytes?: number }[] = [];
      let pageToken = "";
      do {
        const q = `'${parent}' in parents and trashed=false`;
        const url =
          `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&pageSize=1000` +
          `&fields=nextPageToken,files(id,name,size)${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`;
        const res = await api(url);
        if (!res.ok) throw await apiError("Listing backups", res);
        const b = (await res.json()) as {
          nextPageToken?: string;
          files: { id: string; name: string; size?: string }[];
        };
        for (const x of b.files)
          out.push({ id: x.id, name: x.name, ...(x.size ? { sizeBytes: Number(x.size) } : {}) });
        pageToken = b.nextPageToken ?? "";
      } while (pageToken);
      return out;
    },

    async download(id) {
      const res = await api(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?alt=media`,
      );
      if (!res.ok) throw await apiError("Downloading the backup", res);
      return new Uint8Array(await res.arrayBuffer());
    },

    async delete(id) {
      const res = await api(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!res.ok && res.status !== 404) throw await apiError("Deleting the backup", res);
    },
  };
}
