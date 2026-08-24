import { createElement } from "./utils.js";

const SECTIONS = [
  { store: "keys", title: "鑰匙管理", description: "維護鑰匙名稱、車牌與顯示順序", addLabel: "新增鑰匙" },
  { store: "dutyTypes", title: "勤務管理", description: "管理取用時的快速勤務選項", addLabel: "新增勤務", importLabel: "匯入勤務" },
  { store: "personnel", title: "人員管理", description: "管理取用時的快速人員選項", addLabel: "新增人員", importLabel: "匯入人員" },
];

function actionButton(label, title, onClick, disabled = false) {
  const button = createElement("button", {
    className: "icon-button",
    text: label,
    attributes: { type: "button", title, "aria-label": title },
  });
  button.disabled = disabled;
  button.addEventListener("click", onClick);
  return button;
}

function createRow(entity, index, list, section, handlers) {
  const row = createElement("div", { className: "setting-row" });
  const info = createElement("div", { className: "setting-row__info" });
  info.append(createElement("strong", { text: entity.name }));
  if (section.store === "keys") {
    const details = [entity.licensePlate, entity.note].filter(Boolean).join(" · ");
    if (details) info.append(createElement("span", { text: details }));
  }

  const controls = createElement("div", { className: "setting-row__actions" });
  controls.append(
    actionButton("↑", `上移${entity.name}`, () => handlers.onMove(section.store, entity.id, -1), index === 0),
    actionButton("↓", `下移${entity.name}`, () => handlers.onMove(section.store, entity.id, 1), index === list.length - 1),
  );

  const editButton = createElement("button", { className: "button button--ghost button--small", text: "編輯", attributes: { type: "button" } });
  editButton.addEventListener("click", () => handlers.onEdit(section.store, entity));
  const deleteButton = createElement("button", { className: "button button--danger-ghost button--small", text: "刪除", attributes: { type: "button" } });
  deleteButton.addEventListener("click", () => handlers.onDelete(section.store, entity));
  controls.append(editButton, deleteButton);
  row.append(info, controls);
  return row;
}

function createSection(section, list, handlers) {
  const card = createElement("section", { className: "settings-card" });
  const header = createElement("div", { className: "settings-card__header" });
  const copy = createElement("div");
  const titleLine = createElement("div", { className: "settings-title-line" });
  titleLine.append(createElement("h2", { text: section.title }));
  titleLine.append(createElement("span", { className: "count-badge", text: String(list.length) }));
  copy.append(titleLine, createElement("p", { text: section.description }));
  const addButton = createElement("button", { className: "button button--secondary button--small", text: `＋ ${section.addLabel}`, attributes: { type: "button" } });
  addButton.addEventListener("click", () => handlers.onAdd(section.store));
  const headerActions = createElement("div", { className: "settings-card__actions" });
  if (section.importLabel) {
    const importButton = createElement("button", { className: "button button--ghost button--small", text: section.importLabel, attributes: { type: "button" } });
    importButton.addEventListener("click", () => handlers.onImport(section.store));
    headerActions.append(importButton);
  }
  headerActions.append(addButton);
  header.append(copy, headerActions);
  card.append(header);

  const listElement = createElement("div", { className: "settings-list" });
  if (!list.length) {
    listElement.append(createElement("p", { className: "settings-empty", text: "尚無資料，請新增第一筆項目。" }));
  } else {
    list.forEach((entity, index) => listElement.append(createRow(entity, index, list, section, handlers)));
  }
  card.append(listElement);
  return card;
}

function createInterfaceSettingsCard(settings = {}, handlers = {}) {
  const card = createElement("section", { className: "settings-card interface-settings-card" });
  const header = createElement("div", { className: "settings-card__header" });
  const copy = createElement("div");
  copy.append(
    createElement("h2", { text: "介面設定" }),
    createElement("p", { text: "自訂系統標題與頁首 Logo" }),
  );
  header.append(copy);

  const form = createElement("form", { className: "interface-settings-form" });
  let logoDataUrl = settings.logoDataUrl || "";

  const appTitleField = createElement("label", { className: "field" });
  appTitleField.append(createElement("span", { text: "系統標題" }));
  const appTitleInput = createElement("input", {
    attributes: { type: "text", maxlength: "40", value: settings.appTitle || "車輛鑰匙控管", placeholder: "例如：車輛鑰匙控管" },
  });
  appTitleField.append(appTitleInput);

  const logoField = createElement("div", { className: "settings-image-field" });
  logoField.append(createElement("span", { className: "settings-image-field__label", text: "頁首圖片 / Logo" }));
  const imageRow = createElement("div", { className: "settings-image-row" });
  const preview = createElement("div", { className: "settings-image-preview" });
  const previewText = createElement("span", { text: "使用預設圖示" });
  const previewImage = createElement("img", { attributes: { alt: "Logo 預覽", hidden: true } });
  preview.append(previewImage, previewText);
  const imageControls = createElement("div", { className: "settings-image-controls" });
  const fileInput = createElement("input", { className: "file-input", attributes: { type: "file", accept: "image/*" } });
  const removeLogoButton = createElement("button", { className: "button button--ghost button--small", text: "移除圖片", attributes: { type: "button" } });
  const imageError = createElement("p", { className: "settings-inline-error", attributes: { hidden: true } });
  imageControls.append(fileInput, removeLogoButton, imageError);
  imageRow.append(preview, imageControls);
  logoField.append(imageRow);

  const renderPreview = () => {
    const hasImage = Boolean(logoDataUrl);
    previewImage.hidden = !hasImage;
    previewText.hidden = hasImage;
    removeLogoButton.disabled = !hasImage;
    if (hasImage) previewImage.src = logoDataUrl;
  };
  const showImageError = (message = "") => {
    imageError.textContent = message;
    imageError.hidden = !message;
  };
  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    showImageError();
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      showImageError("請選擇圖片檔案。");
      fileInput.value = "";
      return;
    }
    if (file.size > 1024 * 1024) {
      showImageError("圖片請小於 1 MB。");
      fileInput.value = "";
      return;
    }
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      logoDataUrl = typeof reader.result === "string" ? reader.result : "";
      renderPreview();
    });
    reader.addEventListener("error", () => showImageError("圖片讀取失敗，請重新選擇。"));
    reader.readAsDataURL(file);
  });
  removeLogoButton.addEventListener("click", () => {
    logoDataUrl = "";
    fileInput.value = "";
    showImageError();
    renderPreview();
  });
  renderPreview();

  const footer = createElement("div", { className: "settings-save-row" });
  footer.append(createElement("p", { text: "設定會保存在這台電腦的 IndexedDB。" }));
  const saveButton = createElement("button", { className: "button button--primary", text: "儲存介面設定", attributes: { type: "submit" } });
  footer.append(saveButton);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    handlers.onSaveAppSettings?.({
      appTitle: appTitleInput.value,
      dashboardTitle: settings.dashboardTitle || "",
      logoDataUrl,
    });
  });
  form.append(appTitleField, logoField, footer);
  card.append(header, form);
  return card;
}

export function renderSettings(root, data, handlers) {
  const page = createElement("section", { className: "page" });
  const heading = createElement("div", { className: "page-heading page-heading--simple" });
  const copy = createElement("div");
  copy.append(createElement("p", { className: "eyebrow", text: "系統維護" }));
  copy.append(createElement("h1", { text: "設定" }));
  copy.append(createElement("p", { className: "page-description", text: "管理卡片、快速選擇清單與顯示順序" }));
  const backupActions = createElement("div", { className: "page-heading__actions" });
  const exportButton = createElement("button", { className: "button button--ghost", text: "匯出備份", attributes: { type: "button" } });
  exportButton.addEventListener("click", () => handlers.onExportBackup?.());
  const importButton = createElement("button", { className: "button button--secondary", text: "匯入備份", attributes: { type: "button" } });
  importButton.addEventListener("click", () => handlers.onImportBackup?.());
  backupActions.append(exportButton, importButton);
  heading.append(copy, backupActions);

  const grid = createElement("div", { className: "settings-grid" });
  grid.append(createInterfaceSettingsCard(data.appSettings, handlers));
  SECTIONS.forEach((section) => grid.append(createSection(section, data[section.store], handlers)));
  page.append(heading, grid);
  root.replaceChildren(page);
}
