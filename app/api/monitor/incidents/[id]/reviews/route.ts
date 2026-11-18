import { NextResponse } from "next/server";
import { getViewer } from "@/lib/server/auth";
import { adminClient } from "@/lib/server/supabase";
import { isUuid } from "@/lib/report-contract";
import { parseReview } from "@/lib/case-contract";
import { errorResponse, noStore } from "@/lib/server/responses";

/** Record a human review outcome. Previous reviews are preserved, never overwritten. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const viewer = await getViewer(req, ["monitor", "admin"]);
    const { id } = await ctx.params;
    if (!isUuid(id))
      return NextResponse.json(
        { error: { code: "INPUT", message: "Invalid case ID" } },
        { status: 400, headers: noStore },
      );
    const parsed = parseReview(await req.json().catch(() => null));
    const db = adminClient();

    const { data: incident, error: lookupError } = await db
      .from("incidents").select("id").eq("id", id).maybeSingle();
    if (lookupError) throw lookupError;
    if (!incident)
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Case not found" } },
        { status: 404, headers: noStore },
      );

    const { data: review, error: reviewError } = await db
      .from("reviews")
      .insert({
        incident_id: id,
        reviewer_id: viewer.userId,
        outcome: parsed.outcome,
        reason: parsed.reason,
      })
      .select("id,created_at")
      .single();
    if (reviewError) throw reviewError;

    const { error: stateError } = await db
      .from("incidents")
      .update({ review_state: parsed.outcome, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (stateError) throw stateError;

    await db.from("case_events").insert({
      incident_id: id,
      actor_id: viewer.userId,
      event_type: "review_recorded",
      details: { outcome: parsed.outcome, reason: parsed.reason, reviewId: review.id },
    });

    return NextResponse.json(
      { id: review.id, outcome: parsed.outcome, createdAt: review.created_at },
      { status: 201, headers: noStore },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
