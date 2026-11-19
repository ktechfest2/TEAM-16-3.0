/**
 * Case contract — grouping, review, assignment and follow-up payloads.
 * Framework-independent (same style as report-contract) so it can be unit tested
 * with the native node test runner. Grouping is capped at ten to match the
 * already-applied database function until a separately reviewed DB migration
 * raises both limits together.
 */
import { InputError, isUuid } from "./report-contract.ts";

export const reviewOutcomes = ["supported", "inconclusive", "not_supported"] as const;
export type ReviewOutcome = (typeof reviewOutcomes)[number];

export type CasePayload = { reportIds: string[]; summary: string; linkReason: string };
export type ReviewPayload = { outcome: ReviewOutcome; reason: string; evidenceIds: string[] };
export type AssignPayload = { coordinatorId: string; note: string | null };
export type NotePayload = { note: string | null };
export type FollowUpPayload = { action: string; note: string | null };

function text(value: unknown, name: string, min: number, max: number): string {
  if (typeof value !== "string") throw new InputError(`${name} is required`);
  const trimmed = value.trim();
  if (trimmed.length < min || trimmed.length > max)
    throw new InputError(`${name} must be between ${min} and ${max} characters`);
  return trimmed;
}

function optionalText(value: unknown, name: string, max: number): string | null {
  if (value === null || value === undefined || value === "") return null;
  return text(value, name, 1, max);
}

function body(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new InputError("Invalid request body");
  return input as Record<string, unknown>;
}

export function parseCase(input: unknown): CasePayload {
  const p = body(input);
  if (!Array.isArray(p.reportIds) || p.reportIds.length === 0)
    throw new InputError("Select at least one report to group");
  if (p.reportIds.length > 10) throw new InputError("Group at most 10 reports at a time");
  const reportIds = p.reportIds.map((id) => {
    if (!isUuid(id)) throw new InputError("Invalid report ID");
    return id.toLowerCase();
  });
  if (new Set(reportIds).size !== reportIds.length) throw new InputError("Duplicate report ID");
  return {
    reportIds,
    summary: text(p.summary, "Case summary", 8, 1200),
    linkReason: text(p.linkReason, "Grouping rationale", 12, 2000),
  };
}

export function parseReview(input: unknown): ReviewPayload {
  const p = body(input);
  if (typeof p.outcome !== "string" || !reviewOutcomes.includes(p.outcome as ReviewOutcome))
    throw new InputError("Unknown review outcome");
  const evidenceIds = p.evidenceIds === undefined ? [] : p.evidenceIds;
  if (!Array.isArray(evidenceIds) || evidenceIds.length > 20 || evidenceIds.some((id) => !isUuid(id)))
    throw new InputError("Evidence references must contain up to 20 valid IDs");
  const normalizedEvidenceIds = evidenceIds.map((id: string) => id.toLowerCase());
  if (new Set(normalizedEvidenceIds).size !== normalizedEvidenceIds.length)
    throw new InputError("Duplicate evidence reference");
  return {
    outcome: p.outcome as ReviewOutcome,
    reason: text(p.reason, "Review rationale", 12, 2000),
    evidenceIds: normalizedEvidenceIds,
  };
}

export function parseAssignment(input: unknown): AssignPayload {
  const p = body(input);
  if (!isUuid(p.coordinatorId)) throw new InputError("Select an approved coordinator");
  return { coordinatorId: p.coordinatorId.toLowerCase(), note: optionalText(p.note, "Assignment note", 2000) };
}

export function parseNote(input: unknown): NotePayload {
  const p = body(input);
  return { note: optionalText(p.note, "Note", 2000) };
}

export function parseFollowUp(input: unknown): FollowUpPayload {
  const p = body(input);
  return {
    action: text(p.action, "Follow-up action", 4, 400),
    note: optionalText(p.note, "Follow-up note", 2000),
  };
}
