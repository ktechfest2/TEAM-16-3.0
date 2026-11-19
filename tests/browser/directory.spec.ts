import { expect, test } from "@playwright/test";

test("directory follows codes, resets children, and finds exact leading-zero code", async ({ page, context }) => {
  const unit = { id: "00000000-0000-4000-8000-000000000501", code: "01/01/01/001", name: "RAILWAY QUARTERS I", state: "ABIA", lga: "ABA NORTH", ward: "EZIAMA", is_simulated: false };
  await context.route("**/api/directory?**", route => {
    const params = new URL(route.request().url()).searchParams;
    const level = params.get("level");
    const items = level === "states" ? [{ code: "01", name: "ABIA" }, { code: "02", name: "ADAMAWA" }] : level === "lgas" ? [{ code: "01", name: "ABA NORTH" }] : level === "wards" ? [{ code: "01", name: "EZIAMA" }] : level === "code" || level === "units" ? [unit] : [];
    return route.fulfill({ json: { items } });
  });
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
});
