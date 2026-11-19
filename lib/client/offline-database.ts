type StoredReport = {
  payload: { id: string };
  reporterId?: string | null;
  storageVersion?: number;
  ownerUserId?: string | null;
  ownershipState?: "owned" | "unowned";
  [key: string]: unknown;
};

const DATABASE = "signa-offline-v1";
const DATABASE_VERSION = 4;

export function openOfflineDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("Local report storage is unavailable in this browser."));
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, DATABASE_VERSION);
    let wasBlocked = false;

    request.onupgradeneeded = (event) => {
      const db = request.result;
      if (!db.objectStoreNames.contains("reports")) {
        db.createObjectStore("reports", { keyPath: "payload.id" });
      }
      if (!db.objectStoreNames.contains("evidence")) {
        db.createObjectStore("evidence", { keyPath: "evidenceId" });
      }

      if (event.oldVersion >= DATABASE_VERSION) return;
      const transaction = request.transaction;
      if (!transaction) return;

      const cursorRequest = transaction.objectStore("reports").openCursor();
      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        if (!cursor) return;

        const record = cursor.value as StoredReport;
        if (record.storageVersion !== 2) {
          const reporterId = typeof record.reporterId === "string" && record.reporterId.trim()
            ? record.reporterId
            : null;
          const { reporterId: _legacyReporterId, ...preserved } = record;
          cursor.update({
            ...preserved,
            storageVersion: 2,
            ownerUserId: reporterId,
            ownershipState: reporterId ? "owned" : "unowned",
          });
        }
        cursor.continue();
      };
    };

    request.onerror = () => reject(request.error ?? new Error("Local report storage is unavailable in this browser."));
    request.onblocked = () => {
      wasBlocked = true;
      reject(new Error("Local report storage is busy in another Signa tab. Close older tabs and try again."));
    };
    request.onsuccess = () => {
      if (wasBlocked) {
        request.result.close();
        return;
      }
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
  });
}
