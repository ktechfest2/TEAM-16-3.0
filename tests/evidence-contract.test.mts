import test from "node:test";
import assert from "node:assert/strict";
import { InputError } from "../lib/report-contract.ts";
import { MAX_EVIDENCE_BYTES, validateEvidenceBytes } from "../lib/evidence-contract.ts";

test("evidence type must match a supported file signature", () => {
  assert.equal(validateEvidenceBytes("image/jpeg", new Uint8Array([0xff, 0xd8, 0xff, 0x00])), "image/jpeg");
  assert.equal(validateEvidenceBytes("image/png", new Uint8Array([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])), "image/png");
  assert.equal(validateEvidenceBytes("image/webp", new Uint8Array([82,73,70,70,0,0,0,0,87,69,66,80])), "image/webp");
  assert.throws(() => validateEvidenceBytes("image/png", new Uint8Array([0xff, 0xd8, 0xff])), InputError);
  assert.throws(() => validateEvidenceBytes("image/svg+xml", new Uint8Array([60,115,118,103])), InputError);
});

test("evidence rejects empty and over-limit files before upload", () => {
  assert.throws(() => validateEvidenceBytes("image/jpeg", new Uint8Array()), InputError);
  assert.throws(() => validateEvidenceBytes("image/jpeg", new Uint8Array(MAX_EVIDENCE_BYTES + 1)), InputError);
});
