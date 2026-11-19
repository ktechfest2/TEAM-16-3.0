/** Report contract is intentionally framework-independent for fast native-node tests. */
export const categories = [
  "violence", "intimidation", "vote_buying", "missing_materials",
  "disruption", "accessibility_barrier", "other",
] as const;

export type ReportCategory = (typeof categories)[number];
export type ReportPayload = {
  id: string;
  pollingUnitId: string;
  category: ReportCategory;
  description: string;
  occurredAt: string | null;
  clientCreatedAt: string | null;
  aiProcessingConsent: boolean;
};

export class InputError extends Error {
  constructor(message: string) { super(message); this.name = "InputError"; }
}

export function isUuid(text: unknown): text is string {
  return typeof text === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text);
}

function normalizeOptionalDate(value: unknown, name: string): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || value.length > 45 || !/^(\d{4})-\d\d-\d\dT/.test(value))
    throw new InputError(`${name} must be an ISO date-time`);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new InputError(`${name} is invalid`);
  return parsed.toISOString();
}

export function parseReport(input: unknown): ReportPayload {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new InputError("Invalid report body");
  const p = input as Record<string, unknown>;
  if (!isUuid(p.id) || !isUuid(p.pollingUnitId)) throw new InputError("Invalid report or polling-unit ID");
  if (typeof p.category !== "string" || !categories.includes(p.category as ReportCategory))
    throw new InputError("Unknown incident category");
  if (typeof p.description !== "string" || p.description.trim().length < 3 || p.description.length > 1600)
    throw new InputError("Description must be between 3 and 1600 characters");
  return {
    id: p.id.toLowerCase(), pollingUnitId: p.pollingUnitId.toLowerCase(),
    category: p.category as ReportCategory, description: p.description.trim(),
    occurredAt: normalizeOptionalDate(p.occurredAt, "occurredAt"),
    clientCreatedAt: normalizeOptionalDate(p.clientCreatedAt, "clientCreatedAt"),
    aiProcessingConsent: p.aiProcessingConsent === true,
  };
}

export function canonicalPayload(payload: ReportPayload): string {
  return JSON.stringify([
    payload.pollingUnitId, payload.category, payload.description,
    payload.occurredAt, payload.clientCreatedAt,
    payload.aiProcessingConsent,
  ]);
}

export function isRetrySameReport(
  record: { reporter_id: string; payload_sha256: string }, reporterId: string, sha256: string,
): boolean {
  return record.reporter_id === reporterId && record.payload_sha256 === sha256;
}
