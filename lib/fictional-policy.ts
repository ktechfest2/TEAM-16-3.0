export type FictionalPolicyConfig = {
  reportingEnabled?: string;
  reportingReporterIds?: string;
  aiEnabled?: string;
  aiReporterIds?: string;
  aiStartAt?: string;
};

function allowlisted(reporterId: string, ids = ""): boolean {
  const normalized = reporterId.trim().toLowerCase();
  return normalized.length > 0 && ids.split(",").some((id) => id.trim().toLowerCase() === normalized);
}

export function fictionalReportingAllowed(reporterId: string, config: FictionalPolicyConfig): boolean {
  return config.reportingEnabled === "true" && allowlisted(reporterId, config.reportingReporterIds);
}

export function fictionalAiStart(config: FictionalPolicyConfig): number | null {
  const value = config.aiStartAt;
  if (!value || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(value)) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

export function fictionalAiReporterAllowed(
  reporterId: string,
  config: FictionalPolicyConfig,
  at = Date.now(),
): boolean {
  const start = fictionalAiStart(config);
  return config.aiEnabled === "true" && start !== null && at >= start && allowlisted(reporterId, config.aiReporterIds);
}

export function fictionalAiReportAllowed(
  reporterId: string,
  receivedAt: string,
  config: FictionalPolicyConfig,
): boolean {
  const received = Date.parse(receivedAt);
  return Number.isFinite(received) && fictionalAiReporterAllowed(reporterId, config, received);
}

export function reportLocationAllowed(input: {
  isSimulated: boolean;
  markedFictional: boolean;
  fictionalReportingApproved: boolean;
}): boolean {
  if (input.isSimulated) return input.markedFictional && input.fictionalReportingApproved;
  return !input.markedFictional;
}
