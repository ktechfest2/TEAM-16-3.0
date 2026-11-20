import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const REPORTER_ID = "00000000-0000-4000-8000-000000000001";
const UNIT_ID = "00000000-0000-4000-8000-000000000100";
const storageKey = "signa-citizen-auth-v1";

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
  await context.route("**/api/directory?**", route => {
    const level = new URL(route.request().url()).searchParams.get("level");
    const items = level === "states" ? [{ code: "01", name: "ABIA" }] : level === "lgas" ? [{ code: "01", name: "ABA NORTH" }] : level === "wards" ? [{ code: "01", name: "EZIAMA" }] : [{ id: UNIT_ID, code: "01/01/01/001", name: "RAILWAY QUARTERS I", is_simulated: false }];
    return route.fulfill({ json: { items } });
  });
}

async function selectUnit(page: Page) {
  await page.getByLabel("State or FCT", { exact: true }).selectOption("01");
  await page.getByLabel("LGA", { exact: true }).selectOption("01");
  await page.getByLabel("Ward", { exact: true }).selectOption("01");
  await page.getByLabel("Polling unit", { exact: true }).selectOption(UNIT_ID);
}

test("photo upload follows an ordinary report receipt", async ({ page, context }) => {
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
  await selectUnit(page);
  await page.getByRole("button", { name: /Disruption/i }).first().click();
  await page.getByText(/Add details or photo \(optional\)/).click();
  await page.getByLabel("More details (optional)").fill("Fictional observation for the photo workflow.");
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
  await expect(page.getByRole("img", { name: "Preview of fictional-camera.jpg" })).toBeVisible();
  await expect(page.getByText(/fictional-camera.jpg.*KB/i)).toBeVisible();
  const save = page.getByRole("button", { name: "Submit alert" });
  await save.focus();
  await page.keyboard.press("Enter");

  await expect.poll(() => postedReport?.aiProcessingConsent).toBe(false);
  await expect.poll(() => postedReport?.fictionalTestSubmission).toBeUndefined();
  await expect.poll(() => evidenceKeys.length).toBe(2);
  expect(evidenceKeys.every((value) => /^[0-9a-f-]{36}$/i.test(value))).toBe(true);
  await expect(page.getByText(/Photo upload status/)).toBeVisible();
  await expect(page.getByText(/Received by server/)).toHaveCount(3);
  await expect(page.getByRole("status").filter({ hasText: /received by the server/i })).toBeVisible();
  await expect(page.getByText("Received by server", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Alert recorded").locator("..").getByText("Received by server")).toBeVisible();
});

test("offline report stays saved and only its own receipt confirms on reconnection", async ({ page, context }) => {
  await installSession(page);
  await fakePollingUnit(context);
  const otherId = "00000000-0000-4000-8000-000000000899";
  let currentId = "";
  let allowCurrent = false;
  await context.route("**/api/reports", async route => {
    const id = (route.request().postDataJSON() as { id: string }).id;
    if (id !== otherId) currentId = id;
    if (id === otherId || allowCurrent) return route.fulfill({ status: 201, json: { id, delivery: "received", receivedAt: new Date().toISOString() } });
    return route.fulfill({ status: 503, json: { error: { message: "Retry later" } } });
  });
  await page.goto("/report");
  await page.evaluate(async ({ id, unitId, reporterId }) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const req = indexedDB.open("signa-offline-v1", 2); req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains("reports")) req.result.createObjectStore("reports", { keyPath: "payload.id" }); if (!req.result.objectStoreNames.contains("evidence")) req.result.createObjectStore("evidence", { keyPath: "evidenceId" }); }; req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
    await new Promise<void>((resolve, reject) => { const tx = db.transaction("reports", "readwrite"); tx.objectStore("reports").put({ reporterId, queuedAt: new Date().toISOString(), state: "pending", payload: { id, pollingUnitId: unitId, category: "disruption", description: "Other fictional queue item", occurredAt: null, clientCreatedAt: new Date().toISOString() } }); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); });
    db.close();
  }, { id: otherId, unitId: UNIT_ID, reporterId: REPORTER_ID });
  await selectUnit(page);
  await page.getByRole("button", { name: /Disruption/i }).first().click();
  await context.setOffline(true);
  await page.getByRole("button", { name: "Submit alert" }).click();
  await expect(page.getByText("Alert recorded").locator("..").getByText("Saved on this device")).toBeVisible();
  await context.setOffline(false);
  await expect.poll(() => currentId).not.toBe("");
  await expect(page.getByText("Alert recorded").locator("..").getByText("Saved on this device")).toBeVisible();
  allowCurrent = true;
  await page.getByRole("button", { name: "Sync now" }).click();
  await expect(page.getByText("Alert recorded").locator("..").getByText("Received by server")).toBeVisible();
});

test("reporter session change hides the previous receipt", async ({ page, context }) => {
  await installSession(page);
  await fakePollingUnit(context);
  await context.route("**/api/reports", route => { const id = (route.request().postDataJSON() as { id: string }).id; return route.fulfill({ status: 201, json: { id, delivery: "received", receivedAt: new Date().toISOString() } }); });
  await page.goto("/report");
  await selectUnit(page);
  await page.getByRole("button", { name: /Disruption/i }).first().click();
  await page.getByRole("button", { name: "Submit alert" }).click();
  await expect(page.getByText("Alert recorded").locator("..").getByText("Received by server")).toBeVisible();
  await page.evaluate((key) => { localStorage.removeItem(key); const channel = new BroadcastChannel(key); channel.postMessage({ event: "SIGNED_OUT", session: null }); channel.close(); }, storageKey);
  await expect(page.getByText("Alert recorded")).toHaveCount(0);
});

test("failed photo upload leaves the confirmed report receipt intact", async ({ page, context }) => {
  await installSession(page);
  await fakePollingUnit(context);
  await context.route("**/api/reports", route => {
    const id = (route.request().postDataJSON() as { id: string }).id;
    return route.fulfill({ status: 201, json: { id, delivery: "received", receivedAt: new Date().toISOString() } });
  });
  await context.route("**/api/reports/*/evidence", route => route.fulfill({ status: 503, json: { error: { message: "Upload unavailable" } } }));
  await page.goto("/report");
  await selectUnit(page);
  await page.getByRole("button", { name: /Disruption/i }).first().click();
  await page.getByText(/Add details or photo \(optional\)/).click();
  await page.getByLabel("Choose photos from gallery").setInputFiles({ name: "fictional.jpg", mimeType: "image/jpeg", buffer: Buffer.from([0xff, 0xd8, 0xff, 0x00]) });
  await page.getByRole("button", { name: "Submit alert" }).click();
  await expect(page.getByText("Alert recorded").locator("..").getByText("Received by server")).toBeVisible();
  await expect(page.getByText(/Upload failed/i).first()).toBeVisible();
  await expect(page.getByText("Alert recorded").locator("..").getByText("Received by server")).toBeVisible();
});

