import { NextResponse } from "next/server";
import { AccessError } from "./auth";
import { InputError } from "../report-contract";
export const noStore = { "cache-control": "no-store" };
export function errorResponse(err: unknown) {
  const requestId = crypto.randomUUID();
  if (err instanceof AccessError) return NextResponse.json({ error: { code: "ACCESS", message: err.message }, requestId }, { status: err.status, headers: noStore });
  if (err instanceof InputError) return NextResponse.json({ error: { code: "INPUT", message: err.message }, requestId }, { status: 400, headers: noStore });
  console.error("signa.api", requestId, err);
  return NextResponse.json({ error: { code: "SERVER", message: "Request could not be completed" }, requestId }, { status: 500, headers: noStore });
}
