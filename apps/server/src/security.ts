import type { MiddlewareHandler } from "hono";
import { secureHeaders } from "hono/secure-headers";

/**
 * Security headers for every response. CSP: same-origin only; the Expo export's fixed inline
 * script(s) are allowed by hash (computed at startup), styles allow inline because react-native-web
 * injects a <style> tag. No COOP/COEP (web uses the remote repository, ADR 0002).
 */
export function securityHeaders(inlineScriptHashes: readonly string[]): MiddlewareHandler {
  return secureHeaders({
    contentSecurityPolicy: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", ...inlineScriptHashes],
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
    crossOriginOpenerPolicy: false,
    crossOriginEmbedderPolicy: false,
  });
}
