import { expect, test, type BrowserContext, type Page, type Route } from "@playwright/test";

const STORAGE_KEY = "sb-fixture-auth-token";
const REPORTER_A = "00000000-0000-4000-8000-000000000001";
const REPORTER_B = "00000000-0000-4000-8000-000000000002";
const POLLING_UNIT = "00000000-0000-4000-8000-000000000100";

type SessionFixture = {
  access_token: string;
  token_type: "bearer";
  expires_in: number;
  expires_at: number;
  refresh_token: string;
  user: {
    id: string;
    aud: string;
    role: string;
    email: string;
    app_metadata: { provider: string; providers: string[] };
    user_metadata: Record<string, never>;
    created_at: string;
  };
};

type CaseStatus = { reviewState: string; responseState: string } | null;
type ReportFixture = {
  id: string;
  category: string;
  description: string;
  received_at: string;
  caseStatus: CaseStatus;
};

const fakeJwt = (reporterId: string, expiresAt: number) => {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "none", typ: "JWT" })}.${encode({ sub: reporterId, exp: expiresAt, aud: "authenticated", role: "authenticated" })}.fixture`;
};

function sessionFor(reporterId: string, expiresAt = Math.floor(Date.now() / 1000) + 3600): SessionFixture {
  return {
    access_token: fakeJwt(reporterId, expiresAt),
    token_type: "bearer",
    expires_in: Math.max(expiresAt - Math.floor(Date.now() / 1000), 0),
    expires_at: expiresAt,
    refresh_token: `fictional-refresh-${reporterId.slice(-1)}`,
    user: {
      id: reporterId,
      aud: "authenticated",
      role: "authenticated",
      email: `fictional-${reporterId.slice(-1)}@example.test`,
      app_metadata: { provider: "anonymous", providers: ["anonymous"] },
      user_metadata: {},
      created_at: "2026-01-01T00:00:00.000Z",
    },
  };
}

function reportFixture(id: string, description: string, caseStatus: CaseStatus): ReportFixture {
  return {
    id,
    category: "disruption",
    description,
    received_at: "2026-11-18T12:00:00.000Z",
    caseStatus,
  };
}

const linkedReport = reportFixture(
  "00000000-0000-4000-8000-000000000201",
  "Fictional linked observation alpha.",
  { reviewState: "under_review", responseState: "acknowledged" },
);
const unlinkedReport = reportFixture(
  "00000000-0000-4000-8000-000000000202",
  "Fictional unlinked observation beta.",
  null,
);

async function installSession(page: Page, reporterId: string, expiresAt?: number) {
  const session = sessionFor(reporterId, expiresAt);
  await page.addInitScript(({ key, value }) => {
    localStorage.setItem(key, JSON.stringify(value));
  }, { key: STORAGE_KEY, value: session });
  return session;
}

async function respondToReports(context: BrowserContext, handler: (route: Route) => Promise<void>) {
  await context.route("**/api/reports/mine", handler);
  await context.route("https://fixture.supabase.co/**", async route => {
    await route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({ error: "fixture_auth_unavailable" }),
    });
  });
}

async function seedQueuedReport(page: Page, reporterId: string | null, id: string, description: string) {
  await page.evaluate(async ({ reporterId, id, description, pollingUnitId }) => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("signa-offline-v1", 1);
      request.onerror = () => reject(request.error);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains("reports")) {
          db.createObjectStore("reports", { keyPath: "payload.id" });
        }
      };
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction("reports", "readwrite");
        transaction.objectStore("reports").put({
          reporterId,
          queuedAt: "2026-11-18T12:00:00.000Z",
          state: "pending",
          payload: {
            id,
            pollingUnitId,
            category: "disruption",
            description,
            occurredAt: null,
            clientCreatedAt: "2026-11-18T12:00:00.000Z",
          },
        });
        transaction.oncomplete = () => { db.close(); resolve(); };
        transaction.onerror = () => { db.close(); reject(transaction.error); };
      };
    });
  }, { reporterId, id, description, pollingUnitId: POLLING_UNIT });
}

async function countQueued(page: Page): Promise<number> {
  return page.evaluate(() => new Promise<number>((resolve, reject) => {
    const request = indexedDB.open("signa-offline-v1", 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction("reports", "readonly");
      const count = transaction.objectStore("reports").count();
      count.onsuccess = () => resolve(count.result);
      transaction.oncomplete = () => db.close();
      transaction.onerror = () => reject(transaction.error);
    };
  }));
}

async function switchSessionInBrowser(page: Page, session: SessionFixture | null) {
  await page.evaluate(({ key, value }) => {
    const newValue = value ? JSON.stringify(value) : null;
    if (newValue) localStorage.setItem(key, newValue);
    else localStorage.removeItem(key);
    const channel = new BroadcastChannel(key);
    channel.postMessage({ event: value ? "SIGNED_IN" : "SIGNED_OUT", session: value });
    channel.close();
  }, { key: STORAGE_KEY, value: session });
}

async function replaceStoredSessionWithoutBroadcast(page: Page, session: SessionFixture) {
  await page.evaluate(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
    key: STORAGE_KEY,
    value: session,
  });
}

test("renders linked and unlinked reports with separate, safe statuses using the captured token", async ({ page, context }) => {
  const reporterSession = await installSession(page, REPORTER_A);
  let calls = 0;
  let usedCapturedToken = false;
  await respondToReports(context, async route => {
    calls += 1;
    usedCapturedToken = route.request().headers().authorization === `Bearer ${reporterSession.access_token}`;
    await route.fulfill({ json: { reports: [linkedReport, unlinkedReport] } });
  });

  await page.goto("/my-reports");
  await expect.poll(() => calls).toBe(1);
  await expect(page.getByText(linkedReport.description)).toBeVisible();
  await expect(page.getByText(unlinkedReport.description)).toBeVisible();
  await expect(page.getByText("Delivery", { exact: true })).toHaveCount(2);
  await expect(page.getByText("Verification", { exact: true })).toHaveCount(2);
  await expect(page.getByText("Response", { exact: true })).toHaveCount(2);
  await expect(page.getByText("Received by server").first()).toBeVisible();
  await expect(page.getByText("Under review")).toBeVisible();
  await expect(page.getByText("Acknowledged")).toBeVisible();
  await expect(page.getByText("Not in a case yet")).toBeVisible();
  await expect(page.getByText("No case response status")).toBeVisible();
  await expect(page.getByText(/do not mean emergency responders were dispatched/i).first()).toBeVisible();
  expect(usedCapturedToken).toBeTruthy();
});

test("refresh and reload fetch fresh server status", async ({ page, context }) => {
  await installSession(page, REPORTER_A);
  let calls = 0;
  await respondToReports(context, async route => {
    calls += 1;
    await route.fulfill({ json: { reports: [linkedReport] } });
  });

  await page.goto("/my-reports");
  await expect(page.getByText("Under review")).toBeVisible();
  await page.getByRole("button", { name: "Refresh" }).click();
  await expect.poll(() => calls).toBe(2);
  await page.reload();
  await expect(page.getByText("Under review")).toBeVisible();
  expect(calls).toBe(3);
});

test("API failure clears old server rows and refresh can recover", async ({ page, context }) => {
  await installSession(page, REPORTER_A);
  let fail = true;
  await respondToReports(context, async route => {
    if (fail) {
      await route.fulfill({ status: 503, json: { error: "fictional unavailable" } });
      return;
    }
    await route.fulfill({ json: { reports: [linkedReport] } });
  });

  await page.goto("/my-reports");
  await expect(page.getByText("Unable to load server reports")).toBeVisible();
  await expect(page.getByText(linkedReport.description)).toHaveCount(0);
  fail = false;
  await page.getByRole("button", { name: "Refresh" }).click();
  await expect(page.getByText(linkedReport.description)).toBeVisible();
});

test("offline queue is visible only to its reporter and remains stored after identity switch", async ({ page, context }) => {
  await installSession(page, REPORTER_A);
  await respondToReports(context, async route => await route.fulfill({ json: { reports: [] } }));
  await page.goto("/my-reports");
  await seedQueuedReport(page, REPORTER_A, "00000000-0000-4000-8000-000000000301", "Fictional pending alpha.");
  await seedQueuedReport(page, REPORTER_B, "00000000-0000-4000-8000-000000000302", "Fictional pending beta.");
  await seedQueuedReport(page, null, "00000000-0000-4000-8000-000000000303", "Fictional unassigned pending gamma.");
  await page.context().setOffline(true);
  await page.getByRole("button", { name: "Refresh" }).click();
  await expect(page.getByText("Fictional pending alpha.")).toBeVisible();
  await expect(page.getByText("Fictional pending beta.")).toHaveCount(0);
  await expect(page.getByText("Fictional unassigned pending gamma.")).toHaveCount(0);
  await expect(page.getByText("Saved on this device").first()).toBeVisible();

  await page.context().setOffline(false);
  await switchSessionInBrowser(page, sessionFor(REPORTER_B));
  await expect(page.getByText("Fictional pending alpha.")).toHaveCount(0);
  await expect(page.getByText("Fictional pending beta.")).toBeVisible();
  await expect(page.getByText("Fictional unassigned pending gamma.")).toHaveCount(0);
  expect(await countQueued(page)).toBe(3);
});

test("retry submits only the current reporter's queued items and preserves the others", async ({ page, context }) => {
  await installSession(page, REPORTER_A);
  await context.route("https://fixture.supabase.co/**", async route => {
    await route.fulfill({ status: 400, json: { error: "fixture unavailable" } });
  });
  let pollingUnitCalls = 0;
  await context.route("**/api/polling-units", async route => {
    pollingUnitCalls += 1;
    await route.fulfill({ json: { units: [] } });
  });
  const submittedIds: string[] = [];
  await context.route("**/api/reports", async route => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON() as { id: string };
      submittedIds.push(body.id);
      await route.fulfill({ status: 200, json: { receipt: { received: true } } });
      return;
    }
    await route.fulfill({ json: { reports: [] } });
  });
  await context.route("https://fixture.supabase.co/auth/v1/**", async route => {
    await route.fulfill({ status: 400, json: { error: "fixture_auth_unavailable" } });
  });
  await context.route("**/api/reports/mine", async route => await route.fulfill({ json: { reports: [] } }));

  await page.goto("/my-reports");
  await seedQueuedReport(page, REPORTER_A, "00000000-0000-4000-8000-000000000311", "Fictional retry alpha.");
  await seedQueuedReport(page, REPORTER_B, "00000000-0000-4000-8000-000000000312", "Fictional retry beta.");
  await seedQueuedReport(page, null, "00000000-0000-4000-8000-000000000313", "Fictional retry gamma.");
  await page.goto("/report");
  await expect.poll(() => pollingUnitCalls).toBeGreaterThan(0);
  await expect(page.getByText("1 report waiting on this device")).toBeVisible();
  await page.getByRole("button", { name: "Sync now" }).click();
  await expect.poll(() => submittedIds.length).toBe(1);
  expect(submittedIds[0]).toBe("00000000-0000-4000-8000-000000000311");
  expect(await countQueued(page)).toBe(2);
});

test("first-time offline drafts stay saved but remain hidden on a signed-out shared device", async ({ page, context }) => {
  let anonymousSignInRequests = 0;
  let reportPosts = 0;
  let reportReads = 0;
  await context.route("https://fixture.supabase.co/**", async route => {
    if (route.request().url().includes("grant_type=anonymous")) anonymousSignInRequests += 1;
    await route.fulfill({ status: 400, json: { error: "fixture_auth_unavailable" } });
  });
  await context.route("**/api/reports/mine", async route => {
    reportReads += 1;
    await route.fulfill({ json: { reports: [] } });
  });
  await context.route("**/api/polling-units", async route => await route.fulfill({
    json: { units: [{ id: POLLING_UNIT, code: "FIC-001", name: "Fictional Unit", is_simulated: true }] },
  }));
  await context.route("**/api/reports", async route => {
    if (route.request().method() === "POST") reportPosts += 1;
    await route.fulfill({ status: 200, json: { receipt: { received: true } } });
  });

  await page.goto("/report");
  await context.setOffline(true);
  await page.getByLabel("Polling unit").selectOption(POLLING_UNIT);
  await page.getByLabel("Your account").fill("Fictional first-time offline report contains private detail.");
  await page.getByRole("button", { name: "Accessible option — save alert now" }).click();
  await expect(page.getByRole("status")).toContainText(/cannot be linked or synced automatically/i);
  expect(await countQueued(page)).toBe(1);

  await context.setOffline(false);
  await page.getByRole("link", { name: /track this report/i }).click();
  await expect(page.getByText(/No active online session/i)).toBeVisible();
  await expect(page.getByText(/No recovery is available yet/i)).toBeVisible();
  await expect(page.getByText("Fictional first-time offline report contains private detail.")).toHaveCount(0);
  await expect(page.getByText("0", { exact: true }).first()).toBeVisible();

  await page.goto("/report");
  await expect(page.getByText(/cannot be linked or delivered automatically/i)).toBeVisible();
  await page.getByRole("button", { name: "Sync now" }).click();
  await switchSessionInBrowser(page, sessionFor(REPORTER_B));
  await page.goto("/my-reports");
  await expect.poll(() => reportReads).toBeGreaterThan(0);
  await expect(page.getByText("Fictional first-time offline report contains private detail.")).toHaveCount(0);
  expect(await countQueued(page)).toBe(1);
  expect(anonymousSignInRequests).toBe(0);
  expect(reportPosts).toBe(0);
});

test("sign-out clears reports and does not create an anonymous session", async ({ page, context }) => {
  await installSession(page, REPORTER_A);
  let mineCalls = 0;
  let anonymousSignInRequests = 0;
  await respondToReports(context, async route => {
    mineCalls += 1;
    await route.fulfill({ json: { reports: [linkedReport] } });
  });
  await context.route("https://fixture.supabase.co/auth/v1/token**", async route => {
    if (route.request().url().includes("grant_type=anonymous")) anonymousSignInRequests += 1;
    await route.fulfill({ status: 400, json: { error: "fixture_auth_unavailable" } });
  });

  await page.goto("/my-reports");
  await expect(page.getByText(linkedReport.description)).toBeVisible();
  await switchSessionInBrowser(page, null);
  await expect(page.getByText(linkedReport.description)).toHaveCount(0);
  await expect(page.getByText(/No active online session/i)).toBeVisible();
  expect(mineCalls).toBe(1);
  expect(anonymousSignInRequests).toBe(0);
});

test("delayed responses from an old identity cannot replace the current reporter's records", async ({ page, context }) => {
  const reporterSessionA = await installSession(page, REPORTER_A);
  const reporterSessionB = sessionFor(REPORTER_B);
  let releaseOldResponse!: () => void;
  let markOldRequestStarted!: () => void;
  const oldResponse = new Promise<void>(resolve => { releaseOldResponse = resolve; });
  const oldRequestStarted = new Promise<void>(resolve => { markOldRequestStarted = resolve; });
  const tokenA = reporterSessionA.access_token;
  const tokenB = reporterSessionB.access_token;
  let reporterARequests = 0;
  await respondToReports(context, async route => {
    const token = route.request().headers().authorization;
    if (token === `Bearer ${tokenA}`) {
      reporterARequests += 1;
      if (reporterARequests === 1) {
        await route.fulfill({ json: { reports: [reportFixture("old", "Fictional old-session row.", null)] } });
      } else {
        markOldRequestStarted();
        await oldResponse;
        await route.fulfill({ json: { reports: [reportFixture("old", "Fictional old-session row.", null)] } });
      }
    } else if (token === `Bearer ${tokenB}`) {
      await route.fulfill({ json: { reports: [reportFixture("new", "Fictional current-session row.", null)] } });
    } else {
      await route.fulfill({ status: 401, json: { error: "fixture unauthorized" } });
    }
  });

  await page.goto("/my-reports");
  await expect(page.getByText("Fictional old-session row.")).toBeVisible();
  await page.getByRole("button", { name: "Refresh" }).click();
  await oldRequestStarted;
  await replaceStoredSessionWithoutBroadcast(page, reporterSessionB);
  releaseOldResponse();
  await expect(page.getByText("Fictional current-session row.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Refresh" })).toBeEnabled();
  await expect(page.getByText("Fictional old-session row.")).toHaveCount(0);
  await expect(page.getByText("Fictional current-session row.")).toBeVisible();
});

test("expired sessions clear rows without anonymous fallback", async ({ page, context }) => {
  await installSession(page, REPORTER_A);
  let mineCalls = 0;
  let refreshCalls = 0;
  let anonymousSignInRequests = 0;
  await respondToReports(context, async route => {
    mineCalls += 1;
    await route.fulfill({ json: { reports: [linkedReport] } });
  });
  await context.route("https://fixture.supabase.co/auth/v1/token**", async route => {
    const url = route.request().url();
    if (url.includes("grant_type=refresh_token")) refreshCalls += 1;
    if (url.includes("grant_type=anonymous")) anonymousSignInRequests += 1;
    await route.fulfill({ status: 400, json: { error: "invalid_grant" } });
  });

  await page.goto("/my-reports");
  await expect(page.getByText(linkedReport.description)).toBeVisible();
  await switchSessionInBrowser(page, sessionFor(REPORTER_A, Math.floor(Date.now() / 1000) - 3600));
  await page.getByRole("button", { name: "Refresh" }).click();
  await expect(page.getByText(linkedReport.description)).toHaveCount(0);
  await expect(page.getByText(/No active online session|Unable to load reports/i)).toBeVisible();
  expect(mineCalls).toBe(1);
  expect(refreshCalls).toBeGreaterThan(0);
  expect(anonymousSignInRequests).toBe(0);
});

test("refresh is keyboard accessible", async ({ page, context }) => {
  await installSession(page, REPORTER_A);
  let calls = 0;
  await respondToReports(context, async route => {
    calls += 1;
    await route.fulfill({ json: { reports: [] } });
  });
  await page.goto("/my-reports");
  const refresh = page.getByRole("button", { name: "Refresh" });
  await expect(refresh).toBeEnabled();
  await refresh.focus();
  await page.keyboard.press("Enter");
  await expect.poll(() => calls).toBe(2);
});

test("My Reports has no horizontal overflow at narrow and desktop widths", async ({ page, context }) => {
  await installSession(page, REPORTER_A);
  await respondToReports(context, async route => await route.fulfill({ json: { reports: [linkedReport, unlinkedReport] } }));

  for (const width of [320, 375, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/my-reports");
    await expect(page.getByText(linkedReport.description)).toBeVisible();
    const dimensions = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      document: document.documentElement.scrollWidth,
      body: document.body.scrollWidth,
    }));
    expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport);
    expect(dimensions.body).toBeLessThanOrEqual(dimensions.viewport);
  }
});
