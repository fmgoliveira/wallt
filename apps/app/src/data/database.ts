import type { Repository } from "@wallt/db";
import { repositoryFromDatabase } from "./sqlite-repository";

/**
 * Web (interim, ADR 0005): the same local SQLite, running as WASM in this browser (OPFS). `expo-sqlite` is
 * `require`d lazily inside the function (not `import()`: Metro's async-import helper breaks the SSR bundle through the
 * pnpm symlink) so the server-side render never evaluates it; this only ever runs on the client.
 * Requires cross-origin isolation (COOP/COEP headers, see metro.config.js).
 */
export async function openRepository(): Promise<Repository> {
  if (typeof window === "undefined" || !globalThis.crossOriginIsolated) {
    throw new Error("Web database needs a cross-origin isolated page (COOP/COEP headers).");
  }
  const { configureWeb, openDatabaseAsync } =
    require("expo-sqlite") as typeof import("expo-sqlite");
  // The worker's own import of the wasm is stubbed out in metro.config.js; serve it from public/ instead.
  configureWeb({ wasmURL: "/wa-sqlite.wasm" });
  return repositoryFromDatabase(await openDatabaseAsync("wallt.db"));
}
