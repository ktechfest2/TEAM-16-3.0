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

    const { error: actionError } = await db.rpc("signa_record_followup", {
      p_actor: viewer.userId, p_assignment: id, p_action: parsed.action, p_note: parsed.note,
    });
    if (actionError) {
      if (/Acknowledge first/i.test(actionError.message))
        return NextResponse.json({ error: { code: "STATE", message: actionError.message } }, { status: 409, headers: noStore });
      if (/Not authorised/i.test(actionError.message))
        return NextResponse.json({ error: { code: "ACCESS", message: "Assignment not found or not assigned to this coordinator" } }, { status: 403, headers: noStore });
      throw actionError;
    }
    return NextResponse.json({ recordedAt: new Date().toISOString() }, { status: 201, headers: noStore });
  } catch (e) {
    return errorResponse(e);
  }
}
