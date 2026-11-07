export type BackupTrigger = "scheduled" | "manual" | "pre_migration";

export type RemoteBackup = { id: string; name: string };

const PREFIX = "wallt-backup-";
const SUFFIX = ".tar.gz.age";
const NAME_RE =
  /^wallt-backup-(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z-(scheduled|manual|pre_migration)\.tar\.gz\.age$/;

export function backupFileName(trigger: BackupTrigger, at: Date): string {
  const stamp = at
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d+Z$/, "Z");
  return `${PREFIX}${stamp}-${trigger}${SUFFIX}`;
}

/** Parses a name produced by `backupFileName`; null for anything else (never ours to delete). */
export function parseBackupName(name: string): { at: Date; trigger: BackupTrigger } | null {
  const m = NAME_RE.exec(name);
  if (!m) return null;
  const n = m.slice(1, 7).map(Number) as [number, number, number, number, number, number];
  const at = new Date(Date.UTC(n[0], n[1] - 1, n[2], n[3], n[4], n[5]));
  // Date.UTC rolls impossible dates over (month 13, day 32...); only accept exact round-trips.
  const exact =
    at.getUTCFullYear() === n[0] &&
    at.getUTCMonth() === n[1] - 1 &&
    at.getUTCDate() === n[2] &&
    at.getUTCHours() === n[3] &&
    at.getUTCMinutes() === n[4] &&
    at.getUTCSeconds() === n[5];
  return exact ? { at, trigger: m[7] as BackupTrigger } : null;
}

export type Retention = {
  daily: number;
  weekly: number;
  monthly: number;
  /** Pre-migration backups are kept this many days. */
  preMigrationDays: number;
  /** The newest N backups are never deleted. */
  keepNewest: number;
};

export const DEFAULT_RETENTION: Retention = {
  daily: 14,
  weekly: 8,
  monthly: 12,
  preMigrationDays: 30,
  keepNewest: 3,
};

const day = (d: Date) => d.toISOString().slice(0, 10);
const month = (d: Date) => d.toISOString().slice(0, 7);
/** ISO-8601 week key (Thursday rule), e.g. `2026-W02`. */
function week(d: Date): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  const yearStart = Date.UTC(t.getUTCFullYear(), 0, 1);
  const n = Math.ceil(((t.getTime() - yearStart) / 86_400_000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(n).padStart(2, "0")}`;
}

/**
 * Grandfather-father-son pruning. Keeps the newest backup of each of the last `daily` days, `weekly` ISO
 * weeks and `monthly` months (union), recent pre-migration backups, and always the newest `keepNewest`.
 * Files that do not match our naming scheme are never returned.
 */
export function selectPrune(
  files: readonly RemoteBackup[],
  now: Date,
  retention: Retention = DEFAULT_RETENTION,
): RemoteBackup[] {
  const ours = files
    .flatMap((f) => {
      const p = parseBackupName(f.name);
      return p ? [{ ...f, ...p }] : [];
    })
    .sort((a, b) => b.at.getTime() - a.at.getTime() || (a.id < b.id ? 1 : -1)); // newest first

  const keep = new Set(ours.slice(0, retention.keepNewest).map((f) => f.id));
  const periodic = ours.filter((f) => f.trigger !== "pre_migration");
  for (const [key, limit] of [
    [day, retention.daily],
    [week, retention.weekly],
    [month, retention.monthly],
  ] as const) {
    const seen = new Set<string>();
    for (const f of periodic) {
      const k = key(f.at);
      if (seen.has(k)) continue; // an even newer backup already represents this period
      if (seen.size >= limit) break;
      seen.add(k);
      keep.add(f.id);
    }
  }
  const cutoff = now.getTime() - retention.preMigrationDays * 86_400_000;
  for (const f of ours)
    if (f.trigger === "pre_migration" && f.at.getTime() >= cutoff) keep.add(f.id);

  return ours.filter((f) => !keep.has(f.id)).map(({ id, name }) => ({ id, name }));
}
