import { describe, expect, it } from "vitest";
import { formatMoney, monthRange } from "./format";

describe("formatMoney", () => {
  it("formats euros and handles nullish", () => {
    expect(formatMoney("90")).toContain("90");
    expect(formatMoney(null)).toBe("–");
    expect(formatMoney("abc")).toBe("–");
  });
});

describe("monthRange", () => {
  it("computes correct last day per month", () => {
    expect(monthRange("2026-06")).toEqual(["2026-06-01", "2026-06-30"]);
    expect(monthRange("2026-02")).toEqual(["2026-02-01", "2026-02-28"]);
    expect(monthRange("2024-02")).toEqual(["2024-02-01", "2024-02-29"]);
    expect(monthRange("2026-12")).toEqual(["2026-12-01", "2026-12-31"]);
  });
});
