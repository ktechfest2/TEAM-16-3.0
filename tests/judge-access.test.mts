import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

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
  assert.doesNotMatch(script, /console\.log\(.*password/);
});
