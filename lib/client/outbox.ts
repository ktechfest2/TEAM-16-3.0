"use client";
import { canonicalPayload, type ReportPayload } from "../report-contract.ts";
import { getReporterContext, type ReporterContext } from "./supabase.ts";
import { sameReporterContext } from "./reporter-verification.ts";
import { openOfflineDatabase } from "./offline-database.ts";
import { markEvidenceReportReceived } from "./evidence-outbox.ts";
type StoredReport = {
  payload: ReportPayload;
  queuedAt: string;
  state: "pending" | "failed";
  error?: string;
  /** Ownership field written by the v1 queue used on the deployed branch. */
  reporterId?: string | null;
  storageVersion?: 2;
  ownerUserId?: string | null;
  ownershipState?: "owned" | "unowned";
};
export type QueuedReport = StoredReport & {
  storageVersion: 2;
  ownerUserId: string;
  ownershipState: "owned";
};
export type FlushResult = { delivered: string[]; failed: string[]; pending: number | null; errors: string[] };
type FlushDependencies = {
  isOnline?: () => boolean;
  getReporterContext?: () => Promise<ReporterContext | null>;
  request?: typeof fetch;
  requestTimeoutMs?: number;
};
type FlushJob = {
  dependencies: FlushDependencies;
  resolve: (result: FlushResult) => void;
  reject: (error: unknown) => void;
};
const STORE = "reports";
const flushJobs: FlushJob[] = [];
let processingFlushes = false;

function errorName(error: unknown) {
  return error && typeof error === "object" && "name" in error ? String(error.name) : "";
}

function storageError(error: unknown) {
  const name = errorName(error);
  if (name === "QuotaExceededError") return new Error("This device is out of browser storage space. Free some space, then try again.");
  if (name === "SecurityError" || name === "NotAllowedError") return new Error("Local report storage is blocked in this browser. Allow site storage, then try again.");
  return error instanceof Error ? error : new Error("Local report storage is unavailable in this browser.");
}

export function openOutbox(): Promise<IDBDatabase> {
  return openOfflineDatabase();
}
async function trans<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openOutbox();
  return new Promise((resolve, reject) => {
    let tx: IDBTransaction;
    let req: IDBRequest<T>;
    try {
      tx = db.transaction(STORE, mode);
      req = action(tx.objectStore(STORE));
    } catch (error) {
      db.close();
      reject(storageError(error));
      return;
    }
    let result: T;
    req.onsuccess = () => { result = req.result; };
    tx.oncomplete = () => { db.close(); resolve(result); };
    tx.onabort = () => { db.close(); reject(storageError(tx.error || req.error)); };
    tx.onerror = () => { db.close(); reject(storageError(tx.error || req.error)); };
  });
}

export async function queueReport(payload: ReportPayload, ownerUserId: string | null): Promise<void> {
  const db = await openOutbox();
  return new Promise<void>((resolve, reject) => {
    let tx: IDBTransaction;
    let store: IDBObjectStore;
    let existing: IDBRequest;
    try {
      tx = db.transaction(STORE, "readwrite");
      store = tx.objectStore(STORE);
      existing = store.get(payload.id);
    } catch (error) {
      db.close();
      reject(storageError(error));
      return;
    }
    let failure: Error | null = null;
    existing.onsuccess = () => {
      const queued = existing.result as StoredReport | undefined;
      if (queued) {
        if (canonicalPayload(queued.payload) !== canonicalPayload(payload)) {
          failure = new Error("This report ID is already saved with different content. Keep the original report or create a new one.");
          tx.abort();
        } else if (
          queued.storageVersion !== 2 ||
          queued.ownerUserId !== ownerUserId ||
          queued.ownershipState !== (ownerUserId ? "owned" : "unowned")
        ) {
          failure = new Error("This report ID is already saved in a different ownership state. Review it in My reports before continuing.");
          tx.abort();
        }
        return;
      }
      store.add({
        payload,
        queuedAt: new Date().toISOString(),
        state: "pending",
        storageVersion: 2,
        ownerUserId,
        ownershipState: ownerUserId ? "owned" : "unowned",
      } satisfies StoredReport);
    };
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onabort = () => { db.close(); reject(failure ?? storageError(tx.error || existing.error)); };
    tx.onerror = () => { db.close(); reject(storageError(tx.error || existing.error)); };
  });
}

function isOwnedBy(record: StoredReport, ownerUserId: string): record is QueuedReport {
  return record.storageVersion === 2 && record.ownershipState === "owned" && record.ownerUserId === ownerUserId;
}

export async function listQueued(ownerUserId: string): Promise<QueuedReport[]> {
  const records = await trans<StoredReport[]>("readonly", store => store.getAll());
  return records.filter((record) => isOwnedBy(record, ownerUserId));
}

/** Compatibility for report surfaces that already pass the current reporter ID. */
export async function listQueuedForReporter(reporterId: string | null): Promise<QueuedReport[]> {
  if (!reporterId) return [];
  return listQueued(reporterId);
}

export async function removeQueued(id: string, ownerUserId: string) {
  const db = await openOutbox();
  return new Promise<void>((resolve, reject) => {
    let tx: IDBTransaction;
    let request: IDBRequest;
    try {
      tx = db.transaction(STORE, "readwrite");
      request = tx.objectStore(STORE).get(id);
    } catch (error) {
      db.close();
      reject(storageError(error));
      return;
    }
    request.onsuccess = () => {
      const record = request.result as StoredReport | undefined;
      if (record && isOwnedBy(record, ownerUserId)) tx.objectStore(STORE).delete(id);
    };
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onabort = () => { db.close(); reject(storageError(tx.error || request.error)); };
    tx.onerror = () => { db.close(); reject(storageError(tx.error || request.error)); };
  });
}

async function updateQueued(id: string, ownerUserId: string, update: Partial<Pick<QueuedReport, "state" | "error">>) {
  const db = await openOutbox();
  return new Promise<void>((resolve, reject) => {
    let tx: IDBTransaction;
    let request: IDBRequest;
    try {
      tx = db.transaction(STORE, "readwrite");
      request = tx.objectStore(STORE).get(id);
    } catch (error) {
      db.close();
      reject(storageError(error));
      return;
    }
    request.onsuccess = () => {
      const record = request.result as StoredReport | undefined;
      if (record && isOwnedBy(record, ownerUserId)) tx.objectStore(STORE).put({ ...record, ...update });
    };
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onabort = () => { db.close(); reject(storageError(tx.error || request.error)); };
    tx.onerror = () => { db.close(); reject(storageError(tx.error || request.error)); };
  });
}

async function flushQueuedNow(dependencies: FlushDependencies): Promise<FlushResult> {
  const delivered: string[] = [], failed: string[] = [], errors: string[] = [];
  const isOnline = dependencies.isOnline ?? (() => navigator.onLine);
  if (!isOnline()) return { delivered, failed, pending: null, errors };
  const candidates = await trans<StoredReport[]>("readonly", store => store.getAll());
  if (!candidates.some((record) => record.storageVersion === 2 && record.ownershipState === "owned")) {
    return { delivered, failed, pending: 0, errors };
  }
  let context: ReporterContext | null;
  try {
    context = await (dependencies.getReporterContext ?? (() => getReporterContext({ createIfMissing: false })))();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Reporter session unavailable";
    return { delivered, failed, pending: null, errors: [message] };
  }
  if (!context?.ownerUserId) return { delivered, failed, pending: null, errors };
  const records = candidates.filter((record) => isOwnedBy(record, context.ownerUserId));
  if (records.length === 0) return { delivered, failed, pending: 0, errors };
  const request = dependencies.request ?? fetch;
  const requestTimeoutMs = dependencies.requestTimeoutMs ?? 15_000;
  for (const record of records) {
    try {
      await updateQueued(record.payload.id, context.ownerUserId, { state: "pending", error: undefined });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not prepare the saved report for retry";
      failed.push(record.payload.id);
      errors.push(`${record.payload.id.slice(0, 8)}: ${message}`);
      continue;
    }

    let activeContext: ReporterContext | null = null;
    try {
      activeContext = await (dependencies.getReporterContext ?? (() => getReporterContext({ createIfMissing: false })))();
    } catch {
      activeContext = null;
    }
    if (!sameReporterContext(context, activeContext)) {
      errors.push("Reporter session changed before upload. Saved reports remain on this device.");
      break;
    }

    let response: Response;
    let body: {
      id?: unknown; receivedAt?: unknown; delivery?: unknown; error?: { message?: unknown };
    } | null;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
    try {
      response = await request("/api/reports", {
        method: "POST", headers: { "content-type": "application/json", ...context.headers },
        body: JSON.stringify(record.payload), cache: "no-store", signal: controller.signal,
      });
      body = await response.json().catch((error) => {
        if (controller.signal.aborted) throw error;
        return null;
      }) as {
        id?: unknown; receivedAt?: unknown; delivery?: unknown; error?: { message?: unknown };
      } | null;
    } catch {
      const message = controller.signal.aborted ? "request timed out" : "network unavailable";
      failed.push(record.payload.id);
      errors.push(`${record.payload.id.slice(0, 8)}: ${message}`);
      try { await updateQueued(record.payload.id, context.ownerUserId, { state: "failed", error: message }); } catch {}
      continue;
    } finally {
      clearTimeout(timeout);
    }

    const hasReceipt = response.ok && body?.id === record.payload.id &&
      body.delivery === "received" && typeof body.receivedAt === "string" &&
      Number.isFinite(Date.parse(body.receivedAt));
    if (hasReceipt) {
      delivered.push(record.payload.id);
      void markEvidenceReportReceived(record.payload.id, context.ownerUserId).catch(() => {});
      try {
        await removeQueued(record.payload.id, context.ownerUserId);
      } catch {
        errors.push(`${record.payload.id.slice(0, 8)}: server confirmed receipt, but the local report could not be cleared; sync again to clear it safely`);
      }
    } else {
      const message = typeof body?.error?.message === "string" ? body.error.message :
        response.ok ? "server receipt did not match this report" : `HTTP ${response.status}`;
      failed.push(record.payload.id);
      errors.push(`${record.payload.id.slice(0, 8)}: ${message}`);
      try {
        await updateQueued(record.payload.id, context.ownerUserId, { state: "failed", error: message });
      } catch {}
    }
  }
  return { delivered, failed, pending: (await listQueued(context.ownerUserId)).length, errors };
}

async function processFlushJobs() {
  if (processingFlushes) return;
  processingFlushes = true;
  try {
    while (flushJobs.length > 0) {
      const job = flushJobs.shift()!;
      try {
        job.resolve(await flushQueuedNow(job.dependencies));
      } catch (error) {
        job.reject(error);
      }
    }
  } finally {
    processingFlushes = false;
    if (flushJobs.length > 0) void processFlushJobs();
  }
}

export function flushQueued(dependencies: FlushDependencies = {}): Promise<FlushResult> {
  return new Promise((resolve, reject) => {
    flushJobs.push({ dependencies, resolve, reject });
    void processFlushJobs();
  });
}
