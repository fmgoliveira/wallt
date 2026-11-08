import type { FetchLike } from "./google";

type Json = Record<string, unknown>;
const json = (body: Json, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });

/** In-memory stand-in for Google's OAuth and Drive endpoints (test helper; no network). */
export function createFakeGoogle(
  opts: { pendingPolls?: number; pageSize?: number; slowDown?: boolean } = {},
) {
  const state = {
    pendingLeft: opts.pendingPolls ?? 0,
    slowDownLeft: opts.slowDown ? 1 : 0,
    validTokens: new Set<string>(),
    tokenCounter: 0,
    refreshToken: "refresh-token-secret",
    revoked: false,
    denied: false,
    files: new Map<string, { name: string; parent: string; bytes: Uint8Array }>(),
    folders: new Map<string, string>(),
    trashed: new Set<string>(),
    uploads: new Map<string, { name: string; parent: string }>(),
    idCounter: 0,
    tokenRequests: 0,
    log: [] as string[],
  };
  const nextId = (p: string) => `${p}-${++state.idCounter}`;

  const fetchImpl: FetchLike = async (input, init = {}) => {
    const url = new URL(
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
    );
    const method = (init.method ?? "GET").toUpperCase();
    const headers = new Headers(init.headers);
    state.log.push(`${method} ${url.origin}${url.pathname}`);

    if (url.origin === "https://oauth2.googleapis.com") {
      const body = new URLSearchParams(String(init.body ?? ""));
      if (url.pathname === "/device/code") {
        return json({
          device_code: "dev-code",
          user_code: "ABCD-EFGH",
          verification_url: "https://www.google.com/device",
          expires_in: 1800,
          interval: 5,
        });
      }
      state.tokenRequests++;
      const grant = body.get("grant_type");
      if (grant === "urn:ietf:params:oauth:grant-type:device_code") {
        if (state.denied) return json({ error: "access_denied" }, 403);
        if (state.slowDownLeft-- > 0) return json({ error: "slow_down" }, 400);
        if (state.pendingLeft-- > 0) return json({ error: "authorization_pending" }, 428);
        return json({
          access_token: "unused",
          refresh_token: state.refreshToken,
          expires_in: 3600,
        });
      }
      if (grant === "refresh_token") {
        if (state.revoked || body.get("refresh_token") !== state.refreshToken)
          return json({ error: "invalid_grant" }, 400);
        const token = `access-${++state.tokenCounter}`;
        state.validTokens.add(token);
        return json({ access_token: token, expires_in: 3600 });
      }
      return json({ error: "unsupported_grant_type" }, 400);
    }

    if (url.origin === "https://upload.fake") {
      const session = state.uploads.get(url.pathname.slice("/session/".length));
      if (!session || method !== "PUT") return json({ error: "bad session" }, 404);
      const id = nextId("file");
      state.files.set(id, { ...session, bytes: new Uint8Array(init.body as Uint8Array) });
      return json({ id });
    }

    const token = /^Bearer (.+)$/.exec(headers.get("authorization") ?? "")?.[1];
    if (!token || !state.validTokens.has(token))
      return json({ error: { message: "Invalid Credentials" } }, 401);

    if (url.pathname === "/upload/drive/v3/files" && method === "POST") {
      const meta = JSON.parse(String(init.body)) as { name: string; parents: string[] };
      const parentId = meta.parents[0] as string;
      if (!state.folders.has(parentId) || state.trashed.has(parentId)) {
        return json({ error: { message: `File not found: ${parentId}.` } }, 404);
      }
      const id = nextId("session");
      state.uploads.set(id, { name: meta.name, parent: meta.parents[0] as string });
      return new Response("{}", {
        status: 200,
        headers: { location: `https://upload.fake/session/${id}` },
      });
    }
    if (url.pathname === "/drive/v3/files" && method === "POST") {
      const meta = JSON.parse(String(init.body)) as { name: string };
      const id = nextId("folder");
      state.folders.set(id, meta.name);
      return json({ id });
    }
    if (url.pathname === "/drive/v3/files" && method === "GET") {
      const q = url.searchParams.get("q") ?? "";
      if (q.includes("application/vnd.google-apps.folder")) {
        const name = /name='([^']+)'/.exec(q)?.[1];
        return json({
          files: [...state.folders]
            .filter(([id, n]) => n === name && !state.trashed.has(id))
            .map(([id]) => ({ id })),
        });
      }
      const parent = /'([^']+)' in parents/.exec(q)?.[1];
      const all = [...state.files]
        .filter(([, f]) => f.parent === parent)
        .map(([id, f]) => ({ id, name: f.name, size: String(f.bytes.length) }));
      const start = Number(url.searchParams.get("pageToken") ?? 0);
      const size = opts.pageSize ?? 1000;
      const page = all.slice(start, start + size);
      return json({
        files: page,
        ...(start + size < all.length ? { nextPageToken: String(start + size) } : {}),
      });
    }
    const m = /^\/drive\/v3\/files\/([^/]+)$/.exec(url.pathname);
    if (m) {
      const id = decodeURIComponent(m[1] as string);
      if (state.folders.has(id) && method === "GET") {
        return json({ id, trashed: state.trashed.has(id) });
      }
      const file = state.files.get(id);
      if (!file) return json({ error: { message: "File not found" } }, 404);
      if (method === "DELETE") {
        state.files.delete(id);
        return new Response(null, { status: 204 });
      }
      return new Response(Buffer.from(file.bytes), { status: 200 });
    }
    return json({ error: { message: `unhandled ${method} ${url.pathname}` } }, 500);
  };

  return {
    fetch: fetchImpl,
    state,
    /** Makes every issued access token invalid (simulates expiry before the client notices). */
    expireAccessTokens: () => state.validTokens.clear(),
    /** Permanently deletes a folder and the files in it (as emptying the Drive bin would). */
    deleteFolder(id: string) {
      state.folders.delete(id);
      for (const [fid, file] of state.files) if (file.parent === id) state.files.delete(fid);
    },
    /** Moves a folder to the bin: still addressable but `trashed`. */
    trashFolder: (id: string) => void state.trashed.add(id),
  };
}
