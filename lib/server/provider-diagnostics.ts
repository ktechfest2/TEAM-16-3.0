import "server-only";

export type ProviderFailureCategory =
  | "invalid_credentials"
  | "model_unavailable"
  | "quota"
  | "timeout"
  | "malformed_output"
  | "network"
  | "provider_http"
  | "unknown";

export class ProviderFailure extends Error {
  constructor(
    public category: ProviderFailureCategory,
    public status: number | null = null,
    public providerCode: string | null = null,
  ) { super("Provider request failed"); }
}

export function providerHttpFailure(status: number, payload: unknown): ProviderFailure {
  const error = payload && typeof payload === "object"
    ? (payload as { error?: { status?: unknown; code?: unknown; details?: Array<{ reason?: unknown }> } }).error : null;
  const reason = error?.details?.find((detail) => typeof detail?.reason === "string")?.reason;
  const providerCode = typeof reason === "string" ? reason.slice(0, 80)
    : typeof error?.status === "string" ? error.status.slice(0, 80)
      : typeof error?.code === "number" || typeof error?.code === "string" ? String(error.code).slice(0, 80) : null;
  const category: ProviderFailureCategory = status === 401 || status === 403 || ["API_KEY_INVALID", "UNAUTHENTICATED", "PERMISSION_DENIED"].includes(providerCode || "") ? "invalid_credentials"
    : status === 404 || providerCode === "NOT_FOUND" ? "model_unavailable"
    : status === 429 || providerCode === "RESOURCE_EXHAUSTED" ? "quota"
    : status === 408 || status === 504 ? "timeout" : "provider_http";
  return new ProviderFailure(category, status, providerCode);
}

export function providerFailureDetails(error: unknown) {
  if (error instanceof ProviderFailure) return { category: error.category, status: error.status, providerCode: error.providerCode };
  if (error instanceof SyntaxError) return { category: "malformed_output" as const, status: null, providerCode: null };
  if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) return { category: "timeout" as const, status: null, providerCode: null };
  if (error instanceof TypeError) return { category: "network" as const, status: null, providerCode: null };
  return { category: "unknown" as const, status: null, providerCode: null };
}

export function logProviderFailure(input: { provider: "gemini" | "google_fact_check" | "intron"; operation: string; model?: string; error: unknown }) {
  const details = providerFailureDetails(input.error);
  console.error("signa.provider.failure", {
    provider: input.provider,
    operation: input.operation.slice(0, 80),
    model: input.model?.slice(0, 100) || null,
    ...details,
  });
  return details;
}
