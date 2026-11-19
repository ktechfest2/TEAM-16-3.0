import test from "node:test";
import assert from "node:assert/strict";
import { deliveryMeta, responseMeta, reviewMeta } from "../lib/taxonomy.ts";

test("delivery, verification and response labels remain distinct", () => {
  assert.equal(deliveryMeta.received.label, "Received by server");
  assert.equal(reviewMeta.under_review.label, "Under review");
  assert.equal(responseMeta.acknowledged.label, "Acknowledged");
  assert.notEqual(deliveryMeta.received.label, reviewMeta.under_review.label);
  assert.notEqual(reviewMeta.under_review.label, responseMeta.acknowledged.label);
});

test("review and response copy does not claim proof or emergency dispatch", () => {
  assert.match(reviewMeta.supported.help, /not a legal finding/i);
  const responseCopy = Object.values(responseMeta).map(({ label, help }) => `${label} ${help}`).join(" ");
  assert.match(responseMeta.acknowledged.help, /not an emergency dispatch/i);
  assert.doesNotMatch(responseCopy, /responders have been dispatched|emergency services were dispatched/i);
});
