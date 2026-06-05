import { describe, expect, it } from "vitest";
import { formatBudgetCategoriesForPrompt } from "./service.js";

describe("formatBudgetCategoriesForPrompt", () => {
  it("lists unique sorted names", () => {
    const s = formatBudgetCategoriesForPrompt(["Haushalt", "Lebensmittel", "Haushalt", "  "]);
    expect(s).toContain("Haushalt");
    expect(s).toContain("Lebensmittel");
    expect(s.indexOf("Haushalt")).toBeLessThan(s.indexOf("Lebensmittel"));
  });

  it("handles empty input", () => {
    expect(formatBudgetCategoriesForPrompt([])).toMatch(/no expense budget categories/i);
  });
});
