// ui.js
// --- SHARED UI PIECES: form dialogs + notification bell ---
import { escapeHtml } from "./syncUtil.js";
import {
  getNotifications,
  markNotificationsRead,
  clearNotifications,
} from "./store.js";

/**
 * Opens a dialog built on the .custom-modal-* styles.
 * onConfirm({ card, showError }) may return false (or a Promise of false) to keep it open.
 */
export function openModal({
  title,
  icon = "event",
  bodyHtml = "",
  confirmText = "Save",
  cancelText = "Cancel",
  danger = false,
  wide = false,
  onConfirm,
  onOpen,
}) {
  const overlay = document.createElement("div");
  overlay.className = "custom-modal-overlay";
  overlay.innerHTML = `
    <div class="custom-modal-card app-modal-card ${wide ? "wide" : ""}" role="dialog" aria-modal="true">
      <div class="custom-modal-header">
        <i class="material-icons modal-icon ${danger ? "danger" : ""}">${icon}</i>
        <h3>${escapeHtml(title)}</h3>
      </div>
      <div class="custom-modal-body app-modal-body">
        <div class="modal-error hidden"></div>
        ${bodyHtml}
      </div>
      <div class="custom-modal-actions">
        <button type="button" class="modal-btn secondary-btn" data-action="cancel">${escapeHtml(cancelText)}</button>
        ${
          onConfirm
            ? `<button type="button" class="modal-btn ${danger ? "danger-btn" : "confirm-btn"}" data-action="confirm">${escapeHtml(confirmText)}</button>`
            : ""
        }
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const card = overlay.querySelector(".custom-modal-card");
  const errorBox = overlay.querySelector(".modal-error");
  const close = () => overlay.remove();
  const showError = (msg) => {
    errorBox.textContent = msg;
    errorBox.classList.remove("hidden");
  };

  overlay.querySelector('[data-action="cancel"]').onclick = close;
  overlay.onclick = (e) => {
    if (e.target === overlay) close();
  };

  const confirmBtn = overlay.querySelector('[data-action="confirm"]');
  if (confirmBtn) {
    confirmBtn.onclick = async () => {
      errorBox.classList.add("hidden");
      confirmBtn.disabled = true;
      try {
        const result = await onConfirm({ card, showError });
        if (result !== false) close();
      } finally {
        confirmBtn.disabled = false;
      }
    };
  }

  if (onOpen) onOpen({ card, showError, close });
  return { card, close, showError };
}

// --- NOTIFICATION BELL ---

export function renderBellHtml() {
  return `
    <div class="notification-wrapper">
      <button type="button" class="bell-btn" id="notificationBtn" title="Notifications" aria-label="Notifications">
        <i class="material-icons">notifications</i>
        <span class="notification-badge" id="notifBadge">0</span>
      </button>
      <div class="notification-dropdown hidden" id="notificationDropdown">
        <div class="notif-header">
          <span>Notifications</span>
          <button type="button" id="clearNotifs" class="notif-clear">Clear all</button>
        </div>
        <div class="notif-body" id="notifBody"></div>
      </div>
    </div>
  `;
}

export function refreshBell(userId) {
  const body = document.getElementById("notifBody");
  const badge = document.getElementById("notifBadge");
  if (!body || !badge) return;

  const items = getNotifications(userId);
  const unread = items.filter((n) => !n.read).length;

  badge.textContent = unread > 9 ? "9+" : String(unread);
  badge.style.display = unread > 0 ? "block" : "none";

  body.innerHTML =
    items.length > 0
      ? items
          .slice(0, 30)
          .map(
            (n) => `
        <div class="notif-item ${n.read ? "" : "unread"}">
          <p>${escapeHtml(n.message)}</p>
          <small>${new Date(n.createdAt).toLocaleString()}</small>
        </div>`,
          )
          .join("")
      : '<p class="empty-notif">No notifications yet</p>';
}

let outsideClickBound = false;

export function setupBell(userId) {
  const btn = document.getElementById("notificationBtn");
  const dropdown = document.getElementById("notificationDropdown");
  const clearBtn = document.getElementById("clearNotifs");
  if (!btn || !dropdown) return;

  refreshBell(userId);

  btn.onclick = (e) => {
    e.stopPropagation();
    dropdown.classList.toggle("hidden");
    if (!dropdown.classList.contains("hidden")) {
      // Show the unread highlight while open, then clear the badge
      refreshBell(userId);
      markNotificationsRead(userId);
      document.getElementById("notifBadge").style.display = "none";
    }
  };

  if (clearBtn) {
    clearBtn.onclick = (e) => {
      e.stopPropagation();
      clearNotifications(userId);
      refreshBell(userId);
    };
  }

  if (!outsideClickBound) {
    outsideClickBound = true;
    document.addEventListener("click", (e) => {
      const dd = document.getElementById("notificationDropdown");
      if (dd && !dd.contains(e.target)) dd.classList.add("hidden");
    });
  }
}
