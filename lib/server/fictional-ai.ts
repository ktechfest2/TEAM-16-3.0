import "server-only";
import {
  fictionalAiReportAllowed,
  fictionalAiReporterAllowed,
  fictionalReportingAllowed,
  type FictionalPolicyConfig,
} from "@/lib/fictional-policy";

function policyConfig(): FictionalPolicyConfig {
  return {
    reportingEnabled: process.env.SIGNA_FICTIONAL_REPORTING_MODE,
    reportingReporterIds: process.env.SIGNA_FICTIONAL_REPORTER_IDS,
    aiEnabled: process.env.SIGNA_FICTIONAL_TEST_MODE,
    aiReporterIds: process.env.SIGNA_FICTIONAL_TEST_REPORTER_IDS,
    aiStartAt: process.env.SIGNA_FICTIONAL_TEST_START_AT,
  };
}

/** Server-controlled reporting allowlist. Client markers never grant simulated-unit access. */
export function approvedFictionalReportingReporter(reporterId: string): boolean {
  return fictionalReportingAllowed(reporterId, policyConfig());
}

/** Separate Gemini allowlist and activation cutoff; it may be narrower than reporting access. */
export function approvedFictionalAiReporter(reporterId: string): boolean {
  return fictionalAiReporterAllowed(reporterId, policyConfig());
}

/** Excludes older, unclassified records even when their reporter is later allowlisted. */
export function approvedFictionalReport(reporterId: string, receivedAt: string): boolean {
  return fictionalAiReportAllowed(reporterId, receivedAt, policyConfig());
}
