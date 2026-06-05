import { describe, expect, it } from "vitest";
import { parseDelimitedLine, parseDelimitedText, sniffDelimiter } from "./importTabular.js";

describe("importTabular", () => {
  it("sniffs tab delimiter", () => {
    expect(sniffDelimiter("a\tb\tc")).toBe("\t");
  });

  it("parses quoted CSV fields", () => {
    expect(parseDelimitedLine('"a,b",c', ",")).toEqual(["a,b", "c"]);
  });

  it("parses semicolon German header row", () => {
    const t = "Buchungstag;Betrag;Verwendungszweck\n2026-01-02;-12,50;Coffee";
    const sheet = parseDelimitedText(t);
    expect(sheet.delimiter).toBe(";");
    expect(sheet.headers[0]).toContain("Buchung");
    expect(sheet.rows).toHaveLength(1);
  });
});
