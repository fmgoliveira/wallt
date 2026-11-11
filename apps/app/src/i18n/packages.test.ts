import { describeSync } from "@wallt/sync";
import { createInstance } from "i18next";
import { describe, expect, it } from "vitest";
import { en } from "./locales/en";
import { pt } from "./locales/pt";
import { describeRRuleT, describeSyncT, notificationTitleT } from "./packages";

async function make(lng: "en" | "pt") {
  const i = createInstance();
  await i.init({
    lng,
    fallbackLng: "en",
    resources: { en: { translation: en }, pt: { translation: pt } },
    interpolation: { escapeValue: false },
  });
  return i.t;
}

describe("package text helpers", () => {
  it("English output matches the packages' own English text", async () => {
    const t = await make("en");
    for (const r of [
      "FREQ=DAILY",
      "FREQ=WEEKLY;INTERVAL=2;BYDAY=FR",
      "FREQ=MONTHLY;BYMONTHDAY=1",
      "FREQ=MONTHLY;BYMONTHDAY=22",
      "FREQ=MONTHLY;BYMONTHDAY=-1",
      "FREQ=YEARLY;INTERVAL=3",
    ]) {
      const { describeRRule } = await import("@wallt/core");
      expect(describeRRuleT(t, r)).toBe(describeRRule(r));
    }
    const state = { syncing: false, problem: null, lastSyncedAt: 0, pending: 3, failed: 0 };
    const now = 5 * 60_000;
    expect(describeSyncT(t, state, now).label).toBe(describeSync(state, now).label);
  });

  it("translates to Portuguese", async () => {
    const t = await make("pt");
    expect(describeRRuleT(t, "FREQ=WEEKLY;INTERVAL=2;BYDAY=FR")).toBe(
      "A cada 2 semanas à(s) sexta-feira",
    );
    expect(
      notificationTitleT(t, {
        key: "k",
        type: "review",
        title: "3 transactions need review",
        body: "",
        titleText: { id: "reviewCount", params: { count: 3 } },
      }),
    ).toBe("3 transações precisam de revisão");
  });

  it("falls back to the English text for an unknown id", async () => {
    const t = await make("pt");
    expect(
      notificationTitleT(t, {
        key: "k",
        type: "bill",
        title: "English fallback",
        body: "",
        titleText: { id: "somethingNew" },
      }),
    ).toBe("English fallback");
  });
});
