import { describe, expect, it } from "vitest";
import {
  buildRRule,
  describeRRule,
  firstOccurrenceOnOrAfter,
  isValidRRule,
  nextOccurrence,
  occurrencesBetween,
  parseRRule,
  presetOf,
  RECURRENCE_PRESETS,
  rruleForPreset,
  upcomingItems,
} from "./recurrence";
import { detectRecurring, type HistoryItem, suggestionKey } from "./recurrence-detect";

describe("parseRRule / buildRRule", () => {
  it("parses the supported subset", () => {
    expect(parseRRule("FREQ=MONTHLY;BYMONTHDAY=5")).toEqual({
      freq: "MONTHLY",
      interval: 1,
      byDay: [],
      byMonthDay: 5,
      until: null,
    });
    expect(parseRRule("RRULE:freq=weekly;interval=2;byday=fr,mo;until=20261231")).toEqual({
      freq: "WEEKLY",
      interval: 2,
      byDay: [0, 4],
      byMonthDay: null,
      until: "2026-12-31",
    });
    expect(parseRRule("FREQ=MONTHLY;BYMONTHDAY=-1")?.byMonthDay).toBe(-1);
    expect(parseRRule("FREQ=DAILY;UNTIL=2026-12-31T000000Z")?.until).toBe("2026-12-31");
  });
  it("rejects malformed or unsupported rules", () => {
    for (const bad of [
      "",
      "FREQ=HOURLY",
      "FREQ=MONTHLY;COUNT=3",
      "INTERVAL=2",
      "FREQ=DAILY;INTERVAL=0",
      "FREQ=DAILY;INTERVAL=x",
      "FREQ=DAILY;INTERVAL=5000",
      "FREQ=DAILY;BYDAY=MO",
      "FREQ=WEEKLY;BYDAY=XX",
      "FREQ=WEEKLY;BYMONTHDAY=3",
      "FREQ=MONTHLY;BYMONTHDAY=0",
      "FREQ=MONTHLY;BYMONTHDAY=32",
      "FREQ=MONTHLY;BYMONTHDAY=x",
      "FREQ=DAILY;UNTIL=nope",
      "FREQ=DAILY;UNTIL=20261340",
      "FREQ=DAILY;FREQ=DAILY",
      "FREQ",
    ]) {
      expect(parseRRule(bad), bad).toBeNull();
      expect(isValidRRule(bad)).toBe(false);
    }
  });
  it("builds canonical text that parses back", () => {
    const text = buildRRule({ freq: "WEEKLY", interval: 2, byDay: [4, 0], until: "2027-01-31" });
    expect(text).toBe("FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,FR;UNTIL=20270131");
    expect(parseRRule(text)).toMatchObject({ freq: "WEEKLY", interval: 2, byDay: [0, 4] });
    expect(buildRRule({ freq: "MONTHLY", byMonthDay: -1 })).toBe("FREQ=MONTHLY;BYMONTHDAY=-1");
    expect(buildRRule({ freq: "YEARLY" })).toBe("FREQ=YEARLY");
  });
});

describe("nextOccurrence", () => {
  it("steps daily and yearly", () => {
    expect(nextOccurrence("FREQ=DAILY;INTERVAL=3", "2026-12-30")).toBe("2027-01-02");
    expect(nextOccurrence("FREQ=YEARLY", "2026-03-15")).toBe("2027-03-15");
  });
  it("steps weekly with and without BYDAY", () => {
    expect(nextOccurrence("FREQ=WEEKLY", "2026-11-09")).toBe("2026-11-16");
    expect(nextOccurrence("FREQ=WEEKLY;INTERVAL=2", "2026-11-09")).toBe("2026-11-23");
    // Mon 2026-11-09 -> Fri same week -> next Monday-and-Friday week
    expect(nextOccurrence("FREQ=WEEKLY;BYDAY=MO,FR", "2026-11-09")).toBe("2026-11-13");
    expect(nextOccurrence("FREQ=WEEKLY;BYDAY=MO,FR", "2026-11-13")).toBe("2026-11-16");
    expect(nextOccurrence("FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,FR", "2026-11-13")).toBe("2026-11-23");
  });
  it("keeps the day of month and clamps to short months without drifting", () => {
    expect(nextOccurrence("FREQ=MONTHLY;BYMONTHDAY=31", "2026-01-31")).toBe("2026-02-28");
    expect(nextOccurrence("FREQ=MONTHLY;BYMONTHDAY=31", "2026-02-28")).toBe("2026-03-31");
    expect(nextOccurrence("FREQ=MONTHLY;BYMONTHDAY=-1", "2026-02-28")).toBe("2026-03-31");
    expect(nextOccurrence("FREQ=MONTHLY;BYMONTHDAY=-1", "2028-01-31")).toBe("2028-02-29");
    expect(nextOccurrence("FREQ=MONTHLY;INTERVAL=3;BYMONTHDAY=5", "2026-11-05")).toBe("2027-02-05");
    expect(nextOccurrence("FREQ=MONTHLY", "2026-12-15")).toBe("2027-01-15");
  });
  it("stops after UNTIL and on invalid rules", () => {
    expect(nextOccurrence("FREQ=MONTHLY;UNTIL=20261215", "2026-12-15")).toBeNull();
    expect(nextOccurrence("FREQ=MONTHLY;UNTIL=20261215", "2026-11-15")).toBe("2026-12-15");
    expect(nextOccurrence("nope", "2026-11-15")).toBeNull();
  });
});

describe("occurrences and upcoming", () => {
  it("lists occurrences inclusively and respects the limit and UNTIL", () => {
    expect(occurrencesBetween("FREQ=WEEKLY", "2026-11-02", "2026-11-23")).toEqual([
      "2026-11-02",
      "2026-11-09",
      "2026-11-16",
      "2026-11-23",
    ]);
    expect(occurrencesBetween("FREQ=DAILY", "2026-01-01", "2026-12-31", 3)).toHaveLength(3);
    expect(occurrencesBetween("FREQ=DAILY;UNTIL=20260103", "2026-01-01", "2026-12-31")).toEqual([
      "2026-01-01",
      "2026-01-02",
      "2026-01-03",
    ]);
    expect(occurrencesBetween("bad", "2026-01-01", "2026-12-31")).toEqual([]);
    expect(occurrencesBetween("FREQ=DAILY", "2026-02-01", "2026-01-01")).toEqual([]);
  });
  it("finds the first occurrence on or after a date", () => {
    expect(firstOccurrenceOnOrAfter("FREQ=MONTHLY;BYMONTHDAY=5", "2026-01-05", "2026-04-06")).toBe(
      "2026-05-05",
    );
    expect(firstOccurrenceOnOrAfter("FREQ=MONTHLY;BYMONTHDAY=5", "2026-06-05", "2026-04-06")).toBe(
      "2026-06-05",
    );
    expect(
      firstOccurrenceOnOrAfter("FREQ=DAILY;UNTIL=20260110", "2026-01-01", "2026-02-01"),
    ).toBeNull();
    expect(firstOccurrenceOnOrAfter("FREQ=DAILY", "2000-01-01", "2026-02-01")).toBeNull(); // safety cap
  });
  it("merges active rules by date, keeps overdue ones, skips inactive", () => {
    const rules = [
      { id: "rent", rrule: "FREQ=MONTHLY;BYMONTHDAY=1", nextDate: "2026-11-01", active: true },
      { id: "gym", rrule: "FREQ=WEEKLY", nextDate: "2026-11-12", active: true },
      { id: "old", rrule: "FREQ=DAILY", nextDate: "2026-11-01", active: false },
    ];
    const items = upcomingItems(rules, "2026-11-09", 14);
    expect(items.map((i) => `${i.date}:${i.rule.id}:${i.inDays}`)).toEqual([
      "2026-11-01:rent:-8",
      "2026-11-12:gym:3",
      "2026-11-19:gym:10",
    ]);
  });
});

describe("detectRecurring", () => {
  const today = "2026-11-09";
  const tx = (date: string, amount: number, over: Partial<HistoryItem> = {}): HistoryItem => ({
    date,
    amount,
    currency: "EUR",
    payee: "Netflix",
    accountId: "a1",
    categoryId: "c1",
    kind: "expense",
    ...over,
  });
  const monthly = (payee = "Netflix", amount = -1299) =>
    ["2026-08-05", "2026-09-05", "2026-10-05"].map((d) => tx(d, amount, { payee }));

  it("suggests a monthly charge with the next due date", () => {
    const [s] = detectRecurring(monthly(), today);
    expect(s).toMatchObject({
      payee: "Netflix",
      amount: -1299,
      rrule: "FREQ=MONTHLY;BYMONTHDAY=5",
      nextDate: "2026-12-05",
      occurrences: 3,
      lastDate: "2026-10-05",
      confidence: 100,
      categoryId: "c1",
    });
    expect(s?.key).toBe(suggestionKey(tx("2026-08-05", -1299)));
  });
  it("tolerates small amount changes and one irregular gap", () => {
    const history = [
      tx("2026-05-05", -1299),
      tx("2026-06-05", -1349),
      tx("2026-07-05", -1299),
      tx("2026-08-05", -1299),
      tx("2026-09-05", -1299),
      tx("2026-10-08", -1299),
    ];
    const [s] = detectRecurring(history, today);
    expect(s?.occurrences).toBe(6);
    expect(s?.rrule).toBe("FREQ=MONTHLY;BYMONTHDAY=8");
  });
  it("detects weekly, biweekly, quarterly and yearly cadences", () => {
    const weekly = ["2026-10-12", "2026-10-19", "2026-10-26", "2026-11-02"].map((d) =>
      tx(d, -500, { payee: "Gym" }),
    );
    expect(detectRecurring(weekly, today)[0]?.rrule).toBe("FREQ=WEEKLY;BYDAY=MO");
    const biweekly = ["2026-10-02", "2026-10-16", "2026-10-30"].map((d) =>
      tx(d, -500, { payee: "Cleaner" }),
    );
    expect(detectRecurring(biweekly, today)[0]).toMatchObject({
      rrule: "FREQ=WEEKLY;INTERVAL=2;BYDAY=FR",
      nextDate: "2026-11-13",
    });
    const quarterly = ["2026-02-10", "2026-05-10", "2026-08-10"].map((d) =>
      tx(d, -9000, { payee: "Insurance" }),
    );
    expect(detectRecurring(quarterly, today)[0]).toMatchObject({
      rrule: "FREQ=MONTHLY;INTERVAL=3;BYMONTHDAY=10",
      nextDate: "2026-11-10",
    });
    const yearly = ["2024-11-20", "2025-11-20", "2026-11-01"].map((d) =>
      tx(d, -4000, { payee: "Domain" }),
    );
    expect(detectRecurring(yearly, today)).toEqual([]); // gaps 365 and 346: not regular enough
    const yearlyOk = ["2024-11-20", "2025-11-20"]
      .concat("2026-11-20")
      .map((d) => tx(d, -4000, { payee: "Domain" }));
    expect(detectRecurring(yearlyOk, "2026-11-25")[0]?.rrule).toBe("FREQ=YEARLY");
  });
  it("uses the last day of the month when the charges land on it", () => {
    const history = ["2026-08-31", "2026-09-30", "2026-10-31"].map((d) =>
      tx(d, -2000, { payee: "Loan" }),
    );
    expect(detectRecurring(history, today)[0]).toMatchObject({
      rrule: "FREQ=MONTHLY;BYMONTHDAY=-1",
      nextDate: "2026-11-30",
    });
  });
  it("works for recurring income", () => {
    const history = ["2026-08-25", "2026-09-25", "2026-10-25"].map((d) =>
      tx(d, 250_000, { payee: "ACME Payroll", kind: "income" }),
    );
    expect(detectRecurring(history, today)[0]).toMatchObject({
      amount: 250_000,
      nextDate: "2026-11-25",
    });
  });
  it("ignores too few occurrences, irregular dates, varying amounts, transfers and blank payees", () => {
    expect(detectRecurring(monthly().slice(0, 2), today)).toEqual([]);
    const irregular = ["2026-08-01", "2026-08-09", "2026-10-20"].map((d) => tx(d, -500));
    expect(detectRecurring(irregular, today)).toEqual([]);
    const varying = ["2026-08-05", "2026-09-05", "2026-10-05"].map((d, i) =>
      tx(d, -1000 * (i + 1) * 2),
    );
    expect(detectRecurring(varying, today)).toEqual([]);
    expect(
      detectRecurring(
        monthly().map((t) => ({ ...t, kind: "transfer" as const })),
        today,
      ),
    ).toEqual([]);
    expect(detectRecurring(monthly(" "), today)).toEqual([]);
    expect(
      detectRecurring(
        monthly().map((t) => ({ ...t, amount: 0 })),
        today,
      ),
    ).toEqual([]);
  });
  it("drops charges that stopped more than two cycles ago", () => {
    expect(detectRecurring(monthly(), "2027-01-20")).toEqual([]);
  });
  it("never re-suggests payees that already have a rule, and keeps accounts and signs apart", () => {
    expect(detectRecurring(monthly(), today, [{ payee: " NETFLIX ", accountId: "a1" }])).toEqual(
      [],
    );
    expect(detectRecurring(monthly(), today, [{ payee: "Netflix", accountId: "a2" }])).toHaveLength(
      1,
    );
    const mixed = [...monthly(), ...monthly().map((t) => tx(t.date, -1299, { accountId: "a2" }))];
    expect(detectRecurring(mixed, today)).toHaveLength(2);
  });
  it("orders by confidence, then occurrences", () => {
    const a = ["2026-08-05", "2026-09-05", "2026-10-05"].map((d) => tx(d, -1000, { payee: "A" }));
    const b = ["2026-06-05", "2026-07-05", "2026-08-05", "2026-09-05", "2026-10-05"].map((d) =>
      tx(d, -1000, { payee: "B" }),
    );
    expect(detectRecurring([...a, ...b], today).map((s) => s.payee)).toEqual(["B", "A"]);
  });
});

describe("describeRRule", () => {
  it("summarises supported rules in plain English", () => {
    expect(describeRRule("FREQ=DAILY")).toBe("Every day");
    expect(describeRRule("FREQ=WEEKLY;INTERVAL=2;BYDAY=FR")).toBe("Every 2 weeks on Friday");
    expect(describeRRule("FREQ=WEEKLY;BYDAY=MO,FR")).toBe("Every week on Monday, Friday");
    expect(describeRRule("FREQ=MONTHLY;BYMONTHDAY=1")).toBe("Every month on the 1st");
    expect(describeRRule("FREQ=MONTHLY;BYMONTHDAY=2")).toBe("Every month on the 2nd");
    expect(describeRRule("FREQ=MONTHLY;BYMONTHDAY=3")).toBe("Every month on the 3rd");
    expect(describeRRule("FREQ=MONTHLY;BYMONTHDAY=11")).toBe("Every month on the 11th");
    expect(describeRRule("FREQ=MONTHLY;BYMONTHDAY=22")).toBe("Every month on the 22nd");
    expect(describeRRule("FREQ=MONTHLY;INTERVAL=3;BYMONTHDAY=-1")).toBe(
      "Every 3 months on the last day",
    );
    expect(describeRRule("FREQ=MONTHLY")).toBe("Every month");
    expect(describeRRule("FREQ=YEARLY;UNTIL=20301231")).toBe("Every year until 2030-12-31");
    expect(describeRRule("nope")).toBeNull();
  });
});

describe("presets", () => {
  it("builds rules anchored on the first due date", () => {
    // 2026-11-13 is a Friday
    expect(rruleForPreset("weekly", "2026-11-13")).toBe("FREQ=WEEKLY;BYDAY=FR");
    expect(rruleForPreset("biweekly", "2026-11-13")).toBe("FREQ=WEEKLY;INTERVAL=2;BYDAY=FR");
    expect(rruleForPreset("monthly", "2026-11-13")).toBe("FREQ=MONTHLY;BYMONTHDAY=13");
    expect(rruleForPreset("monthly_last", "2026-11-13")).toBe("FREQ=MONTHLY;BYMONTHDAY=-1");
    expect(rruleForPreset("quarterly", "2026-11-13")).toBe("FREQ=MONTHLY;INTERVAL=3;BYMONTHDAY=13");
    expect(rruleForPreset("yearly", "2026-11-13")).toBe("FREQ=YEARLY");
  });
  it("recognises the preset behind a rule, or null for custom ones", () => {
    for (const p of RECURRENCE_PRESETS) {
      expect(presetOf(rruleForPreset(p.value, "2026-11-13"), "2026-11-13")).toBe(p.value);
    }
    expect(presetOf("FREQ=DAILY", "2026-11-13")).toBeNull();
    expect(presetOf("FREQ=MONTHLY;BYMONTHDAY=5", "2026-11-13")).toBeNull();
    expect(presetOf("nope", "2026-11-13")).toBeNull();
  });
});

describe("describeRRuleParts", () => {
  it("exposes the structure behind describeRRule", async () => {
    const { describeRRuleParts } = await import("./recurrence");
    expect(describeRRuleParts("FREQ=WEEKLY;INTERVAL=2;BYDAY=FR")).toMatchObject({
      freq: "WEEKLY",
      interval: 2,
      byDay: [4],
    });
    expect(describeRRuleParts("nonsense")).toBeNull();
  });
});
