import { NextResponse } from "next/server";
import { AccessError } from "./auth";
import { InputError } from "../report-contract";
export const noStore = { "cache-control": "no-store" };
export class RequestLimitedError extends Error {
  constructor(public retryAfterSeconds: number) { super("Request limit reached"); }
}
export class DependencyUnavailableError extends Error {
  constructor(message = "A required service is unavailable", public diagnosticCategory = "dependency") { super(message); }
}
export function errorResponse(err: unknown) {
  const requestId = crypto.randomUUID();
  if (err instanceof AccessError) return NextResponse.json({ error: { code: "ACCESS", message: err.message }, requestId }, { status: err.status, headers: noStore });
  if (err instanceof InputError) return NextResponse.json({ error: { code: "INPUT", message: err.message }, requestId }, { status: 400, headers: noStore });
  if (err instanceof RequestLimitedError) return NextResponse.json(
    { error: { code: "RATE_LIMIT", message: "Too many requests. Try again later." }, requestId },
    { status: 429, headers: { ...noStore, "retry-after": String(err.retryAfterSeconds) } },
  );
  if (err instanceof DependencyUnavailableError) {
    console.error("signa.dependency.failure", { requestId, category: err.diagnosticCategory.slice(0, 80) });
    return NextResponse.json(
      { error: { code: "UNAVAILABLE", message: "A required service is temporarily unavailable" }, requestId },
      { status: 503, headers: { ...noStore, "retry-after": "30" } },
    );
  }
  // Do not print exception messages, request payloads, SQL details, paths, or tokens.
  console.error("signa.api.failure", { requestId, errorType: err instanceof Error ? "Error" : "Unknown" });
  return NextResponse.json({ error: { code: "SERVER", message: "Request could not be completed" }, requestId }, { status: 500, headers: noStore });
}
