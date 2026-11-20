import { expect, test } from "@playwright/test";

const reviewerId = "00000000-0000-4000-8000-000000000702";

function accessToken() {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "none", typ: "JWT" })}.${encode({ sub: reviewerId, exp: Math.floor(Date.now() / 1000) + 1800, aud: "authenticated", role: "authenticated" })}.fixture`;
}

test("Try Signa exposes four controlled roles without credentials", async ({ page, context }) => {
  await page.goto("/staff");
  await expect(page.getByRole("button", { name: "Try Signa as Citizen" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Try Signa as Incident Reviewer 1" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Try Signa as Independent Reviewer 2" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Try Signa as Response Coordinator" })).toBeEnabled();
  const html = await page.content();
  expect(html).not.toContain("fixture-password");

  let requestedRole = "";
  await context.route("**/api/demo/session", route => {
    requestedRole = (route.request().postDataJSON() as { role: string }).role;
    return route.fulfill({ json: {
      session: { accessToken: accessToken(), refreshToken: "fixture-demo-refresh", expiresAt: Math.floor(Date.now() / 1000) + 1800 },
      destination: "/monitor",
      role: "reviewer1",
    } });
  });
  await context.route("https://abcdefghijklmnopqrst.supabase.co/auth/v1/user**", route => route.fulfill({ json: {
    id: reviewerId, aud: "authenticated", role: "authenticated", email: "reviewer1@demo.invalid",
    app_metadata: { provider: "email", providers: ["email"] }, user_metadata: {}, created_at: "2026-01-01T00:00:00.000Z",
  } }));
  await context.route("**/api/monitor/**", route => route.fulfill({ status: 403, json: { error: { message: "Fixture navigation complete" } } }));
  await page.getByRole("button", { name: "Try Signa as Incident Reviewer 1" }).click();
  await expect.poll(() => requestedRole).toBe("reviewer1");
  await expect(page).toHaveURL(/\/monitor$/, { timeout: 20_000 });
});

test("demo broker failure is announced without navigation", async ({ page, context }) => {
  await context.route("**/api/demo/session", route => route.fulfill({ status: 429, json: { error: { message: "Too many requests. Try again later." } } }));
  await page.goto("/staff");
  await page.getByRole("button", { name: "Try Signa as Response Coordinator" }).click();
  await expect(page.getByText("Too many requests. Try again later.", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/staff$/);
});
