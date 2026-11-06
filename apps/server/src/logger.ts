import pino from "pino";
import type { Config } from "./config";

export type Logger = pino.Logger;

/** Structured JSON logs; secrets are redacted if they ever end up in a log object. */
export function createLogger(config: Pick<Config, "LOG_LEVEL">): Logger {
  return pino({
    level: config.LOG_LEVEL,
    redact: [
      "*.password",
      "*.token",
      "*.authorization",
      "*.ENCRYPTION_KEY",
      "req.headers.authorization",
      "req.headers.cookie",
    ],
  });
}
