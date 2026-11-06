import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize, resolve, sep } from "node:path";
import type { Context, MiddlewareHandler } from "hono";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".wasm": "application/wasm",
};

/** sha256 CSP sources for every inline <script> in the HTML files at the root of the web export. */
export function inlineScriptHashes(webDir: string): string[] {
  if (!existsSync(webDir)) return [];
  const hashes = new Set<string>();
  for (const file of readdirSync(webDir).filter((f) => f.endsWith(".html"))) {
    const html = readFileSync(join(webDir, file), "utf8");
    for (const m of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)) {
      const body = m[1] ?? "";
      if (body.trim()) hashes.add(`'sha256-${createHash("sha256").update(body).digest("base64")}'`);
    }
  }
  return [...hashes];
}

function file(path: string): string | null {
  try {
    return statSync(path).isFile() ? path : null;
  } catch {
    return null;
  }
}

/**
 * Serves the static Expo web export from `webDir` for GET/HEAD. Unknown extension-less paths fall back
 * to `index.html` (client-side routing); unknown files 404. Hashed `/_expo/` assets are cached forever.
 */
export function serveWeb(webDir: string): MiddlewareHandler {
  const root = resolve(webDir);
  return async (c: Context, next) => {
    if (c.req.method !== "GET" && c.req.method !== "HEAD") return next();
    let rel: string;
    try {
      rel = normalize(decodeURIComponent(c.req.path));
    } catch {
      return c.text("Bad request", 400);
    }
    const candidates = [join(root, rel)];
    if (!extname(rel)) candidates.push(join(root, `${rel}.html`), join(root, rel, "index.html"));
    let found: string | null = null;
    for (const cand of candidates) {
      const abs = resolve(cand);
      if (abs !== root && !abs.startsWith(root + sep)) return c.text("Not found", 404);
      found = file(abs);
      if (found) break;
    }
    if (!found && !extname(rel)) found = file(join(root, "index.html"));
    if (!found) return next();
    const type = TYPES[extname(found).toLowerCase()] ?? "application/octet-stream";
    const immutable = c.req.path.startsWith("/_expo/") || c.req.path.startsWith("/assets/");
    c.header("Content-Type", type);
    c.header("Cache-Control", immutable ? "public, max-age=31536000, immutable" : "no-cache");
    if (c.req.method === "HEAD") return c.body(null, 200);
    return c.body(readFileSync(found) as unknown as ArrayBuffer, 200);
  };
}
