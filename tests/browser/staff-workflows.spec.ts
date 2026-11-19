import { expect, test, type BrowserContext, type Route } from "@playwright/test";

const MONITOR_ID = "00000000-0000-4000-8000-000000000010";
const COORDINATOR_ID = "00000000-0000-4000-8000-000000000020";
const REPORT_ID = "00000000-0000-4000-8000-000000000201";
const CASE_ID = "00000000-0000-4000-8000-000000000301";
const ASSIGNMENT_ID = "00000000-0000-4000-8000-000000000401";
const EVIDENCE_ID = "00000000-0000-4000-8000-000000000701";
const UNIT_ID = "00000000-0000-4000-8000-000000000100";

function sessionFor(userId: string, email: string) {
  const expiresAt = Math.floor(Date.now() / 1000) + 3600;
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return {
    access_token: `${encode({ alg: "none", typ: "JWT" })}.${encode({ sub: userId, exp: expiresAt, aud: "authenticated", role: "authenticated" })}.fixture`,
    token_type: "bearer", expires_in: 3600, expires_at: expiresAt,
    refresh_token: `fixture-${userId.slice(-2)}`,
    user: { id: userId, aud: "authenticated", role: "authenticated", email, app_metadata: { provider: "email", providers: ["email"] }, user_metadata: {}, created_at: "2026-01-01T00:00:00.000Z" },
  };
}

async function mockPasswordLogin(context: BrowserContext) {
  await context.route("**/auth/v1/token**", async route => {
    if (route.request().method() !== "POST") return route.continue();
    const body = route.request().postDataJSON() as { email?: string };
    const monitor = body.email === "monitor@example.test";
    await route.fulfill({ json: sessionFor(monitor ? MONITOR_ID : COORDINATOR_ID, body.email || "staff@example.test") });
  });
  await context.route("**/auth/v1/logout**", route => route.fulfill({ status: 204, body: "" }));
}

async function signIn(page: import("@playwright/test").Page, email: string) {
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password").fill("fictional-password");
  await page.getByRole("button", { name: "Sign in" }).click();
}

test("monitor login, grouping, human review, assignment, and coordinator follow-up use returned states", async ({ page, context }) => {
  await mockPasswordLogin(context);
  let reviewState = "under_review";
  let responseState = "unassigned";
  let assignment: Record<string, unknown> | null = null;
  let acknowledgedAt: string | null = null;
  let reviewedEvidenceIds: string[] = [];

  await context.route("**/api/**", async (route: Route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const method = route.request().method();

    if (path === "/api/monitor/reports" && method === "GET") {
      return route.fulfill({ json: { reports: [{
        id: REPORT_ID, polling_unit_id: UNIT_ID, category: "disruption",
        description: "Fictional reports of an observed pause in accreditation.", received_at: "2026-11-19T09:00:00.000Z",
        polling_units: { code: "SIM-PU-001", name: "SIMULATED Polling Unit 001" }, incident_reports: [],
      }] } });
    }
    if (path === "/api/monitor/incidents" && method === "GET") {
      return route.fulfill({ json: { incidents: CASE_ID ? [{ id: CASE_ID, summary: "Fictional accreditation pause", review_state: reviewState, response_state: responseState, updated_at: "2026-11-19T09:00:00.000Z", polling_units: { code: "SIM-PU-001", name: "SIMULATED Polling Unit 001", ward: null, lga: null }, incident_reports: [{ report_id: REPORT_ID, reports: { category: "disruption" } }] }] : [] } });
    }
    if (path === "/api/monitor/incidents" && method === "POST") return route.fulfill({ status: 201, json: { id: CASE_ID } });
    if (path === "/api/monitor/coordinators" && method === "GET") return route.fulfill({ json: { coordinators: [{ id: COORDINATOR_ID, display_name: "Fictional Coordinator" }] } });
    if (path === `/api/monitor/incidents/${CASE_ID}` && method === "GET") {
      return route.fulfill({ json: {
        incident: { id: CASE_ID, summary: "Fictional accreditation pause", review_state: reviewState, response_state: responseState, created_at: "2026-11-19T09:00:00.000Z", updated_at: "2026-11-19T09:00:00.000Z", polling_units: { code: "SIM-PU-001", name: "SIMULATED Polling Unit 001", ward: null, lga: null, state: null, is_simulated: true } },
        reviewEligibility: { canReview: true, reason: null },
        reports: [{ id: REPORT_ID, category: "disruption", description: "Fictional reports of an observed pause in accreditation.", received_at: "2026-11-19T09:00:00.000Z", occurred_at: null, aiEligible: true, latestAssessment: null }],
        reviews: reviewState === "under_review" ? [] : [{ id: "00000000-0000-4000-8000-000000000501", outcome: reviewState, reason: "The observations support the reported pause only.", created_at: "2026-11-19T09:10:00.000Z", evidence_ids: [] }],
        assignment,
        events: [],
      } });
    }
    if (path === `/api/reports/${REPORT_ID}/evidence` && method === "GET") return route.fulfill({ json: { evidence: [{ id: EVIDENCE_ID, reportId: REPORT_ID, mimeType: "image/jpeg", byteSize: 1024, sha256: "a".repeat(64), receivedAt: "2026-11-19T09:02:00.000Z" }] } });
    if (path === `/api/reports/${REPORT_ID}/evidence/${EVIDENCE_ID}` && method === "GET") return route.fulfill({ json: { signedUrl: "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=", expiresAt: "2026-11-19T09:03:00.000Z" } });
    if (path === `/api/monitor/incidents/${CASE_ID}/reviews` && method === "POST") {
      const body = route.request().postDataJSON();
      reviewState = body.outcome;
      reviewedEvidenceIds = body.evidenceIds;
      return route.fulfill({ status: 201, json: { id: "00000000-0000-4000-8000-000000000501", outcome: reviewState, evidenceIds: reviewedEvidenceIds } });
    }
    if (path === `/api/monitor/incidents/${CASE_ID}/assign` && method === "POST") {
      responseState = "assigned";
      assignment = { id: ASSIGNMENT_ID, assigned_to: COORDINATOR_ID, assigned_at: "2026-11-19T09:15:00.000Z", acknowledged_at: acknowledgedAt, acknowledgement_note: null };
      return route.fulfill({ status: 201, json: { id: ASSIGNMENT_ID } });
    }
    if (path === "/api/coordinator/assignments" && method === "GET") {
      return route.fulfill({ json: { assignments: [{
        id: ASSIGNMENT_ID, incident_id: CASE_ID, assigned_at: "2026-11-19T09:15:00.000Z", acknowledged_at: acknowledgedAt,
        acknowledgement_note: acknowledgedAt ? "Received for internal follow-up." : null,
        incidents: { id: CASE_ID, summary: "Fictional accreditation pause", review_state: "supported", response_state: responseState, updated_at: "2026-11-19T09:15:00.000Z", polling_units: { code: "SIM-PU-001", name: "SIMULATED Polling Unit 001", ward: null, lga: null }, incident_reports: [{ report_id: REPORT_ID, reports: { category: "disruption" } }] },
      }] } });
    }
    if (path === `/api/coordinator/assignments/${ASSIGNMENT_ID}/acknowledge` && method === "POST") {
      acknowledgedAt = "2026-11-19T09:20:00.000Z";
      responseState = "acknowledged";
      return route.fulfill({ status: 200, json: { id: ASSIGNMENT_ID } });
    }
    if (path === `/api/coordinator/assignments/${ASSIGNMENT_ID}/follow-ups` && method === "POST") {
      responseState = "followup_recorded";
      return route.fulfill({ status: 201, json: { id: ASSIGNMENT_ID } });
    }
    if (path === "/api/monitor/ai-assessments" && method === "POST") return route.fulfill({ status: 201, json: { assessment: {
      id: "00000000-0000-4000-8000-000000000601", status: "failed", provisional_summary: null,
      model_observations: null,
      deterministic_checks: { location: UNIT_ID, category: "disruption", occurredAt: null, possibleDuplicateReportIds: ["00000000-0000-4000-8000-000000000202"] },
      source_references: [{ type: "report", id: REPORT_ID }], uncertainty: [],
      provider_failure: "GEMINI_API_KEY is not configured", created_at: "2026-11-19T09:05:00.000Z",
    } } });
    return route.fulfill({ status: 404, json: { error: { message: `Unmocked fixture route ${method} ${path}` } } });
  });

  await page.goto("/monitor");
  await signIn(page, "monitor@example.test");
  await expect(page.getByText("Fictional reports of an observed pause in accreditation.")).toBeVisible();
  await page.getByLabel("Select report 0000-0000").check();
  await page.getByRole("button", { name: "Group into a case" }).click();
  await page.getByLabel("Case summary").fill("Fictional accreditation pause");
  await page.getByLabel("Why these reports belong together").fill("Same simulated unit and event window; monitor review required.");
  await page.getByRole("button", { name: "Open case with 1 report" }).click();
  await expect(page).toHaveURL(new RegExp(`/monitor/incidents/${CASE_ID}$`));
  await expect(page.getByText("Human verification", { exact: true })).toBeVisible();
  await expect(page.getByText("AI assessment", { exact: true })).toBeVisible();
  for (const width of [320, 375, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    const dimensions = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, document: document.documentElement.scrollWidth }));
    expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport);
  }
  await page.getByRole("button", { name: "View privately" }).click();
  await expect(page.getByRole("img", { name: /Private evidence for report/ })).toBeVisible();
  await page.getByRole("button", { name: "Request assessment" }).click();
  await expect(page.getByText("AI status: failed")).toBeVisible();
  await expect(page.getByText(/GEMINI_API_KEY is not configured/)).toBeVisible();
  await expect(page.getByText("Not returned by the current assessment contract.", { exact: false }).first()).toBeVisible();
  await expect(page.getByText("Possible same-unit/category/time match")).toBeVisible();

  await page.getByRole("button", { name: "Supported by evidence", exact: true }).click();
  await page.getByRole("checkbox", { name: /report 0000-0000/ }).last().check();
  await page.getByLabel("Rationale").fill("The observations support the reported pause only.");
  await page.getByRole("button", { name: "Record review outcome" }).click();
  await expect.poll(() => reviewedEvidenceIds).toEqual([EVIDENCE_ID]);
  await expect(page.getByText("supported", { exact: false }).first()).toBeVisible();
  await page.getByLabel("Coordinator").selectOption(COORDINATOR_ID);
  await page.getByRole("button", { name: "Assign case" }).click();
  await expect(page.getByText(/Waiting for the coordinator to acknowledge receipt/)).toBeVisible();

  await page.goto("/monitor");
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.goto("/coordinator");
  await signIn(page, "coordinator@example.test");
  await expect(page.getByText("Fictional accreditation pause")).toBeVisible();
  await page.getByRole("button", { name: "Acknowledge", exact: true }).click();
  await page.getByRole("button", { name: "Confirm receipt" }).click();
  await expect(page.getByText(/Acknowledged/)).toBeVisible();
  await page.getByRole("button", { name: "Record follow-up" }).click();
  await page.getByLabel("Action taken").fill("Reviewed with internal monitoring desk");
  await page.getByRole("button", { name: "Save to case timeline" }).click();
  await expect(page.getByText("Follow-up recorded", { exact: true })).toBeVisible();
});

test("a denied staff API keeps the workspace restricted and reports the server decision", async ({ page, context }) => {
  await mockPasswordLogin(context);
  await context.route("**/api/**", route => route.fulfill({ status: 403, json: { error: { code: "ACCESS", message: "Only pre-approved monitors can open this workspace." } } }));
  await page.goto("/monitor");
  await signIn(page, "monitor@example.test");
  await expect(page.getByText("Only pre-approved monitors can open this workspace.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Approved staff sign-in" })).toBeVisible();
  await expect(page.getByText("Reports received", { exact: true })).toHaveCount(0);
});

test("case creator sees independent-review guidance and persisted AI without a new provider request", async ({ page, context }) => {
  await mockPasswordLogin(context);
  let assessmentPosts = 0;
  await context.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/monitor/reports") return route.fulfill({ json: { reports: [] } });
    if (path === "/api/monitor/incidents") return route.fulfill({ json: { incidents: [] } });
    if (path === `/api/monitor/incidents/${CASE_ID}`) return route.fulfill({ json: {
      incident: { id: CASE_ID, summary: "Fictional case awaiting independent review", review_state: "under_review", response_state: "unassigned", created_at: "2026-11-19T09:00:00.000Z", updated_at: "2026-11-19T09:00:00.000Z", polling_units: { code: "SIM-PU-001", name: "SIMULATED Polling Unit 001", is_simulated: true } },
      reviewEligibility: { canReview: false, reason: "An independent reviewer is required." },
      reports: [{ id: REPORT_ID, category: "disruption", description: "Fictional account", received_at: "2026-11-19T09:00:00.000Z", occurred_at: null, aiEligible: false, latestAssessment: { id: "00000000-0000-4000-8000-000000000601", status: "completed", provisional_summary: "Provisional fictional summary", model_observations: { observations: ["Claimed pause"], image_observations: ["A queue is visible"] }, deterministic_checks: { possibleDuplicateReportIds: [] }, source_references: [{ type: "report", id: REPORT_ID }], uncertainty: ["Timing unclear"], provider_failure: null, created_at: "2026-11-19T09:05:00.000Z" } }],
      reviews: [], assignment: null, events: [],
    } });
    if (path === `/api/reports/${REPORT_ID}/evidence`) return route.fulfill({ json: { evidence: [] } });
    if (path === "/api/monitor/coordinators") return route.fulfill({ json: { coordinators: [] } });
    if (path === "/api/monitor/ai-assessments" && route.request().method() === "POST") assessmentPosts += 1;
    return route.fulfill({ status: 404, json: { error: { message: "Unmocked fixture route" } } });
  });
  await page.goto("/monitor");
  await signIn(page, "monitor@example.test");
  await page.goto(`/monitor/incidents/${CASE_ID}`);
  await expect(page.getByText(/Awaiting independent review/).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Record review outcome" })).toHaveCount(0);
  await expect(page.getByText("Provisional fictional summary")).toBeVisible();
  await expect(page.getByText("A queue is visible")).toBeVisible();
  await expect(page.getByRole("button", { name: "Request assessment" })).toHaveCount(0);
  expect(assessmentPosts).toBe(0);
});

