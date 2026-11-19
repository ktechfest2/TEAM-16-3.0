import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { adminClient } from "@/lib/server/supabase";
import { EVIDENCE_BUCKET } from "@/lib/server/evidence";
import { noStore } from "@/lib/server/responses";

export const runtime = "nodejs";

/** Daily cleanup for abandoned upload intents and their private storage objects. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !authorized(req, secret))
    return NextResponse.json({ error: { code: "ACCESS", message: "Not authorised" } }, { status: 401, headers: noStore });

  try {
    const db = adminClient();
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: rows, error } = await db.from("evidence")
      .select("id,report_id,storage_path")
      .in("upload_status", ["pending", "failed"])
      .lt("received_at", cutoff)
      .order("received_at", { ascending: true })
      .limit(100);
    if (error) throw error;

    let removed = 0;
    for (const row of rows || []) {
      const { error: storageError } = await db.storage.from(EVIDENCE_BUCKET).remove([row.storage_path]);
      if (storageError) continue;
      const { data, error: deleteError } = await db.from("evidence").delete()
        .eq("id", row.id).eq("report_id", row.report_id)
        .in("upload_status", ["pending", "failed"]).select("id").maybeSingle();
      if (!deleteError && data) removed++;
    }

    return NextResponse.json({ removed }, { headers: noStore });
  } catch {
    // Never log row IDs, paths, SQL errors or storage details from this job.
    return NextResponse.json({ error: { code: "UNAVAILABLE", message: "Cleanup is temporarily unavailable" } }, { status: 503, headers: noStore });
  }
}

function authorized(req: Request, secret: string): boolean {
  const provided = req.headers.get("authorization") || "";
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
