import { NextResponse } from "next/server";
import { adminClient } from "@/lib/server/supabase";
import { errorResponse, noStore } from "@/lib/server/responses";
import { getViewer } from "@/lib/server/auth";
import { approvedFictionalAiReporter, approvedFictionalReportingReporter } from "@/lib/server/fictional-ai";

export async function GET(req: Request) {
  try {
    const viewer = await getViewer(req, ["reporter"]);
    if (!approvedFictionalReportingReporter(viewer.userId))
      return NextResponse.json({ error: { code: "NOT_AUTHORISED", message: "Fictional reporting is unavailable for this reporter session" } }, { status: 403, headers: noStore });
    const { data, error } = await adminClient().from("polling_units")
      .select("id,code,name,ward,lga,state,is_simulated").eq("is_simulated", true).limit(50).order("code");
    if (error) throw error;
    return NextResponse.json({
      fictionalReportingEnabled: true,
      aiProcessingEnabled: approvedFictionalAiReporter(viewer.userId),
      units: data,
    }, { headers: noStore });
  } catch(e) { return errorResponse(e); }
}
