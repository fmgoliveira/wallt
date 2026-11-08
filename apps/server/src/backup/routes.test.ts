import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as age from "age-encryption";
import pino from "pino";
import { describe, expect, it } from "vitest";
import { harness } from "../auth/test-harness";
import { createBackupService } from "./service";
import { createFsStorage } from "./storage";

const log = pino({ level: "silent" });

async function service(storage: ReturnType<typeof createFsStorage>) {
  const recipient = await age.identityToRecipient(await age.generateX25519Identity());
  return (db: Parameters<typeof createBackupService>[0]["db"], dataDir: string) =>
    createBackupService({ db, dataDir, log, recipient, storage });
}

describe("/backups", () => {
  it("requires an access token", async () => {
    const h = await harness({ setupToken: undefined, backup: () => null });
    expect((await h.call("GET", "/backups")).status).toBe(401);
    expect((await h.call("POST", "/backups/run", {})).status).toBe(401);
  });

  it("reports 'not configured' and refuses manual runs when backups are off", async () => {
    const h = await harness({ backup: () => null });
    const { session } = await h.bootstrap();
    const auth = h.bearer(session.accessToken);
    const status = await h.call("GET", "/backups", undefined, auth);
    expect(status.json).toMatchObject({
      configured: false,
      runs: [],
      lastSuccessAt: null,
      lastFailure: null,
    });
    expect(status.headers.get("cache-control")).toBe("no-store");
    expect(await h.call("POST", "/backups/run", {}, auth)).toMatchObject({
      status: 503,
      json: { error: "backups_not_configured" },
    });
  });

  it("runs a manual backup and shows it in the status", async () => {
    const make = await service(createFsStorage(mkdtempSync(join(tmpdir(), "wallt-store-"))));
    const h = await harness({ backup: make });
    const { session } = await h.bootstrap();
    const auth = h.bearer(session.accessToken);
    const run = await h.call("POST", "/backups/run", {}, auth);
    expect(run.status).toBe(200);
    expect(run.json).toMatchObject({ status: "success", pruned: 0 });
    expect(run.json.sizeBytes).toBeGreaterThan(0);
    const status = await h.call("GET", "/backups", undefined, auth);
    expect(status.json.configured).toBe(true);
    expect(status.json.runs).toHaveLength(1);
    expect(status.json.runs[0]).toMatchObject({ trigger: "manual", status: "success" });
    expect(status.json.lastSuccessAt).toBe(status.json.runs[0].finishedAt);
    expect(status.json.lastFailure).toBeNull();
    expect(JSON.stringify(status.json)).not.toMatch(/token|secret|key/i);
  });

  it("surfaces a failed run (message + lastFailure) and recovers", async () => {
    const real = createFsStorage(mkdtempSync(join(tmpdir(), "wallt-store-")));
    let broken = true;
    const make = await service({
      ...real,
      upload: async (name, bytes) => {
        if (broken)
          throw new Error("Google refresh token was revoked or expired; run drive-auth again");
        return real.upload(name, bytes);
      },
    });
    const h = await harness({ backup: make });
    const { session } = await h.bootstrap();
    const auth = h.bearer(session.accessToken);
    const failed = await h.call("POST", "/backups/run", {}, auth);
    expect(failed).toMatchObject({ status: 502, json: { error: "backup_failed" } });
    expect(failed.json.message).toMatch(/run drive-auth/);
    const status = await h.call("GET", "/backups", undefined, auth);
    expect(status.json.lastFailure).toMatchObject({ status: "failed", trigger: "manual" });
    expect(status.json.lastSuccessAt).toBeNull();
    broken = false;
    expect((await h.call("POST", "/backups/run", {}, auth)).status).toBe(200);
    expect((await h.call("GET", "/backups", undefined, auth)).json.lastFailure).toBeNull();
  });

  it("answers 409 while another backup is running", async () => {
    const real = createFsStorage(mkdtempSync(join(tmpdir(), "wallt-store-")));
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    const make = await service({
      ...real,
      upload: async (name, bytes) => {
        await gate;
        return real.upload(name, bytes);
      },
    });
    const h = await harness({ backup: make });
    const { session } = await h.bootstrap();
    const auth = h.bearer(session.accessToken);
    const first = h.call("POST", "/backups/run", {}, auth);
    await new Promise((r) => setTimeout(r, 200));
    expect(await h.call("POST", "/backups/run", {}, auth)).toMatchObject({
      status: 409,
      json: { error: "backup_in_progress" },
    });
    release();
    expect((await first).status).toBe(200);
  });
});
