import { parseBackupName } from "./retention";
import type { BackupStorage } from "./storage";

/** Downloads one backup: `latest` (newest of ours by the timestamp in its name) or an explicit file id. */
export async function downloadBackup(
  storage: BackupStorage,
  which: string,
): Promise<{ name: string; bytes: Uint8Array }> {
  const files = await storage.list();
  let pick: { id: string; name: string } | undefined;
  if (which === "latest") {
    pick = files
      .flatMap((f) => {
        const p = parseBackupName(f.name);
        return p ? [{ ...f, at: p.at.getTime() }] : [];
      })
      .sort((a, b) => b.at - a.at)[0];
    if (!pick) throw new Error("No backups found in the backup folder");
  } else {
    pick = files.find((f) => f.id === which);
    if (!pick) throw new Error(`No backup with id ${which} in the backup folder`);
  }
  return { name: pick.name, bytes: await storage.download(pick.id) };
}
