import { NextResponse } from "next/server";
import { getViewer } from "@/lib/server/auth";
import { adminClient } from "@/lib/server/supabase";
import { errorResponse, noStore } from "@/lib/server/responses";

/** Approved coordinators a monitor may route a supported case to. No contact details are exposed. */
export async function GET(req: Request) {
  try {
    await getViewer(req, ["monitor", "admin"]);
    const { data, error } = await adminClient()
      .from("profiles")
      .select("id,display_name")
      .eq("role", "coordinator")
      .order("display_name")
      .limit(100);
    if (error) throw error;
    return NextResponse.json({ coordinators: data }, { headers: noStore });
  } catch (e) {
    return errorResponse(e);
  }
}
