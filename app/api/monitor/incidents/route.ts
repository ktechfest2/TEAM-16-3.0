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

/** Group reports and append the audit event in one database transaction. */
export async function POST(req: Request) {
  try {
    const viewer = await getViewer(req, ["monitor", "admin"]);
    const parsed = parseCase(await req.json().catch(() => null));
    const id = crypto.randomUUID();
    const { data, error } = await adminClient().rpc("signa_group_reports", {
      p_actor: viewer.userId, p_case_id: id, p_report_ids: parsed.reportIds,
      p_summary: parsed.summary, p_reason: parsed.linkReason,
    });
    if (error) {
      if (/already linked|Unknown, duplicated|single polling-unit/i.test(error.message))
        return NextResponse.json({ error: { code: "CONFLICT", message: error.message } }, { status: 409, headers: noStore });
      throw error;
    }
    return NextResponse.json({ id: data }, { status: 201, headers: noStore });
  } catch (e) {
    return errorResponse(e);
  }
}
