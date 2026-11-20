import { expect, test } from "@playwright/test";

const image = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");

test("local inspection decodes an image and identifies an exact authorized reference", async ({ page }) => {
  await page.goto("/verify");
  await page.getByLabel("Image to inspect").setInputFiles({ name: "original.png", mimeType: "image/png", buffer: image });
  await page.getByLabel("Authorized reference image").setInputFiles({ name: "reference.png", mimeType: "image/png", buffer: image });
  await page.getByRole("button", { name: "Inspect locally" }).click();
  await expect(page.getByText(/Exact duplicate bytes/)).toBeVisible();
  await expect(page.getByText(/No supported metadata was found/)).toBeVisible();
  await expect(page.getByText(/Missing metadata is not evidence/)).toBeVisible();
  await expect(page.getByText(/C2PA verification is not available/)).toBeVisible();
});

test("invalid image bytes fail without a provider request", async ({ page, context }) => {
  let requested = false;
  await context.route("**/api/media-integrity/observe", route => { requested = true; return route.abort(); });
  await page.goto("/verify");
  await page.getByLabel("Image to inspect").setInputFiles({ name: "invalid.png", mimeType: "image/png", buffer: Buffer.from("not an image") });
  await page.getByRole("button", { name: "Inspect locally" }).click();
  await expect(page.getByText(/Evidence must be a valid JPEG, PNG, or WebP image/)).toBeVisible();
  expect(requested).toBe(false);
});

test("consented visual observations can populate editable claim text without authenticity claims", async ({ page, context }) => {
  await context.route("**/api/media-integrity/observe", route => route.fulfill({ json: { observation: {
    summary: "A screenshot-style graphic containing election text.", visibleText: "Fictional election claim for review", observations: ["Dark text appears on a light background."], uncertainty: ["The source and creation method are unknown."], mayBeNonPhotographic: true,
  }, notice: "Provisional only." } }));
  await page.goto("/verify");
  await page.getByLabel("Image to inspect").setInputFiles({ name: "screenshot.png", mimeType: "image/png", buffer: image });
  await page.getByLabel(/I agree to send this public image/).check();
  await page.getByRole("button", { name: "Request visual observations" }).click();
  await expect(page.getByText(/may be a screenshot, graphic, cartoon or document/)).toBeVisible();
  await page.getByRole("button", { name: "Use as claim text" }).click();
  await expect(page.getByLabel("Claim or message")).toHaveValue("Fictional election claim for review");
  await expect(page.getByText(/not used as a synthetic-image detector/)).toBeVisible();
});

test("provider failure remains inconclusive and preserves local checks", async ({ page, context }) => {
  await context.route("**/api/media-integrity/observe", route => route.fulfill({ status: 503, json: { error: { message: "A required service is temporarily unavailable" } } }));
  await page.goto("/verify");
  await page.getByLabel("Image to inspect").setInputFiles({ name: "photo.png", mimeType: "image/png", buffer: image });
  await page.getByRole("button", { name: "Inspect locally" }).click();
  await expect(page.getByText(/SHA-256/)).toBeVisible();
  await page.getByLabel(/I agree to send this public image/).check();
  await page.getByRole("button", { name: "Request visual observations" }).click();
  await expect(page.getByText("A required service is temporarily unavailable", { exact: true })).toBeVisible();
  await expect(page.getByText(/Provisional visual observations/)).toHaveCount(0);
});
