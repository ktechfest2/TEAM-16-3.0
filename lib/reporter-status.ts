export type SafeReporterCaseStatus = {
  reviewState: string;
  responseState: string;
} | null;

type IncidentStatus = {
  review_state: string;
  response_state: string;
};

type ReportIncidentLink = {
  incidents: IncidentStatus | null;
};

/** Project only public-safe workflow states from the reporter's own linked case. */
export function safeReporterCaseStatus(
  relation: ReportIncidentLink | ReportIncidentLink[] | null,
): SafeReporterCaseStatus {
  const link = Array.isArray(relation) ? relation[0] : relation;
  const incident = link?.incidents;
  if (!incident) return null;

  return {
    reviewState: incident.review_state,
    responseState: incident.response_state,
  };
}
