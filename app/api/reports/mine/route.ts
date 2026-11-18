import { NextResponse } from "next/server";
import { getViewer } from "@/lib/server/auth";
import { adminClient } from "@/lib/server/supabase";
import { errorResponse, noStore } from "@/lib/server/responses";
export async function GET(req: Request) {
  try {
    const viewer = await getViewer(req, ["reporter"]);
    const { data, error } = await adminClient().from("reports")
      .select("id,category,description,received_at,polling_unit_id")
      .eq("reporter_id", viewer.userId).order("received_at", { ascending: false }).limit(50);
    if (error) throw error;
    return NextResponse.json({ reports: data }, { headers: noStore });
  } catch(e) { return errorResponse(e); }
}
