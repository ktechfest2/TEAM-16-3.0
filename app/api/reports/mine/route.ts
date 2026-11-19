import { NextResponse } from "next/server";
import { getViewer } from "@/lib/server/auth";
import { adminClient } from "@/lib/server/supabase";
import { errorResponse, noStore } from "@/lib/server/responses";
import { safeReporterCaseStatus } from "@/lib/reporter-status";

type ReporterReportRow = {
  id: string;
  category: string;
  description: string;
  received_at: string;
  polling_unit_id: string;
  incident_reports:
    | { incidents: { review_state: string; response_state: string } | null }
    | { incidents: { review_state: string; response_state: string } | null }[]
    | null;
};

export async function GET(req: Request) {
  try {
    const viewer = await getViewer(req, ["reporter"]);
    const { data, error } = await adminClient().from("reports")
      .select(
        "id,category,description,received_at,polling_unit_id," +
          "incident_reports(incidents(review_state,response_state))",
      )
      .eq("reporter_id", viewer.userId).order("received_at", { ascending: false }).limit(50)
      .returns<ReporterReportRow[]>();
    if (error) throw error;
    const reports = data.map((report) => {
      return {
        id: report.id,
        category: report.category,
        description: report.description,
        received_at: report.received_at,
        polling_unit_id: report.polling_unit_id,
        caseStatus: safeReporterCaseStatus(report.incident_reports),
      };
    });
    return NextResponse.json({ reports }, { headers: noStore });
  } catch(e) { return errorResponse(e); }
}
