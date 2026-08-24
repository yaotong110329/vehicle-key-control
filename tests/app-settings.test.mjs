import assert from "node:assert/strict";

// This test imports a browser module only for its pure settings normalizer.
// Browser globals are supplied here because storage.js creates BroadcastChannel conditionally.
globalThis.window = {};
const { normalizeAppSettings } = await import("../storage.js");

function test(name, callback) {
  try {
    callback();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

test("介面設定套用預設系統標題並允許留白總覽標題", () => {
  const settings = normalizeAppSettings({ dashboardTitle: "   " });
  assert.equal(settings.appTitle, "車輛鑰匙控管");
  assert.equal(settings.dashboardTitle, "");
  assert.equal(settings.logoDataUrl, "");
});

test("介面設定保留合法圖片 Data URL", () => {
  const settings = normalizeAppSettings({
    appTitle: "值班控制台",
    dashboardTitle: "今日鑰匙狀態",
    logoDataUrl: "data:image/png;base64,AAAA",
  });
  assert.equal(settings.appTitle, "值班控制台");
  assert.equal(settings.dashboardTitle, "今日鑰匙狀態");
  assert.equal(settings.logoDataUrl, "data:image/png;base64,AAAA");
});

test("介面設定拒絕非圖片 Data URL", () => {
  assert.throws(
    () => normalizeAppSettings({ logoDataUrl: "data:text/plain;base64,AAAA" }),
    /Logo 必須是圖片檔案/,
  );
});
