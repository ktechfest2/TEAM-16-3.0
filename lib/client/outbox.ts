"use client";
import type { ReportPayload } from "../report-contract";
import { bearerHeaders } from "./supabase";
export type QueuedReport = { payload: ReportPayload; queuedAt: string; state: "pending" | "failed"; error?: string };
const DB = "signa-offline-v1";
const STORE = "reports";
export function openOutbox(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "payload.id" });
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

export async function queueReport(payload: ReportPayload) {
  await trans("readwrite", store => store.put({ payload, queuedAt: new Date().toISOString(), state: "pending" }));
}
export async function listQueued(): Promise<QueuedReport[]> { return await trans("readonly", store => store.getAll()) as QueuedReport[]; }
export async function removeQueued(id: string) { await trans("readwrite", store => store.delete(id)); }
export async function flushQueued(): Promise<{ delivered: string[]; pending: number; errors: string[] }> {
  const delivered: string[] = [], errors: string[] = [];
  const records = await listQueued();
  if (!navigator.onLine) return { delivered, pending: records.length, errors };
  let auth: Record<string, string>;
  try { auth = await bearerHeaders(); } catch(e) { return { delivered, pending: records.length, errors: [e instanceof Error ? e.message : "Authentication unavailable"] }; }
  for (const record of records) {
    try {
      const response = await fetch("/api/reports", {
        method: "POST", headers: { "content-type": "application/json", ...auth },
        body: JSON.stringify(record.payload), cache: "no-store",
      });
      if (response.ok) {
        await removeQueued(record.payload.id);
        delivered.push(record.payload.id);
      } else {
        const body = await response.json().catch(() => ({}));
        errors.push(`${record.payload.id.slice(0, 8)}: ${body?.error?.message || `HTTP ${response.status}`}`);
      }
    } catch { errors.push(`${record.payload.id.slice(0, 8)}: network unavailable`); }
  }
  return { delivered, pending: (await listQueued()).length, errors };
}
