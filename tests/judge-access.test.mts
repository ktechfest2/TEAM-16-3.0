import assert from "node:assert/strict";
import { closeSync, mkdtempSync, openSync, readFileSync, rmdirSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { persistJsonState } = require("../scripts/private-state-writer.cjs") as {
  persistJsonState: (fileDescriptor: number, state: unknown) => void;
};

test("judge access is a server-only UUID allowlist restricted to simulated records", () => {
  const policy = readFileSync(new URL("../lib/server/judge-access.ts", import.meta.url), "utf8");
  const reports = readFileSync(new URL("../app/api/monitor/reports/route.ts", import.meta.url), "utf8");
  const incidents = readFileSync(new URL("../app/api/monitor/incidents/route.ts", import.meta.url), "utf8");
  const evidence = readFileSync(new URL("../lib/server/evidence.ts", import.meta.url), "utf8");
  const assignment = readFileSync(new URL("../app/api/monitor/incidents/[id]/assign/route.ts", import.meta.url), "utf8");
  assert.match(policy, /process\.env\.SIGNA_JUDGE_USER_IDS/);
  assert.match(policy, /polling_units!inner\(is_simulated\)/);
  assert.match(policy, /eq\("polling_units\.is_simulated", true\)/);
  assert.match(reports, /keepSimulatedForJudge/);
  assert.match(incidents, /judgeCanAccessReport/);
  assert.match(evidence, /judgeCanAccessReport/);
  assert.match(assignment, /isRestrictedJudge\(parsed\.coordinatorId\)/);
});

test("judge provisioning preserves UUIDs, checks trusted roles, and never prints credentials", () => {
  const script = readFileSync(new URL("../scripts/provision-judge-accounts.cjs", import.meta.url), "utf8");
  assert.match(script, /auth\.admin\.updateUserById\(account\.id/);
  assert.match(script, /profile\.role !== account\.role/);
  assert.match(script, /SIGNA_JUDGE_CREDENTIAL_OUTPUT must be an absolute path outside the repository/);
  assert.match(script, /process\.argv\.includes\("--rotate"\)/);
  assert.match(script, /openSync\(output, "wx", 0o600\)/);
  assert.match(script, /randomBytes\(12\)\.toString\("base64url"\).*?!9a/);
  assert.match(script, /credentialState\.status = "partial"/);
  assert.match(script, /persistPrivateState\(\)/);
  assert.doesNotMatch(script, /console\.log\(.*password/);
});

test("judge credential state rewrites are positioned, truncated, durable JSON", () => {
  const directory = mkdtempSync(join(tmpdir(), "signa-judge-state-"));
  const path = join(directory, "credentials.json");
  const descriptor = openSync(path, "wx", 0o600);
  try {
    const states = [
      { status: "in_progress", credentials: [{ role: "Reviewer 1", password: "first-secret-value" }] },
      { status: "partial", credentials: [] },
      { status: "complete", credentials: [{ role: "Reviewer 1" }, { role: "Reviewer 2" }, { role: "Coordinator" }] },
    ];
    for (const state of states) {
      persistJsonState(descriptor, state);
      const bytes = readFileSync(path);
      assert.equal(bytes.includes(0), false);
      assert.deepEqual(JSON.parse(bytes.toString("utf8")), state);
      assert.equal(bytes.toString("utf8"), `${JSON.stringify(state, null, 2)}\n`);
    }
  } finally {
    closeSync(descriptor);
    unlinkSync(path);
    rmdirSync(directory);
  }
});
