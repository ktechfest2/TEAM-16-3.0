import { NextResponse } from "next/server";
import { getViewer } from "@/lib/server/auth";
import { adminClient } from "@/lib/server/supabase";
import { observeWithGemini } from "@/lib/server/ai-assessment";
import { errorResponse, noStore } from "@/lib/server/responses";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(req: Request) {
  try {
    const viewer = await getViewer(req, ["monitor", "admin"]);
    const body = await req.json().catch(() => null);
    if (!body || body.consentedFictionalEvidence !== true || typeof body.reportId !== "string" || !uuid.test(body.reportId))
      return NextResponse.json({ error: { code: "INPUT", message: "A report ID and explicit fictional-evidence consent are required" } }, { status: 400, headers: noStore });
    const reportId = body.reportId;
    const db = adminClient();
    const { data: report, error } = await db.from("reports").select("id,description,category,occurred_at,polling_unit_id,ai_processing_consent,polling_units!inner(code,is_simulated)").eq("id", reportId).maybeSingle();
    if (error) throw error;
    if (!report || !report.ai_processing_consent || !(report.polling_units as { is_simulated: boolean }).is_simulated) return NextResponse.json({ error: { code: "NOT_ELIGIBLE", message: "AI observations require reporter consent and a fictional polling unit" } }, { status: 403, headers: noStore });

    const { data: evidence, error: evidenceError } = await db.from("evidence").select("id,mime_type,storage_path").eq("report_id", reportId);
    if (evidenceError) throw evidenceError;
    const refs = [{ type: "report", id: report.id }, ...(evidence || []).map((item) => ({ type: "evidence", id: item.id }))];
    let deterministic = { location: report.polling_unit_id, category: report.category, occurredAt: report.occurred_at, possibleDuplicateReportIds: [] as string[] };
    if (report.occurred_at) {
      const start = new Date(new Date(report.occurred_at as string).getTime() - 30 * 60_000).toISOString();
      const end = new Date(new Date(report.occurred_at as string).getTime() + 30 * 60_000).toISOString();
      const { data: candidates, error: candidateError } = await db.from("reports").select("id").eq("polling_unit_id", report.polling_unit_id).eq("category", report.category).gte("occurred_at", start).lte("occurred_at", end).neq("id", reportId).limit(20);
      if (candidateError) throw candidateError;
      deterministic.possibleDuplicateReportIds = (candidates || []).map((candidate) => candidate.id);
    }

    let observation = null;
    let failure = null;
    try {
      const images: Array<{ mimeType: string; bytes: Uint8Array }> = [];
      for (const item of (evidence || []).slice(0, 2)) {
        if (!( ["image/jpeg", "image/png", "image/webp"] as string[]).includes(item.mime_type)) continue;
        const { data: file, error: downloadError } = await db.storage.from("signa-evidence").download(item.storage_path);
        if (downloadError) throw downloadError;
        const bytes = new Uint8Array(await file.arrayBuffer());
        if (bytes.byteLength > 4 * 1024 * 1024 || images.reduce((sum, image) => sum + image.bytes.byteLength, 0) + bytes.byteLength > 8 * 1024 * 1024) throw new Error("Evidence exceeds the model input limit");
        images.push({ mimeType: item.mime_type, bytes });
      }
      observation = await observeWithGemini(report.description as string, images);
    } catch (e) { failure = e instanceof Error ? e.message.slice(0, 240) : "Provider failed"; }

    const { data: saved, error: saveError } = await db.from("ai_assessments").insert({
      report_id: reportId, requested_by: viewer.userId, provider: "gemini", model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
      status: observation ? "completed" : "failed", provisional_summary: observation?.summary || null,
      model_observations: observation, deterministic_checks: deterministic, source_references: refs,
      uncertainty: observation?.uncertainty || [], provider_failure: failure,
    }).select("id,status,provisional_summary,model_observations,deterministic_checks,source_references,uncertainty,provider_failure,created_at").single();
    if (saveError) throw saveError;
    return NextResponse.json({ assessment: saved }, { status: 201, headers: noStore });
  } catch (e) { return errorResponse(e); }
}
