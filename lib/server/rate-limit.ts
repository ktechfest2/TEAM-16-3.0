import "server-only";
import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { DependencyUnavailableError, RequestLimitedError } from "./responses";
import { adminClient } from "./supabase";

type Limit = { scope: "report" | "evidence" | "ai_assessment" | "voice" | "verify" | "media_integrity"; reporterMax: number; ipMax: number; windowSeconds: number };

/**
 * Durable fixed-window counters in Postgres. Only HMAC-derived identifiers are
 * persisted; raw reporter IDs and client IPs are never written or logged.
 * Limits fail closed when the database migration/service is unavailable.
 */
export async function enforceAbuseLimit(req: Request, reporterId: string | null, limit: Limit): Promise<void> {
  const hmacSecret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!hmacSecret) throw new DependencyUnavailableError("Abuse controls are unavailable", "database_limiter_configuration");

  const ip = trustedClientIp(req);
  if (!reporterId && !ip) throw new DependencyUnavailableError("Abuse controls are unavailable", "trusted_client_address");
  const checks = [
    ...(reporterId ? [consume(limit.scope, `reporter:${reporterId}`, hmacSecret, limit.reporterMax, limit.windowSeconds)] : []),
    ...(ip ? [consume(limit.scope, `network:${ip}`, hmacSecret, limit.ipMax, limit.windowSeconds)] : []),
  ];
  const results = await Promise.all(checks);
  if (results.some((allowed) => !allowed)) throw new RequestLimitedError(limit.windowSeconds);
}

async function consume(scope: Limit["scope"], identity: string, hmacSecret: string, maximum: number, windowSeconds: number) {
  const keyHash = createHmac("sha256", hmacSecret).update(identity).digest("hex");
  let result: { data: unknown; error: unknown };
  try {
    result = await adminClient().rpc("signa_consume_rate_limit", {
      p_scope: scope,
      p_key_hash: keyHash,
      p_limit: maximum,
      p_window_seconds: windowSeconds,
    });
  } catch {
    throw new DependencyUnavailableError("Abuse controls are unavailable", "database_limiter_connection");
  }
  if (result.error || typeof result.data !== "boolean")
    throw new DependencyUnavailableError("Abuse controls are unavailable", "database_limiter_rpc");
  return result.data;
}

function trustedClientIp(req: Request): string | null {
  const candidate = req.headers.get("x-vercel-forwarded-for") || req.headers.get("x-real-ip") || "";
  const ip = candidate.split(",", 1)[0].trim();
  return isIP(ip) ? ip : null;
}
