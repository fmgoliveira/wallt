import { deserializeModel, type Model } from "@wallt/categorize";
import { type ModelMetaStore, pullModel, readStoredModel } from "@wallt/sync";

/**
 * The category classifier on this device (ADR 0009): downloaded from the server after syncs, kept in device-local
 * `sync_meta`, parsed once per version. Offline or signed out the last model keeps working.
 */

let cache: { version: number; model: Model } | null = null;

/** The stored model, parsed (and cached); null when none was downloaded or the stored text is unusable. */
export async function getModel(meta: ModelMetaStore | null): Promise<Model | null> {
  if (!meta) return null;
  const stored = await readStoredModel(meta);
  if (!stored) return null;
  if (cache?.version === stored.version) return cache.model;
  const model = deserializeModel(stored.json);
  cache = model ? { version: stored.version, model } : null;
  return model;
}

export async function refreshModel(options: {
  baseUrl: string;
  getAccessToken: () => Promise<string | null>;
  meta: ModelMetaStore;
}): Promise<boolean> {
  const result = await pullModel({
    baseUrl: options.baseUrl,
    getAccessToken: options.getAccessToken,
    fetch: (url, init) => fetch(url, init),
    store: options.meta,
  });
  return result.ok && result.changed;
}
