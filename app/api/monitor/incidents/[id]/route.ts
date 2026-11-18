import { NextResponse } from "next/server";
import { getViewer } from "@/lib/server/auth";
import { adminClient } from "@/lib/server/supabase";
import { isUuid } from "@/lib/report-contract";
import { errorResponse, noStore } from "@/lib/server/responses";

/** Full case file: linked reports, recorded reviews, assignment and audit timeline. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await getViewer(req, ["monitor", "coordinator", "admin"]);
    const { id } = await ctx.params;
    if (!isUuid(id))
      return NextResponse.json(
        { error: { code: "INPUT", message: "Invalid case ID" } },
        { status: 400, headers: noStore },
      );

    const db = adminClient();
    const { data: incident, error } = await db
      .from("incidents")
      .select(
        "id,summary,review_state,response_state,created_at,updated_at,polling_unit_id," +
          "polling_units(code,name,ward,lga,state,is_simulated)",
      )
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!incident)
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Case not found" } },
        { status: 404, headers: noStore },
      );

    const [links, reviews, assignment, events] = await Promise.all([
      db
        .from("incident_reports")
        .select("report_id,linked_at,reports(id,category,description,received_at,occurred_at)")
        .eq("incident_id", id),
      db
        .from("reviews")
        .select("id,outcome,reason,created_at,reviewer_id")
        .eq("incident_id", id)
        .order("created_at", { ascending: false }),
      db
        .from("assignments")
        .select("id,assigned_to,assigned_by,assigned_at,acknowledged_at,acknowledgement_note")
        .eq("incident_id", id)
        .maybeSingle(),
      db
        .from("case_events")
        .select("id,event_type,details,created_at,actor_id")
        .eq("incident_id", id)
        .order("id", { ascending: true }),
    ]);

    if (links.error) throw links.error;
    if (reviews.error) throw reviews.error;
    if (events.error) throw events.error;

    return NextResponse.json(
      {
        incident,
        reports: (links.data || []).map((link) => link.reports),
        reviews: reviews.data || [],
        assignment: assignment.data || null,
        events: events.data || [],
      },
      { headers: noStore },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
