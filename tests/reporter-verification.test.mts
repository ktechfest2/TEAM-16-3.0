import test from "node:test";
import assert from "node:assert/strict";
import { sameReporterContext } from "../lib/client/reporter-verification.ts";

const context = {
  ownerUserId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  headers: { authorization: "Bearer fictional-reporter-token" },
};

test("reporter context comparison rejects an owner or token change", () => {
  assert.equal(sameReporterContext(context, { ...context }), true);
  assert.equal(sameReporterContext(context, null), false);
  assert.equal(sameReporterContext(context, {
    ...context,
    ownerUserId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  }), false);
  assert.equal(sameReporterContext(context, {
    ...context,
    headers: { authorization: "Bearer refreshed-token" },
  }), false);
});
