import { Hono } from "hono";
import { type AuthEnv, requireAuth } from "../auth/routes";
import type { AuthService } from "../auth/service";
import type { FxService } from "./service";

/** Most rows one response carries; clients page by re-asking from the last date they received. */
export const FX_PAGE_LIMIT = 20_000;
/** Without `since`, a new device gets the last three years: enough to convert recent history. */
const DEFAULT_WINDOW_DAYS = 3 * 365;

/** `GET /fx/rates?since=YYYY-MM-DD` (access token required): ECB reference rates, units of quote per 1 EUR. */
export function fxRoutes(auth: AuthService, fx: FxService, now: () => number) {
  const app = new Hono<AuthEnv>();
  app.use(requireAuth(auth));

  app.get("/rates", (c) => {
    const raw = c.req.query("since");
    if (raw !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      return c.json({ error: "invalid_request" }, 400);
    }
    const since =
      raw ?? new Date(now() - DEFAULT_WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10);
    const rates = fx.rates(since, FX_PAGE_LIMIT);
    // Rates change at most once a day.
    c.header("Cache-Control", "private, max-age=3600");
    return c.json({ rates, latest: fx.latestDate(), more: rates.length === FX_PAGE_LIMIT });
  });

  return app;
}
