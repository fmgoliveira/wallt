import { SCHEMA_VERSION } from "@wallt/db";
import { createAuthClient, createHttpTransport, createSessionManager } from "@wallt/sync";
import { describe, expect, it } from "vitest";
import { EMAIL, harness, PASSWORD } from "../auth/test-harness";
import { generateTotp } from "../auth/totp";

/** The device-side auth client against the real auth routes (field names, tokens, refresh rotation). */
describe("device sign-in", () => {
  it("signs in with password + TOTP, then syncs with a refreshed token", async () => {
    const h = await harness();
    const { secret } = await h.bootstrap();
    const fetchApp = async (url: string, init?: RequestInit) =>
      h.app.request(
        new URL(url).pathname + new URL(url).search,
        {
          ...init,
          headers: { ...(init?.headers as Record<string, string>), "x-real-ip": "10.9.9.9" },
        },
        {
          incoming: { socket: { remoteAddress: "127.0.0.1", remotePort: 1, remoteFamily: "IPv4" } },
        },
      );
    const deviceId = "01900000-0000-7000-8000-000000000042";
    const client = createAuthClient({
      baseUrl: "http://x",
      fetch: fetchApp,
      device: { deviceId, deviceName: "Test phone", platform: "android" },
      now: h.now,
    });

    const step1 = await client.login(EMAIL, PASSWORD);
    if (step1.status !== "mfa_required") throw new Error("expected mfa");
    h.advance(30_000);
    const session = await client.verify(step1.challengeToken, {
      code: generateTotp(secret, h.now()),
    });
    expect(session.email).toBe(EMAIL);
    expect(session.deviceId).toBeTruthy(); // the server assigns the device id (a client-proposed one is only reused if known)

    const stored: unknown[] = [];
    const manager = createSessionManager({
      storage: {
        load: async () => null,
        save: async (s) => void stored.push(s),
        clear: async () => undefined,
      },
      fetch: fetchApp,
      initial: session,
      now: h.now,
    });
    const transport = createHttpTransport({
      baseUrl: "http://x",
      getAccessToken: () => manager.getAccessToken(),
      fetch: fetchApp,
    });
    const first = await transport.pull({
      since: 0,
      limit: 10,
      schemaVersion: SCHEMA_VERSION,
    });
    expect(first.hasMore).toBe(false);

    h.advance(60 * 60_000); // access token expired: the manager refreshes it and rotates the refresh token
    await transport.pull({ since: 0, limit: 10, schemaVersion: first.schemaVersion });
    expect(stored).toHaveLength(1);
    expect(manager.current()?.refreshToken).not.toBe(session.refreshToken);
  });

  it("wrong password and wrong code map to client error kinds", async () => {
    const h = await harness();
    const { secret } = await h.bootstrap();
    const fetchApp = async (url: string, init?: RequestInit) =>
      h.app.request(
        new URL(url).pathname,
        {
          ...init,
          headers: { ...(init?.headers as Record<string, string>), "x-real-ip": "10.9.9.8" },
        },
        {
          incoming: { socket: { remoteAddress: "127.0.0.1", remotePort: 1, remoteFamily: "IPv4" } },
        },
      );
    const client = createAuthClient({
      baseUrl: "http://x",
      fetch: fetchApp,
      device: {
        deviceId: "01900000-0000-7000-8000-000000000043",
        deviceName: "p",
        platform: "other",
      },
    });
    await expect(client.login(EMAIL, "nope nope nope nope")).rejects.toMatchObject({
      kind: "invalid_credentials",
    });
    const ok = await client.login(EMAIL, PASSWORD);
    if (ok.status !== "mfa_required") throw new Error("expected mfa");
    await expect(client.verify(ok.challengeToken, { code: "000000" })).rejects.toMatchObject({
      kind: "invalid_code",
    });
    expect(secret).toBeTruthy();
  });
});
