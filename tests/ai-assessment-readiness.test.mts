import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("idempotent evidence retries do not schedule duplicate provider calls", () => {
  const route = readFileSync(new URL("../app/api/reports/[reportId]/evidence/route.ts", import.meta.url), "utf8");
  assert.match(route, /if \(!result\.duplicate\) after\(/);
});

test("Gemini requests have bounded duration and output", () => {
  const provider = readFileSync(new URL("../lib/server/ai-assessment.ts", import.meta.url), "utf8");
  assert.match(provider, /AbortSignal\.timeout\(20_000\)/);
  assert.match(provider, /maxOutputTokens: 1024/);
});

test("automatic and manual assessment paths retain server-side eligibility checks", () => {
  const automatic = readFileSync(new URL("../lib/server/async-ai-assessment.ts", import.meta.url), "utf8");
  const manual = readFileSync(new URL("../app/api/monitor/ai-assessments/route.ts", import.meta.url), "utf8");
  for (const source of [automatic, manual]) {
    assert.match(source, /ai_processing_consent/);
    assert.match(source, /is_simulated/);
    assert.match(source, /approvedFictionalReport/);
    assert.match(source, /upload_status", "ready"/);
  }
});
