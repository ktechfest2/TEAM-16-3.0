import { NextResponse } from "next/server";
import { getViewer } from "@/lib/server/auth";
import { adminClient } from "@/lib/server/supabase";
import { errorResponse, noStore } from "@/lib/server/responses";

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
          "polling_units(code,name,ward,lga),incident_reports(report_id,reports(category)))",
      )
      .order("assigned_at", { ascending: false })
      .limit(50);
    if (viewer.role === "coordinator") query = query.eq("assigned_to", viewer.userId);

    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ assignments: data }, { headers: noStore });
  } catch (e) {
    return errorResponse(e);
  }
}
