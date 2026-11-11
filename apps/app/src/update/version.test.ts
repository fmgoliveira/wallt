import { describe, expect, it } from "vitest";
import { isNewerVersion, parseVersion } from "./version";

describe("versions", () => {
  it("parses release versions", () => {
    expect(parseVersion("1.2.3")).toEqual([1, 2, 3]);
    expect(parseVersion("v10.0.1")).toEqual([10, 0, 1]);
    expect(parseVersion("1.2.3-rc.1")).toEqual([1, 2, 3]);
    expect(parseVersion("dev")).toBeNull();
    expect(parseVersion("1.2")).toBeNull();
  });
  it("compares numerically, not as text", () => {
    expect(isNewerVersion("1.10.0", "1.9.9")).toBe(true);
    expect(isNewerVersion("2.0.0", "1.99.99")).toBe(true);
    expect(isNewerVersion("1.2.4", "1.2.3")).toBe(true);
  });
  it("is not newer when equal, older or unknown", () => {
    expect(isNewerVersion("1.2.3", "1.2.3")).toBe(false);
    expect(isNewerVersion("1.2.2", "1.2.3")).toBe(false);
    expect(isNewerVersion("dev", "1.2.3")).toBe(false);
    expect(isNewerVersion("1.2.3", "dev")).toBe(false);
  });
});
