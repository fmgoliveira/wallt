import { deriveKeys } from "./auth/crypto";
import {
  createDriveStorage,
  createSecretStore,
  pollDeviceFlow,
  startDeviceFlow,
} from "./backup/google";
import { loadConfig } from "./config";

/** One-off: links the server to a Google account for backups (OAuth device flow, `drive.file` scope). */
async function main(): Promise<void> {
  const config = loadConfig();
  if (!config.GDRIVE_CLIENT_ID || !config.GDRIVE_CLIENT_SECRET) {
    throw new Error("Set GDRIVE_CLIENT_ID and GDRIVE_CLIENT_SECRET first (see docs/deploy.md)");
  }
  const google = { clientId: config.GDRIVE_CLIENT_ID, clientSecret: config.GDRIVE_CLIENT_SECRET };
  const secrets = createSecretStore(config.DATA_DIR, deriveKeys(config.ENCRYPTION_KEY).encKey);

  const device = await startDeviceFlow(google);
  console.log(
    `\nOpen ${device.verificationUrl} on any device and enter the code: ${device.userCode}`,
  );
  console.log(`Waiting for approval (expires in ${Math.round(device.expiresIn / 60)} min)...`);
  const { refreshToken } = await pollDeviceFlow(google, device);
  secrets.write({ refreshToken });

  // Prove the link works and create the "Wallt backups" folder now rather than at 03:30.
  const files = await createDriveStorage({ google, secrets }).list();
  console.log(
    `Linked. Backup folder ready (${files.length} existing backup(s)). The refresh token is stored encrypted.`,
  );
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(`drive-auth failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  },
);
