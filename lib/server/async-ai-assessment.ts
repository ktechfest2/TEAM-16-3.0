import "server-only";
import { adminClient } from "@/lib/server/supabase";
import { observeWithGemini } from "@/lib/server/ai-assessment";
import { approvedFictionalReport } from "./fictional-ai";
import { enforceAbuseLimit } from "./rate-limit";

/** Runs after the report/evidence response has been sent; always remains provisional. */
export async function runConsentAssessment(reportId: string): Promise<void> {
  const db = adminClient();
  const { data: report, error } = await db.from("reports")
    .select("id,reporter_id,received_at,description,category,occurred_at,polling_unit_id,ai_processing_consent,polling_units!inner(is_simulated)")
    .eq("id", reportId).maybeSingle();
  const unit = report && (Array.isArray(report.polling_units) ? report.polling_units[0] : report.polling_units) as { is_simulated?: boolean } | null;
  if (error || !report || !report.ai_processing_consent || unit?.is_simulated !== true || !approvedFictionalReport(report.reporter_id, report.received_at)) return;

  const { data: evidence } = await db.from("evidence").select("id,mime_type,storage_path")
    .eq("report_id", reportId).eq("upload_status", "ready").limit(2);
  const refs = [{ type: "report", id: report.id }, ...(evidence || []).map((item) => ({ type: "evidence", id: item.id }))];
  const deterministic = { location: report.polling_unit_id, category: report.category, occurredAt: report.occurred_at, possibleDuplicateReportIds: [] as string[] };
  if (report.occurred_at) {
    const time = new Date(report.occurred_at).getTime();
    const { data: candidates } = await db.from("reports").select("id").eq("polling_unit_id", report.polling_unit_id)
      .eq("category", report.category).gte("occurred_at", new Date(time - 30 * 60_000).toISOString())
      .lte("occurred_at", new Date(time + 30 * 60_000).toISOString()).neq("id", reportId).limit(20);
    deterministic.possibleDuplicateReportIds = (candidates || []).map((r) => r.id);
  }
  let observation = null;
  let failure: string | null = null;
  try {
    // Automatic provider work has its own durable reporter quota in addition
    // to report/evidence submission limits. It fails closed before billing.
    await enforceAbuseLimit(new Request("https://signa.internal/ai-assessment"), report.reporter_id, {
      scope: "ai_assessment", reporterMax: 12, ipMax: 1, windowSeconds: 600,
    });
    const images: Array<{ mimeType: string; bytes: Uint8Array }> = [];
    for (const item of evidence || []) {
      if (!( ["image/jpeg", "image/png", "image/webp"] as string[]).includes(item.mime_type)) continue;
      const { data: file, error: downloadError } = await db.storage.from("signa-evidence").download(item.storage_path);
      if (downloadError || !file) throw new Error("Evidence unavailable");
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (bytes.byteLength > 4 * 1024 * 1024 || images.reduce((n, image) => n + image.bytes.byteLength, 0) + bytes.byteLength > 8 * 1024 * 1024) throw new Error("Evidence exceeds processing limit");
      images.push({ mimeType: item.mime_type, bytes });
    }
    observation = await observeWithGemini(report.description, images);
  } catch { failure = "Assessment provider or evidence processing failed; retry may be attempted."; }
  await db.from("ai_assessments").insert({
    report_id: report.id, requested_by: report.reporter_id, provider: "gemini", model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
    status: observation ? "completed" : "retryable", provisional_summary: observation?.summary || null,
    model_observations: observation, deterministic_checks: deterministic, source_references: refs,
    uncertainty: observation?.uncertainty || [], provider_failure: failure,
  });
}
