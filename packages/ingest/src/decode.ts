/** Text decoding for bank exports (PLAN 5.1 step 1). Pure: bytes in, string out, no TextDecoder dependency. */

export type Encoding = "utf-8" | "utf-16le" | "utf-16be" | "windows-1252" | "iso-8859-1";

export interface Decoded {
  text: string;
  encoding: Encoding;
}

// Windows-1252 differs from ISO-8859-1 only in 0x80-0x9F.
const CP1252_HIGH = [
  0x20ac, 0x81, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039,
  0x0152, 0x8d, 0x017d, 0x8f, 0x90, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc,
  0x2122, 0x0161, 0x203a, 0x0153, 0x9d, 0x017e, 0x0178,
];

/** Strict UTF-8 decode; returns null when the bytes are not valid UTF-8. */
function decodeUtf8Strict(bytes: Uint8Array, start: number): string | null {
  const out: string[] = [];
  let i = start;
  while (i < bytes.length) {
    const b = bytes[i] as number;
    let cp: number;
    let extra: number;
    if (b < 0x80) {
      cp = b;
      extra = 0;
    } else if (b >= 0xc2 && b <= 0xdf) {
      cp = b & 0x1f;
      extra = 1;
    } else if (b >= 0xe0 && b <= 0xef) {
      cp = b & 0x0f;
      extra = 2;
    } else if (b >= 0xf0 && b <= 0xf4) {
      cp = b & 0x07;
      extra = 3;
    } else return null;
    for (let k = 1; k <= extra; k++) {
      const c = bytes[i + k];
      if (c === undefined || (c & 0xc0) !== 0x80) return null;
      cp = (cp << 6) | (c & 0x3f);
    }
    if ((extra === 2 && cp < 0x800) || (extra === 3 && (cp < 0x10000 || cp > 0x10ffff)))
      return null;
    if (cp >= 0xd800 && cp <= 0xdfff) return null;
    out.push(String.fromCodePoint(cp));
    i += extra + 1;
  }
  return out.join("");
}

function decodeUtf16(bytes: Uint8Array, start: number, littleEndian: boolean): string {
  const units: number[] = [];
  for (let i = start; i + 1 < bytes.length; i += 2) {
    const a = bytes[i] as number;
    const b = bytes[i + 1] as number;
    units.push(littleEndian ? a | (b << 8) : (a << 8) | b);
  }
  let s = "";
  for (let i = 0; i < units.length; i += 8192)
    s += String.fromCharCode(...units.slice(i, i + 8192));
  return s;
}

function decodeSingleByte(bytes: Uint8Array, start: number, cp1252: boolean): string {
  let s = "";
  for (let i = start; i < bytes.length; i++) {
    const b = bytes[i] as number;
    s += String.fromCharCode(
      cp1252 && b >= 0x80 && b <= 0x9f ? (CP1252_HIGH[b - 0x80] as number) : b,
    );
  }
  return s;
}

/** Looks like UTF-16 without a BOM: many NUL bytes in one parity. */
function sniffUtf16(bytes: Uint8Array): "utf-16le" | "utf-16be" | null {
  const n = Math.min(bytes.length, 512) & ~1;
  if (n < 4) return null;
  let even = 0;
  let odd = 0;
  for (let i = 0; i < n; i += 2) {
    if (bytes[i] === 0) even++;
    if (bytes[i + 1] === 0) odd++;
  }
  const pairs = n / 2;
  if (odd > pairs * 0.3 && even === 0) return "utf-16le";
  if (even > pairs * 0.3 && odd === 0) return "utf-16be";
  return null;
}

/**
 * Detect the encoding: BOM first, then UTF-16 NUL pattern, then strict UTF-8 (which rejects almost any
 * legacy text with accents), falling back to Windows-1252 (what Portuguese banks usually export).
 */
export function detectEncoding(bytes: Uint8Array): { encoding: Encoding; bomLength: number } {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf)
    return { encoding: "utf-8", bomLength: 3 };
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return { encoding: "utf-16le", bomLength: 2 };
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return { encoding: "utf-16be", bomLength: 2 };
  const sniffed = sniffUtf16(bytes);
  if (sniffed) return { encoding: sniffed, bomLength: 0 };
  if (decodeUtf8Strict(bytes, 0) !== null) return { encoding: "utf-8", bomLength: 0 };
  return { encoding: "windows-1252", bomLength: 0 };
}

/** Decode bytes to text. Pass `encoding` to override detection (the wizard lets the user pick one). */
export function decodeText(bytes: Uint8Array, encoding?: Encoding): Decoded {
  const detected = detectEncoding(bytes);
  const enc = encoding ?? detected.encoding;
  const start = enc === detected.encoding ? detected.bomLength : 0;
  switch (enc) {
    case "utf-8":
      return {
        text: decodeUtf8Strict(bytes, start) ?? decodeSingleByte(bytes, start, true),
        encoding: enc,
      };
    case "utf-16le":
      return { text: decodeUtf16(bytes, start, true), encoding: enc };
    case "utf-16be":
      return { text: decodeUtf16(bytes, start, false), encoding: enc };
    case "iso-8859-1":
      return { text: decodeSingleByte(bytes, start, false), encoding: enc };
    default:
      return { text: decodeSingleByte(bytes, start, true), encoding: enc };
  }
}
