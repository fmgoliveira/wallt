import { describe, expect, it } from "vitest";
import { EMAIL, harness, type J, PASSWORD } from "./test-harness";
import { generateTotp } from "./totp";

describe("device management", () => {
  it("lists only active devices, flags the current one and exposes no secrets", async () => {
    const h = await harness();
    const { secret, session: a } = await h.bootstrap();
    const b = await h.login(secret, { deviceName: "Laptop", platform: "web" });
    const list = await h.call("GET", "/auth/devices", undefined, h.bearer(b.accessToken));
    expect(list.status).toBe(200);
    expect(list.json.devices).toHaveLength(2);
    expect(list.json.devices.find((d: J) => d.current)).toMatchObject({
      id: b.deviceId,
      name: "Laptop",
      platform: "web",
    });
    expect(list.json.devices.find((d: J) => d.id === a.deviceId).current).toBe(false);
    expect(JSON.stringify(list.json)).not.toMatch(/token|hash|secret/i);
    await h.call("DELETE", `/auth/devices/${a.deviceId}`, undefined, h.bearer(b.accessToken));
    const after = await h.call("GET", "/auth/devices", undefined, h.bearer(b.accessToken));
    expect(after.json.devices.map((d: J) => d.id)).toEqual([b.deviceId]);
    expect((await h.call("GET", "/auth/devices")).status).toBe(401);
  });

  it("revokes another device (its access and refresh tokens die) without touching the caller", async () => {
    const h = await harness();
    const { secret, session: a } = await h.bootstrap();
    const b = await h.login(secret, { deviceName: "Laptop", platform: "web" });
    const del = await h.call(
      "DELETE",
      `/auth/devices/${a.deviceId}`,
      undefined,
      h.bearer(b.accessToken),
    );
    expect(del.status).toBe(204);
    expect((await h.call("GET", "/auth/me", undefined, h.bearer(a.accessToken))).status).toBe(401);
    expect((await h.post("/auth/refresh", { refreshToken: a.refreshToken })).status).toBe(401);
    expect((await h.call("GET", "/auth/me", undefined, h.bearer(b.accessToken))).status).toBe(200);
    const again = await h.call(
      "DELETE",
      `/auth/devices/${a.deviceId}`,
      undefined,
      h.bearer(b.accessToken),
    );
    expect(again.status).toBe(404);
    const junk = await h.call(
      "DELETE",
      "/auth/devices/not-a-device",
      undefined,
      h.bearer(b.accessToken),
    );
    expect(junk.status).toBe(404);
    expect((await h.call("DELETE", `/auth/devices/${b.deviceId}`)).status).toBe(401);
  });

  it("does not let a user revoke a device that belongs to someone else", async () => {
    const h = await harness();
    const { session } = await h.bootstrap();
    h.db
      .prepare(
        "INSERT INTO users (id, email, password_hash, created_at, updated_at) VALUES ('u2', 'b@example.com', 'x', 't', 't')",
      )
      .run();
    h.db
      .prepare(
        "INSERT INTO devices (id, user_id, name, platform, created_at) VALUES ('d-foreign', 'u2', 'x', 'web', 't')",
      )
      .run();
    h.db
      .prepare(
        "INSERT INTO refresh_tokens (id, user_id, device_id, token_hash, family_id, created_at, expires_at) VALUES ('r-foreign', 'u2', 'd-foreign', 'h', 'f', 't', 't')",
      )
      .run();
    const res = await h.call(
      "DELETE",
      "/auth/devices/d-foreign",
      undefined,
      h.bearer(session.accessToken),
    );
    expect(res.status).toBe(404);
    expect(h.db.prepare("SELECT revoked_at FROM devices WHERE id = 'd-foreign'").get()).toEqual({
      revoked_at: null,
    });
    expect(
      h.db.prepare("SELECT revoked_at FROM refresh_tokens WHERE id = 'r-foreign'").get(),
    ).toEqual({
      revoked_at: null,
    });
  });
});

describe("re-authentication for sensitive actions", () => {
  const REGEN = "/auth/recovery-codes/regenerate";

  it("regenerating recovery codes needs password + current TOTP and invalidates the old codes", async () => {
    const h = await harness();
    const { secret, session, recoveryCodes } = await h.bootstrap();
    const auth = h.bearer(session.accessToken);
    h.advance(30_000);
    const code = generateTotp(secret, h.now());
    expect((await h.call("POST", REGEN, {}, auth)).status).toBe(400);
    expect((await h.call("POST", REGEN, { password: PASSWORD, code })).status).toBe(401);
    const badPw = await h.call("POST", REGEN, { password: "wrong password!", code }, auth);
    expect(badPw.json.error).toBe("invalid_credentials");
    const badCode = await h.call("POST", REGEN, { password: PASSWORD, code: "000000" }, auth);
    expect(badCode.json.error).toBe("invalid_code");
    const ok = await h.call("POST", REGEN, { password: PASSWORD, code }, auth);
    expect(ok.status).toBe(200);
    expect(ok.json.recoveryCodes).toHaveLength(10);
    const replay = await h.call("POST", REGEN, { password: PASSWORD, code }, auth);
    expect(replay.json.error).toBe("invalid_code"); // the same TOTP code cannot be reused
    const p1 = await h.post("/auth/login", { email: EMAIL, password: PASSWORD });
    const old = await h.post("/auth/login/verify", {
      challengeToken: p1.json.challengeToken,
      recoveryCode: recoveryCodes[0],
      ...h.dev,
    });
    expect(old.json.error).toBe("invalid_code");
    const fresh = await h.post("/auth/login/verify", {
      challengeToken: p1.json.challengeToken,
      recoveryCode: ok.json.recoveryCodes[0],
      ...h.dev,
    });
    expect(fresh.status).toBe(200);
  });

  it("wrong passwords on a sensitive action count toward the account lockout", async () => {
    const h = await harness();
    const { secret, session } = await h.bootstrap();
    h.advance(30_000);
    const code = generateTotp(secret, h.now());
    for (let i = 0; i < 5; i++) {
      await h.call(
        "POST",
        "/auth/2fa/reset",
        { password: "wrong password!", code },
        h.bearer(session.accessToken),
      );
    }
    const locked = await h.call(
      "POST",
      "/auth/2fa/reset",
      { password: PASSWORD, code },
      h.bearer(session.accessToken),
    );
    expect(locked).toMatchObject({ status: 429, json: { error: "locked" } });
  });

  it("2FA reset keeps the old authenticator until the new one is confirmed", async () => {
    const h = await harness();
    const { secret, session } = await h.bootstrap();
    const auth = h.bearer(session.accessToken);
    h.advance(30_000);
    const reset = await h.call(
      "POST",
      "/auth/2fa/reset",
      { password: PASSWORD, code: generateTotp(secret, h.now()) },
      auth,
    );
    expect(reset.status).toBe(200);
    expect(reset.json.status).toBe("reset_pending");
    expect(reset.json.secret).not.toBe(secret);
    expect(reset.json.otpauthUri).toContain(reset.json.secret);
    // abandoned reset: the old authenticator still works for login
    expect((await h.login(secret)).accessToken).toBeTruthy();
    // a code from the OLD secret cannot confirm the new one
    h.advance(30_000);
    const bad = await h.call(
      "POST",
      "/auth/2fa/reset/confirm",
      { enrolToken: reset.json.enrolToken, code: generateTotp(secret, h.now()) },
      auth,
    );
    expect(bad.json.error).toBe("invalid_code");
    // the reset token is not a first-time enrolment token
    const asEnrol = await h.post("/auth/2fa/confirm", {
      enrolToken: reset.json.enrolToken,
      code: generateTotp(reset.json.secret, h.now()),
      ...h.dev,
    });
    expect(asEnrol.status).toBe(401);
  });

  it("confirming a 2FA reset swaps the secret, rotates recovery codes and signs out other devices", async () => {
    const h = await harness();
    const { secret, session: a, recoveryCodes } = await h.bootstrap();
    const b = await h.login(secret, { deviceName: "Laptop", platform: "web" });
    h.advance(30_000);
    const reset = await h.call(
      "POST",
      "/auth/2fa/reset",
      { password: PASSWORD, code: generateTotp(secret, h.now()) },
      h.bearer(a.accessToken),
    );
    const done = await h.call(
      "POST",
      "/auth/2fa/reset/confirm",
      { enrolToken: reset.json.enrolToken, code: generateTotp(reset.json.secret, h.now()) },
      h.bearer(a.accessToken),
    );
    expect(done.status).toBe(200);
    expect(done.json.recoveryCodes).toHaveLength(10);
    expect(done.json.revokedDevices).toBe(1);
    expect((await h.call("GET", "/auth/me", undefined, h.bearer(a.accessToken))).status).toBe(200);
    expect((await h.call("GET", "/auth/me", undefined, h.bearer(b.accessToken))).status).toBe(401);
    expect((await h.post("/auth/refresh", { refreshToken: b.refreshToken })).status).toBe(401);
    expect((await h.post("/auth/refresh", { refreshToken: a.refreshToken })).status).toBe(200);
    // login: the old authenticator and old recovery codes are dead, the new ones work
    h.advance(60_000);
    const p = await h.post("/auth/login", { email: EMAIL, password: PASSWORD });
    const old = await h.post("/auth/login/verify", {
      challengeToken: p.json.challengeToken,
      code: generateTotp(secret, h.now()),
      ...h.dev,
    });
    expect(old.json.error).toBe("invalid_code");
    const oldRecovery = await h.post("/auth/login/verify", {
      challengeToken: p.json.challengeToken,
      recoveryCode: recoveryCodes[1],
      ...h.dev,
    });
    expect(oldRecovery.json.error).toBe("invalid_code");
    const fresh = await h.post("/auth/login/verify", {
      challengeToken: p.json.challengeToken,
      code: generateTotp(reset.json.secret, h.now()),
      ...h.dev,
    });
    expect(fresh.status).toBe(200);
    // the code just used cannot be replayed
    const p2 = await h.post("/auth/login", { email: EMAIL, password: PASSWORD });
    const replay = await h.post("/auth/login/verify", {
      challengeToken: p2.json.challengeToken,
      code: generateTotp(reset.json.secret, h.now()),
      ...h.dev,
    });
    expect(replay.json.error).toBe("invalid_code");
    const viaRecovery = await h.post("/auth/login/verify", {
      challengeToken: p2.json.challengeToken,
      recoveryCode: done.json.recoveryCodes[0],
      ...h.dev,
    });
    expect(viaRecovery.status).toBe(200);
  });

  it("a reset token only works for the user and device that started it, and expires", async () => {
    const h = await harness();
    const { secret, session: a } = await h.bootstrap();
    const b = await h.login(secret, { deviceName: "Laptop", platform: "web" });
    h.advance(30_000);
    const reset = await h.call(
      "POST",
      "/auth/2fa/reset",
      { password: PASSWORD, code: generateTotp(secret, h.now()) },
      h.bearer(a.accessToken),
    );
    const stolen = await h.call(
      "POST",
      "/auth/2fa/reset/confirm",
      { enrolToken: reset.json.enrolToken, code: generateTotp(reset.json.secret, h.now()) },
      h.bearer(b.accessToken),
    );
    expect(stolen).toMatchObject({ status: 401, json: { error: "invalid_token" } });
    h.advance(16 * 60_000);
    const fresh = await h.login(secret, { deviceName: "Tablet", platform: "web" });
    const expired = await h.call(
      "POST",
      "/auth/2fa/reset/confirm",
      { enrolToken: reset.json.enrolToken, code: generateTotp(reset.json.secret, h.now()) },
      h.bearer(fresh.accessToken),
    );
    expect(expired.status).toBe(401);
  });
});
