import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type { Viewer } from "./auth";
import { DependencyUnavailableError } from "./responses";
import { adminClient } from "./supabase";
import type { EvidenceItem, EvidenceMime } from "@/lib/evidence-contract";
import { enforceAbuseLimit } from "./rate-limit";
import { judgeCanAccessReport } from "./judge-access";

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
  upload_status: "pending" | "uploading" | "ready" | "failed" | "cleaning";
  upload_token?: string | null;
  upload_lease_expires_at?: string | null;
  cleanup_token?: string | null;
};

export async function reporterOwnsReport(reportId: string, reporterId: string): Promise<boolean> {
  const { data, error } = await adminClient().from("reports")
    .select("id").eq("id", reportId).eq("reporter_id", reporterId).maybeSingle();
  if (error) throw new Error("Report ownership could not be checked");
  return !!data;
}

export async function canViewReportEvidence(reportId: string, viewer: Viewer): Promise<boolean> {
  const db = adminClient();
  if (!(await judgeCanAccessReport(viewer.userId, reportId))) return false;
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
  const uploadToken = randomUUID();

  let { data: existing, error: lookupError } = await db.from("evidence")
    .select("id,report_id,storage_path,mime_type,byte_size,sha256,received_at,upload_status,upload_token,upload_lease_expires_at,cleanup_token")
    .eq("id", input.evidenceId).maybeSingle();
  if (lookupError) throw new Error("Evidence retry state could not be checked");
  if (existing && !sameEvidence(existing as EvidenceRow, input.reportId, input.mimeType, byteSize, sha256))
    throw new Error("EVIDENCE_ID_CONFLICT");

  let ownsLease = false;
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
      upload_status: "uploading",
      upload_token: uploadToken,
      upload_lease_expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    }).select("id,report_id,storage_path,mime_type,byte_size,sha256,received_at,upload_status,upload_token,upload_lease_expires_at,cleanup_token").single();
    if (error?.code === "23505") {
      const retry = await db.from("evidence")
        .select("id,report_id,storage_path,mime_type,byte_size,sha256,received_at,upload_status,upload_token,upload_lease_expires_at,cleanup_token")
        .eq("id", input.evidenceId).maybeSingle();
      if (retry.error || !retry.data || !sameEvidence(retry.data as EvidenceRow, input.reportId, input.mimeType, byteSize, sha256))
        throw new Error("EVIDENCE_ID_CONFLICT");
      existing = retry.data;
    } else if (error || !created) {
      throw new Error("Evidence upload intent could not be stored");
    } else {
      existing = created;
      ownsLease = true;
    }
  }

  const row = existing as EvidenceRow;
  if (row.upload_status === "ready") return { item: toEvidenceItem(row), duplicate: true };

  // Claim retryable or expired work with a compare-and-set. A concurrent
  // request cannot upload or clean up the same object while another owns it.
  if (!ownsLease && (row.upload_status !== "uploading" || row.upload_token !== uploadToken)) {
    let claim = db.from("evidence").update({
      upload_status: "uploading",
      upload_token: uploadToken,
      upload_lease_expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      cleanup_token: null,
    }).eq("id", row.id).eq("upload_status", row.upload_status);
    if (row.upload_status === "uploading") {
      if (!row.upload_token || !row.upload_lease_expires_at || Date.parse(row.upload_lease_expires_at) >= Date.now())
        throw new Error("EVIDENCE_UPLOAD_IN_PROGRESS");
      claim = claim.eq("upload_token", row.upload_token).lt("upload_lease_expires_at", new Date().toISOString());
    } else if (row.upload_status !== "pending" && row.upload_status !== "failed") {
      throw new Error("EVIDENCE_UPLOAD_IN_PROGRESS");
    }
    const { data: claimed, error: claimError } = await claim.select("id").maybeSingle();
    if (claimError || !claimed) throw new Error("EVIDENCE_UPLOAD_IN_PROGRESS");
  }

  const { error: uploadError } = await db.storage.from(EVIDENCE_BUCKET).upload(row.storage_path, input.bytes, {
    contentType: input.mimeType,
    cacheControl: "3600",
    upsert: true,
  });
  if (uploadError) {
    // Never remove here: another retry could have finalized the same path.
    // A lease-checked cleanup job removes abandoned objects later.
    const { error: stateError } = await db.from("evidence").update({ upload_status: "failed", upload_token: null, upload_lease_expires_at: null })
      .eq("id", row.id).eq("upload_status", "uploading").eq("upload_token", uploadToken);
    if (stateError) throw new DependencyUnavailableError("Evidence upload failed; retry is pending");
    throw new DependencyUnavailableError("Evidence upload failed");
  }

  const { data: ready, error: readyError } = await db.from("evidence")
    .update({ upload_status: "ready", upload_token: null, upload_lease_expires_at: null }).eq("id", row.id)
    .eq("upload_status", "uploading").eq("upload_token", uploadToken)
    .select("id,report_id,storage_path,mime_type,byte_size,sha256,received_at,upload_status").single();
  if (readyError || !ready) {
    // Keep the intent and object for a same-key retry; the retry reuses this path.
    throw new DependencyUnavailableError("Evidence metadata finalization is pending retry");
  }
  return { item: toEvidenceItem(ready), duplicate: false };
}

export async function findEvidence(reportId: string, evidenceId: string): Promise<EvidenceRow | null> {
  const { data, error } = await adminClient().from("evidence")
    .select("id,report_id,storage_path,mime_type,byte_size,sha256,received_at,upload_status,upload_token,upload_lease_expires_at,cleanup_token")
    .eq("report_id", reportId).eq("id", evidenceId).maybeSingle();
  if (error) throw new Error("Evidence record could not be loaded");
  return data as EvidenceRow | null;
}

export async function removeFailedEvidence(row: EvidenceRow): Promise<void> {
  if (row.upload_status === "ready") throw new Error("EVIDENCE_ALREADY_READY");
  if (row.upload_status === "cleaning") throw new Error("EVIDENCE_UPLOAD_IN_PROGRESS");
  if (row.upload_status !== "pending" && row.upload_status !== "failed" && row.upload_status !== "uploading")
    throw new Error("EVIDENCE_UPLOAD_IN_PROGRESS");
  if (row.upload_status === "uploading" && (!row.upload_lease_expires_at || Date.parse(row.upload_lease_expires_at) >= Date.now()))
    throw new Error("EVIDENCE_UPLOAD_IN_PROGRESS");
  const db = adminClient();
  const cleanupToken = randomUUID();
  let claim = db.from("evidence").update({ upload_status: "cleaning", cleanup_token: cleanupToken })
    .eq("id", row.id).eq("upload_status", row.upload_status);
  if (row.upload_status === "uploading") {
    claim = claim.eq("upload_token", row.upload_token || "").lt("upload_lease_expires_at", new Date().toISOString());
  }
  const { data: claimed, error: claimError } = await claim.select("id").maybeSingle();
  if (claimError || !claimed) throw new Error("EVIDENCE_UPLOAD_IN_PROGRESS");
  const { error: storageError } = await db.storage.from(EVIDENCE_BUCKET).remove([row.storage_path]);
  if (storageError) {
    await db.from("evidence").update({ upload_status: "failed", cleanup_token: null })
      .eq("id", row.id).eq("upload_status", "cleaning").eq("cleanup_token", cleanupToken);
    throw new DependencyUnavailableError("Failed evidence cleanup is pending retry");
  }
  const { data, error } = await db.from("evidence").delete()
    .eq("id", row.id).eq("report_id", row.report_id).eq("upload_status", "cleaning").eq("cleanup_token", cleanupToken)
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
