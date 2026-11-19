"use client";

import { citizenSupabase, getCitizenSession } from "./supabase.ts";
import { openOfflineDatabase } from "./offline-database.ts";

export type EvidenceUploadState = "waiting_for_report" | "pending" | "uploading" | "failed" | "received";

export type QueuedEvidence = {
  evidenceId: string;
  reportId: string;
  reporterId: string | null;
  file?: Blob;
  fileName: string;
  mimeType: string;
  byteSize: number;
  state: EvidenceUploadState;
  receivedAt?: string;
  error?: string;
};

const STORE = "evidence";

const openEvidenceDb = openOfflineDatabase;

export async function queueEvidence(records: QueuedEvidence[]): Promise<void> {
  if (!records.length) return;
  const db = await openEvidenceDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE, "readwrite");
    const store = transaction.objectStore(STORE);
    for (const record of records) store.put(record);
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error || new Error("Evidence could not be saved on this device"));
    transaction.onerror = () => reject(transaction.error || new Error("Evidence could not be saved on this device"));
  }).finally(() => db.close());
}

export async function listEvidenceForReporter(reporterId: string | null): Promise<QueuedEvidence[]> {
  if (!reporterId) return [];
  const db = await openEvidenceDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, "readonly");
    const request = transaction.objectStore(STORE).getAll();
    request.onsuccess = () => resolve((request.result as QueuedEvidence[]).filter((item) => item.reporterId === reporterId));
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => db.close();
    transaction.onerror = () => { db.close(); reject(transaction.error); };
  });
}

export async function markEvidenceReportReceived(reportId: string, reporterId: string): Promise<void> {
  const db = await openEvidenceDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE, "readwrite");
    const store = transaction.objectStore(STORE);
    const request = store.getAll();
    request.onsuccess = () => {
      for (const record of request.result as QueuedEvidence[]) {
        if (record.reportId === reportId && record.reporterId === reporterId && record.state !== "received") {
          store.put({ ...record, state: "pending", error: undefined });
        }
      }
    };
    request.onerror = () => transaction.abort();
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error || new Error("Could not update evidence delivery state"));
    transaction.onerror = () => reject(transaction.error || new Error("Could not update evidence delivery state"));
  }).finally(() => db.close());
}

async function updateRecord(record: QueuedEvidence): Promise<void> {
  const db = await openEvidenceDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE, "readwrite");
    transaction.objectStore(STORE).put(record);
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error || new Error("Could not update evidence status"));
    transaction.onerror = () => reject(transaction.error || new Error("Could not update evidence status"));
  }).finally(() => db.close());
}

export async function retryEvidence(evidenceId: string, reporterId: string): Promise<void> {
  const records = await listEvidenceForReporter(reporterId);
  const record = records.find((item) => item.evidenceId === evidenceId);
  if (!record || !record.file) throw new Error("The local photo is unavailable on this device");
  await updateRecord({ ...record, state: record.state === "waiting_for_report" ? record.state : "pending", error: undefined });
}

export async function flushQueuedEvidence(
  reporterId: string,
  accessToken: string,
): Promise<{ received: string[]; errors: string[] }> {
  const received: string[] = [];
  const errors: string[] = [];
  if (!navigator.onLine) return { received, errors };
  let records = await listEvidenceForReporter(reporterId);
  if (records.some((record) => record.state === "waiting_for_report")) {
    try {
      const response = await fetch("/api/reports/mine", {
        headers: { authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      });
      if (response.ok) {
        const body = await response.json().catch(() => null);
        const reportRows = Array.isArray(body?.reports) ? body.reports as { id?: unknown }[] : [];
        const receivedReports = new Set<string>(reportRows.map((report) => report.id).filter((id): id is string => typeof id === "string"));
        for (const record of records) {
          if (record.state === "waiting_for_report" && receivedReports.has(record.reportId))
            await markEvidenceReportReceived(record.reportId, reporterId);
        }
        records = await listEvidenceForReporter(reporterId);
      }
    } catch {
      // Keep photos waiting; a report lookup failure is not a receipt.
    }
  }
  for (const record of records) {
    if (record.state !== "pending" && record.state !== "failed" && record.state !== "uploading") continue;
    try {
      const { data: { session } } = await getCitizenSession();
      if (!session || session.user.id !== reporterId || session.access_token !== accessToken) {
        errors.push("Reporter session changed; pending photos were not uploaded.");
        break;
      }
    } catch {
      errors.push("Reporter session unavailable; pending photos were not uploaded.");
      break;
    }
    if (!record.file) {
      const message = "Photo data is unavailable in local storage";
      await updateRecord({ ...record, state: "failed", error: message });
      errors.push(`${record.fileName}: ${message}`);
      continue;
    }
    await updateRecord({ ...record, state: "uploading", error: undefined });
    try {
      const form = new FormData();
      form.append("file", record.file, record.fileName);
      const response = await fetch(`/api/reports/${record.reportId}/evidence`, {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}`, "Idempotency-Key": record.evidenceId },
        body: form,
        cache: "no-store",
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error?.message || `Request failed (HTTP ${response.status})`);
      await updateRecord({ ...record, file: undefined, state: "received", receivedAt: body?.evidence?.receivedAt, error: undefined });
      received.push(record.evidenceId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Photo upload failed";
      await updateRecord({ ...record, state: "failed", error: message });
      errors.push(`${record.fileName}: ${message}`);
    }
  }
  return { received, errors };
}

