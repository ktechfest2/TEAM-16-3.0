import { NextResponse } from "next/server";
import { getViewer } from "@/lib/server/auth";
import { adminClient } from "@/lib/server/supabase";
import { isUuid } from "@/lib/report-contract";
import { parseNote } from "@/lib/case-contract";
import { errorResponse, noStore } from "@/lib/server/responses";
import { judgeCanAccessAssignment } from "@/lib/server/judge-access";

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
    if (!(await judgeCanAccessAssignment(viewer.userId, id)))
      return NextResponse.json({ error: { code: "NOT_FOUND", message: "Assignment not found" } }, { status: 404, headers: noStore });
    const parsed = parseNote(await req.json().catch(() => null));
    const db = adminClient();

    const { data: duplicate, error: actionError } = await db.rpc("signa_acknowledge_case", {
      p_actor: viewer.userId, p_assignment: id, p_note: parsed.note,
    });
    if (actionError) {
      if (/Not authorised/i.test(actionError.message))
        return NextResponse.json({ error: { code: "ACCESS", message: "Assignment not found or not assigned to this coordinator" } }, { status: 403, headers: noStore });
      throw actionError;
    }
    const { data: assignment, error: lookupError } = await db.from("assignments")
      .select("id,acknowledged_at").eq("id", id).single();
    if (lookupError) throw lookupError;
    return NextResponse.json(
      { id: assignment.id, acknowledgedAt: assignment.acknowledged_at, duplicate: duplicate === null },
      { headers: noStore },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
