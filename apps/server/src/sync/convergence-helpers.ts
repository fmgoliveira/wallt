import { migrate } from "@wallt/db";
import type { Db } from "../database";
import { toExecutor } from "../database";

/** Test helper: applies the bundled migrations to an in-memory better-sqlite3 database. */
export async function runMigrationsInMemory(db: Db): Promise<void> {
  await migrate(toExecutor(db));
}
