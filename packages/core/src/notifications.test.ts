import { describe, expect, it } from "vitest";
import {
  billNotifications,
  budgetNotifications,
  DEFAULT_NOTIFICATION_PREFS,
  type FeedItem,
  markAllRead,
  mergeFeed,
  rememberKeys,
  reviewNotification,
  selectNotifications,
  unreadCount,
  unseen,
} from "./notifications";

const period = { from: "2026-11-01", to: "2026-11-30" };
const status = (level: "ok" | "warning" | "over", state = "active", percent = 85) =>
  ({ state, level, period, percent }) as never;

describe("budgetNotifications", () => {
  it("alerts at the warning and over thresholds, once per budget, period and level", () => {
    const out = budgetNotifications([
      { budget: { id: "b1", name: "Groceries" }, status: status("warning") },
      { budget: { id: "b2", name: "Fun" }, status: status("over", "active", 120) },
      { budget: { id: "b3", name: "Fine" }, status: status("ok") },
      { budget: { id: "b4", name: "Later" }, status: status("over", "upcoming") },
      { budget: { id: "b5", name: "Done" }, status: status("over", "ended") },
      { budget: { id: "b6", name: "None" }, status: null },
    ]);
    expect(out.map((n) => n.key)).toEqual([
      "budget:b1:2026-11-01:warning",
      "budget:b2:2026-11-01:over",
    ]);
    expect(out[0]).toMatchObject({ type: "budget", title: "Groceries is close to its limit" });
    expect(out[1]?.title).toBe("Fun is over budget");
  });
  it("never puts amounts in the text", () => {
    const [n] = budgetNotifications([
      { budget: { id: "b1", name: "Groceries" }, status: status("over", "active", 120) },
    ]);
    expect(`${n?.title} ${n?.body}`).not.toMatch(/[€$£]/);
  });
});

describe("billNotifications", () => {
  const rule = (id: string, nextDate: string, over = {}) => ({
    id,
    rrule: "FREQ=MONTHLY;BYMONTHDAY=5",
    nextDate,
    active: true,
    template: { payee: `P-${id}` },
    ...over,
  });
  const today = "2026-11-09";
  it("announces bills due within the lead time, today and overdue", () => {
    const out = billNotifications(
      [
        rule("a", "2026-11-12"),
        rule("b", "2026-11-10"),
        rule("c", "2026-11-09"),
        rule("d", "2026-11-05"),
        rule("far", "2026-11-20"),
        rule("off", "2026-11-10", { active: false }),
      ],
      today,
    );
    expect(out.map((n) => `${n.key}|${n.title}`).sort()).toEqual([
      "bill:a:2026-11-12|P-a is due in 3 days",
      "bill:b:2026-11-10|P-b is due tomorrow",
      "bill:c:2026-11-09|P-c is due today",
      "bill:d:2026-11-05|P-d is overdue",
    ]);
    expect(out.find((n) => n.key.startsWith("bill:b"))?.dueDate).toBe("2026-11-10");
  });
  it("can look further ahead for scheduling reminders", () => {
    const far = billNotifications([rule("far", "2026-11-20")], today, 30);
    expect(far.map((n) => n.key)).toEqual(["bill:far:2026-11-20"]);
  });
  it("only the first unposted occurrence of a rule counts", () => {
    const out = billNotifications([rule("w", "2026-11-08", { rrule: "FREQ=DAILY" })], today);
    expect(out.map((n) => n.key)).toEqual(["bill:w:2026-11-08"]);
  });
});

describe("reviewNotification", () => {
  it("is one per day and pluralises", () => {
    expect(reviewNotification(0, "2026-11-09")).toEqual([]);
    expect(reviewNotification(1, "2026-11-09")[0]).toMatchObject({
      key: "review:2026-11-09",
      title: "1 transaction needs review",
    });
    expect(reviewNotification(5, "2026-11-10")[0]?.title).toBe("5 transactions need review");
  });
});

describe("selectNotifications", () => {
  const input = {
    budgets: [{ budget: { id: "b1", name: "G" }, status: status("over") }],
    rules: [
      {
        id: "r",
        rrule: "FREQ=DAILY",
        nextDate: "2026-11-09",
        active: true,
        template: { payee: "X" },
      },
    ],
    reviewCount: 2,
    today: "2026-11-09",
  };
  it("honours the per-type toggles", () => {
    const all = selectNotifications({ ...input, prefs: DEFAULT_NOTIFICATION_PREFS });
    expect(all.map((n) => n.type).sort()).toEqual(["bill", "budget", "review"]);
    const none = selectNotifications({
      ...input,
      prefs: { budget: false, bill: false, review: false },
    });
    expect(none).toEqual([]);
    const onlyBills = selectNotifications({
      ...input,
      prefs: { budget: false, bill: true, review: false },
    });
    expect(onlyBills.map((n) => n.type)).toEqual(["bill"]);
  });
  it("gives two devices identical keys for the same data", () => {
    const a = selectNotifications({ ...input, prefs: DEFAULT_NOTIFICATION_PREFS });
    const b = selectNotifications({ ...input, prefs: DEFAULT_NOTIFICATION_PREFS });
    expect(a.map((n) => n.key)).toEqual(b.map((n) => n.key));
  });
});

describe("unseen / feed", () => {
  const n = (key: string) => ({ key, type: "bill" as const, title: key, body: "" });
  it("filters keys this device has shown and duplicates within a batch", () => {
    expect(unseen([n("a"), n("b"), n("a"), n("c")], new Set(["b"])).map((x) => x.key)).toEqual([
      "a",
      "c",
    ]);
  });
  it("merges new items on top, unread, without repeating a key", () => {
    const feed: FeedItem[] = [{ ...n("old"), createdAt: "2026-11-01T10:00:00Z", read: true }];
    const merged = mergeFeed(feed, [n("new"), n("old")], "2026-11-09T09:00:00Z");
    expect(merged.map((f) => `${f.key}:${f.read}`)).toEqual(["new:false", "old:true"]);
    expect(unreadCount(merged)).toBe(1);
    expect(unreadCount(markAllRead(merged))).toBe(0);
    expect(markAllRead(merged)[1]).toBe(merged[1]); // untouched items are reused
  });
  it("caps the feed", () => {
    const fresh = Array.from({ length: 10 }, (_, i) => n(`k${i}`));
    expect(mergeFeed([], fresh, "2026-11-09T09:00:00Z", 4)).toHaveLength(4);
  });
  it("remembers keys without duplicates and drops the oldest past the cap", () => {
    expect(rememberKeys(["a", "b"], ["b", "c"])).toEqual(["a", "b", "c"]);
    expect(rememberKeys(["a", "b", "c"], ["d"], 3)).toEqual(["b", "c", "d"]);
  });
});
