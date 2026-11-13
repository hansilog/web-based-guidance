// history.js
// --- BROWSER BACK / FORWARD BETWEEN PORTAL TABS ---
// The app is one page that swaps its content, so the browser had no history
// inside it and Back left the app. Each sidebar tab now gets its own address
// (e.g. #records), so Back and Forward move between tabs, and a refresh keeps
// the tab you were on.

let restoring = false;

const findTab = (name) =>
  document.querySelector(`.nav-item[data-target="${CSS.escape(name)}"]`);

const currentTab = () => window.location.hash.slice(1);

// Click a tab without adding another history entry
function openTab(name) {
  const btn = findTab(name);
  if (!btn || btn.classList.contains("active")) return Boolean(btn);
  restoring = true;
  try {
    btn.click();
  } finally {
    restoring = false;
  }
  return true;
}

// Record every tab change (clicks, and code like "go to Book Appointment")
document.addEventListener(
  "click",
  (e) => {
    const btn = e.target.closest(".nav-item[data-target]");
    if (!btn || restoring) return;
    const hash = `#${btn.dataset.target}`;
    if (window.location.hash !== hash) {
      window.history.pushState({ tab: btn.dataset.target }, "", hash);
    }
  },
  true,
);

// Call right after a portal is drawn: open the tab in the address (after a
// refresh), otherwise label the address with the tab that is showing
export function syncPortalTab() {
  if (currentTab()) openTab(currentTab());
  const active = document.querySelector(".nav-item.active[data-target]");
  if (active) {
    window.history.replaceState(
      { tab: active.dataset.target },
      "",
      `#${active.dataset.target}`,
    );
  }
}

// Back / Forward inside a portal. Returns false when the address isn't a tab.
export function showTabFromUrl() {
  return currentTab() ? openTab(currentTab()) : false;
}
