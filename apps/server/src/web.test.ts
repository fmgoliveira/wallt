import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pino from "pino";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "./app";
import { openDatabase, runMigrations } from "./database";
import { parseTrustedProxies, resolveClientIp } from "./proxy";
import { inlineScriptHashes } from "./web";

const log = pino({ level: "silent" });
const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const INLINE = "globalThis.__EXPO_ROUTER_HYDRATE__=true;";
async function setup() {
  const dir = mkdtempSync(join(tmpdir(), "wallt-web-"));
  dirs.push(dir);
  const web = join(dir, "web");
  mkdirSync(join(web, "_expo"), { recursive: true });
  writeFileSync(
    join(web, "index.html"),
    `<html><script src="/_expo/app.js"></script><script id="_R_">${INLINE}</script></html>`,
  );
  writeFileSync(join(web, "settings.html"), "<html>settings</html>");
  writeFileSync(join(web, "_expo", "app.js"), "console.log(1)");
  writeFileSync(join(dir, "secret.txt"), "top secret");
  const db = openDatabase(join(dir, "data"));
  await runMigrations(db, join(dir, "data"), log);
  return { app: createApp({ db, log, webDir: web }), db };
}

describe("static web + security headers", () => {
  it("serves files, route html and SPA fallback with caching rules", async () => {
    const { app, db } = await setup();
    const index = await app.request("/");
    expect(index.status).toBe(200);
    expect(index.headers.get("content-type")).toContain("text/html");
    expect(index.headers.get("cache-control")).toBe("no-cache");
    expect(await (await app.request("/settings")).text()).toContain("settings");
    expect(await (await app.request("/some/client/route")).text()).toContain(
      "__EXPO_ROUTER_HYDRATE__",
    );
    const js = await app.request("/_expo/app.js");
    expect(js.headers.get("content-type")).toContain("text/javascript");
    expect(js.headers.get("cache-control")).toContain("immutable");
    expect((await app.request("/missing.png")).status).toBe(404);
    expect((await app.request("/", { method: "HEAD" })).status).toBe(200);
    expect((await app.request("/", { method: "POST" })).status).toBe(404);
    expect((await app.request("/health")).headers.get("content-type")).toContain("json");
    db.close();
  });

  it("does not escape the web directory", async () => {
    const { app, db } = await setup();
    for (const p of ["/..%2Fsecret.txt", "/%2e%2e/secret.txt", "/../secret.txt", "/%E0%A4%A"]) {
      const res = await app.request(p);
      expect(await res.text()).not.toContain("top secret");
    }
    db.close();
  });

  it("sends CSP with the inline script hash, HSTS and framing protection on every response", async () => {
    const { app, db } = await setup();
    const hash = `'sha256-${createHash("sha256").update(INLINE).digest("base64")}'`;
    for (const path of ["/", "/health", "/nope.js"]) {
      const h = (await app.request(path)).headers;
      const csp = h.get("content-security-policy") ?? "";
      expect(csp).toContain(`script-src 'self' ${hash} 'wasm-unsafe-eval'`);
      expect(csp).toContain("worker-src 'self' blob:");
      expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);
      expect(csp).toContain("frame-ancestors 'none'");
      expect(csp).toContain("object-src 'none'");
      expect(h.get("strict-transport-security")).toContain("max-age=31536000");
      expect(h.get("x-content-type-options")).toBe("nosniff");
      expect(h.get("x-frame-options")).toBe("DENY");
      // cross-origin isolation, required by the web SQLite (SharedArrayBuffer / OPFS)
      expect(h.get("cross-origin-embedder-policy")).toBe("credentialless");
      expect(h.get("cross-origin-opener-policy")).toBe("same-origin");
    }
    expect(inlineScriptHashes("/does/not/exist")).toEqual([]);
    db.close();
  });
});

describe("client IP / trusted proxies", () => {
  const trusted = parseTrustedProxies("127.0.0.1, ::1, 172.18.0.0/16");
  it("honours X-Real-IP only from a trusted peer", () => {
    expect(resolveClientIp("127.0.0.1", "203.0.113.9", trusted)).toBe("203.0.113.9");
    expect(resolveClientIp("::ffff:127.0.0.1", "203.0.113.9", trusted)).toBe("203.0.113.9");
    expect(resolveClientIp("172.18.0.5", "2001:db8::1", trusted)).toBe("2001:db8::1");
    expect(resolveClientIp("198.51.100.7", "203.0.113.9", trusted)).toBe("198.51.100.7");
  });
  it("falls back to the peer for missing/garbage headers and unknown peers", () => {
    expect(resolveClientIp("127.0.0.1", undefined, trusted)).toBe("127.0.0.1");
    expect(resolveClientIp("127.0.0.1", "not-an-ip", trusted)).toBe("127.0.0.1");
    expect(resolveClientIp(undefined, "203.0.113.9", trusted)).toBe("unknown");
  });
  it("rejects invalid entries and allows an empty list", () => {
    expect(() => parseTrustedProxies("nope")).toThrow(/TRUSTED_PROXIES/);
    expect(resolveClientIp("127.0.0.1", "203.0.113.9", parseTrustedProxies(""))).toBe("127.0.0.1");
  });
});
