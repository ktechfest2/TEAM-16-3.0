import { NextResponse } from "next/server";
import { getViewer } from "@/lib/server/auth";
import { adminClient } from "@/lib/server/supabase";
import { errorResponse, noStore } from "@/lib/server/responses";
import { keepSimulatedForJudge } from "@/lib/server/judge-access";
export async function GET(req: Request) {
  try {
    const viewer = await getViewer(req, ["monitor", "admin"]);
    const { data, error } = await adminClient().from("reports")
      .select("id,polling_unit_id,category,description,received_at,polling_units(code,name,state,lga,ward,is_simulated),incident_reports(incident_id)")
      .order("received_at", { ascending: false }).limit(200);
    if (error) throw error;
    type ReportRow = (typeof data extends (infer R)[] | null ? R : never) & { polling_units: { is_simulated?: boolean } | { is_simulated?: boolean }[] | null };
    const visible = keepSimulatedForJudge(viewer.userId, (data || []) as ReportRow[], (row) => Array.isArray(row.polling_units) ? row.polling_units[0] : row.polling_units).slice(0, 50);
    const ids = visible.map((report) => report.id);
    const assessments = ids.length
      ? await adminClient().from("ai_assessments")
          .select("report_id,status,provisional_summary,created_at")
          .in("report_id", ids).order("created_at", { ascending: false }).limit(100)
      : { data: [], error: null };
    if (assessments.error) throw assessments.error;
    const latest = new Map<string, { status: string; provisional_summary: string | null }>();
    for (const item of assessments.data || []) if (!latest.has(item.report_id)) latest.set(item.report_id, item);
    return NextResponse.json({ reports: visible.map((report) => ({ ...report, aiAssessment: latest.get(report.id) || null })) }, { headers: noStore });
  } catch(e) { return errorResponse(e); }
}
