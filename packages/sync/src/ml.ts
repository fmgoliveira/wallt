/**
 * Download of the active category classifier from `GET /ml/model` into device-local storage. Not part of the sync
 * protocol: the model is derived data the server trains from the synced transactions. IO is injected, so this stays
 * testable. The model text is validated by its consumer (`@wallt/categorize`), not here.
 */

export interface ModelMetaStore {
  getMeta(key: string): Promise<string | null>;
  setMeta(key: string, value: string): Promise<void>;
}

export interface PullModelOptions {
  baseUrl: string;
  getAccessToken: () => Promise<string | null>;
  fetch: (url: string, init?: RequestInit) => Promise<Response>;
  store: ModelMetaStore;
}

export const MODEL_VERSION_KEY = "ml_model_version";
export const MODEL_JSON_KEY = "ml_model_json";

/** Models are a few MB at most; anything bigger is a misbehaving server. */
const MAX_MODEL_CHARS = 32 * 1024 * 1024;

export type PullModelResult =
  | { ok: true; changed: boolean; version: number | null }
  | { ok: false; reason: string };

/** The stored model text and version, or null when none was downloaded yet. */
export async function readStoredModel(
  store: ModelMetaStore,
): Promise<{ version: number; json: string } | null> {
  const [version, json] = await Promise.all([
    store.getMeta(MODEL_VERSION_KEY),
    store.getMeta(MODEL_JSON_KEY),
  ]);
  const n = Number(version);
  return json && Number.isSafeInteger(n) && n > 0 ? { version: n, json } : null;
}

/**
 * Fetches the active model when the server has a newer version than the device (ETag `"v<version>"`) and stores it.
 * Never throws: offline, signed out or a server error just means the device keeps the model it has.
 */
export async function pullModel(options: PullModelOptions): Promise<PullModelResult> {
  const base = options.baseUrl.replace(/\/+$/, "");
  try {
    const token = await options.getAccessToken();
    if (!token) return { ok: false, reason: "not signed in" };
    const have = await readStoredModel(options.store);
    const res = await options.fetch(`${base}/ml/model`, {
      headers: {
        authorization: `Bearer ${token}`,
        ...(have ? { "if-none-match": `"v${have.version}"` } : {}),
      },
    });
    if (res.status === 304 || res.status === 204) {
      return { ok: true, changed: false, version: have?.version ?? null };
    }
    if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` };
    const body = (await res.json()) as { version?: unknown; model?: unknown };
    const version = body.version;
    if (typeof version !== "number" || !Number.isSafeInteger(version) || version < 1) {
      return { ok: false, reason: "invalid response" };
    }
    if (typeof body.model !== "object" || body.model === null) {
      return { ok: false, reason: "invalid response" };
    }
    const json = JSON.stringify(body.model);
    if (json.length > MAX_MODEL_CHARS) return { ok: false, reason: "model too large" };
    if (have?.version === version) return { ok: true, changed: false, version };
    await options.store.setMeta(MODEL_JSON_KEY, json);
    await options.store.setMeta(MODEL_VERSION_KEY, String(version));
    return { ok: true, changed: true, version };
  } catch (cause) {
    return { ok: false, reason: cause instanceof Error ? cause.message : "failed" };
  }
}
