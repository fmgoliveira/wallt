import { describe, expect, it } from "vitest";
import {
  addDays,
  addMonths,
  compareDates,
  daysInMonth,
  diffDays,
  endOfMonth,
  fromLocalDate,
  isValidDate,
  parseDate,
  startOfMonth,
  toUtcTimestamp,
} from "./dates";

describe("dates", () => {
  it("validates", () => {
    expect(isValidDate("2024-02-29")).toBe(true);
    expect(isValidDate("2023-02-29")).toBe(false);
    expect(isValidDate("2023-13-01")).toBe(false);
    expect(isValidDate("2023-1-01")).toBe(false);
    expect(() => parseDate("nope")).toThrow();
    expect(parseDate("2024-03-05")).toEqual({ year: 2024, month: 3, day: 5 });
  });
  it("addDays crosses month/year/leap boundaries", () => {
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
    expect(addDays("2023-02-28", 1)).toBe("2023-03-01");
    expect(addDays("2023-12-31", 1)).toBe("2024-01-01");
    expect(addDays("2024-01-01", -1)).toBe("2023-12-31");
  });
  it("addMonths clamps", () => {
    expect(addMonths("2024-01-31", 1)).toBe("2024-02-29");
    expect(addMonths("2023-01-31", 1)).toBe("2023-02-28");
    expect(addMonths("2023-11-15", 3)).toBe("2024-02-15");
    expect(addMonths("2024-01-15", -2)).toBe("2023-11-15");
    expect(addMonths("2024-03-31", -12)).toBe("2023-03-31");
  });
  it("diff, month bounds, compare", () => {
    expect(diffDays("2024-01-01", "2024-03-01")).toBe(60);
    expect(diffDays("2024-03-01", "2024-01-01")).toBe(-60);
    expect(diffDays("2024-03-30", "2024-03-31")).toBe(1);
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(startOfMonth("2024-05-17")).toBe("2024-05-01");
    expect(endOfMonth("2024-02-10")).toBe("2024-02-29");
    expect([
      compareDates("2024-01-01", "2024-01-02"),
      compareDates("a", "a"),
      compareDates("2024-02-01", "2024-01-02"),
    ]).toEqual([-1, 0, 1]);
  });
  it("local date and timestamp", () => {
    expect(fromLocalDate(new Date(2024, 0, 5, 23, 59))).toBe("2024-01-05");
    expect(toUtcTimestamp(new Date(Date.UTC(2024, 0, 5, 1, 2, 3)))).toBe(
      "2024-01-05T01:02:03.000Z",
    );
  });
});
