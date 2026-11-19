import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const REPORTER_ID = "00000000-0000-4000-8000-000000000001";
const SIMULATED_UNIT_ID = "00000000-0000-4000-8000-000000000901";
const storageKey = "signa-citizen-auth-v1";

function reporterSession() {
  const expiresAt = Math.floor(Date.now() / 1000) + 3600;
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const token = `${encode({ alg: "none", typ: "JWT" })}.${encode({ sub: REPORTER_ID, exp: expiresAt, aud: "authenticated", role: "authenticated" })}.fixture`;
  return {
    access_token: token, token_type: "bearer", expires_in: 3600, expires_at: expiresAt, refresh_token: "fictional-refresh",
    user: { id: REPORTER_ID, aud: "authenticated", role: "authenticated", email: "fictional@example.test", app_metadata: { provider: "anonymous", providers: ["anonymous"] }, user_metadata: {}, created_at: "2026-01-01T00:00:00.000Z" },
  };
}

async function installSession(page: Page) {
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), { key: storageKey, value: reporterSession() });
}

async function mockActualDirectory(context: BrowserContext) {
  await context.route("**/api/directory?**", route => {
    const level = new URL(route.request().url()).searchParams.get("level");
    const items = level === "states" ? [{ code: "01", name: "ABIA" }] : [];
    return route.fulfill({ json: { items } });
  });
}

test("ordinary reporters never receive the simulated-unit selector", async ({ page, context }) => {
  await installSession(page);
  await mockActualDirectory(context);
  await context.route("**/api/polling-units", route => route.fulfill({ status: 403, json: { error: { code: "NOT_AUTHORISED" } } }));
  await page.goto("/report");
  await expect(page.getByRole("button", { name: "Simulated test units" })).toHaveCount(0);
  await expect(page.getByLabel("State or FCT", { exact: true })).toBeVisible();
});

test("approved fictional reporter can submit without Gemini processing", async ({ page, context }) => {
  await installSession(page);
  await mockActualDirectory(context);
  await context.route("**/api/polling-units", route => route.fulfill({ json: {
    fictionalReportingEnabled: true,
    aiProcessingEnabled: false,
    units: [{ id: SIMULATED_UNIT_ID, code: "SIM-PU-001", name: "SIMULATED Polling Unit 001", state: "SIMULATED", lga: "SIMULATED", ward: "SIMULATED", is_simulated: true }],
  } }));
  let posted: Record<string, unknown> | null = null;
  await context.route("**/api/reports", route => {
    posted = route.request().postDataJSON() as Record<string, unknown>;
    return route.fulfill({ status: 201, json: { id: posted.id, receivedAt: "2026-11-20T10:00:00.000Z", delivery: "received", duplicate: false } });
  });

  await page.goto("/report");
  await page.getByRole("button", { name: "Simulated test units" }).click();
  await page.getByLabel("Simulated polling unit").selectOption(SIMULATED_UNIT_ID);
  await expect(page.getByText("External AI processing is disabled for this session.")).toBeVisible();
  await page.getByRole("button", { name: /Disruption/i }).first().click();
  await page.getByRole("button", { name: "Submit alert" }).click();
  await expect.poll(() => posted?.fictionalTestSubmission).toBe(true);
  await expect.poll(() => posted?.aiProcessingConsent).toBe(false);
  await expect(page.getByText("Alert recorded").last()).toBeVisible();
});

test("Gemini consent is offered only when the server authorizes it", async ({ page, context }) => {
  await installSession(page);
  await mockActualDirectory(context);
  await context.route("**/api/polling-units", route => route.fulfill({ json: {
    fictionalReportingEnabled: true,
    aiProcessingEnabled: true,
    units: [{ id: SIMULATED_UNIT_ID, code: "SIM-PU-001", name: "SIMULATED Polling Unit 001", is_simulated: true }],
  } }));
  await page.goto("/report");
  await page.getByRole("button", { name: "Simulated test units" }).click();
  await expect(page.getByLabel(/Allow this new fictional report/)).toBeVisible();
});
