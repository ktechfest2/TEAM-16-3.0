import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { after } from "next/server";
import { getViewer } from "@/lib/server/auth";
import { adminClient } from "@/lib/server/supabase";
import { canonicalPayload, isRetrySameReport, legacyCanonicalPayload, parseReport } from "@/lib/report-contract";
import { errorResponse, noStore } from "@/lib/server/responses";
import { enforceAbuseLimit } from "@/lib/server/rate-limit";
import { runConsentAssessment } from "@/lib/server/async-ai-assessment";
import { approvedFictionalReporter } from "@/lib/server/fictional-ai";

export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    const viewer = await getViewer(req, ["reporter"]);
    const parsed = parseReport(await req.json().catch(() => null));
    const hash = createHash("sha256").update(canonicalPayload(parsed)).digest("hex");
    const legacyHash = createHash("sha256").update(legacyCanonicalPayload(parsed)).digest("hex");
    const db = adminClient();
    const { data: unit, error: unitError } = await db.from("polling_units")
      .select("id,is_simulated").eq("id", parsed.pollingUnitId).maybeSingle();
    if (unitError) throw unitError;

    // Successful retries bypass rate counters; a repeated id with changed body
    // remains a conflict and never creates another receipt.
    const { data: prior, error: priorError } = await db.from("reports")
      .select("id,reporter_id,payload_sha256,received_at").eq("id", parsed.id).maybeSingle();
    if (priorError) throw priorError;
    if (prior) {
      if (!isRetrySameReport(prior, viewer.userId, hash, legacyHash))
        return NextResponse.json({ error: { code: "CONFLICT", message: "A different report already uses this ID" } }, { status: 409, headers: noStore });
      return NextResponse.json({ id: prior.id, receivedAt: prior.received_at, delivery: "received", duplicate: true }, { headers: noStore });
    }

    if (!unit || unit.is_simulated && !approvedFictionalReporter(viewer.userId)) return NextResponse.json({ error: { code: "UNIT", message: "Polling unit unavailable for this reporter session" } }, { status: 400, headers: noStore });

    await enforceAbuseLimit(req, viewer.userId, { scope: "report", reporterMax: 30, ipMax: 120, windowSeconds: 600 });

    const aiEligible = unit.is_simulated && parsed.aiProcessingConsent && parsed.fictionalTestSubmission === true && approvedFictionalReporter(viewer.userId);
    const { data: created, error: insertError } = await db.from("reports").insert({
      id: parsed.id, reporter_id: viewer.userId, polling_unit_id: parsed.pollingUnitId,
      category: parsed.category, description: parsed.description, occurred_at: parsed.occurredAt,
      client_created_at: parsed.clientCreatedAt, ai_processing_consent: aiEligible, payload_sha256: hash,
    }).select("id,received_at").single();
    if (!insertError) {
      if (aiEligible) after(async () => { await runConsentAssessment(parsed.id).catch(() => undefined); });
      return NextResponse.json({ id: created!.id, receivedAt: created!.received_at, delivery: "received", duplicate: false }, { status: 201, headers: noStore });
    }
    if (insertError.code !== "23505") throw insertError;

    const { data: existing, error: lookupError } = await db.from("reports")
      .select("id,reporter_id,payload_sha256,received_at").eq("id", parsed.id).maybeSingle();
    if (lookupError) throw lookupError;
    if (!existing || !isRetrySameReport(existing, viewer.userId, hash, legacyHash))
      return NextResponse.json({ error: { code: "CONFLICT", message: "A different report already uses this ID" } }, { status: 409, headers: noStore });
    return NextResponse.json({ id: existing.id, receivedAt: existing.received_at, delivery: "received", duplicate: true }, { headers: noStore });
  } catch(e) { return errorResponse(e); }
}
