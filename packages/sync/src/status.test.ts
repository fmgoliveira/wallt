import { describe, expect, it } from "vitest";
import type { SyncState } from "./engine";
import { describeSync, timeAgo } from "./status";

const base: SyncState = {
  syncing: false,
  problem: null,
  lastSyncedAt: null,
  pending: 0,
  failed: 0,
};
const NOW = 1_700_000_000_000;

describe("timeAgo", () => {
  it("rounds to the largest sensible unit", () => {
    expect(timeAgo(NOW - 10_000, NOW)).toBe("just now");
    expect(timeAgo(NOW - 2 * 60_000, NOW)).toBe("2 min ago");
    expect(timeAgo(NOW - 3 * 3600_000, NOW)).toBe("3 h ago");
    expect(timeAgo(NOW - 5 * 86_400_000, NOW)).toBe("5 d ago");
    expect(timeAgo(NOW + 5000, NOW)).toBe("just now");
  });
});

describe("describeSync", () => {
  it("local only when signed out", () => {
    expect(describeSync(null, NOW)).toEqual({ label: "Local only", tone: "neutral" });
  });
  it("synced, with pending changes and while syncing", () => {
    expect(describeSync({ ...base, lastSyncedAt: NOW - 120_000 }, NOW)).toEqual({
      label: "Synced 2 min ago",
      tone: "positive",
    });
    expect(describeSync({ ...base, lastSyncedAt: NOW, pending: 3 }, NOW)).toEqual({
      label: "Synced just now · 3 waiting",
      tone: "warning",
    });
    expect(describeSync({ ...base, syncing: true, pending: 1 }, NOW).label).toBe(
      "Syncing… · 1 waiting",
    );
    expect(describeSync(base, NOW).label).toBe("Not synced yet");
  });
  it("offline is a warning, auth and schema problems are errors", () => {
    expect(describeSync({ ...base, problem: "offline", pending: 2 }, NOW)).toEqual({
      label: "Offline · 2 waiting",
      tone: "warning",
    });
    expect(describeSync({ ...base, problem: "unauthorized" }, NOW).tone).toBe("negative");
    expect(describeSync({ ...base, problem: "schema_outdated" }, NOW).label).toBe(
      "Update the app to sync",
    );
    expect(describeSync({ ...base, failed: 2 }, NOW).tone).toBe("negative");
  });
});
