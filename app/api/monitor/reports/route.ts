import { NextResponse } from "next/server";
import { getViewer } from "@/lib/server/auth";
import { adminClient } from "@/lib/server/supabase";
import { errorResponse, noStore } from "@/lib/server/responses";
export async function GET(req: Request) {
  try {
    await getViewer(req, ["monitor", "admin"]);
    const { data, error } = await adminClient().from("reports")
      .select("id,polling_unit_id,category,description,received_at,polling_units(code,name),incident_reports(incident_id)")
      .order("received_at", { ascending: false }).limit(50);
    if (error) throw error;
    const ids = (data || []).map((report) => report.id);
    const assessments = ids.length
      ? await adminClient().from("ai_assessments")
          .select("report_id,status,provisional_summary,created_at")
          .in("report_id", ids).order("created_at", { ascending: false }).limit(100)
      : { data: [], error: null };
    if (assessments.error) throw assessments.error;
    const latest = new Map<string, { status: string; provisional_summary: string | null }>();
    for (const item of assessments.data || []) if (!latest.has(item.report_id)) latest.set(item.report_id, item);
    return NextResponse.json({ reports: (data || []).map((report) => ({ ...report, aiAssessment: latest.get(report.id) || null })) }, { headers: noStore });
  } catch(e) { return errorResponse(e); }
}
