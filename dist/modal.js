import { createElement } from "./utils.js";

const dialog = document.querySelector("#app-dialog");
const titleElement = dialog.querySelector("#dialog-title");
const subtitleElement = dialog.querySelector("#dialog-subtitle");
const bodyElement = dialog.querySelector("#dialog-body");
const errorElement = dialog.querySelector("#dialog-error");
const cancelButton = dialog.querySelector("#dialog-cancel");
const tertiaryButton = dialog.querySelector("#dialog-tertiary");
const confirmButton = dialog.querySelector("#dialog-confirm");

let activeCleanup = () => {};
let busy = false;

function closeDialog() {
  if (busy) return;
  if (dialog.open) dialog.close();
}

export function openModal({
  title,
  subtitle = "",
  content,
  primaryLabel = "儲存",
  secondaryLabel = "取消",
  primaryTone = "primary",
  initialValid = true,
  tertiaryLabel = "",
  onTertiary,
  onConfirm,
}) {
  const opener = document.activeElement instanceof HTMLElement && document.activeElement !== dialog
    ? document.activeElement
    : null;
  if (dialog.open) {
    busy = false;
    activeCleanup();
    dialog.close();
  } else {
    activeCleanup();
  }
  titleElement.textContent = title;
  subtitleElement.textContent = subtitle;
  subtitleElement.hidden = !subtitle;
  bodyElement.replaceChildren(content);
  errorElement.textContent = "";
  errorElement.hidden = true;
  cancelButton.textContent = secondaryLabel;
  tertiaryButton.textContent = tertiaryLabel;
  tertiaryButton.hidden = !tertiaryLabel;
  confirmButton.textContent = primaryLabel;
  confirmButton.disabled = !initialValid;
  confirmButton.dataset.tone = primaryTone;
  busy = false;

  const setValid = (valid) => {
    confirmButton.disabled = !valid || busy;
  };

  const setPrimaryLabel = (label) => {
    confirmButton.textContent = label;
  };

  const showError = (message) => {
    errorElement.textContent = message;
    errorElement.hidden = !message;
  };

  const submit = async () => {
    if (confirmButton.disabled || busy) return;
    busy = true;
    confirmButton.disabled = true;
    cancelButton.disabled = true;
    confirmButton.classList.add("is-loading");
    showError("");
    try {
      await onConfirm?.();
      busy = false;
      dialog.close();
    } catch (error) {
      busy = false;
      cancelButton.disabled = false;
      confirmButton.classList.remove("is-loading");
      confirmButton.disabled = false;
      showError(error?.message || "操作失敗，請稍後再試。");
    }
  };

  const onCancel = () => closeDialog();
  const onTertiaryClick = () => onTertiary?.();
  const onBackdrop = (event) => {
    if (event.target === dialog) closeDialog();
  };
  const onKeydown = (event) => {
    if (event.key === "Escape" && busy) event.preventDefault();
  };
  const onClose = () => {
    busy = false;
    confirmButton.classList.remove("is-loading");
    cancelButton.disabled = false;
    activeCleanup();
    if (opener?.isConnected) {
      requestAnimationFrame(() => opener.focus());
    }
  };

  confirmButton.addEventListener("click", submit);
  cancelButton.addEventListener("click", onCancel);
  tertiaryButton.addEventListener("click", onTertiaryClick);
  dialog.addEventListener("click", onBackdrop);
  dialog.addEventListener("keydown", onKeydown);
  dialog.addEventListener("close", onClose, { once: true });

  activeCleanup = () => {
    confirmButton.removeEventListener("click", submit);
    cancelButton.removeEventListener("click", onCancel);
    tertiaryButton.removeEventListener("click", onTertiaryClick);
    dialog.removeEventListener("click", onBackdrop);
    dialog.removeEventListener("keydown", onKeydown);
    dialog.removeEventListener("close", onClose);
    activeCleanup = () => {};
  };

  dialog.showModal();
  requestAnimationFrame(() => {
    const initialFocus = content.querySelector("[data-autofocus]")
      || content.querySelector("button, input, textarea, select")
      || dialog.querySelector("#dialog-cancel");
    initialFocus?.focus();
  });

  return { setValid, setPrimaryLabel, showError, close: closeDialog };
}

export function openConfirmModal({ title, message, confirmLabel = "確認", tone = "danger", onConfirm }) {
  const content = createElement("div", { className: "confirm-copy" });
  content.append(createElement("p", { text: message }));
  return openModal({
    title,
    content,
    primaryLabel: confirmLabel,
    primaryTone: tone,
    onConfirm,
  });
}
