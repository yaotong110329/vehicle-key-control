const DB_NAME = "key-control-db";
const DB_VERSION = 1;

const STORES = Object.freeze({
  keys: "keys",
  dutyTypes: "dutyTypes",
  personnel: "personnel",
  activeUsage: "activeUsage",
  history: "history",
  meta: "meta",
});

const DEFAULT_KEYS = ["001", "002", "003", "004"];
const DEFAULT_DUTIES = ["一線巡邏", "二線巡邏", "三線巡邏", "備勤", "交通整理"];
const DEFAULT_PERSONNEL = ["張OO", "曾OO", "王OO", "李OO"];
const DEFAULT_APP_SETTINGS = Object.freeze({
  appTitle: "車輛鑰匙控管",
  dashboardTitle: "",
  logoDataUrl: "",
});
const BACKUP_VERSION = 1;
const BACKUP_DATA_STORES = Object.freeze([
  STORES.keys,
  STORES.dutyTypes,
  STORES.personnel,
  STORES.activeUsage,
  STORES.history,
  STORES.meta,
]);

let databasePromise;
const changeChannel = "BroadcastChannel" in window
  ? new BroadcastChannel("key-control-changes")
  : null;

function uuid() {
  return crypto.randomUUID();
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionComplete(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error || new Error("資料庫交易已取消。"));
  });
}

function createEntityStore(database, name) {
  const store = database.createObjectStore(name, { keyPath: "id" });
  store.createIndex("sortOrder", "sortOrder", { unique: false });
  store.createIndex("name", "name", { unique: false });
  return store;
}

function applyMigrations(database, transaction, oldVersion) {
  if (oldVersion < 1) {
    createEntityStore(database, STORES.keys);
    createEntityStore(database, STORES.dutyTypes);
    createEntityStore(database, STORES.personnel);

    const activeStore = database.createObjectStore(STORES.activeUsage, { keyPath: "id" });
    activeStore.createIndex("keyId", "keyId", { unique: true });
    activeStore.createIndex("checkoutAt", "checkoutAt", { unique: false });

    const historyStore = database.createObjectStore(STORES.history, { keyPath: "id" });
    historyStore.createIndex("keyId", "keyId", { unique: false });
    historyStore.createIndex("checkoutAt", "checkoutAt", { unique: false });
    historyStore.createIndex("returnAt", "returnAt", { unique: false });

    database.createObjectStore(STORES.meta, { keyPath: "key" });

    const timestamp = new Date().toISOString();
    const seed = (storeName, names, extra = {}) => {
      const store = transaction.objectStore(storeName);
      names.forEach((name, index) => {
        store.add({
          id: uuid(),
          name,
          sortOrder: index,
          createdAt: timestamp,
          updatedAt: timestamp,
          ...extra,
        });
      });
    };

    seed(STORES.keys, DEFAULT_KEYS, { licensePlate: "", note: "" });
    seed(STORES.dutyTypes, DEFAULT_DUTIES);
    seed(STORES.personnel, DEFAULT_PERSONNEL);
    transaction.objectStore(STORES.meta).add({
      key: "databaseInfo",
      schemaVersion: DB_VERSION,
      seedCompletedAt: timestamp,
    });
  }
}

export function openDatabase() {
  if (databasePromise) return databasePromise;

  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      applyMigrations(request.result, request.transaction, event.oldVersion);
    };

    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => {
        database.close();
        databasePromise = undefined;
      };
      resolve(database);
    };

    request.onerror = () => {
      databasePromise = undefined;
      reject(request.error);
    };

    request.onblocked = () => reject(new Error("資料庫升級被其他分頁阻擋，請關閉其他分頁後重試。"));
  });

  return databasePromise;
}

async function getAll(storeName) {
  const database = await openDatabase();
  const transaction = database.transaction(storeName, "readonly");
  return requestResult(transaction.objectStore(storeName).getAll());
}

async function getById(storeName, id) {
  if (!id) return null;
  const database = await openDatabase();
  const transaction = database.transaction(storeName, "readonly");
  return requestResult(transaction.objectStore(storeName).get(id));
}

function sortEntities(items) {
  return items.sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name, "zh-Hant"));
}

function announceChange(type) {
  changeChannel?.postMessage({ type, at: Date.now() });
}

export function subscribeToChanges(listener) {
  if (!changeChannel) return () => {};
  const handler = (event) => listener(event.data);
  changeChannel.addEventListener("message", handler);
  return () => changeChannel.removeEventListener("message", handler);
}

export async function requestPersistentStorage() {
  if (!navigator.storage?.persist) return false;
  try {
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

export async function getDashboardData() {
  const [keys, activeUsage] = await Promise.all([
    getAll(STORES.keys),
    getAll(STORES.activeUsage),
  ]);
  const usageByKey = new Map(activeUsage.map((usage) => [usage.keyId, usage]));
  return sortEntities(keys).map((key) => ({ key, usage: usageByKey.get(key.id) || null }));
}

export async function getSettingsData() {
  const [keys, dutyTypes, personnel, appSettings] = await Promise.all([
    getAll(STORES.keys),
    getAll(STORES.dutyTypes),
    getAll(STORES.personnel),
    getAppSettings(),
  ]);
  return {
    keys: sortEntities(keys),
    dutyTypes: sortEntities(dutyTypes),
    personnel: sortEntities(personnel),
    appSettings,
  };
}

export async function getAppSettings() {
  const stored = await getById(STORES.meta, "uiSettings");
  if (!stored) return { ...DEFAULT_APP_SETTINGS };
  try {
    return normalizeAppSettings(stored);
  } catch {
    return { ...DEFAULT_APP_SETTINGS };
  }
}

export function normalizeAppSettings(input = {}) {
  const appTitle = String(input.appTitle ?? "").trim() || DEFAULT_APP_SETTINGS.appTitle;
  const dashboardTitle = String(input.dashboardTitle ?? "").trim();
  const logoDataUrl = String(input.logoDataUrl ?? "");
  if (logoDataUrl && !logoDataUrl.startsWith("data:image/")) {
    throw new Error("Logo 必須是圖片檔案。");
  }
  if (logoDataUrl.length > 1_500_000) {
    throw new Error("圖片檔案太大，請選擇 1 MB 以下的圖片。");
  }
  return { key: "uiSettings", appTitle, dashboardTitle, logoDataUrl };
}

export async function saveAppSettings(input) {
  const settings = normalizeAppSettings(input);
  const database = await openDatabase();
  const transaction = database.transaction(STORES.meta, "readwrite");
  transaction.objectStore(STORES.meta).put(settings);
  await transactionComplete(transaction);
  announceChange("app-settings-save");
  return settings;
}

export async function createBackup() {
  const stores = {};
  await Promise.all(BACKUP_DATA_STORES.map(async (storeName) => {
    stores[storeName] = await getAll(storeName);
  }));
  return {
    format: "vehicle-key-control-backup",
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    stores,
  };
}

function assertBackupArray(stores, storeName) {
  if (!Array.isArray(stores?.[storeName])) {
    throw new Error(`備份缺少 ${storeName} 資料。`);
  }
  return stores[storeName];
}

export function validateBackup(backup) {
  if (!backup || backup.format !== "vehicle-key-control-backup" || backup.version !== BACKUP_VERSION) {
    throw new Error("備份格式不支援，請選擇本系統匯出的 JSON 備份檔。");
  }
  const stores = backup.stores;
  const keys = assertBackupArray(stores, STORES.keys);
  const dutyTypes = assertBackupArray(stores, STORES.dutyTypes);
  const personnel = assertBackupArray(stores, STORES.personnel);
  const activeUsage = assertBackupArray(stores, STORES.activeUsage);
  const history = assertBackupArray(stores, STORES.history);
  const meta = assertBackupArray(stores, STORES.meta);
  const ids = new Set();
  const validateEntities = (items, label) => {
    items.forEach((item) => {
      if (!item || typeof item.id !== "string" || !item.id || typeof item.name !== "string" || !item.name.trim()) {
        throw new Error(`${label}備份資料包含無效項目。`);
      }
      if (ids.has(item.id)) throw new Error("備份資料的 ID 重複，無法還原。");
      ids.add(item.id);
    });
  };
  validateEntities(keys, "鑰匙");
  validateEntities(dutyTypes, "勤務");
  validateEntities(personnel, "人員");
  const keyIds = new Set(keys.map((item) => item.id));
  const dutyIds = new Set(dutyTypes.map((item) => item.id));
  const personnelIds = new Set(personnel.map((item) => item.id));
  const activeKeyIds = new Set();
  activeUsage.forEach((usage) => {
    if (!usage?.id || !keyIds.has(usage.keyId) || activeKeyIds.has(usage.keyId)) {
      throw new Error("使用中紀錄包含無效或重複的鑰匙關聯。");
    }
    if (usage.dutyId && !dutyIds.has(usage.dutyId)) throw new Error("使用中紀錄包含無效勤務關聯。");
    if (usage.personnelId && !personnelIds.has(usage.personnelId)) throw new Error("使用中紀錄包含無效人員關聯。");
    if (!usage.checkoutAt) throw new Error("使用中紀錄缺少取用時間。");
    activeKeyIds.add(usage.keyId);
  });
  history.forEach((record) => {
    if (!record?.id || !record.keyId || typeof record.keyNameSnapshot !== "string" || !record.checkoutAt || !record.returnAt) {
      throw new Error("歷史紀錄包含無效項目。");
    }
  });
  if (!meta.some((item) => item?.key === "databaseInfo")) {
    throw new Error("備份缺少資料庫版本資訊。");
  }
  return backup;
}

export function parseBackupText(text) {
  let backup;
  try {
    backup = JSON.parse(text);
  } catch {
    throw new Error("備份檔不是有效的 JSON 格式。");
  }
  return validateBackup(backup);
}

export function summarizeBackup(backup) {
  validateBackup(backup);
  return {
    keys: backup.stores[STORES.keys].length,
    dutyTypes: backup.stores[STORES.dutyTypes].length,
    personnel: backup.stores[STORES.personnel].length,
    activeUsage: backup.stores[STORES.activeUsage].length,
    history: backup.stores[STORES.history].length,
  };
}

export async function restoreBackup(backup) {
  validateBackup(backup);
  const database = await openDatabase();
  const transaction = database.transaction(BACKUP_DATA_STORES, "readwrite");
  BACKUP_DATA_STORES.forEach((storeName) => {
    const store = transaction.objectStore(storeName);
    store.clear();
    backup.stores[storeName].forEach((record) => store.put(record));
  });
  await transactionComplete(transaction);
  announceChange("backup-restore");
}

export async function getUsageOptions() {
  const [dutyTypes, personnel] = await Promise.all([
    getAll(STORES.dutyTypes),
    getAll(STORES.personnel),
  ]);
  return { dutyTypes: sortEntities(dutyTypes), personnel: sortEntities(personnel) };
}

export async function checkoutKey({ keyId, dutyId = null, customDuty = "", personnelId = null, note = "" }) {
  const cleanCustomDuty = customDuty.trim();
  const cleanNote = note.trim();
  if (!cleanCustomDuty && !dutyId && !personnelId && !cleanNote) {
    throw new Error("勤務、人員、補充至少填寫一項。");
  }

  const database = await openDatabase();
  const transaction = database.transaction(
    [STORES.keys, STORES.dutyTypes, STORES.personnel, STORES.activeUsage],
    "readwrite",
  );
  const keyStore = transaction.objectStore(STORES.keys);
  const dutyStore = transaction.objectStore(STORES.dutyTypes);
  const personnelStore = transaction.objectStore(STORES.personnel);
  const activeStore = transaction.objectStore(STORES.activeUsage);

  const usage = await new Promise((resolve, reject) => {
    const requests = [
      { name: "key", request: keyStore.get(keyId) },
      { name: "duty", request: dutyId ? dutyStore.get(dutyId) : null },
      { name: "person", request: personnelId ? personnelStore.get(personnelId) : null },
    ];
    const values = {};
    let remaining = requests.filter((entry) => entry.request).length;
    let settled = false;
    const fail = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    const finish = () => {
      if (settled || remaining > 0) return;
      const key = values.key;
      const duty = values.duty;
      const person = values.person;
      if (!key) return fail(new Error("找不到這把鑰匙，資料可能已在其他分頁變更。"));
      if (dutyId && !duty) return fail(new Error("所選勤務已不存在，請重新選擇。"));
      if (personnelId && !person) return fail(new Error("所選人員已不存在，請重新選擇。"));

      const dutyNameSnapshot = (cleanCustomDuty || duty?.name || "").trim();
      const personnelNameSnapshot = person?.name || "";
      if (!dutyNameSnapshot && !personnelNameSnapshot && !cleanNote) {
        return fail(new Error("勤務、人員、補充至少填寫一項。"));
      }

      const timestamp = new Date().toISOString();
      const nextUsage = {
        id: uuid(),
        keyId,
        dutyId: cleanCustomDuty ? null : duty?.id || null,
        personnelId: person?.id || null,
        dutyNameSnapshot,
        personnelNameSnapshot,
        note: cleanNote,
        checkoutAt: timestamp,
        updatedAt: timestamp,
      };
      const addRequest = activeStore.add(nextUsage);
      addRequest.onerror = () => fail(addRequest.error);
      addRequest.onsuccess = () => {
        if (!settled) {
          settled = true;
          resolve(nextUsage);
        }
      };
    };

    requests.forEach(({ name, request }) => {
      if (!request) {
        values[name] = null;
        return;
      }
      request.onerror = () => fail(request.error);
      request.onsuccess = () => {
        values[name] = request.result;
        remaining -= 1;
        finish();
      };
    });
    finish();
  });

  try {
    await transactionComplete(transaction);
  } catch (error) {
    if (error?.name === "ConstraintError") {
      throw new Error("此鑰匙已被其他分頁取用，畫面將重新整理。");
    }
    throw error;
  }
  announceChange("checkout");
  return usage;
}

export async function updateActiveUsage({ id, dutyId = null, customDuty = "", personnelId = null, note = "" }) {
  const [duty, person] = await Promise.all([
    getById(STORES.dutyTypes, dutyId),
    getById(STORES.personnel, personnelId),
  ]);
  if (dutyId && !duty) throw new Error("所選勤務已不存在，請重新選擇。");
  if (personnelId && !person) throw new Error("所選人員已不存在，請重新選擇。");

  const dutyNameSnapshot = (customDuty || duty?.name || "").trim();
  const personnelNameSnapshot = person?.name || "";
  const cleanNote = note.trim();
  if (!dutyNameSnapshot && !personnelNameSnapshot && !cleanNote) {
    throw new Error("勤務、人員、補充至少填寫一項。");
  }

  const database = await openDatabase();
  const transaction = database.transaction(STORES.activeUsage, "readwrite");
  const store = transaction.objectStore(STORES.activeUsage);

  await new Promise((resolve, reject) => {
    const request = store.get(id);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const current = request.result;
      if (!current) {
        reject(new Error("這筆使用中資料已不存在，可能已在其他分頁完成歸還。"));
        return;
      }
      const nextDutyNameSnapshot = customDuty
        ? customDuty.trim()
        : current.dutyId === dutyId && dutyId
          ? current.dutyNameSnapshot
          : duty?.name || "";
      const nextPersonnelNameSnapshot = current.personnelId === personnelId && personnelId
        ? current.personnelNameSnapshot
        : person?.name || "";
      store.put({
        ...current,
        dutyId: customDuty ? null : duty?.id || null,
        personnelId: person?.id || null,
        dutyNameSnapshot: nextDutyNameSnapshot,
        personnelNameSnapshot: nextPersonnelNameSnapshot,
        note: cleanNote,
        updatedAt: new Date().toISOString(),
      });
      resolve();
    };
  });
  await transactionComplete(transaction);
  announceChange("usage-update");
}

export async function returnKey(keyId) {
  const database = await openDatabase();
  const transaction = database.transaction(
    [STORES.keys, STORES.activeUsage, STORES.history],
    "readwrite",
  );
  const keyStore = transaction.objectStore(STORES.keys);
  const activeStore = transaction.objectStore(STORES.activeUsage);
  const historyStore = transaction.objectStore(STORES.history);

  const result = await new Promise((resolve, reject) => {
    const usageRequest = activeStore.index("keyId").get(keyId);
    usageRequest.onerror = () => reject(usageRequest.error);
    usageRequest.onsuccess = () => {
      const usage = usageRequest.result;
      if (!usage) {
        reject(new Error("此鑰匙已不在使用中，畫面將重新整理。"));
        return;
      }

      const keyRequest = keyStore.get(keyId);
      keyRequest.onerror = () => reject(keyRequest.error);
      keyRequest.onsuccess = () => {
        const key = keyRequest.result;
        const history = {
          id: uuid(),
          keyId,
          keyNameSnapshot: key?.name || "已刪除鑰匙",
          dutyId: usage.dutyId || null,
          dutyNameSnapshot: usage.dutyNameSnapshot || "",
          personnelId: usage.personnelId || null,
          personnelNameSnapshot: usage.personnelNameSnapshot || "",
          note: usage.note || "",
          checkoutAt: usage.checkoutAt,
          returnAt: new Date().toISOString(),
        };
        historyStore.add(history);
        activeStore.delete(usage.id);
        resolve({ history, keyName: key?.name || "鑰匙" });
      };
    };
  });

  await transactionComplete(transaction);
  announceChange("return");
  return result;
}

export async function getHistory() {
  const records = await getAll(STORES.history);
  return records.sort((left, right) => right.returnAt.localeCompare(left.returnAt));
}

function entityLabel(storeName) {
  if (storeName === STORES.keys) return "鑰匙";
  if (storeName === STORES.dutyTypes) return "勤務";
  return "人員";
}

function validateStoreName(storeName) {
  if (![STORES.keys, STORES.dutyTypes, STORES.personnel].includes(storeName)) {
    throw new Error("不支援的設定資料類型。");
  }
}

export async function saveEntity(storeName, input) {
  validateStoreName(storeName);
  const name = String(input.name ?? "").trim();
  if (!name) throw new Error(`${entityLabel(storeName)}名稱不可空白。`);

  const database = await openDatabase();
  const transaction = database.transaction(storeName, "readwrite");
  const store = transaction.objectStore(storeName);
  const entity = await new Promise((resolve, reject) => {
    const request = store.getAll();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const entities = request.result || [];
      const duplicate = entities.find(
        (candidate) => candidate.id !== input.id
          && candidate.name.trim().toLocaleLowerCase("zh-Hant") === name.toLocaleLowerCase("zh-Hant"),
      );
      if (duplicate) {
        reject(new Error(`${entityLabel(storeName)}名稱不可重複。`));
        return;
      }

      const current = input.id ? entities.find((candidate) => candidate.id === input.id) : null;
      if (input.id && !current) {
        reject(new Error(`${entityLabel(storeName)}已不存在，資料可能已在其他分頁變更。`));
        return;
      }
      const timestamp = new Date().toISOString();
      const nextEntity = {
        ...(current || {}),
        id: current?.id || uuid(),
        name,
        sortOrder: current?.sortOrder ?? entities.length,
        createdAt: current?.createdAt || timestamp,
        updatedAt: timestamp,
      };
      if (storeName === STORES.keys) {
        nextEntity.licensePlate = String(input.licensePlate ?? "").trim();
        nextEntity.note = String(input.note ?? "").trim();
      }
      store.put(nextEntity);
      resolve(nextEntity);
    };
  });
  await transactionComplete(transaction);
  announceChange(`${storeName}-save`);
  return entity;
}

export async function bulkAddEntities(storeName, names) {
  validateStoreName(storeName);
  const uniqueNames = [];
  const seen = new Set();
  names.forEach((rawName) => {
    const name = String(rawName ?? "").trim();
    const key = name.toLocaleLowerCase("zh-Hant");
    if (name && !seen.has(key)) {
      seen.add(key);
      uniqueNames.push(name);
    }
  });
  if (!uniqueNames.length) return { added: [], duplicates: [] };

  const database = await openDatabase();
  const transaction = database.transaction(storeName, "readwrite");
  const store = transaction.objectStore(storeName);
  const timestamp = new Date().toISOString();
  let added = [];
  let duplicates = [];

  await new Promise((resolve, reject) => {
    const request = store.getAll();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const current = request.result || [];
      const existing = new Set(current.map((entity) => entity.name.trim().toLocaleLowerCase("zh-Hant")));
      let nextOrder = current.reduce((max, entity) => Math.max(max, Number(entity.sortOrder) || 0), -1) + 1;
      const newEntities = [];

      uniqueNames.forEach((name) => {
        const key = name.toLocaleLowerCase("zh-Hant");
        if (existing.has(key)) {
          duplicates.push(name);
          return;
        }
        const entity = {
          id: uuid(),
          name,
          sortOrder: nextOrder,
          createdAt: timestamp,
          updatedAt: timestamp,
        };
        if (storeName === STORES.keys) {
          entity.licensePlate = "";
          entity.note = "";
        }
        existing.add(key);
        newEntities.push(entity);
        nextOrder += 1;
      });

      newEntities.forEach((entity) => store.add(entity));
      added = newEntities;
      resolve();
    };
  });

  await transactionComplete(transaction);
  if (added.length) announceChange(`${storeName}-bulk-add`);
  return { added, duplicates };
}

export async function deleteEntity(storeName, id) {
  validateStoreName(storeName);
  const database = await openDatabase();
  const transaction = database.transaction([storeName, STORES.activeUsage], "readwrite");
  const entityStore = transaction.objectStore(storeName);
  const activeStore = transaction.objectStore(STORES.activeUsage);
  await new Promise((resolve, reject) => {
    const entityRequest = entityStore.get(id);
    const activeRequest = activeStore.getAll();
    let entity;
    let activeUsage;
    let remaining = 2;
    let settled = false;
    const fail = (error) => {
      if (!settled) {
        settled = true;
        reject(error);
      }
    };
    const finish = () => {
      if (settled || remaining > 0) return;
      if (!entity) return fail(new Error(`${entityLabel(storeName)}已不存在。`));
      const isReferenced = activeUsage.some((usage) => {
        if (storeName === STORES.keys) return usage.keyId === id;
        if (storeName === STORES.dutyTypes) return usage.dutyId === id;
        return usage.personnelId === id;
      });
      if (isReferenced) {
        if (storeName === STORES.keys) {
          return fail(new Error("此鑰匙目前使用中，請先完成歸還後再刪除。"));
        }
        return fail(new Error(`此${entityLabel(storeName)}正被使用中紀錄引用，請先完成歸還後再刪除。`));
      }
      const deleteRequest = entityStore.delete(id);
      deleteRequest.onerror = () => fail(deleteRequest.error);
      deleteRequest.onsuccess = () => {
        if (!settled) {
          settled = true;
          resolve();
        }
      };
    };
    entityRequest.onerror = () => fail(entityRequest.error);
    entityRequest.onsuccess = () => {
      entity = entityRequest.result;
      remaining -= 1;
      finish();
    };
    activeRequest.onerror = () => fail(activeRequest.error);
    activeRequest.onsuccess = () => {
      activeUsage = activeRequest.result || [];
      remaining -= 1;
      finish();
    };
  });
  await transactionComplete(transaction);
  await normalizeSortOrder(storeName);
  announceChange(`${storeName}-delete`);
}

async function normalizeSortOrder(storeName) {
  const entities = sortEntities(await getAll(storeName));
  const database = await openDatabase();
  const transaction = database.transaction(storeName, "readwrite");
  const store = transaction.objectStore(storeName);
  entities.forEach((entity, index) => store.put({ ...entity, sortOrder: index }));
  await transactionComplete(transaction);
}

export async function moveEntity(storeName, id, direction) {
  validateStoreName(storeName);
  const entities = sortEntities(await getAll(storeName));
  const index = entities.findIndex((entity) => entity.id === id);
  const targetIndex = index + direction;
  if (index < 0 || targetIndex < 0 || targetIndex >= entities.length) return;

  [entities[index], entities[targetIndex]] = [entities[targetIndex], entities[index]];
  const timestamp = new Date().toISOString();
  const database = await openDatabase();
  const transaction = database.transaction(storeName, "readwrite");
  const store = transaction.objectStore(storeName);
  entities.forEach((entity, sortOrder) => store.put({ ...entity, sortOrder, updatedAt: timestamp }));
  await transactionComplete(transaction);
  announceChange(`${storeName}-move`);
}

export const storeNames = STORES;
