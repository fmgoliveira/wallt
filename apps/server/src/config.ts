import { z } from "zod";

const base64Key = z.string().refine((v) => {
  const bytes = Buffer.from(v, "base64");
  return bytes.length >= 32 && bytes.toString("base64").replace(/=+$/, "") === v.replace(/=+$/, "");
}, "must be base64 and decode to at least 32 bytes");

const schema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATA_DIR: z.string().min(1).default("/data"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  APP_URL: z.url().optional(),
  /** Static Expo web export to serve on the same origin; unset = API only. */
  WEB_DIR: z.string().min(1).optional(),
  /** Reverse proxies (IPs/CIDRs) whose X-Real-IP is trusted; default loopback. */
  TRUSTED_PROXIES: z.string().default("127.0.0.1,::1"),
  TZ: z.string().min(1).optional(),
  /** Master secret: TOTP secrets are encrypted with it and the JWT key is derived from it. */
  ENCRYPTION_KEY: base64Key,
  /** age public key; backups run only when this and the Google client below are all set. */
  BACKUP_AGE_RECIPIENT: z
    .string()
    .regex(/^age1[a-z0-9]{50,}$/, "must be an age public key (age1...)")
    .optional(),
  GDRIVE_CLIENT_ID: z.string().min(1).optional(),
  GDRIVE_CLIENT_SECRET: z.string().min(1).optional(),
  /** One-time guard for creating the first user; setup is disabled when unset. */
  SETUP_TOKEN: z.string().min(16).optional(),
});

export type Config = z.infer<typeof schema>;

/** Validates process env. Empty strings (e.g. `APP_URL=` in compose) count as unset. */
export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const cleaned = Object.fromEntries(
    Object.entries(env).filter(([, v]) => v !== undefined && v !== ""),
  );
  const parsed = schema.safeParse(cleaned);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid configuration: ${issues}`);
  }
  return parsed.data;
}
