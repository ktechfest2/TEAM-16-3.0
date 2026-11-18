import { NextResponse } from "next/server";
import { getViewer } from "@/lib/server/auth";
import { adminClient } from "@/lib/server/supabase";
import { isUuid } from "@/lib/report-contract";
import { parseFollowUp } from "@/lib/case-contract";
import { errorResponse, noStore } from "@/lib/server/responses";

/**
 * Append an internal follow-up action to a case.
 * This is an internal monitoring log only — it makes no claim that external
 * responders were contacted or dispatched.
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
    const parsed = parseFollowUp(await req.json().catch(() => null));
    const db = adminClient();

    const { data: assignment, error: lookupError } = await db
      .from("assignments")
      .select("id,incident_id,assigned_to,acknowledged_at")
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
    if (!assignment.acknowledged_at)
      return NextResponse.json(
        { error: { code: "STATE", message: "Acknowledge the assignment before recording follow-up" } },
        { status: 409, headers: noStore },
      );

    const now = new Date().toISOString();
    const { error: eventError } = await db.from("case_events").insert({
      incident_id: assignment.incident_id,
      actor_id: viewer.userId,
      event_type: "followup_recorded",
      details: { assignmentId: assignment.id, action: parsed.action, note: parsed.note },
    });
    if (eventError) throw eventError;

    await db
      .from("incidents")
      .update({ response_state: "followup_recorded", updated_at: now })
      .eq("id", assignment.incident_id)
      .in("response_state", ["assigned", "acknowledged"]);

    return NextResponse.json({ recordedAt: now }, { status: 201, headers: noStore });
  } catch (e) {
    return errorResponse(e);
  }
}
