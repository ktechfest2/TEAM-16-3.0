import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { readDemoConfiguration } from "../lib/demo-contract.ts";

const ids = {
  citizen: "00000000-0000-4000-8000-000000000701",
  reviewer1: "00000000-0000-4000-8000-000000000702",
  reviewer2: "00000000-0000-4000-8000-000000000703",
  coordinator: "00000000-0000-4000-8000-000000000704",
};

function environment() {
  return {
    SIGNA_DEMO_MODE: "true",
    SIGNA_DEMO_PROJECT_REF: "abcdefghijklmnopqrst",
    SIGNA_DEMO_SESSION_MAX_SECONDS: "1800",
    NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co",
    SIGNA_DEMO_CITIZEN_USER_ID: ids.citizen,
    SIGNA_DEMO_CITIZEN_EMAIL: "citizen@demo.invalid",
    SIGNA_DEMO_CITIZEN_PASSWORD: "fixture-password-citizen",
    SIGNA_DEMO_REVIEWER_1_USER_ID: ids.reviewer1,
    SIGNA_DEMO_REVIEWER_1_EMAIL: "reviewer1@demo.invalid",
    SIGNA_DEMO_REVIEWER_1_PASSWORD: "fixture-password-reviewer-one",
    SIGNA_DEMO_REVIEWER_2_USER_ID: ids.reviewer2,
    SIGNA_DEMO_REVIEWER_2_EMAIL: "reviewer2@demo.invalid",
    SIGNA_DEMO_REVIEWER_2_PASSWORD: "fixture-password-reviewer-two",
    SIGNA_DEMO_COORDINATOR_USER_ID: ids.coordinator,
    SIGNA_DEMO_COORDINATOR_EMAIL: "coordinator@demo.invalid",
    SIGNA_DEMO_COORDINATOR_PASSWORD: "fixture-password-coordinator",
  };
}

test("demo access is safely disabled by default", () => {
  assert.deepEqual(readDemoConfiguration({}), { enabled: false });
});

test("demo access refuses the production project and mismatched targets", () => {
  assert.throws(() => readDemoConfiguration({ ...environment(), SIGNA_DEMO_PROJECT_REF: "zddmcuidtzvwalvdtfqp", NEXT_PUBLIC_SUPABASE_URL: "https://zddmcuidtzvwalvdtfqp.supabase.co" }), /distinct/);
  assert.throws(() => readDemoConfiguration({ ...environment(), NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co.attacker.example" }), /do not match/);
});

test("demo access requires distinct controlled identities and bounded expiry", () => {
  const config = readDemoConfiguration(environment());
  assert.equal(config.enabled, true);
  if (!config.enabled) return;
  assert.equal(config.accounts.reviewer1.trustedRole, "monitor");
  assert.equal(config.accounts.reviewer2.trustedRole, "monitor");
  assert.notEqual(config.accounts.reviewer1.userId, config.accounts.reviewer2.userId);
  assert.equal(config.accounts.coordinator.destination, "/coordinator");
  assert.throws(() => readDemoConfiguration({ ...environment(), SIGNA_DEMO_REVIEWER_2_USER_ID: ids.reviewer1 }), /distinct account/);
  assert.throws(() => readDemoConfiguration({ ...environment(), SIGNA_DEMO_SESSION_MAX_SECONDS: "7200" }), /between 300 and 3600/);
});

test("session broker checks origin, rate limit, identity, trusted role, and expiry", () => {
  const route = readFileSync(new URL("../app/api/demo/session/route.ts", import.meta.url), "utf8");
  assert.match(route, /new URL\(origin\)\.origin !== new URL\(req\.url\)\.origin/);
  assert.match(route, /enforceAbuseLimit/);
  assert.match(route, /data\.user\.id\.toLowerCase\(\) !== account\.userId/);
  assert.match(route, /trustedRole\(profile\) !== account\.trustedRole/);
  assert.match(route, /remaining > config\.maxSessionSeconds \+ 60/);
  const response = route.slice(route.indexOf("return NextResponse.json({\n      session"));
  assert.doesNotMatch(response, /account\.(?:email|password)/);
});

test("demo deployments only accept simulated report locations", () => {
  const route = readFileSync(new URL("../app/api/reports/route.ts", import.meta.url), "utf8");
  assert.match(route, /SIGNA_DEMO_MODE === "true"/);
  assert.match(route, /demoRequiresFictionalUnit && !unit\.is_simulated/);
});
