import { NextResponse } from "next/server";
import { getViewer } from "@/lib/server/auth";
import { adminClient } from "@/lib/server/supabase";
import { parseCase } from "@/lib/case-contract";
import { errorResponse, noStore } from "@/lib/server/responses";

/** Monitor case list, newest activity first. */
export async function GET(req: Request) {
  try {
    await getViewer(req, ["monitor", "coordinator", "admin"]);
    const { data, error } = await adminClient()
      .from("incidents")
      .select(
        "id,summary,review_state,response_state,created_at,updated_at,polling_unit_id," +
          "polling_units(code,name,ward,lga),incident_reports(report_id,reports(category))",
      )
      .order("updated_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    return NextResponse.json({ incidents: data }, { headers: noStore });
  } catch (e) {
    return errorResponse(e);
  }
}

/**
 * Group one or more unlinked reports into a case.
 *
 * Supabase JS cannot open a client-side transaction, so the writes are ordered
 * so that a failure never leaves a half-linked report: the case row is created
 * first, links are inserted in one statement (the unique constraint on
 * incident_reports.report_id rejects any already-linked report), and the case
 * row is removed again if linking fails.
 */
export async function POST(req: Request) {
  try {
    const viewer = await getViewer(req, ["monitor", "admin"]);
    const parsed = parseCase(await req.json().catch(() => null));
    const db = adminClient();

    const { data: reports, error: reportError } = await db
      .from("reports")
      .select("id,polling_unit_id")
      .in("id", parsed.reportIds);
    if (reportError) throw reportError;
    if (!reports || reports.length !== parsed.reportIds.length)
      return NextResponse.json(
        { error: { code: "INPUT", message: "One or more reports could not be found" } },
        { status: 400, headers: noStore },
      );

    const unitIds = new Set(reports.map((r) => r.polling_unit_id));
    if (unitIds.size !== 1)
      return NextResponse.json(
        { error: { code: "INPUT", message: "Group reports from a single polling unit" } },
        { status: 400, headers: noStore },
      );

    const { data: incident, error: incidentError } = await db
      .from("incidents")
      .insert({
        polling_unit_id: reports[0].polling_unit_id,
        summary: parsed.summary,
        created_by: viewer.userId,
      })
      .select("id")
      .single();
    if (incidentError) throw incidentError;

    const { error: linkError } = await db.from("incident_reports").insert(
      parsed.reportIds.map((reportId) => ({
        incident_id: incident.id,
        report_id: reportId,
        linked_by: viewer.userId,
      })),
    );
    if (linkError) {
      await db.from("incidents").delete().eq("id", incident.id);
      if (linkError.code === "23505")
        return NextResponse.json(
          { error: { code: "CONFLICT", message: "A selected report is already linked to a case" } },
          { status: 409, headers: noStore },
        );
      throw linkError;
    }

    await db.from("case_events").insert([
      {
        incident_id: incident.id,
        actor_id: viewer.userId,
        event_type: "case_created",
        details: { summary: parsed.summary },
      },
      {
        incident_id: incident.id,
        actor_id: viewer.userId,
        event_type: "reports_linked",
        details: { reportIds: parsed.reportIds, reason: parsed.linkReason },
      },
    ]);

    return NextResponse.json({ id: incident.id }, { status: 201, headers: noStore });
  } catch (e) {
    return errorResponse(e);
  }
}
