import assert from "node:assert/strict";
import { analyzeClipboardImport } from "../bulk-import.js";

const personnelHeaders = ["姓名", "人員", "人員姓名", "員警", "員警姓名", "名稱"];
const dutyHeaders = ["勤務", "勤務名稱", "勤務項目", "工作", "工作項目", "名稱"];

function analyze(text, existingNames = [], headerAliases = personnelHeaders) {
  return analyzeClipboardImport(text, { existingNames, headerAliases });
}

function test(name, callback) {
  callback();
  console.log(`PASS ${name}`);
}

test("單欄資料保留順序並忽略最後換行", () => {
  const result = analyze("張耀東\r\n張嘉峻\r\n曾志達\r\n廖裕鈞\r\n");
  assert.equal(result.totalRead, 4);
  assert.deepEqual(result.canAdd.map((row) => row.value), ["張耀東", "張嘉峻", "曾志達", "廖裕鈞"]);
});

test("人員標題列會略過", () => {
  const result = analyze("姓名\n張耀東\n張嘉峻\n");
  assert.equal(result.totalRead, 2);
  assert.deepEqual(result.canAdd.map((row) => row.value), ["張耀東", "張嘉峻"]);
});

test("勤務標題列與 Tab 多欄只取第一欄", () => {
  const result = analyze("勤務名稱\t備註\r\n巡邏\tA 組\r\n備勤\tB 組", [], dutyHeaders);
  assert.equal(result.totalRead, 2);
  assert.deepEqual(result.canAdd.map((row) => row.value), ["巡邏", "備勤"]);
});

test("前後空白會 trim，既有名稱會列為重複", () => {
  const result = analyze("  張耀東  \n張嘉峻\n", ["張耀東"]);
  assert.equal(result.totalRead, 2);
  assert.deepEqual(result.canAdd.map((row) => row.value), ["張嘉峻"]);
  assert.deepEqual(result.duplicates.map((row) => row.value), ["張耀東"]);
});

test("貼上內容內重複只保留第一次", () => {
  const result = analyze("巡邏\n 巡邏 \n備勤", [], dutyHeaders);
  assert.deepEqual(result.canAdd.map((row) => row.value), ["巡邏", "備勤"]);
  assert.deepEqual(result.duplicates.map((row) => row.value), ["巡邏"]);
});

test("空白列忽略，第一欄空白但其他欄有值視為無效", () => {
  const result = analyze("張耀東\tA 組\n\t只有備註\n   \n張嘉峻\tB 組\n");
  assert.equal(result.totalRead, 3);
  assert.deepEqual(result.canAdd.map((row) => row.value), ["張耀東", "張嘉峻"]);
  assert.equal(result.invalid.length, 1);
});

test("只有標題或空白時沒有可新增資料", () => {
  const result = analyze("\r\n人員姓名\r\n\r\n");
  assert.equal(result.totalRead, 0);
  assert.equal(result.canAdd.length, 0);
  assert.equal(result.invalid.length, 0);
});
