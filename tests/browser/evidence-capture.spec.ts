import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const REPORTER_ID = "00000000-0000-4000-8000-000000000001";
const UNIT_ID = "00000000-0000-4000-8000-000000000100";
const storageKey = "sb-fixture-auth-token";

function reporterSession() {
  const expiresAt = Math.floor(Date.now() / 1000) + 3600;
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const token = `${encode({ alg: "none", typ: "JWT" })}.${encode({ sub: REPORTER_ID, exp: expiresAt, aud: "authenticated", role: "authenticated" })}.fixture`;
  return {
    access_token: token,
    token_type: "bearer",
    expires_in: 3600,
    expires_at: expiresAt,
    refresh_token: "fictional-refresh",
    user: {
      id: REPORTER_ID, aud: "authenticated", role: "authenticated", email: "fictional@example.test",
      app_metadata: { provider: "anonymous", providers: ["anonymous"] }, user_metadata: {}, created_at: "2026-01-01T00:00:00.000Z",
    },
  };
}

async function installSession(page: Page) {
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), { key: storageKey, value: reporterSession() });
}

async function fakePollingUnit(context: BrowserContext) {
  await context.route("**/api/polling-units", route => route.fulfill({ json: { units: [{ id: UNIT_ID, code: "SIM-PU-001", name: "SIMULATED Polling Unit 001", is_simulated: true }] } }));
}

test("photo gallery upload follows report receipt and keeps consent optional", async ({ page, context }) => {
  await installSession(page);
  await fakePollingUnit(context);
  let postedReport: Record<string, unknown> | null = null;
  const evidenceKeys: string[] = [];

  await context.route("**/api/reports", async route => {
    if (route.request().method() !== "POST") return route.continue();
    postedReport = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({ status: 201, json: { id: postedReport.id, delivery: "received", receivedAt: "2026-11-19T10:00:00.000Z", duplicate: false } });
  });
  await context.route("**/api/reports/*/evidence", async route => {
    expect(route.request().method()).toBe("POST");
    const evidenceId = route.request().headers()["idempotency-key"];
    evidenceKeys.push(evidenceId);
    await route.fulfill({ status: 201, json: { evidence: { id: evidenceId, receivedAt: "2026-11-19T10:00:01.000Z" }, duplicate: false } });
  });

  await page.goto("/report");
  await expect(page.getByRole("heading", { name: "Report an incident" })).toBeVisible();
  for (const width of [320, 375, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    const dimensions = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, document: document.documentElement.scrollWidth }));
    expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport);
  }
  await page.getByLabel("Polling unit").selectOption(UNIT_ID);
  await page.getByLabel("Your account").fill("Fictional observation for the photo workflow.");
  const consent = page.getByLabel("Optional: I consent to AI generating a provisional observation summary from this report and its evidence. AI outputs are uncertain and will not verify the report; an authorised human remains responsible for review.");
  await expect(consent).not.toBeChecked();
  await consent.check();
  await expect(page.getByLabel("Take a photo")).toHaveAttribute("capture", "environment");
  await page.getByLabel("Take a photo").setInputFiles({
    name: "fictional-camera.jpg", mimeType: "image/jpeg", buffer: Buffer.from([0xff, 0xd8, 0xff, 0x00]),
  });
  await page.getByLabel("Choose photos from gallery").setInputFiles({
    name: "fictional-gallery.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.from([0xff, 0xd8, 0xff, 0x00]),
  });
  await expect(page.getByText(/fictional-camera.jpg.*selected on this device/i)).toBeVisible();
  await expect(page.getByText(/fictional-gallery.jpg.*selected on this device/i)).toBeVisible();
  const save = page.getByRole("button", { name: "Accessible option — save alert now" });
  await save.focus();
  await page.keyboard.press("Enter");

  await expect.poll(() => postedReport?.aiProcessingConsent).toBe(true);
  await expect.poll(() => evidenceKeys.length).toBe(2);
  expect(evidenceKeys.every((value) => /^[0-9a-f-]{36}$/i.test(value))).toBe(true);
  await expect(page.getByText(/Photo upload status/)).toBeVisible();
  await expect(page.getByText(/Received by server/)).toHaveCount(2);
  await expect(page.getByRole("status").filter({ hasText: /received by the server/i })).toBeVisible();
});

