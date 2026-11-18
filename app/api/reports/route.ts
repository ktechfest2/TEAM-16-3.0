import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { getViewer } from "@/lib/server/auth";
import { adminClient } from "@/lib/server/supabase";
import { canonicalPayload, isRetrySameReport, parseReport } from "@/lib/report-contract";
import { errorResponse, noStore } from "@/lib/server/responses";

export async function POST(req: Request) {
  try {
    const viewer = await getViewer(req, ["reporter"]);
    const parsed = parseReport(await req.json().catch(() => null));
    const hash = createHash("sha256").update(canonicalPayload(parsed)).digest("hex");
    const db = adminClient();
    const { data: unit, error: unitError } = await db.from("polling_units")
      .select("id").eq("id", parsed.pollingUnitId).eq("is_simulated", true).maybeSingle();
    if (unitError) throw unitError;
    if (!unit) return NextResponse.json({ error: { code: "UNIT", message: "Unknown polling unit" } }, { status: 400, headers: noStore });

    const { data: created, error: insertError } = await db.from("reports").insert({
      id: parsed.id, reporter_id: viewer.userId, polling_unit_id: parsed.pollingUnitId,
      category: parsed.category, description: parsed.description, occurred_at: parsed.occurredAt,
      client_created_at: parsed.clientCreatedAt, payload_sha256: hash,
    }).select("id,received_at").single();
    if (!insertError) return NextResponse.json({ id: created!.id, receivedAt: created!.received_at, delivery: "received", duplicate: false }, { status: 201, headers: noStore });
    if (insertError.code !== "23505") throw insertError;

    const { data: existing, error: lookupError } = await db.from("reports")
      .select("id,reporter_id,payload_sha256,received_at").eq("id", parsed.id).maybeSingle();
    if (lookupError) throw lookupError;
    if (!existing || !isRetrySameReport(existing, viewer.userId, hash))
      return NextResponse.json({ error: { code: "CONFLICT", message: "A different report already uses this ID" } }, { status: 409, headers: noStore });
    return NextResponse.json({ id: existing.id, receivedAt: existing.received_at, delivery: "received", duplicate: true }, { headers: noStore });
  } catch(e) { return errorResponse(e); }
}
