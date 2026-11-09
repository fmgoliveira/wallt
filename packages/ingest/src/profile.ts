import type { Encoding } from "./decode";
import { fingerprint, type ImportMapping } from "./mapping";
import type { Delimiter, Rows, Tabular } from "./tabularize";

/*
 * Import profiles (PLAN 5.2): the saved, editable record of how to read one bank's export. The database row
 * (`import_profiles`) holds name, institution, default account, fingerprints and this `config`.
 */

export const PROFILE_CONFIG_VERSION = 1;

/** Everything needed to re-read a file of this layout without detection. JSON-serializable. */
export interface ProfileConfig {
  version: typeof PROFILE_CONFIG_VERSION;
  mapping: ImportMapping;
  /** Decoding overrides; absent = detect. */
  encoding?: Encoding;
  delimiter?: Delimiter;
  sheet?: string;
}

/** Portable form of a profile (JSON export/import between installs). Ids and ownership stay behind. */
export interface PortableProfile {
  name: string;
  institution: string | null;
  fingerprints: string[];
  config: ProfileConfig;
}

export interface PortableBundle {
  kind: "wallt-import-profiles";
  version: 1;
  profiles: PortableProfile[];
}

/** Layout fingerprint of an inferred/loaded table: header names, column count and delimiter. */
export function tableFingerprint(table: Tabular, headerRow: number | null): string {
  const headers = headerRow === null ? [] : (table.rows[headerRow] ?? []);
  const width = Math.max(headers.length, ...table.rows.slice(0, 50).map((r) => r.length), 0);
  return fingerprint(headers, width, table.delimiter ?? "");
}

export interface StoredProfile {
  id: string;
  name: string;
  fingerprints: readonly string[];
}

/** Exact fingerprint match first; otherwise none (the UI then offers the closest profiles by similarity). */
export function matchProfile<P extends StoredProfile>(
  profiles: readonly P[],
  fp: string,
): P | undefined {
  return profiles.find((p) => p.fingerprints.includes(fp));
}

/** Column letters like a spreadsheet: A, B, ... Z, AA. */
export function columnLetter(index: number): string {
  let n = index;
  let out = "";
  do {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
}

export interface ColumnChoice {
  index: number;
  /** `A: Data Mov.` (header text when there is one, else the first value). */
  label: string;
}

/** Choices for a column picker: letter plus the header (or a sample value when the file has no header). */
export function columnChoices(rows: Rows, headerRow: number | null): ColumnChoice[] {
  const header = headerRow === null ? [] : (rows[headerRow] ?? []);
  const sample = rows[headerRow === null ? 0 : headerRow + 1] ?? [];
  const width = Math.max(header.length, ...rows.slice(0, 50).map((r) => r.length), 0);
  return Array.from({ length: width }, (_, index) => {
    const text = (header[index] || sample[index] || "").slice(0, 28);
    return { index, label: text ? `${columnLetter(index)}: ${text}` : columnLetter(index) };
  });
}

export function isProfileConfig(value: unknown): value is ProfileConfig {
  const v = value as Partial<ProfileConfig> | null;
  const m = v?.mapping as Partial<ImportMapping> | undefined;
  return (
    !!v &&
    v.version === PROFILE_CONFIG_VERSION &&
    !!m &&
    typeof m.columns === "object" &&
    m.columns !== null &&
    typeof m.invertSign === "boolean" &&
    (m.headerRow === null || typeof m.headerRow === "number") &&
    typeof m.amountLocale === "string" &&
    typeof m.dateFormat === "object" &&
    m.dateFormat !== null
  );
}

export function exportProfiles(profiles: readonly PortableProfile[]): string {
  const bundle: PortableBundle = {
    kind: "wallt-import-profiles",
    version: 1,
    profiles: [...profiles],
  };
  return JSON.stringify(bundle, null, 2);
}

export class ProfileImportError extends Error {}

/** Parse and validate an exported bundle. Throws `ProfileImportError` with a message fit for the user. */
export function parseProfilesJson(text: string): PortableProfile[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ProfileImportError("That is not valid JSON.");
  }
  const bundle = data as Partial<PortableBundle> | null;
  if (bundle?.kind !== "wallt-import-profiles" || !Array.isArray(bundle.profiles)) {
    throw new ProfileImportError("This is not a Wallt import formats file.");
  }
  if (bundle.version !== 1)
    throw new ProfileImportError("This file comes from a newer version of Wallt.");
  return bundle.profiles.map((p, i) => {
    const prof = p as Partial<PortableProfile>;
    const where = `Format ${i + 1}`;
    if (typeof prof.name !== "string" || prof.name.trim() === "")
      throw new ProfileImportError(`${where} has no name.`);
    if (
      !Array.isArray(prof.fingerprints) ||
      prof.fingerprints.length === 0 ||
      !prof.fingerprints.every((f) => typeof f === "string" && f !== "")
    )
      throw new ProfileImportError(`${where} ("${prof.name}") has no fingerprints.`);
    if (!isProfileConfig(prof.config))
      throw new ProfileImportError(`${where} ("${prof.name}") has an unreadable configuration.`);
    return {
      name: prof.name.trim(),
      institution: typeof prof.institution === "string" ? prof.institution : null,
      fingerprints: [...new Set(prof.fingerprints)],
      config: prof.config,
    };
  });
}

/** `Name`, `Name (2)`, `Name (3)`: the first variant not already taken (duplicate / import). */
export function uniqueName(name: string, taken: readonly string[]): string {
  const has = (n: string) => taken.some((t) => t.toLowerCase() === n.toLowerCase());
  if (!has(name)) return name;
  for (let i = 2; ; i++) {
    const candidate = `${name} (${i})`;
    if (!has(candidate)) return candidate;
  }
}
