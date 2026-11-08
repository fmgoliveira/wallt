import type { Repository } from "@wallt/db";

/**
 * Web has no data source yet. An interim in-browser SQLite (expo-sqlite WASM) was prototyped but its SSR bundling
 * is unresolved; the production path is a RemoteRepository (ADR 0002). Android resolves `database.native.ts`.
 */
export async function openRepository(): Promise<Repository> {
  throw new Error("No data source on web yet (see ADR 0005, open points).");
}
