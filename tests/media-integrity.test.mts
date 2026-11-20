import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { differenceHashFromLuma, hashDistance, inspectImageBytes } from "../lib/media-integrity.ts";

const png = new Uint8Array(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64"));

test("media inspection validates actual format, dimensions, size and SHA-256", async () => {
  const result = await inspectImageBytes("image/png", png);
  assert.equal(result.mimeType, "image/png");
  assert.deepEqual([result.width, result.height], [1, 1]);
  assert.match(result.sha256, /^[0-9a-f]{64}$/);
  assert.deepEqual(result.metadata, {});
  await assert.rejects(() => inspectImageBytes("image/jpeg", png), /valid JPEG, PNG, or WebP/);
  await assert.rejects(() => inspectImageBytes("image/png", new Uint8Array([1, 2, 3])), /valid JPEG, PNG, or WebP/);
});

test("exact and perceptual comparisons are deterministic but do not authenticate images", async () => {
  const first = await inspectImageBytes("image/png", png);
  const second = await inspectImageBytes("image/png", png);
  assert.equal(first.sha256, second.sha256);
  const descending = differenceHashFromLuma(Array.from({ length: 72 }, (_, index) => 72 - index));
  const ascending = differenceHashFromLuma(Array.from({ length: 72 }, (_, index) => index));
  assert.equal(hashDistance(descending, descending), 0);
  assert.equal(hashDistance(descending, ascending), 64);
});

test("Media Integrity stays separate, bounded and honest about unknown provenance", () => {
  const route = readFileSync(new URL("../app/api/media-integrity/observe/route.ts", import.meta.url), "utf8");
  const provider = readFileSync(new URL("../lib/server/media-observation.ts", import.meta.url), "utf8");
  const panel = readFileSync(new URL("../components/signa/media-integrity-panel.tsx", import.meta.url), "utf8");
  const automatic = readFileSync(new URL("../lib/server/async-ai-assessment.ts", import.meta.url), "utf8");
  assert.match(route, /scope: "media_integrity"/);
  assert.match(route, /externalProcessingConsent/);
  assert.match(provider, /Do not decide whether the image is authentic, manipulated, AI-generated/);
  assert.match(provider, /AbortSignal\.timeout\(15_000\)/);
  assert.match(panel, /Missing metadata is not evidence/);
  assert.match(panel, /C2PA verification is not available/);
  assert.match(panel, /Gemini is not used as a synthetic-image detector/);
  assert.match(automatic, /enforceAbuseLimit/);
  assert.match(automatic, /scope: "ai_assessment", reporterMax: 12/);
});

test("media limiter migration is server-only and includes prior scopes", () => {
  const migration = readFileSync(new URL("../supabase/migrations/20261120110000_media_integrity_rate_limit_scope.sql", import.meta.url), "utf8");
  for (const scope of ["report", "evidence", "ai_assessment", "voice", "verify", "media_integrity"]) assert.match(migration, new RegExp(`'${scope}'`));
  assert.match(migration, /revoke all on function/);
  assert.match(migration, /grant execute .* service_role/);
});
