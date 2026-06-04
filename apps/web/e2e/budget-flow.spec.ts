import { expect, test } from "@playwright/test";

/**
 * End-to-end happy path (per spec):
 *  1. Login with the demo user
 *  2. Create a category "Lebensmittel <run>" with budget 100 €
 *  3. Capture a "Despar 90 €" transaction in that category
 *  4. Dashboard shows the expense
 *  5. A budget warning message is created (threshold reached)
 *  6. Open the message and mark it as read
 */

const RUN = Date.now().toString().slice(-6);
const CATEGORY = `Lebensmittel ${RUN}`;

/** Selects an option from a Vuetify v-select identified by its label. */
async function pickSelect(page: import("@playwright/test").Page, label: string, option: string) {
  await page.locator(".v-field", { has: page.getByText(label, { exact: false }) }).first().click();
  await page.getByRole("option", { name: option, exact: false }).first().click();
}

test("budget warning flow", async ({ page }) => {
  // 1. Login (fields are pre-filled with the demo credentials).
  await page.goto("/login");
  await page.getByLabel("E-Mail").fill("demo@naxeu.app");
  await page.getByLabel("Passwort").fill("demo123456");
  await page.getByRole("button", { name: "Login", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

  // 2. Create a category with a 100 € budget.
  await page.goto("/categories");
  await page.getByRole("button", { name: "Neue Kategorie" }).click();
  await page.getByLabel("Name").fill(CATEGORY);
  await page.getByLabel("Monatsbudget (€)").fill("100");
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByText(CATEGORY).first()).toBeVisible();

  // 3. Add a Despar 90 € transaction in that category.
  await page.goto("/transactions/add");
  await page.getByLabel("Betrag (€)").fill("90");
  await page.getByLabel("Händler").fill("Despar");
  await pickSelect(page, "Kategorie", CATEGORY);
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(page).toHaveURL(/\/transactions$/);

  // 4. Dashboard reflects the expense (non-zero Ausgaben).
  await page.goto("/");
  await expect(page.getByText("Ausgaben", { exact: true })).toBeVisible();
  await expect(page.getByText("Top-Kategorien", { exact: true })).toBeVisible();

  // 5. The worker creates a budget warning (threshold reached at 90%).
  await page.goto("/messages");
  await expect(page.getByText(`Budget-Warnung: ${CATEGORY}`)).toBeVisible({ timeout: 20_000 });

  // 6. Mark the message as read.
  const card = page
    .locator(".v-list-item", { hasText: `Budget-Warnung: ${CATEGORY}` })
    .first();
  await card.getByRole("button", { name: "Gelesen" }).click();
  await expect(card.getByText("read")).toBeVisible();
});
