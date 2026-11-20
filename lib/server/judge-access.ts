import "server-only";
import { adminClient } from "./supabase";

function judgeIds(): Set<string> {
  return new Set((process.env.SIGNA_JUDGE_USER_IDS || "").split(",").map((value) => value.trim().toLowerCase()).filter(Boolean));
}

export function isRestrictedJudge(userId: string): boolean {
  return judgeIds().has(userId.toLowerCase());
}

export function keepSimulatedForJudge<T>(userId: string, rows: T[], unit: (row: T) => { is_simulated?: boolean } | null | undefined): T[] {
  return isRestrictedJudge(userId) ? rows.filter((row) => unit(row)?.is_simulated === true) : rows;
}

export async function judgeCanAccessIncident(userId: string, incidentId: string): Promise<boolean> {
  if (!isRestrictedJudge(userId)) return true;
  const { data, error } = await adminClient().from("incidents")
    .select("id,polling_units!inner(is_simulated)").eq("id", incidentId).eq("polling_units.is_simulated", true).maybeSingle();
  if (error) throw new Error("Judge case access could not be checked");
  return !!data;
}

export async function judgeCanAccessReport(userId: string, reportId: string): Promise<boolean> {
  if (!isRestrictedJudge(userId)) return true;
  const { data, error } = await adminClient().from("reports")
    .select("id,polling_units!inner(is_simulated)").eq("id", reportId).eq("polling_units.is_simulated", true).maybeSingle();
  if (error) throw new Error("Judge report access could not be checked");
  return !!data;
}

export async function judgeCanAccessAssignment(userId: string, assignmentId: string): Promise<boolean> {
  if (!isRestrictedJudge(userId)) return true;
  const { data, error } = await adminClient().from("assignments")
    .select("id,incidents!inner(polling_units!inner(is_simulated))").eq("id", assignmentId)
    .eq("incidents.polling_units.is_simulated", true).maybeSingle();
  if (error) throw new Error("Judge assignment access could not be checked");
  return !!data;
}
