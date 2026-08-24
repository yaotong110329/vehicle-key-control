import { createElement, formatFullDateTime, toLocalDateValue } from "./utils.js";

function createEmptyState(message) {
  const empty = createElement("div", { className: "table-empty" });
  empty.append(createElement("span", { className: "table-empty__icon", text: "⌁" }));
  empty.append(createElement("p", { text: message }));
  return empty;
}

function snapshotOptions(records) {
  const seen = new Set();
  return records
    .filter((record) => {
      if (seen.has(record.keyId)) return false;
      seen.add(record.keyId);
      return true;
    })
    .map((record) => ({ id: record.keyId, name: record.keyNameSnapshot }));
}

export function renderHistory(root, records) {
  const page = createElement("section", { className: "page" });
  const heading = createElement("div", { className: "page-heading page-heading--simple" });
  const copy = createElement("div");
  copy.append(createElement("p", { className: "eyebrow", text: "使用歷程" }));
  copy.append(createElement("h1", { text: "歷史紀錄" }));
  copy.append(createElement("p", { className: "page-description", text: "歸還後的紀錄永久保留且不可修改" }));
  heading.append(copy);

  const panel = createElement("div", { className: "data-panel" });
  const filters = createElement("div", { className: "filters" });
  const dateField = createElement("label", { className: "field field--compact" });
  dateField.append(createElement("span", { text: "取用日期" }));
  const dateInput = createElement("input", { attributes: { type: "date" } });
  dateField.append(dateInput);

  const keyField = createElement("label", { className: "field field--compact" });
  keyField.append(createElement("span", { text: "鑰匙" }));
  const keySelect = createElement("select");
  keySelect.append(createElement("option", { text: "全部鑰匙", attributes: { value: "" } }));
  snapshotOptions(records).forEach((key) => {
    keySelect.append(createElement("option", { text: key.name, attributes: { value: key.id } }));
  });
  keyField.append(keySelect);

  const count = createElement("span", { className: "result-count" });
  filters.append(dateField, keyField, count);

  const tableWrap = createElement("div", { className: "table-wrap" });

  const drawTable = () => {
    const filtered = records.filter((record) => {
      const dateMatches = !dateInput.value || toLocalDateValue(record.checkoutAt) === dateInput.value;
      const keyMatches = !keySelect.value || record.keyId === keySelect.value;
      return dateMatches && keyMatches;
    });
    count.textContent = `${filtered.length} 筆紀錄`;
    tableWrap.replaceChildren();

    if (!filtered.length) {
      tableWrap.append(createEmptyState(records.length ? "沒有符合篩選條件的紀錄" : "尚無歸還紀錄"));
      return;
    }

    const table = createElement("table", { className: "history-table" });
    const thead = createElement("thead");
    const headerRow = createElement("tr");
    ["鑰匙", "勤務／人員", "補充", "取用時間", "歸還時間"].forEach((label) => {
      headerRow.append(createElement("th", { text: label }));
    });
    thead.append(headerRow);
    const tbody = createElement("tbody");
    filtered.forEach((record) => {
      const row = createElement("tr");
      const keyCell = createElement("td");
      keyCell.append(createElement("strong", { className: "history-key", text: record.keyNameSnapshot }));

      const assignment = createElement("td");
      if (record.dutyNameSnapshot) assignment.append(createElement("div", { className: "history-primary", text: record.dutyNameSnapshot }));
      assignment.append(createElement("div", { className: "history-secondary", text: record.personnelNameSnapshot || "未填人員" }));

      row.append(
        keyCell,
        assignment,
        createElement("td", { className: "history-note", text: record.note || "—" }),
        createElement("td", { className: "history-time", text: formatFullDateTime(record.checkoutAt) }),
        createElement("td", { className: "history-time", text: formatFullDateTime(record.returnAt) }),
      );
      tbody.append(row);
    });
    table.append(thead, tbody);
    tableWrap.append(table);
  };

  dateInput.addEventListener("change", drawTable);
  keySelect.addEventListener("change", drawTable);
  drawTable();
  panel.append(filters, tableWrap);
  page.append(heading, panel);
  root.replaceChildren(page);
}
