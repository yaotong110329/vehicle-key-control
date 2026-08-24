const DEFAULT_HEADERS = Object.freeze({
  personnel: ["姓名", "人員", "人員姓名", "員警", "員警姓名", "名稱"],
  dutyTypes: ["勤務", "勤務名稱", "勤務項目", "工作", "工作項目", "名稱"],
});

const CONFIG = Object.freeze({
  personnel: {
    title: "匯入人員",
    description: "請從 Excel 複製人員名單後，直接貼到下方。",
    placeholder: "在此貼上 Excel 資料",
    unit: "人員",
    confirmLabel: (count) => `匯入 ${count} 名人員`,
    headerAliases: DEFAULT_HEADERS.personnel,
    previewLabel: "可新增人員預覽",
    success: (count) => `已匯入 ${count} 名人員`,
  },
  dutyTypes: {
    title: "匯入勤務",
    description: "請從 Excel 複製勤務名單後，直接貼到下方。",
    placeholder: "在此貼上 Excel 資料",
    unit: "勤務",
    confirmLabel: (count) => `匯入 ${count} 個勤務`,
    headerAliases: DEFAULT_HEADERS.dutyTypes,
    previewLabel: "可新增勤務預覽",
    success: (count) => `已匯入 ${count} 個勤務`,
  },
});

export function getBulkImportConfig(storeName) {
  const config = CONFIG[storeName];
  if (!config) throw new Error("不支援的批次匯入類型。");
  return config;
}

export function normalizeImportValue(value) {
  return String(value ?? "").replace(/^\uFEFF/, "").trim();
}

function comparisonKey(value) {
  return normalizeImportValue(value).toLocaleLowerCase("zh-Hant");
}

function isBlankRow(cells) {
  return cells.every((cell) => normalizeImportValue(cell) === "");
}

function splitLines(text) {
  return String(text ?? "").split(/\r\n|\n|\r/);
}

export function parseClipboardTable(text, { headerAliases = [] } = {}) {
  const aliases = new Set(headerAliases.map(comparisonKey));
  const rows = [];
  let totalRead = 0;

  splitLines(text).forEach((line, index) => {
    const cells = line.split("\t");
    if (isBlankRow(cells)) return;

    const firstCell = normalizeImportValue(cells[0]);
    if (aliases.has(comparisonKey(firstCell))) return;

    totalRead += 1;
    rows.push({
      lineNumber: index + 1,
      value: firstCell,
      isValid: Boolean(firstCell),
    });
  });

  return { rows, totalRead };
}

export function validateImportRows(parsed, existingNames = []) {
  const existing = new Set(existingNames.map(comparisonKey));
  const seen = new Set();
  const canAdd = [];
  const duplicates = [];
  const invalid = [];

  parsed.rows.forEach((row) => {
    const value = normalizeImportValue(row.value);
    if (!row.isValid || !value) {
      invalid.push({ ...row, reason: "無法取得名稱" });
      return;
    }

    const key = comparisonKey(value);
    if (existing.has(key) || seen.has(key)) {
      duplicates.push({
        ...row,
        value,
        reason: existing.has(key) ? "目前資料已存在" : "貼上內容重複",
      });
      return;
    }

    seen.add(key);
    canAdd.push({ ...row, value });
  });

  return {
    totalRead: parsed.totalRead,
    canAdd,
    duplicates,
    invalid,
  };
}

export function analyzeClipboardImport(text, { headerAliases = [], existingNames = [] } = {}) {
  const parsed = parseClipboardTable(text, { headerAliases });
  return validateImportRows(parsed, existingNames);
}
