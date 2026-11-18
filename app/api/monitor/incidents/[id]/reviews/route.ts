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
    const { data: reviewId, error: reviewError } = await db.rpc("signa_review_case", {
      p_actor: viewer.userId, p_case_id: id, p_outcome: parsed.outcome, p_reason: parsed.reason,
    });
    if (reviewError) {
      if (/Unknown case/i.test(reviewError.message))
        return NextResponse.json({ error: { code: "NOT_FOUND", message: "Case not found" } }, { status: 404, headers: noStore });
      if (/locked after assignment/i.test(reviewError.message))
        return NextResponse.json({ error: { code: "STATE", message: reviewError.message } }, { status: 409, headers: noStore });
      throw reviewError;
    }
    const { data: review, error: lookupError } = await db.from("reviews")
      .select("id,outcome,created_at").eq("id", reviewId).single();
    if (lookupError) throw lookupError;

    return NextResponse.json(
      { id: review.id, outcome: review.outcome, createdAt: review.created_at },
      { status: 201, headers: noStore },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
