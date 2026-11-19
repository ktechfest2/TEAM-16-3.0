import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { adminClient } from "@/lib/server/supabase";
import { enforceAbuseLimit } from "@/lib/server/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const secret = process.env.VOICEBIP_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  const raw = await req.text();
  if (raw.length > 16_000) return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
  const supplied = req.headers.get("x-voicebip-signature") || "";
  const expected = createHmac("sha256", secret).update(raw).digest("hex");
  const normalized = supplied.replace(/^sha256=/i, "");
  const a = Buffer.from(expected, "hex"); const b = Buffer.from(normalized, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    await enforceAbuseLimit(req, "", { scope: "voice", reporterMax: 60, ipMax: 120, windowSeconds: 600 });
    const body = JSON.parse(raw);
    const event = body.event_type;
    const name = body.tool_name;
    const args = body.arguments;
    if (event !== "tool.invocation" || name !== "get_public_incident_updates" || !args || typeof args !== "object")
      return NextResponse.json({ error: "unsupported_invocation" }, { status: 400 });
    const code = typeof args.polling_unit_code === "string" ? args.polling_unit_code.trim().slice(0, 32) : "";
    if (!/^[A-Za-z0-9-]{2,32}$/.test(code)) return NextResponse.json({ error: "invalid_polling_unit" }, { status: 400 });
    const { data, error } = await adminClient().from("public_safe_updates")
      .select("polling_unit_code,summary,public_date")
      .eq("polling_unit_code", code).eq("approved", true).lte("public_date", new Date().toISOString().slice(0, 10))
      .order("public_date", { ascending: false }).limit(5);
    if (error) throw error;
    const result = data?.length
      ? data.map((row) => `${row.polling_unit_code} — ${row.public_date}: ${row.summary}`).join("\n")
      : `No approved public update is available for polling unit ${code}. Information is unavailable; this does not indicate that the location is safe.`;
    return NextResponse.json({ result });
  } catch {
    return NextResponse.json({ error: "tool_unavailable" }, { status: 503 });
  }
}
