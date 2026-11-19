import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const service = readFileSync(new URL("../lib/server/evidence.ts", import.meta.url), "utf8");
const cleanup = readFileSync(new URL("../app/api/internal/cleanup-evidence/route.ts", import.meta.url), "utf8");

// These are source-level guards. Concurrent behavior still requires the owner
// to apply the migration and run live parallel requests against PostgreSQL.
test("upload finalization and failure are fenced by the current lease token", () => {
  assert.match(service, /\.eq\("upload_status", "uploading"\)\.eq\("upload_token", uploadToken\)/);
  assert.match(service, /\.update\(\{ upload_status: "failed", upload_token: null, upload_lease_expires_at: null \}\)[\s\S]*?\.eq\("upload_token", uploadToken\)/);
  const failureHandling = service.slice(service.indexOf("if (uploadError)"), service.indexOf("const { data: ready"));
  assert.doesNotMatch(failureHandling, /\.storage\.from\(EVIDENCE_BUCKET\)\.remove/);
});

test("cleanup claims a row before deleting its object and metadata", () => {
  assert.match(cleanup, /upload_status: "cleaning", cleanup_token: cleanupToken/);
  assert.match(cleanup, /\.eq\("upload_token", row\.upload_token\)\.lt\("upload_lease_expires_at", cutoff\)/);
  assert.match(cleanup, /\.eq\("upload_status", "cleaning"\)\.eq\("cleanup_token", cleanupToken\)/);
});
