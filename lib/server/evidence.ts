import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type { Viewer } from "./auth";
import { DependencyUnavailableError } from "./responses";
import { adminClient } from "./supabase";
import type { EvidenceItem, EvidenceMime } from "@/lib/evidence-contract";
import { enforceAbuseLimit } from "./rate-limit";

export const EVIDENCE_BUCKET = "signa-evidence";
const extensionByMime: Record<EvidenceMime, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

type EvidenceRow = {
  id: string;
  report_id: string;
  storage_path: string;
  mime_type: EvidenceMime;
  byte_size: number;
  sha256: string;
  received_at: string;
  upload_status: "pending" | "ready" | "failed";
};

export async function reporterOwnsReport(reportId: string, reporterId: string): Promise<boolean> {
  const { data, error } = await adminClient().from("reports")
    .select("id").eq("id", reportId).eq("reporter_id", reporterId).maybeSingle();
  if (error) throw new Error("Report ownership could not be checked");
  return !!data;
}

export async function canViewReportEvidence(reportId: string, viewer: Viewer): Promise<boolean> {
  const db = adminClient();
  if (viewer.role === "admin" || viewer.role === "monitor") return true;
  if (viewer.role === "reporter") return reporterOwnsReport(reportId, viewer.userId);
  const { data: links, error: linksError } = await db.from("incident_reports")
    .select("incident_id").eq("report_id", reportId);
  if (linksError) throw new Error("Evidence access could not be checked");
  const incidentIds = (links || []).map((link) => link.incident_id as string);
  if (!incidentIds.length) return false;
  const { data: assignment, error } = await db.from("assignments")
    .select("id").eq("assigned_to", viewer.userId).in("incident_id", incidentIds).limit(1).maybeSingle();
  if (error) throw new Error("Evidence access could not be checked");
  return !!assignment;
}

export async function listReadyEvidence(reportId: string): Promise<EvidenceItem[]> {
  const { data, error } = await adminClient().from("evidence")
    .select("id,report_id,mime_type,byte_size,sha256,received_at")
    .eq("report_id", reportId).eq("upload_status", "ready")
    .order("received_at", { ascending: true });
  if (error) throw new Error("Evidence metadata could not be loaded");
  return (data || []).map(toEvidenceItem);
}

export async function saveEvidence(input: {
  req: Request;
  evidenceId: string;
  reportId: string;
  reporterId: string;
  mimeType: EvidenceMime;
  bytes: Uint8Array;
}): Promise<{ item: EvidenceItem; duplicate: boolean }> {
  const db = adminClient();
  const sha256 = createHash("sha256").update(input.bytes).digest("hex");
  const byteSize = input.bytes.byteLength;

  let { data: existing, error: lookupError } = await db.from("evidence")
    .select("id,report_id,storage_path,mime_type,byte_size,sha256,received_at,upload_status")
    .eq("id", input.evidenceId).maybeSingle();
  if (lookupError) throw new Error("Evidence retry state could not be checked");
  if (existing && !sameEvidence(existing as EvidenceRow, input.reportId, input.mimeType, byteSize, sha256))
    throw new Error("EVIDENCE_ID_CONFLICT");

  if (!existing) {
    await enforceAbuseLimit(input.req, input.reporterId, {
      scope: "evidence", reporterMax: 10, ipMax: 30, windowSeconds: 600,
    });
    const storagePath = `${input.reportId}/${randomUUID()}.${extensionByMime[input.mimeType]}`;
    const { data: created, error } = await db.from("evidence").insert({
      id: input.evidenceId,
      report_id: input.reportId,
      storage_path: storagePath,
      mime_type: input.mimeType,
      byte_size: byteSize,
      sha256,
      upload_status: "pending",
    }).select("id,report_id,storage_path,mime_type,byte_size,sha256,received_at,upload_status").single();
    if (error?.code === "23505") {
      const retry = await db.from("evidence")
        .select("id,report_id,storage_path,mime_type,byte_size,sha256,received_at,upload_status")
        .eq("id", input.evidenceId).maybeSingle();
      if (retry.error || !retry.data || !sameEvidence(retry.data as EvidenceRow, input.reportId, input.mimeType, byteSize, sha256))
        throw new Error("EVIDENCE_ID_CONFLICT");
      existing = retry.data;
    } else if (error || !created) {
      throw new Error("Evidence upload intent could not be stored");
    } else {
      existing = created;
    }
  }

  const row = existing as EvidenceRow;
  if (row.upload_status === "ready") return { item: toEvidenceItem(row), duplicate: true };

  const { error: uploadError } = await db.storage.from(EVIDENCE_BUCKET).upload(row.storage_path, input.bytes, {
    contentType: input.mimeType,
    cacheControl: "3600",
    upsert: true,
  });
  if (uploadError) {
    const { error: cleanupError } = await db.storage.from(EVIDENCE_BUCKET).remove([row.storage_path]);
    const { error: stateError } = await db.from("evidence").update({ upload_status: "failed" }).eq("id", row.id);
    if (cleanupError || stateError) throw new DependencyUnavailableError("Evidence upload failed; cleanup is pending");
    throw new DependencyUnavailableError("Evidence upload failed");
  }

  const { data: ready, error: readyError } = await db.from("evidence")
    .update({ upload_status: "ready" }).eq("id", row.id)
    .select("id,report_id,storage_path,mime_type,byte_size,sha256,received_at,upload_status").single();
  if (readyError || !ready) {
    // Keep the intent and object for a same-key retry; the retry reuses this path.
    throw new DependencyUnavailableError("Evidence metadata finalization is pending retry");
  }
  return { item: toEvidenceItem(ready), duplicate: false };
}

export async function findEvidence(reportId: string, evidenceId: string): Promise<EvidenceRow | null> {
  const { data, error } = await adminClient().from("evidence")
    .select("id,report_id,storage_path,mime_type,byte_size,sha256,received_at,upload_status")
    .eq("report_id", reportId).eq("id", evidenceId).maybeSingle();
  if (error) throw new Error("Evidence record could not be loaded");
  return data as EvidenceRow | null;
}

export async function removeFailedEvidence(row: EvidenceRow): Promise<void> {
  if (row.upload_status === "ready") throw new Error("EVIDENCE_ALREADY_READY");
  const db = adminClient();
  const { error: storageError } = await db.storage.from(EVIDENCE_BUCKET).remove([row.storage_path]);
  if (storageError) throw new DependencyUnavailableError("Failed evidence cleanup is pending retry");
  const { data, error } = await db.from("evidence").delete()
    .eq("id", row.id).eq("report_id", row.report_id).neq("upload_status", "ready")
    .select("id").maybeSingle();
  if (error || !data) throw new DependencyUnavailableError("Failed evidence metadata cleanup is pending retry");
}

export async function createEvidenceSignedUrl(row: EvidenceRow): Promise<{ signedUrl: string; expiresAt: string }> {
  const expiresIn = 60;
  const { data, error } = await adminClient().storage.from(EVIDENCE_BUCKET)
    .createSignedUrl(row.storage_path, expiresIn);
  if (error || !data?.signedUrl) throw new DependencyUnavailableError("Evidence retrieval is temporarily unavailable");
  return { signedUrl: data.signedUrl, expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString() };
}

export function toEvidenceItem(row: Pick<EvidenceRow, "id" | "report_id" | "mime_type" | "byte_size" | "sha256" | "received_at">): EvidenceItem {
  return {
    id: row.id,
    reportId: row.report_id,
    mimeType: row.mime_type,
    byteSize: row.byte_size,
    sha256: row.sha256,
    receivedAt: row.received_at,
  };
}

function sameEvidence(row: EvidenceRow, reportId: string, mimeType: EvidenceMime, byteSize: number, sha256: string) {
  return row.report_id === reportId && row.mime_type === mimeType && row.byte_size === byteSize && row.sha256 === sha256;
}
