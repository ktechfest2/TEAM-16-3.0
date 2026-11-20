import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { adminClient } from "@/lib/server/supabase";
import { enforceAbuseLimit } from "@/lib/server/rate-limit";
import { noStore, RequestLimitedError } from "@/lib/server/responses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const secret = process.env.VOICEBIP_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "unavailable" }, { status: 503, headers: noStore });
  const raw = await req.text();
  if (raw.length > 16_000) return NextResponse.json({ error: "payload_too_large" }, { status: 413, headers: noStore });
  const supplied = req.headers.get("x-voicebip-signature") || "";
  const expected = createHmac("sha256", secret).update(raw).digest("hex");
  const normalized = supplied.replace(/^sha256=/i, "");
  const a = Buffer.from(expected, "hex"); const b = Buffer.from(normalized, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: noStore });
  try {
    const body = JSON.parse(raw);
    const event = body.event_type;
    const name = body.tool_name;
    const args = body.arguments;
    const eventId = typeof body.event_id === "string" ? body.event_id : typeof body.invocation_id === "string" ? body.invocation_id : "";
    const occurredAt = typeof body.timestamp === "string" ? Date.parse(body.timestamp) : NaN;
    if (!/^(?:evt|inv)_[A-Za-z0-9_-]{6,120}$/.test(eventId) || !Number.isFinite(occurredAt) || Math.abs(Date.now() - occurredAt) > 5 * 60_000)
      return NextResponse.json({ error: "stale_or_invalid_invocation" }, { status: 400, headers: noStore });
    if (event !== "tool.invocation" || !["get_public_incident_updates", "get_signa_information"].includes(name) || !args || typeof args !== "object")
      return NextResponse.json({ error: "unsupported_invocation" }, { status: 400, headers: noStore });
    if (name === "get_signa_information") {
      await enforceAbuseLimit(req, `voicebip:${eventId}`, { scope: "voice", reporterMax: 1, ipMax: 120, windowSeconds: 600 });
      return NextResponse.json({ result: "Signa is a nonpartisan incident reporting and coordination service. Citizens can submit and track reports. Authorized reviewers assess allegations, and coordinators record internal follow-up. Signa does not certify claims automatically, dispatch emergency services, or represent INEC or the police." }, { headers: noStore });
    }
    const code = typeof args.polling_unit_code === "string" ? args.polling_unit_code.trim().slice(0, 32) : "";
    if (!/^[A-Za-z0-9/-]{2,32}$/.test(code)) return NextResponse.json({ error: "invalid_polling_unit" }, { status: 400, headers: noStore });
    const { data, error } = await adminClient().from("public_safe_updates")
      .select("polling_unit_code,summary,public_date")
      .eq("polling_unit_code", code).eq("approved", true).lte("public_date", new Date().toISOString().slice(0, 10))
      .order("public_date", { ascending: false }).limit(5);
    if (error) throw error;
    // Consume the event identifier only after the read succeeds. A transient
    // database failure remains retryable, while successful replays fail closed.
    await enforceAbuseLimit(req, `voicebip:${eventId}`, { scope: "voice", reporterMax: 1, ipMax: 120, windowSeconds: 600 });
    const result = data?.length
      ? data.map((row) => `${row.polling_unit_code} — ${row.public_date}: ${row.summary}`).join("\n")
      : `No approved public update is available for polling unit ${code}. Information is unavailable; this does not indicate that the location is safe.`;
    return NextResponse.json({ result }, { headers: noStore });
  } catch (error) {
    if (error instanceof RequestLimitedError) return NextResponse.json({ error: "replayed_or_rate_limited" }, { status: 409, headers: noStore });
    return NextResponse.json({ error: "tool_unavailable" }, { status: 503, headers: noStore });
  }
}
