import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parseVerifyRequest, validateSupportedVerifyUrl, validateVerifyAnalysis, verifyOutcomes, type VerifySource } from "../lib/verify-contract.ts";

const source: VerifySource = { id: "source-1", title: "Published review", url: "https://dubawa.org/review", publisher: "DUBAWA", publishedAt: "2026-11-20", claim: "The reviewed claim", rating: "False" };

test("verification requires explicit external-processing consent and bounded input", () => {
  assert.throws(() => parseVerifyRequest({ claim: "claim", externalProcessingConsent: false }), /Consent is required/);
  assert.throws(() => parseVerifyRequest({ claim: "x".repeat(5_001), externalProcessingConsent: true }), /5,000/);
  assert.deepEqual(parseVerifyRequest({ claim: "  election claim ", externalProcessingConsent: true }), { claim: "election claim", articleUrl: "" });
});

test("link extraction rejects SSRF targets, credentials, ports, and unsupported redirects", () => {
  for (const unsafe of ["http://dubawa.org/a", "https://127.0.0.1/a", "https://localhost/a", "https://user:pass@dubawa.org/a", "https://dubawa.org:8443/a", "https://dubawa.org.attacker.test/a"])
    assert.throws(() => validateSupportedVerifyUrl(unsafe));
  assert.equal(validateSupportedVerifyUrl("https://www.africacheck.org/fact-checks/example").hostname, "www.africacheck.org");
});

test("all public outcomes validate only with real returned source IDs", () => {
  const second = { ...source, id: "source-2", url: "https://africacheck.org/review", publisher: "Africa Check" };
  for (const outcome of verifyOutcomes) assert.equal(validateVerifyAnalysis({ outcome, explanation: "This explanation is grounded in the returned published source.", citedSourceIds: outcome === "conflicting" ? ["source-1", "source-2"] : ["source-1"], uncertainty: "Publication coverage may be incomplete." }, [source, second]).outcome, outcome);
  assert.throws(() => validateVerifyAnalysis({ outcome: "supported", explanation: "This explanation attempts to cite a fabricated source identifier.", citedSourceIds: ["invented-99"], uncertainty: "" }, [source]), /unavailable source/);
  assert.throws(() => validateVerifyAnalysis({ outcome: "supported", explanation: "This result links https://invented.example as if it were evidence.", citedSourceIds: ["source-1"], uncertainty: "" }, [source]), /inline URL/);
});

test("Verify is default-off, separately configured, rate-limited, and does not read incident records", () => {
  const config = readFileSync(new URL("../lib/server/verify-config.ts", import.meta.url), "utf8");
  const route = readFileSync(new URL("../app/api/verify/route.ts", import.meta.url), "utf8");
  const contract = readFileSync(new URL("../lib/verify-contract.ts", import.meta.url), "utf8");
  const limiter = readFileSync(new URL("../supabase/migrations/20261120103000_verify_rate_limit_scope.sql", import.meta.url), "utf8");
  assert.match(config, /SIGNA_VERIFY_ENABLED === "true"/);
  assert.match(config, /GOOGLE_FACT_CHECK_API_KEY/);
  assert.match(route, /scope: "verify"/);
  assert.match(contract, /externalProcessingConsent !== true/);
  assert.doesNotMatch(route, /from\("(?:reports|evidence|incidents)"\)/);
  assert.match(limiter, /'verify'/);
  assert.match(limiter, /revoke all on function/);
});

test("credible-source search records partial coverage without inventing searches", () => {
  const search = readFileSync(new URL("../lib/server/fact-check-search.ts", import.meta.url), "utf8");
  assert.match(search, /result\.status === "fulfilled"/);
  assert.match(search, /reviewPublisherSiteFilter/);
  for (const domain of ["inecnigeria.org", "dubawa.org", "factcheckhub.com", "africacheck.org"]) assert.match(search, new RegExp(domain.replace(".", "\\.")));
});
