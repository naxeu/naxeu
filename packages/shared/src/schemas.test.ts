import { describe, expect, it } from "vitest";
import { createTransactionSchema, extractedAttachmentSchema, registerSchema } from "./schemas.js";
import { toMonthKey } from "./index.js";

describe("createTransactionSchema", () => {
  it("applies defaults and normalises amount to a string", () => {
    const parsed = createTransactionSchema.parse({ amount: 90, date: "2026-06-10" });
    expect(parsed.amount).toBe("90.00");
    expect(parsed.type).toBe("expense");
    expect(parsed.currency).toBe("EUR");
    expect(parsed.affectsBudget).toBe(true);
  });

  it("rejects non-existent calendar dates", () => {
    expect(() => createTransactionSchema.parse({ amount: 1, date: "2026-06-31" })).toThrow();
  });
});

describe("registerSchema", () => {
  it("rejects short passwords and bad emails", () => {
    expect(registerSchema.safeParse({ email: "x", name: "A", password: "short" }).success).toBe(false);
    expect(registerSchema.safeParse({ email: "a@b.de", name: "A", password: "longenough" }).success).toBe(true);
  });
});

describe("toMonthKey", () => {
  it("formats a date as YYYY-MM", () => {
    expect(toMonthKey(new Date(Date.UTC(2026, 5, 15)))).toBe("2026-06");
  });
});

describe("extractedAttachmentSchema", () => {
  it("accepts comma decimals and currency noise from model-shaped JSON", () => {
    const raw = {
      merchantName: "Testladen",
      total: "12,50 €",
      date: "2026-06-01",
      currency: "eur",
      lineItems: [{ description: "Milch", amount: "1,99", categoryHint: null }],
      confidence: "0.85",
    };
    const parsed = extractedAttachmentSchema.parse(raw);
    expect(parsed.total).toBe("12.50");
    expect(parsed.currency).toBe("EUR");
    expect(parsed.lineItems[0]!.amount).toBe("1.99");
    expect(parsed.confidence).toBe(0.85);
  });

  it("trims categoryHint on line items", () => {
    const raw = {
      merchantName: "X",
      total: "1.00",
      date: "2026-06-01",
      currency: "EUR",
      lineItems: [{ description: "A", amount: "1.00", categoryHint: "  Lebensmittel  " }],
      confidence: 0.5,
    };
    const parsed = extractedAttachmentSchema.parse(raw);
    expect(parsed.lineItems[0]!.categoryHint).toBe("Lebensmittel");
  });
});
