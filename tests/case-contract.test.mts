import test from "node:test";
import assert from "node:assert/strict";
import { InputError } from "../lib/report-contract.ts";
import { parseCase, parseReview } from "../lib/case-contract.ts";

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

test("group contract matches the database maximum of ten reports", () => {
  const valid = parseCase({
    reportIds: Array.from({ length: 10 }, (_, i) => uuid(i + 1)),
    summary: "Fictional incident summary",
    linkReason: "Similar time and independently reviewed details",
  });
  assert.equal(valid.reportIds.length, 10);
  assert.throws(() => parseCase({
    reportIds: Array.from({ length: 11 }, (_, i) => uuid(i + 1)),
    summary: "Fictional incident summary",
    linkReason: "Similar time and independently reviewed details",
  }), InputError);
});

test("review evidence references normalize UUIDs and reject malformed or duplicate IDs", () => {
  const evidenceId = uuid(81);
  const parsed = parseReview({ outcome: "supported", reason: "Reviewed independently with sufficient detail", evidenceIds: [evidenceId.toUpperCase()] });
  assert.deepEqual(parsed.evidenceIds, [evidenceId]);
  assert.throws(() => parseReview({ outcome: "supported", reason: "Reviewed independently with sufficient detail", evidenceIds: [evidenceId, evidenceId] }), InputError);
  assert.throws(() => parseReview({ outcome: "supported", reason: "Reviewed independently with sufficient detail", evidenceIds: ["not-a-uuid"] }), InputError);
});
