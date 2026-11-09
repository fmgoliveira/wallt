import { type SyncTransport, SyncTransportError } from "./engine";
import type { PullResponse, PushResponse } from "./protocol";

export interface HttpTransportOptions {
  /** Server origin, e.g. `https://wallt.example.com` (no trailing slash needed). */
  baseUrl: string;
  /** Current access token, refreshed by the caller when needed; null when signed out. */
  getAccessToken: () => Promise<string | null>;
  /** Injected so this package stays free of IO; pass `fetch`. */
  fetch: (url: string, init?: RequestInit) => Promise<Response>;
}

/** `SyncTransport` over the server's `/sync/*` routes. Network failures become `offline`, 401 `unauthorized`. */
export function createHttpTransport(options: HttpTransportOptions): SyncTransport {
  const base = options.baseUrl.replace(/\/+$/, "");

  async function call<T>(path: string, init: RequestInit): Promise<T> {
    const token = await options.getAccessToken();
    if (!token) throw new SyncTransportError("unauthorized", "not signed in");
    let res: Response;
    try {
      res = await options.fetch(`${base}${path}`, {
        ...init,
        headers: {
          ...(init.body ? { "content-type": "application/json" } : {}),
          authorization: `Bearer ${token}`,
        },
      });
    } catch (cause) {
      throw new SyncTransportError("offline", cause instanceof Error ? cause.message : "offline");
    }
    if (res.status === 401) throw new SyncTransportError("unauthorized");
    if (res.status === 409) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new SyncTransportError(
        body.error === "server_outdated" ? "server_outdated" : "schema_outdated",
      );
    }
    if (res.status === 502 || res.status === 503 || res.status === 504) {
      throw new SyncTransportError("offline", `server unavailable (${res.status})`);
    }
    if (!res.ok) throw new SyncTransportError("server", `HTTP ${res.status}`);
    return (await res.json()) as T;
  }

  return {
    push: (request) =>
      call<PushResponse>("/sync/push", { method: "POST", body: JSON.stringify(request) }),
    pull: ({ since, limit, schemaVersion }) =>
      call<PullResponse>(
        `/sync/pull?since=${since}&limit=${limit}&schemaVersion=${schemaVersion}`,
        { method: "GET" },
      ),
  };
}
