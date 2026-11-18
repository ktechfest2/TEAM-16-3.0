import { NextResponse } from "next/server";
import { getViewer } from "@/lib/server/auth";
import { adminClient } from "@/lib/server/supabase";
import { errorResponse, noStore } from "@/lib/server/responses";
export async function GET(req: Request) {
  try {
    await getViewer(req, ["monitor", "admin"]);
    const { data, error } = await adminClient().from("reports")
      .select("id,polling_unit_id,category,description,received_at,polling_units(code,name),incident_reports(incident_id)")
      .order("received_at", { ascending: false }).limit(50);
    if (error) throw error;
    return NextResponse.json({ reports: data }, { headers: noStore });
  } catch(e) { return errorResponse(e); }
}
