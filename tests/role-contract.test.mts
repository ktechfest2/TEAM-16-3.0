import test from "node:test";
import assert from "node:assert/strict";
import { roles, trustedRole } from "../lib/role-contract.ts";

test("accepts only known server profile roles", () => {
  for (const role of roles) assert.equal(trustedRole({ role }), role);
  assert.equal(trustedRole({ role: "owner" }), null);
  assert.equal(trustedRole(null), null);
  assert.equal(trustedRole([]), null);
});

test("client controlled auth metadata cannot escalate a reporter profile", () => {
  assert.equal(
    trustedRole({ role: "reporter", user_metadata: { role: "admin" }, app_metadata: { role: "admin" } }),
    "reporter",
  );
  assert.equal(trustedRole({ user_metadata: { role: "admin" } }), null);
});
