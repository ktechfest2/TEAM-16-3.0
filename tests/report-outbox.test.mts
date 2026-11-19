import test from "node:test";
import assert from "node:assert/strict";
import { IDBKeyRange, indexedDB } from "fake-indexeddb";
import { flushQueued, listQueued, openOutbox, queueReport, removeQueued } from "../lib/client/outbox.ts";
import { listEvidenceForReporter } from "../lib/client/evidence-outbox.ts";
import { parseReport } from "../lib/report-contract.ts";

Object.defineProperty(globalThis, "indexedDB", { value: indexedDB, configurable: true });
Object.defineProperty(globalThis, "IDBKeyRange", { value: IDBKeyRange, configurable: true });
Object.defineProperty(globalThis, "navigator", { value: { onLine: true }, configurable: true });

const OWNER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_OWNER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const context = (ownerUserId = OWNER) => ({ ownerUserId, headers: { authorization: "Bearer test-token" } });

const report = parseReport({
  id: "9e8ca3da-3718-45ca-9124-59fbc9819d7a",
  pollingUnitId: "550e8400-e29b-41d4-a716-446655440000",
  category: "intimidation",
  description: "Fictional observation at simulated polling unit.",
  occurredAt: null,
  clientCreatedAt: "2026-11-19T10:00:00.000Z",
});

test("the v4 schema upgrade preserves reporter-owned v1 drafts and quarantines ownerless v1 drafts", async () => {
  const legacyId = "22222222-2222-4222-8222-222222222222";
  const unownedId = "33333333-3333-4333-8333-333333333333";
  const legacyPayload = parseReport({ ...report, id: legacyId });
  const unownedPayload = parseReport({ ...report, id: unownedId });
  const legacyRequest = indexedDB.open("signa-offline-v1", 1);
  const v1 = await new Promise<IDBDatabase>((resolve, reject) => {
    legacyRequest.onupgradeneeded = () => legacyRequest.result.createObjectStore("reports", { keyPath: "payload.id" });
    legacyRequest.onsuccess = () => resolve(legacyRequest.result);
    legacyRequest.onerror = () => reject(legacyRequest.error);
  });
  await new Promise<void>((resolve, reject) => {
    const tx = v1.transaction("reports", "readwrite");
    tx.objectStore("reports").add({
      payload: legacyPayload, reporterId: OWNER, queuedAt: "2026-11-18T00:00:00.000Z", state: "pending",
    });
    tx.objectStore("reports").add({
      payload: unownedPayload, reporterId: null, queuedAt: "2026-11-18T00:01:00.000Z", state: "pending",
    });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
  let oldTabClosedForUpgrade = false;
  v1.onversionchange = () => {
    oldTabClosedForUpgrade = true;
    v1.close();
  };

  const upgraded = await openOutbox();
  assert.equal(upgraded.version, 4);
  assert.equal(oldTabClosedForUpgrade, true);
  const storedRows = await new Promise<unknown[]>((resolve, reject) => {
    const request = upgraded.transaction("reports", "readonly").objectStore("reports").getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  upgraded.close();

  const storedOwner = storedRows.find((record) => (record as { payload?: { id?: string } }).payload?.id === legacyId) as Record<string, unknown>;
  const storedUnowned = storedRows.find((record) => (record as { payload?: { id?: string } }).payload?.id === unownedId) as Record<string, unknown>;
  assert.equal(storedOwner.storageVersion, 2);
  assert.equal(storedOwner.ownerUserId, OWNER);
  assert.equal(storedOwner.ownershipState, "owned");
  assert.equal("reporterId" in storedOwner, false);
  assert.equal(storedUnowned.storageVersion, 2);
  assert.equal(storedUnowned.ownerUserId, null);
  assert.equal(storedUnowned.ownershipState, "unowned");
  assert.deepEqual((await listQueued(OWNER)).map((item) => item.payload.id), [legacyId]);
  assert.deepEqual(await listQueued(OTHER_OWNER), []);

  let contacted = false;
  const result = await flushQueued({
    getReporterContext: async () => context(OWNER),
    request: async (_input: RequestInfo | URL, init?: RequestInit) => {
      contacted = true;
      const submitted = JSON.parse(String(init?.body)) as { id: string };
      assert.equal(submitted.id, legacyId);
      return new Response(JSON.stringify({
        id: legacyId,
        receivedAt: "2026-11-19T10:01:00.000Z",
        delivery: "received",
      }), { status: 201, headers: { "content-type": "application/json" } });
    },
    isOnline: () => true,
  });

  assert.deepEqual(result.delivered, [legacyId]);
  assert.deepEqual(await listQueued(OWNER), []);
  assert.equal(contacted, true);
  assert.deepEqual(await listQueued(OTHER_OWNER), []);
});

test("evidence-first upgrades repair legacy report ownership from an earlier v3 open", async () => {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase("signa-offline-v1");
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Could not reset the offline database for the migration test"));
  });
  const legacyId = "44444444-4444-4444-8444-444444444444";
  const legacyPayload = parseReport({ ...report, id: legacyId });
  const legacyRequest = indexedDB.open("signa-offline-v1", 3);
  const legacyDb = await new Promise<IDBDatabase>((resolve, reject) => {
    legacyRequest.onupgradeneeded = () => {
      legacyRequest.result.createObjectStore("reports", { keyPath: "payload.id" });
      legacyRequest.result.createObjectStore("evidence", { keyPath: "evidenceId" });
    };
    legacyRequest.onsuccess = () => resolve(legacyRequest.result);
    legacyRequest.onerror = () => reject(legacyRequest.error);
  });
  await new Promise<void>((resolve, reject) => {
    const tx = legacyDb.transaction("reports", "readwrite");
    tx.objectStore("reports").add({
      payload: legacyPayload,
      reporterId: OWNER,
      queuedAt: "2026-11-18T00:00:00.000Z",
      state: "pending",
    });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
  let oldTabClosedForUpgrade = false;
  legacyDb.onversionchange = () => {
    oldTabClosedForUpgrade = true;
    legacyDb.close();
  };

  assert.deepEqual(await listEvidenceForReporter(OWNER), []);
  const migrated = await listQueued(OWNER);
  assert.equal(oldTabClosedForUpgrade, true);
  assert.deepEqual(migrated.map((item) => item.payload.id), [legacyId]);
  await removeQueued(legacyId, OWNER);
});

test("a queued report is removed only after a matching server receipt", async () => {
  await queueReport(report, OWNER);
  const sentBodies: unknown[] = [];

  const result = await flushQueued({
    getReporterContext: async () => context(),
    request: async (_input: RequestInfo | URL, init?: RequestInit) => {
      sentBodies.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify({
        id: report.id,
        receivedAt: "2026-11-19T10:01:00.000Z",
        delivery: "received",
        duplicate: false,
      }), { status: 201, headers: { "content-type": "application/json" } });
    },
    isOnline: () => true,
  });

  assert.deepEqual(result.delivered, [report.id]);
  assert.equal(result.pending, 0);
  assert.deepEqual(await listQueued(OWNER), []);
  assert.deepEqual(sentBodies, [report]);
});

test("a successful response for a different report keeps the queued report", async () => {
  await queueReport(report, OWNER);

  const result = await flushQueued({
    getReporterContext: async () => context(),
    request: async () => new Response(JSON.stringify({
      id: "11111111-1111-4111-8111-111111111111",
      receivedAt: "2026-11-19T10:01:00.000Z",
      delivery: "received",
      duplicate: false,
    }), { status: 201, headers: { "content-type": "application/json" } }),
    isOnline: () => true,
  });

  assert.deepEqual(result.delivered, []);
  assert.deepEqual(result.failed, [report.id]);
  assert.equal(result.pending, 1);
  assert.match(result.errors[0], /receipt did not match/);
  assert.equal((await listQueued(OWNER))[0]?.payload.id, report.id);
  assert.equal((await listQueued(OWNER))[0]?.state, "failed");
  await removeQueued(report.id, OWNER);
});

test("a transient failure remains saved and retries with the same report ID and body", async () => {
  await queueReport(report, OWNER);
  const sentBodies: unknown[] = [];

  const failed = await flushQueued({
    getReporterContext: async () => context(),
    request: async (_input: RequestInfo | URL, init?: RequestInit) => {
      sentBodies.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify({ error: { message: "Temporarily unavailable" } }), {
        status: 503, headers: { "content-type": "application/json" },
      });
    },
    isOnline: () => true,
  });

  assert.deepEqual(failed.failed, [report.id]);
  assert.equal((await listQueued(OWNER))[0]?.state, "failed");

  const retried = await flushQueued({
    getReporterContext: async () => context(),
    request: async (_input: RequestInfo | URL, init?: RequestInit) => {
      sentBodies.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify({
        id: report.id,
        receivedAt: "2026-11-19T10:02:00.000Z",
        delivery: "received",
        duplicate: true,
      }), { status: 200, headers: { "content-type": "application/json" } });
    },
    isOnline: () => true,
  });

  assert.deepEqual(retried.delivered, [report.id]);
  assert.equal(retried.pending, 0);
  assert.deepEqual(sentBodies, [report, report]);
  assert.deepEqual(await listQueued(OWNER), []);
});

test("the same report ID cannot overwrite a saved report with edited content", async () => {
  await queueReport(report, OWNER);
  const edited = parseReport({ ...report, description: "Edited content for the same ID." });

  await assert.rejects(queueReport(edited, OWNER), /already saved with different content/);
  assert.deepEqual((await listQueued(OWNER)).map((item) => item.payload), [report]);
  await removeQueued(report.id, OWNER);
});

test("owned reports are visible and syncable only for their exact reporter", async () => {
  await queueReport(report, OWNER);
  let contacted = false;

  const result = await flushQueued({
    getReporterContext: async () => context(OTHER_OWNER),
    request: async () => { contacted = true; return new Response(null, { status: 500 }); },
    isOnline: () => true,
  });

  assert.equal((await listQueued(OWNER)).length, 1);
  assert.deepEqual(await listQueued(OTHER_OWNER), []);
  assert.equal(contacted, false);
  assert.equal(result.pending, 0);
  assert.deepEqual(result.delivered, []);
  await removeQueued(report.id, OWNER);
});

test("unowned reports stay hidden and unsent for every reporter session", async () => {
  await queueReport(report, null);
  assert.deepEqual(await listQueued(OWNER), []);
  assert.deepEqual(await listQueued(OTHER_OWNER), []);

  let requests = 0;
  await flushQueued({
    getReporterContext: async () => context(OWNER),
    request: async () => {
      requests += 1;
      return new Response(JSON.stringify({
        id: report.id,
        receivedAt: "2026-11-19T10:05:00.000Z",
        delivery: "received",
      }), { status: 201, headers: { "content-type": "application/json" } });
    },
    isOnline: () => true,
  });
  assert.equal(requests, 0);

  const db = await openOutbox();
  const stored = await new Promise<Record<string, unknown>>((resolve, reject) => {
    const request = db.transaction("reports", "readonly").objectStore("reports").get(report.id);
    request.onsuccess = () => resolve(request.result as Record<string, unknown>);
    request.onerror = () => reject(request.error);
  });
  db.close();
  assert.equal(stored.ownerUserId, null);
  assert.equal(stored.ownershipState, "unowned");
  const cleanup = await openOutbox();
  await new Promise<void>((resolve, reject) => {
    const tx = cleanup.transaction("reports", "readwrite");
    tx.objectStore("reports").delete(report.id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
  cleanup.close();
});

test("an owned offline report is immediately eligible for sync after reconnect", async () => {
  await queueReport(report, OWNER);
  let online = false;
  const dependencies = {
    getReporterContext: async () => context(OWNER),
    request: async () => new Response(JSON.stringify({
      id: report.id,
      receivedAt: "2026-11-19T10:05:00.000Z",
      delivery: "received",
    }), { status: 201, headers: { "content-type": "application/json" } }),
    isOnline: () => online,
  };
  const offlineResult = await flushQueued(dependencies);
  assert.equal(offlineResult.pending, null);
  online = true;
  const result = await flushQueued(dependencies);

  assert.deepEqual(result.delivered, [report.id]);
  assert.deepEqual(await listQueued(OWNER), []);
});

test("an ID already owned by another reporter cannot be silently reused", async () => {
  await queueReport(report, OWNER);
  await assert.rejects(queueReport(report, OTHER_OWNER), /different ownership state/);
  assert.deepEqual((await listQueued(OWNER)).map((item) => item.payload), [report]);
  assert.deepEqual(await listQueued(OTHER_OWNER), []);
  await removeQueued(report.id, OWNER);
});

test("the report endpoint rejects an unauthorized reporter without clearing the saved report", async () => {
  await queueReport(report, OWNER);
  let submitted = false;
  const result = await flushQueued({
    getReporterContext: async () => context(OWNER),
    request: async () => {
      submitted = true;
      return new Response(JSON.stringify({ error: { message: "Reporter access denied" } }), {
        status: 403, headers: { "content-type": "application/json" },
      });
    },
    isOnline: () => true,
  });

  assert.equal(submitted, true);
  assert.equal(result.pending, 1);
  assert.match(result.errors[0], /Reporter access denied/);
  assert.equal((await listQueued(OWNER))[0]?.state, "failed");
  await removeQueued(report.id, OWNER);
});

test("outbox verification for reporter A cannot send after the session changes to B", async () => {
  await queueReport(report, OWNER);
  let contextReads = 0;
  let posted = false;
  const result = await flushQueued({
    getReporterContext: async () => (++contextReads === 1 ? context(OWNER) : context(OTHER_OWNER)),
    request: async () => { posted = true; return new Response(null, { status: 201 }); },
    isOnline: () => true,
  });
  assert.equal(posted, false);
  assert.match(result.errors[0], /session changed/i);
  await removeQueued(report.id, OWNER);
});

test("offline flush does not request authentication or contact the server", async () => {
  await queueReport(report, OWNER);
  let contacted = false;

  const result = await flushQueued({
    getReporterContext: async () => { throw new Error("must not read a reporter context while offline"); },
    request: async () => { contacted = true; return new Response(null, { status: 500 }); },
    isOnline: () => false,
  });

  assert.equal(contacted, false);
  assert.deepEqual(result.delivered, []);
  assert.deepEqual(result.failed, []);
  assert.equal(result.pending, null);
  assert.equal((await listQueued(OWNER))[0]?.state, "pending");
  await removeQueued(report.id, OWNER);
});

test("a stalled request times out and remains queued for a safe retry", async () => {
  await queueReport(report, OWNER);
  const result = await flushQueued({
    getReporterContext: async () => context(),
    requestTimeoutMs: 5,
    request: async (_input: RequestInfo | URL, init?: RequestInit) => await new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new Error("request aborted")), { once: true });
    }),
    isOnline: () => true,
  });

  assert.deepEqual(result.failed, [report.id]);
  assert.match(result.errors[0], /request timed out/);
  assert.equal(result.pending, 1);
  assert.equal((await listQueued(OWNER))[0]?.state, "failed");
  await removeQueued(report.id, OWNER);
});

test("an empty outbox does not create a reporter session", async () => {
  let authenticated = false;
  const result = await flushQueued({
    getReporterContext: async () => { authenticated = true; return context(); },
    request: async () => new Response(null, { status: 500 }),
    isOnline: () => true,
  });

  assert.equal(authenticated, false);
  assert.equal(result.pending, 0);
  assert.deepEqual(result.errors, []);
});

test("queued reports survive closing and reopening the IndexedDB connection", async () => {
  await queueReport(report, OWNER);
  const connection = await openOutbox();
  connection.close();

  assert.deepEqual((await listQueued(OWNER)).map((item) => item.payload), [report]);
  await removeQueued(report.id, OWNER);
});

test("same-tab flushes are serialized and do not resend a report after receipt", async () => {
  await queueReport(report, OWNER);
  let requests = 0;
  const sentBodies: unknown[] = [];
  const dependencies = {
    getReporterContext: async () => context(),
    request: async (_input: RequestInfo | URL, init?: RequestInit) => {
      requests += 1;
      sentBodies.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify({
        id: report.id,
        receivedAt: "2026-11-19T10:03:00.000Z",
        delivery: "received",
        duplicate: false,
      }), { status: 201, headers: { "content-type": "application/json" } });
    },
    isOnline: () => true,
  };

  const results = await Promise.all([flushQueued(dependencies), flushQueued(dependencies)]);

  assert.equal(requests, 1);
  assert.deepEqual(sentBodies, [report]);
  assert.deepEqual(results.map((result) => result.delivered), [[report.id], []]);
  assert.deepEqual(results.map((result) => result.pending), [0, 0]);
  assert.deepEqual(await listQueued(OWNER), []);
});

test("separate tab module instances may resend, but matching receipts clear one canonical queue item", async () => {
  const otherTab = await import("../lib/client/outbox.ts?other-tab");
  await queueReport(report, OWNER);
  let requests = 0;
  let releaseRequests!: () => void;
  let bothRequestsStarted!: () => void;
  const requestBarrier = new Promise<void>((resolve) => { releaseRequests = resolve; });
  const bothStarted = new Promise<void>((resolve) => { bothRequestsStarted = resolve; });
  const dependencies = {
    getReporterContext: async () => context(),
    request: async (_input: RequestInfo | URL, init?: RequestInit) => {
      assert.deepEqual(JSON.parse(String(init?.body)), report);
      const requestNumber = ++requests;
      if (requestNumber === 2) bothRequestsStarted();
      await requestBarrier;
      return new Response(JSON.stringify({
        id: report.id,
        receivedAt: "2026-11-19T10:04:00.000Z",
        delivery: "received",
        duplicate: requestNumber > 1,
      }), { status: requestNumber > 1 ? 200 : 201, headers: { "content-type": "application/json" } });
    },
    isOnline: () => true,
  };

  const first = flushQueued(dependencies);
  const second = otherTab.flushQueued(dependencies);
  await bothStarted;
  releaseRequests();
  const results = await Promise.all([first, second]);

  assert.equal(requests, 2);
  assert.deepEqual(results.map((result) => result.delivered), [[report.id], [report.id]]);
  assert.deepEqual(await listQueued(OWNER), []);
});
