import { NextResponse } from "next/server";
import { getViewer } from "@/lib/server/auth";
import { adminClient } from "@/lib/server/supabase";
import { parseCase } from "@/lib/case-contract";
import { errorResponse, noStore } from "@/lib/server/responses";
import { judgeCanAccessReport, keepSimulatedForJudge } from "@/lib/server/judge-access";

/** Monitor case list, newest activity first. */
export async function GET(req: Request) {
  try {
    const viewer = await getViewer(req, ["monitor", "admin"]);
    const { data, error } = await adminClient()
      .from("incidents")
      .select(
        "id,summary,review_state,response_state,created_at,updated_at,polling_unit_id,created_by," +
          "polling_units(code,name,ward,lga,state,is_simulated),incident_reports(report_id,reports(category,reporter_id))",
      )
      .order("updated_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    type Row = { created_by: string; review_state: string; incident_reports: { report_id: string; reports: { category: string; reporter_id: string } | { category: string; reporter_id: string }[] | null }[]; [key: string]: unknown };
    const visible = keepSimulatedForJudge(viewer.userId, (data || []) as unknown as Row[], (row) => {
      const unit = row.polling_units as { is_simulated?: boolean } | { is_simulated?: boolean }[] | null;
      return Array.isArray(unit) ? unit[0] : unit;
    }).slice(0, 50);
    return NextResponse.json({ incidents: visible.map(({ created_by, incident_reports, ...row }) => ({
      ...row,
      canReview: created_by !== viewer.userId && !incident_reports.some((link) => {
        const reports = link.reports ? (Array.isArray(link.reports) ? link.reports : [link.reports]) : [];
        return reports.some((report) => report.reporter_id === viewer.userId);
      }),
      incident_reports: incident_reports.map((link) => ({ report_id: link.report_id, reports: link.reports ? (Array.isArray(link.reports) ? link.reports.map((report) => ({ category: report.category })) : { category: link.reports.category }) : null })),
    })) }, { headers: noStore });
  } catch (e) {
    return errorResponse(e);
  }
}

/** Group reports and append the audit event in one database transaction. */
export async function POST(req: Request) {
  try {
    const viewer = await getViewer(req, ["monitor", "admin"]);
    const parsed = parseCase(await req.json().catch(() => null));
    if (await Promise.all(parsed.reportIds.map((reportId) => judgeCanAccessReport(viewer.userId, reportId))).then((allowed) => allowed.some((value) => !value)))
      return NextResponse.json({ error: { code: "NOT_FOUND", message: "Reports not found" } }, { status: 404, headers: noStore });
    const id = crypto.randomUUID();
    const { data, error } = await adminClient().rpc("signa_group_reports", {
      p_actor: viewer.userId, p_case_id: id, p_report_ids: parsed.reportIds,
      p_summary: parsed.summary, p_reason: parsed.linkReason,
    });
    if (error) {
      if (/already linked|Unknown, duplicated|single polling-unit/i.test(error.message))
        return NextResponse.json({ error: { code: "CONFLICT", message: error.message } }, { status: 409, headers: noStore });
      throw error;
    }
    return NextResponse.json({ id: data }, { status: 201, headers: noStore });
  } catch (e) {
    return errorResponse(e);
  }
}
