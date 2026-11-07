import type { Context, MiddlewareHandler } from "hono";
import { Hono } from "hono";
import { z } from "zod";
import { createRateLimiter } from "./rate-limit";
import { AuthError, type AuthService } from "./service";

export type AuthEnv = { Variables: { clientIp: string; userId: string; deviceId: string } };

const email = z.string().trim().toLowerCase().pipe(z.email());
const device = {
  deviceName: z.string().trim().min(1).max(80),
  platform: z.enum(["android", "web", "other"]),
  deviceId: z.uuid().optional(),
};
const totpCode = z.string().regex(/^\d{6}$/);

const setupBody = z.object({
  setupToken: z.string().min(1).max(256),
  email,
  password: z.string().min(12).max(256),
});
const loginBody = z.object({ email, password: z.string().min(1).max(256) });
const verifyBody = z
  .object({
    challengeToken: z.string().min(1).max(2048),
    code: totpCode.optional(),
    recoveryCode: z.string().min(10).max(32).optional(),
    ...device,
  })
  .refine(
    (b) => (b.code === undefined) !== (b.recoveryCode === undefined),
    "exactly one of code or recoveryCode",
  );
const confirmBody = z.object({
  enrolToken: z.string().min(1).max(2048),
  code: totpCode,
  ...device,
});
const refreshBody = z.object({ refreshToken: z.string().min(1).max(256) });

const dev = (b: { deviceName: string; platform: string; deviceId?: string | undefined }) => ({
  id: b.deviceId,
  name: b.deviceName,
  platform: b.platform,
});

export function requireAuth(auth: AuthService): MiddlewareHandler<AuthEnv> {
  return async (c, next) => {
    const m = /^Bearer (.+)$/.exec(c.req.header("authorization") ?? "");
    const who = m ? auth.authenticate(m[1] as string) : null;
    if (!who) return c.json({ error: "unauthorized" }, 401, { "WWW-Authenticate": "Bearer" });
    c.set("userId", who.userId);
    c.set("deviceId", who.deviceId);
    await next();
  };
}

/** `/auth/*` routes. Per-IP limits sit in front of the per-account lockout in the service. */
export function authRoutes(auth: AuthService, now: () => number = Date.now) {
  const app = new Hono<AuthEnv>();
  const sensitive = createRateLimiter(10, 15 * 60_000, now);
  const refreshing = createRateLimiter(60, 15 * 60_000, now);

  app.use(async (c, next) => {
    c.header("Cache-Control", "no-store");
    await next();
  });

  const handle =
    <S extends z.ZodType>(
      schema: S,
      limiter: typeof sensitive,
      fn: (body: z.infer<S>, c: Context<AuthEnv>) => unknown | Promise<unknown>,
    ) =>
    async (c: Context<AuthEnv>) => {
      const hit = limiter.hit(c.get("clientIp"));
      if (!hit.ok) {
        return c.json({ error: "rate_limited" }, 429, { "Retry-After": String(hit.retryAfterSec) });
      }
      const parsed = schema.safeParse(await c.req.json().catch(() => null));
      if (!parsed.success) return c.json({ error: "invalid_request" }, 400);
      try {
        return c.json((await fn(parsed.data, c)) as object);
      } catch (e) {
        if (!(e instanceof AuthError)) throw e;
        return c.json(
          { error: e.code },
          e.status,
          e.retryAfterSec ? { "Retry-After": String(e.retryAfterSec) } : {},
        );
      }
    };

  app.post(
    "/setup",
    handle(setupBody, sensitive, (b) => auth.setup(b)),
  );
  app.post(
    "/login",
    handle(loginBody, sensitive, (b) => auth.login(b)),
  );
  app.post(
    "/login/verify",
    handle(verifyBody, sensitive, (b) =>
      auth.verifyMfa({
        challengeToken: b.challengeToken,
        code: b.code,
        recoveryCode: b.recoveryCode,
        device: dev(b),
      }),
    ),
  );
  app.post(
    "/2fa/confirm",
    handle(confirmBody, sensitive, (b) =>
      auth.confirmEnrolment({ enrolToken: b.enrolToken, code: b.code, device: dev(b) }),
    ),
  );
  app.post(
    "/refresh",
    handle(refreshBody, refreshing, (b) => auth.refresh(b.refreshToken)),
  );

  app.post("/logout", requireAuth(auth), (c) => {
    auth.revokeDevice(c.get("userId"), c.get("deviceId"));
    return c.body(null, 204);
  });
  app.get("/me", requireAuth(auth), (c) =>
    c.json({
      userId: c.get("userId"),
      deviceId: c.get("deviceId"),
      email: auth.emailOf(c.get("userId")),
    }),
  );

  app.all("*", (c) => c.json({ error: "not_found" }, 404));
  return app;
}
