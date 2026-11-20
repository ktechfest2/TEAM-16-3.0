import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("provider failures are classified without logging secrets or submitted content", () => {
  const diagnostics = readFileSync(new URL("../lib/server/provider-diagnostics.ts", import.meta.url), "utf8");
  for (const category of ["invalid_credentials", "model_unavailable", "quota", "timeout", "malformed_output", "network", "provider_http"])
    assert.match(diagnostics, new RegExp(category));
  assert.match(diagnostics, /providerCode/);
  assert.doesNotMatch(diagnostics, /console\.(?:error|log)\([^\n]*(?:payload|prompt|claim|apiKey|secret)/i);
});

test("browser speech stays disabled and telephone tools expose public-safe data only", () => {
  const browserRoute = readFileSync(new URL("../app/api/voice/turn/route.ts", import.meta.url), "utf8");
  const page = readFileSync(new URL("../app/voice/page.tsx", import.meta.url), "utf8");
  const tool = readFileSync(new URL("../app/api/voicebip/tool/route.ts", import.meta.url), "utf8");
  assert.match(browserRoute, /status: 404/);
  assert.doesNotMatch(page, /getUserMedia|MediaRecorder|speechSynthesis/);
  assert.match(tool, /VOICEBIP_WEBHOOK_SECRET/);
  assert.match(tool, /timingSafeEqual/);
  assert.match(tool, /event_id|invocation_id/);
  assert.match(tool, /Date\.now\(\)[\s\S]*5 \* 60_000/);
  assert.match(tool, /scope: "voice"/);
  assert.match(tool, /public_safe_updates/);
  assert.match(tool, /eq\("approved", true\)/);
  assert.doesNotMatch(tool, /from\("(?:reports|evidence|profiles)"\)/);
});
