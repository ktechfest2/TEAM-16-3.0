import { NextResponse } from "next/server";
import { adminClient } from "@/lib/server/supabase";
import { errorResponse, noStore } from "@/lib/server/responses";

const code = /^\d{2}$/;
const fullCode = /^\d{2}\/\d{2}\/\d{2}\/\d{3}$/;

export async function GET(req: Request) {
  try {
    const params = new URL(req.url).searchParams;
    const level = params.get("level");
    const state = params.get("state");
    const lga = params.get("lga");
    const ward = params.get("ward");
    const search = params.get("search")?.trim() || "";
    if (state && !code.test(state) || lga && !code.test(lga) || ward && !code.test(ward) || search && !fullCode.test(search))
      return NextResponse.json({ error: { code: "INPUT", message: "Use two-digit geography codes or an exact full polling-unit code" } }, { status: 400, headers: noStore });
    if (!(["states", "lgas", "wards", "units", "code"] as (string | null)[]).includes(level) || level === "lgas" && !state || level === "wards" && (!state || !lga) || level === "units" && (!state || !lga || !ward) || level === "code" && !search)
      return NextResponse.json({ error: { code: "INPUT", message: "Select a valid directory level and its parents" } }, { status: 400, headers: noStore });
    const db = adminClient();
    if (level === "states") {
      const { data, error } = await db.from("directory_states").select("code,name").order("code").limit(40);
      if (error) throw error;
      return NextResponse.json({ items: data }, { headers: noStore });
    }
    if (level === "lgas") {
      const { data, error } = await db.from("directory_lgas").select("code,name").eq("state_code", state).order("code").limit(100);
      if (error) throw error;
      return NextResponse.json({ items: data }, { headers: noStore });
    }
    if (level === "wards") {
      const { data, error } = await db.from("directory_wards").select("code,name").eq("state_code", state).eq("lga_code", lga).order("code").limit(100);
      if (error) throw error;
      return NextResponse.json({ items: data }, { headers: noStore });
    }
    let query = db.from("polling_units").select("id,code,name,state,state_code,lga,lga_code,ward,ward_code,location").eq("is_simulated", false);
    if (state) query = query.eq("state_code", state);
    if (lga) query = query.eq("lga_code", lga);
    if (ward) query = query.eq("ward_code", ward);
    if (level === "code") query = query.eq("code", search);
    const { data, error } = await query.order("code").limit(level === "units" ? 500 : 1);
    if (error) throw error;
    return NextResponse.json({ items: data || [] }, { headers: noStore });
  } catch (error) { return errorResponse(error); }
}
