import { describe, expect, it } from "vitest";
import {
  heuristicCategorize,
  heuristicExtractAttachment,
  heuristicParseQuickInput,
  parseAmount,
} from "../heuristics.js";

describe("parseAmount", () => {
  it("parses German decimals", () => {
    expect(parseAmount("despar 84,30 karte")).toBe(84.3);
    expect(parseAmount("+3250 gehalt")).toBe(3250);
    expect(parseAmount("amazon 12.99 haushalt")).toBe(12.99);
    expect(parseAmount("3.250,00")).toBe(3250);
  });
});

describe("heuristicParseQuickInput", () => {
  it("detects expense with merchant and category", () => {
    const r = heuristicParseQuickInput("despar 84,30 karte");
    expect(r.type).toBe("expense");
    expect(r.amount).toBe("84.30");
    expect(r.merchantName).toBe("Despar");
    expect(r.categoryHint).toBe("Lebensmittel");
  });

  it("detects pet category", () => {
    const r = heuristicParseQuickInput("zooplus 42,90 katzenfutter");
    expect(r.merchantName).toBe("Zooplus");
    expect(r.categoryHint).toBe("Haustiere");
    expect(r.amount).toBe("42.90");
  });

  it("detects income via plus sign and keyword", () => {
    const r = heuristicParseQuickInput("+3250 gehalt");
    expect(r.type).toBe("income");
    expect(r.amount).toBe("3250.00");
    expect(r.categoryHint).toBe("Gehalt");
  });

  it("detects household category", () => {
    const r = heuristicParseQuickInput("amazon 12,99 haushalt");
    expect(r.categoryHint).toBe("Haushalt");
    expect(r.merchantName).toBe("Amazon");
  });
});

describe("heuristicCategorize", () => {
  it("returns a category for known merchants", () => {
    expect(heuristicCategorize("Netflix Abo").categoryName).toBe("Abos");
    expect(heuristicCategorize("Unbekannt XYZ").categoryName).toBeNull();
  });
});

describe("heuristicExtractAttachment", () => {
  it("produces line items that sum to the total", () => {
    const r = heuristicExtractAttachment("beleg.jpg");
    const sum = r.lineItems.reduce((s, i) => s + Number.parseFloat(i.amount), 0);
    expect(Number(r.total)).toBeCloseTo(sum, 2);
    expect(r.lineItems.length).toBeGreaterThan(0);
  });
});
