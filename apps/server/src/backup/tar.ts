import { gunzipSync, gzipSync } from "node:zlib";

/**
 * Minimal ustar reader/writer for backup archives: regular files only (database snapshot, attachments,
 * manifest). Anything else (links, devices, pax headers) is rejected on read, and entry names are
 * validated on both sides so a crafted archive cannot write outside the restore directory.
 */

export type TarEntry = { name: string; data: Uint8Array };

const BLOCK = 512;
const enc = new TextEncoder();
const dec = new TextDecoder();

export function assertSafeName(name: string): void {
  const bad =
    !name ||
    name.startsWith("/") ||
    name.includes("\\") ||
    name.includes("\0") ||
    name.split("/").some((p) => p === ".." || p === "." || p === "");
  if (bad) throw new Error(`Unsafe archive entry name: ${JSON.stringify(name)}`);
}

function put(buf: Uint8Array, off: number, text: string): void {
  buf.set(enc.encode(text), off);
}

const octal = (n: number, width: number) => `${n.toString(8).padStart(width - 1, "0")}\0`;

/** Splits a long path into ustar `prefix` (<=155) and `name` (<=100). */
function splitName(name: string): [prefix: string, name: string] {
  if (enc.encode(name).length <= 100) return ["", name];
  for (let i = name.indexOf("/"); i >= 0; i = name.indexOf("/", i + 1)) {
    const prefix = name.slice(0, i);
    const rest = name.slice(i + 1);
    if (enc.encode(prefix).length <= 155 && enc.encode(rest).length <= 100) return [prefix, rest];
  }
  throw new Error(`Archive entry name too long: ${name}`);
}

export function packTar(entries: readonly TarEntry[], mtimeSeconds: number): Uint8Array {
  const parts: Uint8Array[] = [];
  for (const { name, data } of entries) {
    assertSafeName(name);
    const [prefix, short] = splitName(name);
    const h = new Uint8Array(BLOCK);
    put(h, 0, short);
    put(h, 100, "0000644\0");
    put(h, 108, "0000000\0");
    put(h, 116, "0000000\0");
    put(h, 124, octal(data.length, 12));
    put(h, 136, octal(mtimeSeconds, 12));
    put(h, 148, "        "); // checksum placeholder: eight spaces
    h[156] = 0x30; // '0' regular file
    put(h, 257, "ustar\0");
    put(h, 263, "00");
    put(h, 345, prefix);
    const sum = h.reduce((a, b) => a + b, 0);
    put(h, 148, `${sum.toString(8).padStart(6, "0")}\0 `);
    parts.push(h, data, new Uint8Array((BLOCK - (data.length % BLOCK)) % BLOCK));
  }
  parts.push(new Uint8Array(BLOCK * 2));
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

const cstr = (b: Uint8Array) =>
  dec.decode(b.subarray(0, b.indexOf(0) < 0 ? b.length : b.indexOf(0)));

/** Reads entries; `maxBytes` bounds the total uncompressed size (zip-bomb guard). */
export function unpackTar(tar: Uint8Array, maxBytes = 2 * 1024 ** 3): TarEntry[] {
  const entries: TarEntry[] = [];
  let off = 0;
  let total = 0;
  while (off + BLOCK <= tar.length) {
    const h = tar.subarray(off, off + BLOCK);
    if (h.every((b) => b === 0)) return entries;
    const expected = Number.parseInt(cstr(h.subarray(148, 156)).trim(), 8);
    const sum = h.reduce((a, b, i) => a + (i >= 148 && i < 156 ? 0x20 : b), 0);
    if (sum !== expected) throw new Error("Corrupt archive: bad header checksum");
    const type = h[156] as number;
    if (type !== 0x30 && type !== 0) throw new Error(`Unsupported archive entry type: ${type}`);
    const size = Number.parseInt(cstr(h.subarray(124, 136)).trim() || "0", 8);
    if (!Number.isSafeInteger(size) || size < 0) throw new Error("Corrupt archive: bad size");
    total += size;
    if (total > maxBytes) throw new Error("Archive too large");
    const prefix = cstr(h.subarray(345, 500));
    const name = prefix ? `${prefix}/${cstr(h.subarray(0, 100))}` : cstr(h.subarray(0, 100));
    assertSafeName(name);
    off += BLOCK;
    if (off + size > tar.length) throw new Error("Corrupt archive: truncated entry");
    entries.push({ name, data: tar.slice(off, off + size) });
    off += Math.ceil(size / BLOCK) * BLOCK;
  }
  throw new Error("Corrupt archive: missing end marker");
}

export const packTarGz = (entries: readonly TarEntry[], mtimeSeconds: number) =>
  new Uint8Array(gzipSync(packTar(entries, mtimeSeconds)));

export const unpackTarGz = (gz: Uint8Array, maxBytes?: number) =>
  unpackTar(
    new Uint8Array(gunzipSync(gz, { maxOutputLength: maxBytes ?? 2 * 1024 ** 3 })),
    maxBytes,
  );
