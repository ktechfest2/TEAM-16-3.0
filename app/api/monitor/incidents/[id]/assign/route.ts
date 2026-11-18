import { NextResponse } from "next/server";
import { getViewer } from "@/lib/server/auth";
import { adminClient } from "@/lib/server/supabase";
import { isUuid } from "@/lib/report-contract";
import { parseAssignment } from "@/lib/case-contract";
import { errorResponse, noStore } from "@/lib/server/responses";

/**
 * Route a reviewed case to an approved coordinator.
 * Only a case whose review was recorded as "supported" may be assigned, and the
 * target user's coordinator role is checked server-side against the profiles table.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const viewer = await getViewer(req, ["monitor", "admin"]);
    const { id } = await ctx.params;
    if (!isUuid(id))
      return NextResponse.json(
        { error: { code: "INPUT", message: "Invalid case ID" } },
        { status: 400, headers: noStore },
      );
    const parsed = parseAssignment(await req.json().catch(() => null));
    const db = adminClient();

    const { data: incident, error: lookupError } = await db
      .from("incidents").select("id,review_state,response_state").eq("id", id).maybeSingle();
    if (lookupError) throw lookupError;
    if (!incident)
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Case not found" } },
        { status: 404, headers: noStore },
      );
    if (incident.review_state !== "supported")
      return NextResponse.json(
        { error: { code: "STATE", message: "Record a supported review before assigning this case" } },
        { status: 409, headers: noStore },
      );

    const { data: coordinator, error: roleError } = await db
      .from("profiles").select("id,role").eq("id", parsed.coordinatorId).maybeSingle();
    if (roleError) throw roleError;
    if (!coordinator || coordinator.role !== "coordinator")
      return NextResponse.json(
        { error: { code: "INPUT", message: "Target user is not an approved coordinator" } },
        { status: 400, headers: noStore },
      );

    const { data: assignment, error: assignError } = await db
      .from("assignments")
      .insert({ incident_id: id, assigned_to: parsed.coordinatorId, assigned_by: viewer.userId })
      .select("id,assigned_at")
      .single();
    if (assignError) {
      if (assignError.code === "23505")
        return NextResponse.json(
          { error: { code: "CONFLICT", message: "This case is already assigned" } },
          { status: 409, headers: noStore },
        );
      throw assignError;
    }

    const { error: stateError } = await db
      .from("incidents")
      .update({ response_state: "assigned", updated_at: new Date().toISOString() })
      .eq("id", id);
    if (stateError) throw stateError;

    await db.from("case_events").insert({
      incident_id: id,
      actor_id: viewer.userId,
      event_type: "assignment_created",
      details: { assignmentId: assignment.id, coordinatorId: parsed.coordinatorId, note: parsed.note },
    });

    return NextResponse.json(
      { id: assignment.id, assignedAt: assignment.assigned_at },
      { status: 201, headers: noStore },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
