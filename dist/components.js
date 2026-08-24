import { createElement, formatUsageTime } from "./utils.js";

function makeButton(label, className, onClick, attributes = {}) {
  const button = createElement("button", {
    className,
    text: label,
    attributes: { type: "button", ...attributes },
  });
  button.addEventListener("click", onClick);
  return button;
}

function createStatusSummary(items) {
  const inTeam = items.filter((item) => !item.usage).length;
  const inUse = items.length - inTeam;
  const summary = createElement("div", { className: "summary-strip" });

  const total = createElement("div", { className: "summary-item" });
  total.append(createElement("span", { className: "summary-label", text: "全部鑰匙" }));
  total.append(createElement("strong", { text: String(items.length) }));

  const available = createElement("div", { className: "summary-item summary-item--available" });
  available.append(createElement("span", { className: "summary-dot" }));
  available.append(createElement("span", { className: "summary-label", text: "在隊" }));
  available.append(createElement("strong", { text: String(inTeam) }));

  const active = createElement("div", { className: "summary-item summary-item--active" });
  active.append(createElement("span", { className: "summary-dot" }));
  active.append(createElement("span", { className: "summary-label", text: "使用中" }));
  active.append(createElement("strong", { text: String(inUse) }));

  summary.append(total, available, active);
  return summary;
}

function createUsageLine(label, value, className = "") {
  const line = createElement("div", { className: `usage-line ${className}`.trim() });
  line.append(createElement("span", { className: "usage-line__label", text: label }));
  line.append(createElement("span", { className: "usage-line__value", text: value }));
  return line;
}

function createKeyCard(item, handlers) {
  const { key, usage } = item;
  const card = createElement("article", {
    className: `key-card ${usage ? "key-card--active" : "key-card--available"}`,
    attributes: { "data-key-id": key.id },
  });

  const top = createElement("div", { className: "key-card__top" });
  const identity = createElement("div", { className: "key-identity" });
  identity.append(createElement("p", { className: "eyebrow", text: key.licensePlate || "車輛鑰匙" }));
  identity.append(createElement("h2", { className: "key-name", text: key.name }));

  const status = createElement("span", {
    className: `status-badge ${usage ? "status-badge--active" : "status-badge--available"}`,
  });
  status.append(createElement("span", { className: "status-badge__dot" }));
  status.append(document.createTextNode(usage ? "使用中" : "在隊"));
  top.append(identity, status);
  card.append(top);

  if (!usage) {
    const empty = createElement("div", { className: "available-message" });
    empty.append(createElement("span", { className: "available-message__icon", text: "✓" }));
    empty.append(createElement("p", { text: key.note || "鑰匙目前在隊，可立即取用" }));
    card.append(empty);
    card.append(makeButton("取用鑰匙", "button button--primary button--full", () => handlers.onCheckout(item)));
    return card;
  }

  const details = createElement("div", { className: "usage-details" });
  details.append(
    createUsageLine("勤務", usage.dutyNameSnapshot || "未填"),
    createUsageLine("使用人", usage.personnelNameSnapshot || "未填"),
    createUsageLine("取用時間", formatUsageTime(usage.checkoutAt)),
    createUsageLine("補充", usage.note || ""),
  );
  card.append(details);

  const actions = createElement("div", { className: "card-actions" });
  actions.append(makeButton("編輯", "button button--secondary", () => handlers.onEdit(item)));
  actions.append(makeButton("鑰匙歸還", "button button--return", () => handlers.onReturn(item)));
  card.append(actions);
  return card;
}

export function renderDashboard(root, items, handlers, appSettings = {}) {
  const page = createElement("section", { className: "page dashboard-page" });

  if (!items.length) {
    const empty = createElement("div", { className: "empty-state" });
    empty.append(createElement("div", { className: "empty-state__icon", text: "◇" }));
    empty.append(createElement("h2", { text: "尚未建立鑰匙" }));
    empty.append(createElement("p", { text: "請前往設定新增第一把鑰匙。" }));
    empty.append(makeButton("前往設定", "button button--primary", handlers.onOpenSettings));
    page.append(empty);
  } else {
    const grid = createElement("div", { className: "key-grid" });
    items.forEach((item) => grid.append(createKeyCard(item, handlers)));
    page.append(grid);
  }

  root.replaceChildren(page);
}

export function renderStatusSummary(root, items) {
  if (!root) return;
  root.replaceChildren(createStatusSummary(items));
}
