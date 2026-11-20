import { expect, test } from "@playwright/test";

const UNIT = { id: "00000000-0000-4000-8000-000000000501", code: "01/01/01/001", name: "RAILWAY QUARTERS I", state: "ABIA", lga: "ABA NORTH", ward: "EZIAMA", is_simulated: false };

async function mockDirectory(context: import("@playwright/test").BrowserContext) {
  await context.route("**/api/directory?**", route => {
    const params = new URL(route.request().url()).searchParams;
    const level = params.get("level");
    const state = params.get("state");
    const items = level === "states" ? [{ code: "01", name: "ABIA" }, { code: "02", name: "ADAMAWA" }]
      : level === "lgas" ? [{ code: "01", name: state === "02" ? "DEMSA" : "ABA NORTH" }]
      : level === "wards" ? [{ code: "01", name: state === "02" ? "BILLE" : "EZIAMA" }]
      : level === "code" || level === "units" ? [UNIT] : [];
    return route.fulfill({ json: { items } });
  });
}

test("directory follows codes, resets children, and finds exact leading-zero code", async ({ page, context }) => {
  const unit = UNIT;
  await mockDirectory(context);
  await page.goto("/report");
  await page.getByLabel("State or FCT", { exact: true }).selectOption("01");
  await page.getByLabel("LGA", { exact: true }).selectOption("01");
  await page.getByLabel("Ward", { exact: true }).selectOption("01");
  await page.getByLabel("Polling unit", { exact: true }).selectOption(unit.id);
  await expect(page.getByText(/Confirmed: 01\/01\/01\/001/)).toBeVisible();
  await page.getByLabel("State or FCT", { exact: true }).selectOption("02");
  await expect(page.getByText(/Confirmed: 01\/01\/01\/001/)).toHaveCount(0);
  await page.getByLabel("Full polling-unit code").fill("01/01/01/001");
  await page.getByRole("button", { name: "Find code" }).click();
  await expect(page.getByText(/Confirmed: 01\/01\/01\/001/)).toBeVisible();
  await expect(page.getByLabel("State or FCT", { exact: true })).toHaveValue("01");
  await expect(page.getByLabel("LGA", { exact: true })).toHaveValue("01");
  await expect(page.getByLabel("Ward", { exact: true })).toHaveValue("01");
});

test("parent changes immediately clear dependent options, selections, and filters", async ({ page, context }) => {
  await mockDirectory(context);
  await page.goto("/report");
  await page.getByLabel("State or FCT", { exact: true }).selectOption("01");
  await page.getByLabel("LGA", { exact: true }).selectOption("01");
  await page.getByLabel("Ward", { exact: true }).selectOption("01");
  await page.getByLabel("Polling unit", { exact: true }).selectOption(UNIT.id);
  await page.getByLabel("Search LGA").fill("ABA");
  await page.getByLabel("Search Ward").fill("EZI");
  await page.getByLabel("Search Polling unit").fill("RAIL");
  await page.getByLabel("State or FCT", { exact: true }).selectOption("02");
  await expect(page.getByLabel("LGA", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("Ward", { exact: true })).toBeDisabled();
  await expect(page.getByLabel("Polling unit", { exact: true })).toBeDisabled();
  await expect(page.getByLabel("Search LGA")).toHaveValue("");
  await expect(page.getByLabel("Search Ward")).toHaveValue("");
  await expect(page.getByLabel("Search Polling unit")).toHaveValue("");
  await expect(page.getByText(/Confirmed:/)).toHaveCount(0);
});

test("cached polling unit restores its complete hierarchy", async ({ page, context }) => {
  await mockDirectory(context);
  await page.addInitScript(unit => localStorage.setItem("signa:last-confirmed-unit", JSON.stringify(unit)), UNIT);
  await page.goto("/report");
  await expect(page.getByLabel("State or FCT", { exact: true })).toHaveValue("01");
  await expect(page.getByLabel("LGA", { exact: true })).toHaveValue("01");
  await expect(page.getByLabel("Ward", { exact: true })).toHaveValue("01");
  await expect(page.getByLabel("Polling unit", { exact: true })).toHaveValue(UNIT.id);
  await expect(page.getByText(/Confirmed: 01\/01\/01\/001/)).toBeVisible();
});
