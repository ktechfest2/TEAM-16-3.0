import { NextResponse } from "next/server";
import { getViewer } from "@/lib/server/auth";
import { adminClient } from "@/lib/server/supabase";
import { errorResponse, noStore } from "@/lib/server/responses";
import { keepSimulatedForJudge } from "@/lib/server/judge-access";

/** A coordinator sees only the cases assigned to them. */
export async function GET(req: Request) {
  try {
    const viewer = await getViewer(req, ["coordinator", "admin"]);
    const db = adminClient();
    let query = db
      .from("assignments")
      .select(
        "id,incident_id,assigned_at,acknowledged_at,acknowledgement_note,assigned_to," +
          "incidents(id,summary,review_state,response_state,updated_at," +
          "polling_units(code,name,ward,lga,is_simulated),incident_reports(report_id,reports(category)))",
      )
      .order("assigned_at", { ascending: false })
      .limit(200);
    if (viewer.role === "coordinator") query = query.eq("assigned_to", viewer.userId);

    const { data, error } = await query;
    if (error) throw error;
    type AssignmentRow = (typeof data extends (infer R)[] | null ? R : never) & { incidents: { polling_units?: { is_simulated?: boolean } | { is_simulated?: boolean }[] | null } | { polling_units?: { is_simulated?: boolean } | { is_simulated?: boolean }[] | null }[] | null };
    const visible = keepSimulatedForJudge(viewer.userId, (data || []) as AssignmentRow[], (row) => {
      const incident = Array.isArray(row.incidents) ? row.incidents[0] : row.incidents;
      const unit = incident?.polling_units;
      return Array.isArray(unit) ? unit[0] : unit;
    }).slice(0, 50);
    return NextResponse.json({ assignments: visible }, { headers: noStore });
  } catch (e) {
    return errorResponse(e);
  }
}
