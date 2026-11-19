import test from "node:test";
import assert from "node:assert/strict";
import { parseReport, canonicalPayload, isRetrySameReport, InputError } from "../lib/report-contract.ts";
const base = {
  id: "9e8ca3da-3718-45ca-9124-59fbc9819d7a",
  pollingUnitId: "550e8400-e29b-41d4-a716-446655440000",
  category: "intimidation", description: "  Fictional observation  ",
  clientCreatedAt: "2026-11-18T12:00:00+01:00", occurredAt: null,
};
test("normalizes valid reports deterministically for retry", () => {
  const x = parseReport(base);
  assert.equal(x.description, "Fictional observation");
  assert.equal(x.clientCreatedAt, "2026-11-18T11:00:00.000Z");
  assert.equal(canonicalPayload(x), canonicalPayload(parseReport({...base})));
});
test("rejects unknown categories and malformed identifiers", () => {
  assert.throws(()=>parseReport({...base, category:"verified"}),InputError);
  assert.throws(()=>parseReport({...base, pollingUnitId:"anything"}),InputError);
});
test("rejects dangerous or invalid report body shapes", () => {
  assert.throws(()=>parseReport(null),InputError);
  assert.equal(parseReport({...base, description:""}).description, "");
  assert.equal(parseReport({...base, description:undefined}).description, "");
  assert.throws(()=>parseReport({...base, description:"x".repeat(1601)}),InputError);
  assert.throws(()=>parseReport({...base, occurredAt:"not-date"}),InputError);
});
test("same client UUID with edited text has a distinct canonical payload", () => {
  assert.notEqual(canonicalPayload(parseReport(base)), canonicalPayload(parseReport({...base,description:"Edited observation"})));
});
test("fictional test marker changes the retry payload without changing legacy reports", () => {
  const unmarked = parseReport({...base, aiProcessingConsent: true});
  const marked = parseReport({...base, aiProcessingConsent: true, fictionalTestSubmission: true});
  assert.equal(unmarked.fictionalTestSubmission, undefined);
  assert.notEqual(canonicalPayload(marked), canonicalPayload(unmarked));
});
test("duplicate receipt only for same owner and same hash", () => {
  const rec={reporter_id:"user1",payload_sha256:"a"};
  assert.equal(isRetrySameReport(rec,"user1","a"),true);
  assert.equal(isRetrySameReport(rec,"user2","a"),false);
  assert.equal(isRetrySameReport(rec,"user1","b"),false);
});
