import test from "node:test";
import assert from "node:assert/strict";
import { safeReporterCaseStatus } from "../lib/reporter-status.ts";

test("reporter case status contains only review and response states", () => {
  const incident = {
    review_state: "supported",
    response_state: "followup_recorded",
    review_reason: "staff-only rationale",
    id: "private-case-id",
  };
  const status = safeReporterCaseStatus({
    incidents: incident,
  });

  assert.deepEqual(status, {
    reviewState: "supported",
    responseState: "followup_recorded",
  });
});

test("unlinked reports have no case status", () => {
  assert.equal(safeReporterCaseStatus(null), null);
});

test("array relationships project the first linked case only", () => {
  assert.deepEqual(
    safeReporterCaseStatus([
      { incidents: { review_state: "inconclusive", response_state: "unassigned" } },
      { incidents: { review_state: "supported", response_state: "closed" } },
    ]),
    { reviewState: "inconclusive", responseState: "unassigned" },
  );
});
