import { NextResponse } from "next/server";
import { noStore } from "@/lib/server/responses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Browser speech is intentionally unavailable. Signa Voice is telephone-only. */
export async function POST() {
  return NextResponse.json(
    { error: { code: "NOT_AVAILABLE", message: "Browser voice is not available. Use Signa's published telephone service or the written reporting form." } },
    { status: 404, headers: noStore },
  );
}
