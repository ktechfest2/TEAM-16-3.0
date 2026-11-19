import assert from "node:assert/strict";
import test from "node:test";
import {
  fictionalAiReportAllowed,
  fictionalAiReporterAllowed,
  fictionalReportingAllowed,
  reportLocationAllowed,
  type FictionalPolicyConfig,
} from "../lib/fictional-policy.ts";
import { readFileSync } from "node:fs";

const reporter = "00000000-0000-4000-8000-000000000001";
const reportingOnly: FictionalPolicyConfig = {
  reportingEnabled: "true",
  reportingReporterIds: reporter,
  aiEnabled: "false",
  aiReporterIds: reporter,
  aiStartAt: "2026-11-20T08:00:00.000Z",
};

test("fictional reporting remains available when Gemini processing is disabled", () => {
  assert.equal(fictionalReportingAllowed(reporter, reportingOnly), true);
  assert.equal(fictionalAiReporterAllowed(reporter, reportingOnly, Date.parse("2026-11-20T09:00:00.000Z")), false);
  assert.equal(reportLocationAllowed({ isSimulated: true, markedFictional: true, fictionalReportingApproved: true }), true);
});

test("client markers cannot grant fictional reporting access", () => {
  assert.equal(fictionalReportingAllowed(reporter, { ...reportingOnly, reportingReporterIds: "different-user" }), false);
  assert.equal(reportLocationAllowed({ isSimulated: true, markedFictional: true, fictionalReportingApproved: false }), false);
  assert.equal(reportLocationAllowed({ isSimulated: true, markedFictional: false, fictionalReportingApproved: true }), false);
});

test("fictional markers are rejected for actual polling units", () => {
  assert.equal(reportLocationAllowed({ isSimulated: false, markedFictional: true, fictionalReportingApproved: true }), false);
  assert.equal(reportLocationAllowed({ isSimulated: false, markedFictional: false, fictionalReportingApproved: false }), true);
});

test("Gemini keeps its separate allowlist and activation cutoff", () => {
  const aiConfig = { ...reportingOnly, aiEnabled: "true" };
  assert.equal(fictionalAiReportAllowed(reporter, "2026-11-20T07:59:59.999Z", aiConfig), false);
  assert.equal(fictionalAiReportAllowed(reporter, "2026-11-20T08:00:00.000Z", aiConfig), true);
  assert.equal(fictionalAiReportAllowed("different-user", "2026-11-20T09:00:00.000Z", aiConfig), false);
  assert.equal(fictionalAiReportAllowed(reporter, "2026-11-20T09:00:00.000Z", { ...aiConfig, aiStartAt: "invalid" }), false);
});

test("valid duplicate receipts are resolved before current location policy", () => {
  const route = readFileSync(new URL("../app/api/reports/route.ts", import.meta.url), "utf8");
  assert.ok(route.indexOf("if (prior)") < route.indexOf("const markedFictional"));
  assert.match(route, /approvedFictionalReportingReporter/);
  assert.match(route, /approvedFictionalAiReporter/);
});

test("simulated-unit discovery requires a trusted reporter and reporting allowlist", () => {
  const route = readFileSync(new URL("../app/api/polling-units/route.ts", import.meta.url), "utf8");
  assert.match(route, /getViewer\(req, \["reporter"\]\)/);
  assert.match(route, /approvedFictionalReportingReporter\(viewer\.userId\)/);
  assert.match(route, /status: 403/);
});
