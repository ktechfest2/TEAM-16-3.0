import { NextResponse } from "next/server";
import { adminClient } from "@/lib/server/supabase";
import { errorResponse, noStore } from "@/lib/server/responses";
export async function GET() {
  try {
    const { data, error } = await adminClient().from("polling_units")
      .select("id,code,name,ward,lga,state,is_simulated").eq("is_simulated", true).limit(50).order("code");
    if (error) throw error;
    return NextResponse.json({ units: data }, { headers: noStore });
  } catch(e) { return errorResponse(e); }
}
