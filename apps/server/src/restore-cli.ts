import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { deriveKeys } from "./auth/crypto";
import { downloadBackup } from "./backup/download";
import { createDriveStorage, createSecretStore } from "./backup/google";
import { restoreBackup } from "./backup/restore";
import { loadConfig } from "./config";

const USAGE = `Usage: node restore.mjs (--file <backup.tar.gz.age> | --drive <latest|file-id>) --identity <age-identity-file> [--data-dir /data] --yes

Replaces the database and attachments in the data directory with the contents of an encrypted backup.
STOP THE SERVER FIRST. The current files are moved to <data-dir>/pre-restore-<timestamp>/, not deleted.
--drive downloads from the linked Google Drive (needs the same env as the server, see docs/deploy.md).
--identity is the file holding the age private key (AGE-SECRET-KEY-1...) matching BACKUP_AGE_RECIPIENT.`;

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: {
      file: { type: "string" },
      drive: { type: "string" },
      identity: { type: "string" },
      "data-dir": { type: "string" },
      yes: { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
  });
  const oneSource = Boolean(values.file) !== Boolean(values.drive);
  if (values.help || !values.identity || !oneSource) {
    console.log(USAGE);
    return values.help ? 0 : 2;
  }
  if (!values.yes) {
    console.error("Refusing to replace live data without --yes.\n");
    console.error(USAGE);
    return 2;
  }
  const identity = readFileSync(values.identity, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.startsWith("AGE-SECRET-KEY-"));
  if (!identity) throw new Error("No AGE-SECRET-KEY-1... line found in the identity file");
  const dataDir = values["data-dir"] ?? process.env.DATA_DIR ?? "/data";
  let encrypted: Uint8Array;
  if (values.drive) {
    const config = loadConfig();
    if (!config.GDRIVE_CLIENT_ID || !config.GDRIVE_CLIENT_SECRET) {
      throw new Error("Set GDRIVE_CLIENT_ID and GDRIVE_CLIENT_SECRET to use --drive");
    }
    const storage = createDriveStorage({
      google: { clientId: config.GDRIVE_CLIENT_ID, clientSecret: config.GDRIVE_CLIENT_SECRET },
      secrets: createSecretStore(dataDir, deriveKeys(config.ENCRYPTION_KEY).encKey),
    });
    const dl = await downloadBackup(storage, values.drive);
    console.log(`Downloaded ${dl.name} (${dl.bytes.length} bytes)`);
    encrypted = dl.bytes;
  } else {
    encrypted = new Uint8Array(readFileSync(values.file as string));
  }
  const result = await restoreBackup({ encrypted, identity, dataDir });
  const rows = Object.values(result.manifest.tables).reduce((a, b) => a + b, 0);
  console.log(
    `Restored backup from ${result.manifest.createdAt} into ${dataDir} (${rows} rows, integrity ok).`,
  );
  if (result.previousDir) console.log(`Previous data kept in ${result.previousDir}`);
  console.log("Start the server again; pending migrations (if any) run on boot.");
  return 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(`Restore failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  },
);
