import assert from "node:assert/strict";

globalThis.window = {};
const { parseBackupText, summarizeBackup } = await import("../storage.js");

const backup = {
  format: "vehicle-key-control-backup",
  version: 1,
  exportedAt: "2026-08-24T00:00:00.000Z",
  stores: {
    keys: [{ id: "key-1", name: "311", sortOrder: 0 }],
    dutyTypes: [{ id: "duty-1", name: "巡邏", sortOrder: 0 }],
    personnel: [{ id: "person-1", name: "張耀東", sortOrder: 0 }],
    activeUsage: [{
      id: "usage-1",
      keyId: "key-1",
      dutyId: "duty-1",
      personnelId: "person-1",
      checkoutAt: "2026-08-24T00:00:00.000Z",
    }],
    history: [{
      id: "history-1",
      keyId: "key-1",
      keyNameSnapshot: "311",
      checkoutAt: "2026-08-23T00:00:00.000Z",
      returnAt: "2026-08-23T01:00:00.000Z",
    }],
    meta: [{ key: "databaseInfo", schemaVersion: 1 }],
  },
};

const parsed = parseBackupText(JSON.stringify(backup));
const summary = summarizeBackup(parsed);
assert.deepEqual(summary, { keys: 1, dutyTypes: 1, personnel: 1, activeUsage: 1, history: 1 });
console.log("PASS 備份格式解析與摘要");

assert.throws(
  () => parseBackupText(JSON.stringify({ ...backup, version: 99 })),
  /備份格式不支援/,
);
console.log("PASS 不支援的備份版本會被拒絕");

assert.throws(
  () => parseBackupText(JSON.stringify({ ...backup, stores: { ...backup.stores, activeUsage: [{ id: "bad", keyId: "missing", checkoutAt: "now" }] } })),
  /使用中紀錄包含無效/,
);
console.log("PASS 無效鑰匙關聯會被拒絕");

