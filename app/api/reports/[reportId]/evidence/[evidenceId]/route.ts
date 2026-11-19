import { NextResponse } from "next/server";
import { getViewer } from "@/lib/server/auth";
import { isUuid } from "@/lib/report-contract";
import { canViewReportEvidence, createEvidenceSignedUrl, findEvidence, removeFailedEvidence, reporterOwnsReport } from "@/lib/server/evidence";
import { errorResponse, noStore } from "@/lib/server/responses";

const permittedReaders = ["reporter", "monitor", "coordinator", "admin"] as const;

/** Return a 60-second signed URL only after checking current report/case access. */
export async function GET(req: Request, ctx: { params: Promise<{ reportId: string; evidenceId: string }> }) {
  try {
    const viewer = await getViewer(req, [...permittedReaders]);
    const { reportId, evidenceId } = await ctx.params;
    if (!isUuid(reportId) || !isUuid(evidenceId)) return notFound();
    if (!(await canViewReportEvidence(reportId, viewer))) return notFound();
    const row = await findEvidence(reportId, evidenceId);
    if (!row || row.upload_status !== "ready") return notFound();
    const access = await createEvidenceSignedUrl(row);
    return NextResponse.json(access, { headers: noStore });
  } catch (error) {
    return errorResponse(error);
  }
}

/** Cleanup is limited to the owning reporter and failed/pending uploads. */
export async function DELETE(req: Request, ctx: { params: Promise<{ reportId: string; evidenceId: string }> }) {
  try {
    const viewer = await getViewer(req, ["reporter"]);
    const { reportId, evidenceId } = await ctx.params;
    if (!isUuid(reportId) || !isUuid(evidenceId)) return notFound();
    if (!(await reporterOwnsReport(reportId, viewer.userId))) return notFound();
    const row = await findEvidence(reportId, evidenceId);
    if (!row) return notFound();
    if (row.upload_status === "ready")
      return NextResponse.json({ error: { code: "STATE", message: "Received evidence cannot be removed by this endpoint" } }, { status: 409, headers: noStore });
    await removeFailedEvidence(row);
    return NextResponse.json({ removed: true }, { headers: noStore });
  } catch (error) {
    if (error instanceof Error && error.message === "EVIDENCE_ALREADY_READY")
      return NextResponse.json({ error: { code: "STATE", message: "Received evidence cannot be removed by this endpoint" } }, { status: 409, headers: noStore });
    return errorResponse(error);
  }
}

function notFound() {
  return NextResponse.json({ error: { code: "NOT_FOUND", message: "Evidence not found" } }, { status: 404, headers: noStore });
}
