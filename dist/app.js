import {
  bulkAddEntities,
  checkoutKey,
  createBackup,
  deleteEntity,
  getDashboardData,
  getAppSettings,
  getHistory,
  getSettingsData,
  getUsageOptions,
  moveEntity,
  openDatabase,
  requestPersistentStorage,
  parseBackupText,
  restoreBackup,
  returnKey,
  saveEntity,
  saveAppSettings,
  summarizeBackup,
  storeNames,
  subscribeToChanges,
  updateActiveUsage,
} from "./storage.js";
import { analyzeClipboardImport, getBulkImportConfig } from "./bulk-import.js";
import { renderDashboard, renderStatusSummary } from "./components.js";
import { renderHistory } from "./history.js";
import { openConfirmModal, openModal } from "./modal.js";
import { renderSettings } from "./settings.js";
import { createElement, debounce, formatClock, formatHeaderDate } from "./utils.js";

const appRoot = document.querySelector("#app");
const navButtons = [...document.querySelectorAll("[data-view]")];
const dateElement = document.querySelector("#current-date");
const timeElement = document.querySelector("#current-time");
const headerSummaryElement = document.querySelector("#header-summary");
const toastRegion = document.querySelector("#toast-region");

let currentView = "dashboard";
let toastTimer;

const DEFAULT_LOGO_SRC = "./assets/default-logo.png";


function applyAppSettings(settings = {}) {
  const title = settings.appTitle?.trim() || "車輛鑰匙控管";
  document.querySelector(".brand-title").textContent = title;
  document.title = title;
  const brandMark = document.querySelector(".brand-mark");
  brandMark.replaceChildren();
  if (settings.logoDataUrl) {
    const image = createElement("img", { attributes: { src: settings.logoDataUrl, alt: `${title} Logo` } });
    brandMark.append(image);
  } else {
    const image = createElement("img", { attributes: { src: DEFAULT_LOGO_SRC, alt: `${title} Logo` } });
    brandMark.append(image);
  }
}

function updateClock() {
  const now = new Date();
  dateElement.textContent = formatHeaderDate(now);
  timeElement.textContent = formatClock(now);
}

function setActiveNavigation() {
  navButtons.forEach((button) => {
    const active = button.dataset.view === currentView;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-current", active ? "page" : "false");
  });
}

function showToast(message, tone = "success") {
  clearTimeout(toastTimer);
  toastRegion.replaceChildren();
  const toast = createElement("div", {
    className: `toast toast--${tone}`,
    attributes: { role: tone === "error" ? "alert" : "status" },
  });
  toast.append(createElement("span", { className: "toast__icon", text: tone === "error" ? "!" : "✓" }));
  toast.append(createElement("span", { text: message }));
  toastRegion.append(toast);
  requestAnimationFrame(() => toast.classList.add("is-visible"));
  toastTimer = setTimeout(() => {
    toast.classList.remove("is-visible");
    setTimeout(() => toast.remove(), 180);
  }, 2200);
}

function renderLoading() {
  const loader = createElement("div", { className: "loading-state" });
  loader.append(createElement("span", { className: "loading-spinner" }));
  loader.append(createElement("p", { text: "正在讀取本機資料…" }));
  appRoot.replaceChildren(loader);
}

function renderFatalError(error) {
  const panel = createElement("div", { className: "error-state" });
  panel.append(createElement("div", { className: "error-state__icon", text: "!" }));
  panel.append(createElement("h1", { text: "無法讀取本機資料" }));
  panel.append(createElement("p", { text: error?.message || "發生未預期的錯誤。" }));
  const retry = createElement("button", { className: "button button--primary", text: "重新載入", attributes: { type: "button" } });
  retry.addEventListener("click", () => location.reload());
  panel.append(retry);
  appRoot.replaceChildren(panel);
}

function createChoiceButton(label, selected, onClick) {
  const button = createElement("button", {
    className: `choice-chip ${selected ? "is-selected" : ""}`,
    attributes: { type: "button", "aria-pressed": selected },
  });
  button.append(createElement("span", { className: "choice-chip__check", text: "✓" }));
  button.append(document.createTextNode(label));
  button.addEventListener("click", onClick);
  return button;
}

async function openUsageEditor(item) {
  const options = await getUsageOptions();
  const editing = Boolean(item.usage);
  let selectedDutyId = item.usage?.dutyId || null;
  let selectedPersonnelId = item.usage?.personnelId || null;
  let customDuty = item.usage && !item.usage.dutyId ? item.usage.dutyNameSnapshot : "";

  const form = createElement("form", { className: "usage-form" });
  form.addEventListener("submit", (event) => event.preventDefault());

  const dutySection = createElement("fieldset", { className: "form-section" });
  const dutyLegend = createElement("legend");
  dutyLegend.append(document.createTextNode("勤務"));
  dutyLegend.append(createElement("span", { text: " 選填一項" }));
  dutySection.append(dutyLegend);
  const dutyGrid = createElement("div", { className: "choice-grid" });
  dutySection.append(dutyGrid);

  const customField = createElement("label", { className: "field custom-duty-field" });
  customField.append(createElement("span", { text: "選單沒有需要的勤務？可單次自行輸入" }));
  const customInput = createElement("input", {
    attributes: {
      type: "text",
      maxlength: "60",
      placeholder: "例如：臨時支援、護送勤務",
      value: customDuty,
      "data-autofocus": editing ? null : "true",
    },
  });
  customField.append(customInput);
  dutySection.append(customField);

  const personnelSection = createElement("fieldset", { className: "form-section" });
  const personnelLegend = createElement("legend");
  personnelLegend.append(document.createTextNode("人員"));
  personnelLegend.append(createElement("span", { text: " 最多一人" }));
  personnelSection.append(personnelLegend);
  const personnelGrid = createElement("div", { className: "choice-grid" });
  personnelSection.append(personnelGrid);

  const noteField = createElement("label", { className: "field" });
  noteField.append(createElement("span", { text: "其他 / 補充" }));
  const noteInput = createElement("textarea", {
    attributes: { rows: "3", maxlength: "160", placeholder: "輸入用途、單位或其他說明" },
  });
  noteInput.value = item.usage?.note || "";
  noteField.append(noteInput);

  form.append(dutySection, personnelSection, noteField);
  let modalApi;

  const isValid = () => Boolean(customInput.value.trim() || selectedDutyId || selectedPersonnelId || noteInput.value.trim());
  const syncValidity = () => modalApi?.setValid(isValid());

  const drawDuties = () => {
    dutyGrid.replaceChildren();
    if (!options.dutyTypes.length) {
      dutyGrid.append(createElement("p", { className: "choice-empty", text: "尚無快速勤務，可使用下方單次輸入。" }));
      return;
    }
    options.dutyTypes.forEach((duty) => {
      dutyGrid.append(createChoiceButton(duty.name, duty.id === selectedDutyId, () => {
        selectedDutyId = duty.id === selectedDutyId ? null : duty.id;
        if (selectedDutyId) {
          customDuty = "";
          customInput.value = "";
        }
        drawDuties();
        syncValidity();
      }));
    });
  };

  const drawPersonnel = () => {
    personnelGrid.replaceChildren();
    if (!options.personnel.length) {
      personnelGrid.append(createElement("p", { className: "choice-empty", text: "尚無人員名單，可只填勤務或補充。" }));
      return;
    }
    options.personnel.forEach((person) => {
      personnelGrid.append(createChoiceButton(person.name, person.id === selectedPersonnelId, () => {
        selectedPersonnelId = person.id === selectedPersonnelId ? null : person.id;
        drawPersonnel();
        syncValidity();
      }));
    });
  };

  customInput.addEventListener("input", () => {
    customDuty = customInput.value;
    if (customInput.value.trim() && selectedDutyId) {
      selectedDutyId = null;
      drawDuties();
    }
    syncValidity();
  });
  noteInput.addEventListener("input", syncValidity);
  drawDuties();
  drawPersonnel();

  modalApi = openModal({
    title: `${item.key.name} 鑰匙${editing ? "資料編輯" : "取用"}`,
    subtitle: editing ? "可補填資料，原始取用時間會保留。" : "勤務、人員、補充至少填寫一項。",
    content: form,
    primaryLabel: editing ? "儲存變更" : "確認取用",
    initialValid: isValid(),
    onConfirm: async () => {
      const payload = {
        dutyId: selectedDutyId,
        customDuty: customInput.value.trim(),
        personnelId: selectedPersonnelId,
        note: noteInput.value,
      };
      if (editing) {
        await updateActiveUsage({ id: item.usage.id, ...payload });
        showToast(`${item.key.name} 使用資料已更新`);
      } else {
        await checkoutKey({ keyId: item.key.id, ...payload });
        showToast(`${item.key.name} 鑰匙已取用`);
      }
      await renderCurrentView();
    },
  });
}

function settingLabel(storeName) {
  if (storeName === storeNames.keys) return "鑰匙";
  if (storeName === storeNames.dutyTypes) return "勤務";
  return "人員";
}

function openEntityEditor(storeName, entity = null) {
  const label = settingLabel(storeName);
  const form = createElement("form", { className: "entity-form" });
  form.addEventListener("submit", (event) => event.preventDefault());
  const nameField = createElement("label", { className: "field" });
  nameField.append(createElement("span", { text: `${label}名稱 / 編號` }));
  const nameInput = createElement("input", {
    attributes: { type: "text", maxlength: "60", value: entity?.name || "", "data-autofocus": "true" },
  });
  nameField.append(nameInput);
  form.append(nameField);

  let plateInput;
  let noteInput;
  if (storeName === storeNames.keys) {
    plateInput = createElement("input", { attributes: { type: "text", maxlength: "30", value: entity?.licensePlate || "", placeholder: "選填" } });
    const plateField = createElement("label", { className: "field" });
    plateField.append(createElement("span", { text: "車牌號碼" }), plateInput);
    noteInput = createElement("textarea", { attributes: { rows: "3", maxlength: "120", placeholder: "選填" } });
    noteInput.value = entity?.note || "";
    const keyNoteField = createElement("label", { className: "field" });
    keyNoteField.append(createElement("span", { text: "備註" }), noteInput);
    form.append(plateField, keyNoteField);
  }

  let modalApi;
  nameInput.addEventListener("input", () => modalApi?.setValid(Boolean(nameInput.value.trim())));
  modalApi = openModal({
    title: `${entity ? "編輯" : "新增"}${label}`,
    subtitle: entity ? "修改名稱不會回寫既有使用中或歷史快照。" : "名稱建立後仍可隨時修改。",
    content: form,
    primaryLabel: entity ? "儲存變更" : `新增${label}`,
    initialValid: Boolean(nameInput.value.trim()),
    onConfirm: async () => {
      await saveEntity(storeName, {
        id: entity?.id,
        name: nameInput.value,
        licensePlate: plateInput?.value || "",
        note: noteInput?.value || "",
      });
      showToast(`${label}已${entity ? "更新" : "新增"}`);
      await renderCurrentView();
    },
  });
}

async function openBulkImportModal(storeName) {
  const config = getBulkImportConfig(storeName);
  const settings = await getSettingsData();
  const existingNames = settings[storeName].map((entity) => entity.name);
  const form = createElement("form", { className: "bulk-import-form" });
  form.addEventListener("submit", (event) => event.preventDefault());

  const pasteField = createElement("label", { className: "field" });
  pasteField.append(createElement("span", { text: "Excel 資料" }));
  const textarea = createElement("textarea", {
    className: "bulk-import-textarea",
    attributes: { rows: "7", placeholder: config.placeholder, "data-autofocus": "true" },
  });
  pasteField.append(textarea);

  const resultTitle = createElement("h3", { className: "import-result-title", text: "解析結果" });
  const stats = createElement("div", { className: "import-stats" });
  const previewPanel = createElement("div", { className: "import-preview-panel" });
  const duplicatePanel = createElement("div", { className: "import-detail-panel", hidden: true });
  const invalidPanel = createElement("div", { className: "import-detail-panel import-detail-panel--invalid", hidden: true });
  form.append(pasteField, resultTitle, stats, previewPanel, duplicatePanel, invalidPanel);

  let analysis = analyzeClipboardImport("", {
    headerAliases: config.headerAliases,
    existingNames,
  });
  let modalApi;

  function appendStat(label, value, tone = "") {
    const stat = createElement("div", { className: `import-stat ${tone ? `import-stat--${tone}` : ""}` });
    stat.append(createElement("span", { text: label }), createElement("strong", { text: String(value) }));
    stats.append(stat);
  }

  function createNameList(names, className = "import-name-list") {
    const list = createElement("ul", { className });
    names.forEach((name) => list.append(createElement("li", { text: name })));
    return list;
  }

  function renderPreview() {
    analysis = analyzeClipboardImport(textarea.value, {
      headerAliases: config.headerAliases,
      existingNames,
    });
    stats.replaceChildren();
    appendStat("共讀取", analysis.totalRead);
    appendStat("可新增", analysis.canAdd.length, "success");
    appendStat("重複", analysis.duplicates.length, analysis.duplicates.length ? "warning" : "");
    appendStat("無效", analysis.invalid.length, analysis.invalid.length ? "danger" : "");

    previewPanel.replaceChildren();
    if (analysis.canAdd.length) {
      previewPanel.append(createElement("p", { className: "import-panel-title", text: config.previewLabel }));
      previewPanel.append(createNameList(analysis.canAdd.map((row) => row.value)));
    } else {
      previewPanel.append(createElement("p", { className: "import-panel-empty", text: "目前沒有可新增資料" }));
    }

    duplicatePanel.replaceChildren();
    duplicatePanel.hidden = !analysis.duplicates.length;
    if (analysis.duplicates.length) {
      duplicatePanel.append(createElement("p", { className: "import-panel-title", text: `${analysis.duplicates.length} 筆已存在或在貼上內容中重複，匯入時將自動略過。` }));
      duplicatePanel.append(createNameList(analysis.duplicates.slice(0, 12).map((row) => row.value), "import-name-list import-name-list--muted"));
      if (analysis.duplicates.length > 12) duplicatePanel.append(createElement("p", { className: "import-more", text: `另有 ${analysis.duplicates.length - 12} 筆未列出` }));
    }

    invalidPanel.replaceChildren();
    invalidPanel.hidden = !analysis.invalid.length;
    if (analysis.invalid.length) {
      invalidPanel.append(createElement("p", { className: "import-panel-title", text: `${analysis.invalid.length} 筆無法取得${config.unit}名稱，將自動略過。` }));
      invalidPanel.append(createNameList(analysis.invalid.map((row) => `第 ${row.lineNumber} 列`), "import-name-list import-name-list--muted"));
    }

    modalApi?.setValid(analysis.canAdd.length > 0);
    modalApi?.setPrimaryLabel(config.confirmLabel(analysis.canAdd.length));
  }

  textarea.addEventListener("input", renderPreview);
  modalApi = openModal({
    title: config.title,
    subtitle: config.description,
    content: form,
    primaryLabel: config.confirmLabel(0),
    tertiaryLabel: "清除",
    initialValid: false,
    onTertiary: () => {
      textarea.value = "";
      renderPreview();
      textarea.focus();
    },
    onConfirm: async () => {
      const result = await bulkAddEntities(storeName, analysis.canAdd.map((row) => row.value));
      if (!result.added.length) throw new Error("可新增資料已在其他分頁匯入，請重新解析目前內容。");
      showToast(config.success(result.added.length));
      await renderCurrentView();
    },
  });
  renderPreview();
}

async function exportBackupFile() {
  try {
    const backup = await createBackup();
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = createElement("a", {
      attributes: {
        href: url,
        download: `vehicle-key-control-backup-${new Date().toISOString().slice(0, 10)}.json`,
      },
    });
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast("備份檔已下載");
  } catch (error) {
    showToast(error.message, "error");
  }
}

function openBackupImportModal() {
  const form = createElement("form", { className: "backup-import-form" });
  form.addEventListener("submit", (event) => event.preventDefault());
  const fileField = createElement("label", { className: "field" });
  fileField.append(createElement("span", { text: "選擇 JSON 備份檔" }));
  const fileInput = createElement("input", {
    attributes: { type: "file", accept: "application/json,.json", "data-autofocus": "true" },
  });
  fileField.append(fileInput);
  const preview = createElement("div", { className: "backup-preview", text: "尚未選擇備份檔。" });
  form.append(fileField, preview);
  let backup = null;
  let modalApi;

  const showPreview = (message, tone = "") => {
    preview.className = `backup-preview${tone ? ` backup-preview--${tone}` : ""}`;
    preview.textContent = message;
  };
  fileInput.addEventListener("change", async () => {
    backup = null;
    modalApi?.setValid(false);
    const file = fileInput.files?.[0];
    if (!file) {
      showPreview("尚未選擇備份檔。");
      return;
    }
    try {
      const parsed = parseBackupText(await file.text());
      const summary = summarizeBackup(parsed);
      backup = parsed;
      showPreview(`可還原：${summary.keys} 把鑰匙、${summary.dutyTypes} 項勤務、${summary.personnel} 名人員、${summary.activeUsage} 筆使用中、${summary.history} 筆歷史紀錄。`, "success");
      modalApi?.setValid(true);
    } catch (error) {
      showPreview(error.message, "error");
    }
  });

  modalApi = openModal({
    title: "匯入備份",
    subtitle: "還原會取代目前本機資料，請確認備份內容後再繼續。",
    content: form,
    primaryLabel: "確認還原",
    initialValid: false,
    onConfirm: async () => {
      if (!backup) throw new Error("請先選擇有效的備份檔。");
      await restoreBackup(backup);
      showToast("備份資料已還原");
      await renderCurrentView();
    },
  });
}

function confirmDelete(storeName, entity) {
  const label = settingLabel(storeName);
  openConfirmModal({
    title: `刪除${label}`,
    message: `確定刪除「${entity.name}」？歷史紀錄中的名稱快照仍會保留。`,
    confirmLabel: "確認刪除",
    onConfirm: async () => {
      await deleteEntity(storeName, entity.id);
      showToast(`${entity.name} 已刪除`);
      await renderCurrentView();
    },
  });
}

async function renderDashboardView() {
  const [data, appSettings] = await Promise.all([getDashboardData(), getAppSettings()]);
  applyAppSettings(appSettings);
  renderDashboard(appRoot, data, {
    onCheckout: (item) => openUsageEditor(item).catch((error) => showToast(error.message, "error")),
    onEdit: (item) => openUsageEditor(item).catch((error) => showToast(error.message, "error")),
    onReturn: async (item) => {
      try {
        const result = await returnKey(item.key.id);
        showToast(`${result.keyName} 鑰匙已歸還`);
        await renderCurrentView();
      } catch (error) {
        showToast(error.message, "error");
        await renderCurrentView();
      }
    },
    onOpenSettings: () => navigate("settings"),
  }, appSettings);
}

async function renderSettingsView() {
  const data = await getSettingsData();
  renderSettings(appRoot, data, {
    onAdd: (storeName) => openEntityEditor(storeName),
    onImport: (storeName) => openBulkImportModal(storeName).catch((error) => showToast(error.message, "error")),
    onExportBackup: exportBackupFile,
    onImportBackup: () => openBackupImportModal(),
    onSaveAppSettings: async (settings) => {
      try {
        const saved = await saveAppSettings(settings);
        applyAppSettings(saved);
        showToast("介面設定已更新");
        await renderCurrentView();
      } catch (error) {
        showToast(error.message, "error");
      }
    },
    onEdit: (storeName, entity) => openEntityEditor(storeName, entity),
    onDelete: confirmDelete,
    onMove: async (storeName, id, direction) => {
      try {
        await moveEntity(storeName, id, direction);
        await renderCurrentView();
      } catch (error) {
        showToast(error.message, "error");
      }
    },
  });
}

async function refreshHeaderSummary() {
  renderStatusSummary(headerSummaryElement, await getDashboardData());
}

async function renderCurrentView({ loading = false } = {}) {
  setActiveNavigation();
  appRoot.setAttribute("aria-busy", "true");
  if (loading) renderLoading();
  try {
    await refreshHeaderSummary();
    if (currentView === "history") {
      renderHistory(appRoot, await getHistory());
    } else if (currentView === "settings") {
      await renderSettingsView();
    } else {
      await renderDashboardView();
    }
  } catch (error) {
    console.error(error);
    renderFatalError(error);
  } finally {
    appRoot.setAttribute("aria-busy", "false");
  }
}

function navigate(view) {
  currentView = view;
  history.replaceState(null, "", view === "dashboard" ? "#dashboard" : `#${view}`);
  renderCurrentView({ loading: true });
}

function initialView() {
  const hash = location.hash.slice(1);
  return ["dashboard", "history", "settings"].includes(hash) ? hash : "dashboard";
}

async function initialize() {
  currentView = initialView();
  updateClock();
  setInterval(updateClock, 1000);
  navButtons.forEach((button) => button.addEventListener("click", () => navigate(button.dataset.view)));
  window.addEventListener("hashchange", () => {
    const view = initialView();
    if (view !== currentView) {
      currentView = view;
      renderCurrentView({ loading: true });
    }
  });

  await openDatabase();
  applyAppSettings(await getAppSettings());
  requestPersistentStorage();
  subscribeToChanges(debounce(async (message) => {
    try {
      if (message?.type === "app-settings-save") applyAppSettings(await getAppSettings());
      await renderCurrentView();
    } catch (error) {
      console.error("跨頁籤同步失敗", error);
      showToast("資料已變更，但畫面更新失敗，請重新整理。", "error");
    }
  }, 100));
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) renderCurrentView();
  });
  await renderCurrentView({ loading: true });
}

initialize().catch(renderFatalError);
