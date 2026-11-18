import { NextResponse } from "next/server";
export function GET() { return NextResponse.json({ ok: true, service: "signa-api", mode: "prototype" }, { headers: { "cache-control": "no-store" } }); }
