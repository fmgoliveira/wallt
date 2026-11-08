import type { Repository } from "@wallt/db";
import { openDatabaseAsync } from "expo-sqlite";
import { repositoryFromDatabase } from "./sqlite-repository";

/** Opens the on-device database and returns the repository (Android). */
export async function openRepository(): Promise<Repository> {
  return repositoryFromDatabase(await openDatabaseAsync("wallt.db"));
}
