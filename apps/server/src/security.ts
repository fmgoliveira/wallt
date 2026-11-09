import type { MiddlewareHandler } from "hono";
import { secureHeaders } from "hono/secure-headers";

/**
 * Security headers for every response. CSP: same-origin only; the Expo export's fixed inline
 * script(s) are allowed by hash (computed at startup), styles allow inline because react-native-web
 * injects a <style> tag. The web app runs SQLite in WASM on OPFS (ADR 0002/0005), which needs a cross-origin
 * isolated page: COOP same-origin + COEP credentialless, plus 'wasm-unsafe-eval' and same-origin/blob workers.
 */
export function securityHeaders(inlineScriptHashes: readonly string[]): MiddlewareHandler {
  return secureHeaders({
    contentSecurityPolicy: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", ...inlineScriptHashes, "'wasm-unsafe-eval'"],
      workerSrc: ["'self'", "blob:"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:"],
      fontSrc: ["'self'", "data:"],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
    },
    strictTransportSecurity: "max-age=31536000; includeSubDomains",
    xContentTypeOptions: "nosniff",
    xFrameOptions: "DENY",
    referrerPolicy: "no-referrer",
    permissionsPolicy: { camera: [], microphone: [], geolocation: [], payment: [] },
    crossOriginOpenerPolicy: "same-origin",
    crossOriginEmbedderPolicy: "credentialless",
  });
}
