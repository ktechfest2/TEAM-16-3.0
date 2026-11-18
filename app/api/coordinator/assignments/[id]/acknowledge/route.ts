import { NextResponse } from "next/server";
import { getViewer } from "@/lib/server/auth";
import { adminClient } from "@/lib/server/supabase";
import { isUuid } from "@/lib/report-contract";
import { parseNote } from "@/lib/case-contract";
import { errorResponse, noStore } from "@/lib/server/responses";

/**
 * Acknowledge an internal monitoring assignment.
 * Idempotent: acknowledging twice returns the first acknowledgement and appends no
 * duplicate event. Acknowledgement never implies that responders were dispatched.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const viewer = await getViewer(req, ["coordinator", "admin"]);
    const { id } = await ctx.params;
    if (!isUuid(id))
      return NextResponse.json(
        { error: { code: "INPUT", message: "Invalid assignment ID" } },
        { status: 400, headers: noStore },
      );
    const parsed = parseNote(await req.json().catch(() => null));
    const db = adminClient();

    const { data: assignment, error: lookupError } = await db
      .from("assignments")
      .select("id,incident_id,assigned_to,acknowledged_at,acknowledgement_note")
      .eq("id", id)
      .maybeSingle();
    if (lookupError) throw lookupError;
    if (!assignment)
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Assignment not found" } },
        { status: 404, headers: noStore },
      );
    if (viewer.role === "coordinator" && assignment.assigned_to !== viewer.userId)
      return NextResponse.json(
        { error: { code: "ACCESS", message: "This assignment belongs to another coordinator" } },
        { status: 403, headers: noStore },
      );

    if (assignment.acknowledged_at)
      return NextResponse.json(
        { id: assignment.id, acknowledgedAt: assignment.acknowledged_at, duplicate: true },
        { headers: noStore },
      );

    const acknowledgedAt = new Date().toISOString();
    const { error: updateError } = await db
      .from("assignments")
      .update({ acknowledged_at: acknowledgedAt, acknowledgement_note: parsed.note })
      .eq("id", id)
      .is("acknowledged_at", null);
    if (updateError) throw updateError;

    await db
      .from("incidents")
      .update({ response_state: "acknowledged", updated_at: acknowledgedAt })
      .eq("id", assignment.incident_id)
      .eq("response_state", "assigned");

    await db.from("case_events").insert({
      incident_id: assignment.incident_id,
      actor_id: viewer.userId,
      event_type: "assignment_acknowledged",
      details: { assignmentId: assignment.id, note: parsed.note },
    });

    return NextResponse.json({ id: assignment.id, acknowledgedAt, duplicate: false }, { headers: noStore });
  } catch (e) {
    return errorResponse(e);
  }
}
