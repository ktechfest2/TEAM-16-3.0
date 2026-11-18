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

    const { data: assignmentId, error: assignError } = await db.rpc("signa_assign_case", {
      p_actor: viewer.userId, p_case_id: id, p_coordinator: parsed.coordinatorId, p_note: parsed.note,
    });
    if (assignError) {
      if (/Only supported cases|already assigned/i.test(assignError.message))
        return NextResponse.json({ error: { code: "STATE", message: assignError.message } }, { status: 409, headers: noStore });
      if (/Not authorised/i.test(assignError.message))
        return NextResponse.json({ error: { code: "ACCESS", message: "Case or coordinator is not authorised" } }, { status: 403, headers: noStore });
      throw assignError;
    }
    const { data: assignment, error: lookupError } = await db.from("assignments")
      .select("id,assigned_at").eq("id", assignmentId).single();
    if (lookupError) throw lookupError;

    return NextResponse.json(
      { id: assignment.id, assignedAt: assignment.assigned_at },
      { status: 201, headers: noStore },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
