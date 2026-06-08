import { describe, expect, it } from "vitest";
import { amountsMatchForMerge, isoDateDiffDays, RECEIPT_IMPORT_MERGE_AMOUNT_TOLERANCE_CENTS } from "../receipt-import-merge.js";

describe("receipt-import-merge helpers", () => {
  it("isoDateDiffDays", () => {
    expect(isoDateDiffDays("2025-03-10", "2025-03-10")).toBe(0);
    expect(isoDateDiffDays("2025-03-10", "2025-03-11")).toBe(1);
    expect(isoDateDiffDays("2025-03-11", "2025-03-10")).toBe(1);
  });

  it("amountsMatchForMerge tolerates cent drift on signed expenses", () => {
    expect(amountsMatchForMerge("-12.50", "-12.50", RECEIPT_IMPORT_MERGE_AMOUNT_TOLERANCE_CENTS)).toBe(true);
    expect(amountsMatchForMerge("-12.50", "-12.51", RECEIPT_IMPORT_MERGE_AMOUNT_TOLERANCE_CENTS)).toBe(true);
    expect(amountsMatchForMerge("-12.50", "-12.53", RECEIPT_IMPORT_MERGE_AMOUNT_TOLERANCE_CENTS)).toBe(false);
  });
});
