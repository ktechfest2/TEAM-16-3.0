import type { ReporterContext } from "./supabase.ts";

export function sameReporterContext(left: ReporterContext | null, right: ReporterContext | null): boolean {
  if (left === null || right === null) return left === right;
  return left.ownerUserId === right.ownerUserId &&
    left.headers.authorization === right.headers.authorization;
}
