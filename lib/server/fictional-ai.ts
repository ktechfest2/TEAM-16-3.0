import "server-only";

/** Server-controlled demo allowlist. A client flag or simulated unit alone is insufficient. */
export function approvedFictionalReporter(reporterId: string): boolean {
  if (process.env.SIGNA_FICTIONAL_TEST_MODE !== "true") return false;
  if (!fictionalTestStart()) return false;
  return (process.env.SIGNA_FICTIONAL_TEST_REPORTER_IDS || "")
    .split(",").map((id) => id.trim().toLowerCase())
    .includes(reporterId.toLowerCase());
}

function fictionalTestStart(): number | null {
  const value = process.env.SIGNA_FICTIONAL_TEST_START_AT;
  if (!value || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(value)) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

/** Excludes older, unclassified records even when their reporter is later allowlisted. */
export function approvedFictionalReport(reporterId: string, receivedAt: string): boolean {
  const start = fictionalTestStart();
  return start !== null && approvedFictionalReporter(reporterId) && Date.parse(receivedAt) >= start;
}
