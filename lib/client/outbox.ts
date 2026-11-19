"use client";
import type { ReportPayload } from "../report-contract";
import { browserSupabase } from "./supabase";
import { markEvidenceReportReceived } from "./evidence-outbox";
export type QueuedReport = {
  payload: ReportPayload;
  queuedAt: string;
  state: "pending" | "failed";
  reporterId?: string | null;
  error?: string;
};
const DB = "signa-offline-v1";
const STORE = "reports";
export function openOutbox(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "payload.id" });
      if (!db.objectStoreNames.contains("evidence")) db.createObjectStore("evidence", { keyPath: "evidenceId" });
    };
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
  });
}
async function trans<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openOutbox();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = action(tx.objectStore(STORE));
    let result: T;
    req.onsuccess = () => { result = req.result; };
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => { db.close(); resolve(result); };
    tx.onabort = () => { db.close(); reject(tx.error || new Error("Local storage transaction aborted")); };
    tx.onerror = () => { db.close(); reject(tx.error || new Error("Local storage transaction failed")); };
  });
}

export async function queueReport(payload: ReportPayload, reporterId: string | null) {
  await trans("readwrite", store => store.put({ payload, reporterId, queuedAt: new Date().toISOString(), state: "pending" }));
}
async function listQueued(): Promise<QueuedReport[]> { return await trans("readonly", store => store.getAll()) as QueuedReport[]; }
export async function listQueuedForReporter(reporterId: string | null): Promise<QueuedReport[]> {
  // Ownerless drafts may contain sensitive descriptions. A signed-out browser
  // cannot establish who owns them, so never return their contents to a view.
  if (!reporterId) return [];
  const records = await listQueued();
  return records.filter(record => record.reporterId === reporterId);
}
export async function removeQueued(id: string) { await trans("readwrite", store => store.delete(id)); }
export async function flushQueued(): Promise<{ delivered: string[]; pending: number; errors: string[] }> {
  const delivered: string[] = [], errors: string[] = [];
  let reporterId: string | null = null;
  let accessToken: string | null = null;
  try {
    const { data: { session } } = await browserSupabase().auth.getSession();
    reporterId = session?.user.id ?? null;
    accessToken = session?.access_token ?? null;
  } catch {
    const records = await listQueuedForReporter(null);
    return { delivered, pending: records.length, errors: ["Reporter session unavailable"] };
  }
  if (!navigator.onLine) {
    const records = await listQueuedForReporter(reporterId);
    return { delivered, pending: records.length, errors };
  }
  const records = await listQueuedForReporter(reporterId);
  if (!accessToken) {
    if (records.length) errors.push("Saved offline reports have no reporter session. They remain on this device.");
    return { delivered, pending: records.length, errors };
  }

  const auth = { authorization: `Bearer ${accessToken}` };
  for (const record of records) {
    try {
      const response = await fetch("/api/reports", {
        method: "POST", headers: { "content-type": "application/json", ...auth },
        body: JSON.stringify(record.payload), cache: "no-store",
      });
      if (response.ok) {
        await markEvidenceReportReceived(record.payload.id, reporterId);
        await removeQueued(record.payload.id);
        delivered.push(record.payload.id);
      } else {
        const body = await response.json().catch(() => ({}));
        errors.push(`${record.payload.id.slice(0, 8)}: ${body?.error?.message || `HTTP ${response.status}`}`);
      }
    } catch { errors.push(`${record.payload.id.slice(0, 8)}: network unavailable`); }
  }
  return { delivered, pending: (await listQueuedForReporter(reporterId)).length, errors };
}
