// --- CRYPTOGRAPHIC UTILITY ---
export async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Escape user-supplied text before placing it inside innerHTML templates
export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function listenForRealTimeUpdates(renderCallback) {
  window.addEventListener("storage", (e) => {
    // Re-render when shared data changes in another tab
    const watchedKeys = [
      "gh_appointments",
      "gh_global_broadcasts",
      "gh_notifications",
      "gh_counselor_blocks",
    ];
    if (watchedKeys.includes(e.key)) {
      console.log(
        " Real-time database mutation detected! Syncing UI layouts...",
      );

      renderCallback();
    }
  });
}

window.logActivity = (user, action) => {
  const logs = JSON.parse(localStorage.getItem("gh_activity_logs") || "[]");

  const newLog = {
    id: Date.now(),
    timestamp: new Date().toISOString(),
    userName: user.name,
    userRole: user.role, // 'student' or 'guidance'
    action, // e.g., "Logged in", "Created Appointment", "Updated Status"
  };

  logs.push(newLog);
  localStorage.setItem("gh_activity_logs", JSON.stringify(logs));
};

export function renderBroadcastBanner() {
  const broadcasts = JSON.parse(
    localStorage.getItem("gh_global_broadcasts") || "[]",
  );

  // If there are no broadcasts, return an empty string to avoid rendering empty UI
  if (broadcasts.length === 0) return "";

  // Get the most recent broadcast (assuming unshift was used to add)
  const latest = broadcasts[0];

  return `
    <div class="broadcast-banner" style="
      background: #fef3c7; 
      border-left: 5px solid #f59e0b; 
      padding: 15px; 
      margin-bottom: 20px; 
      border-radius: 4px; 
      display: flex; 
      align-items: center; 
      gap: 10px; 
      box-shadow: 0 2px 4px rgba(0,0,0,0.05);
    ">
      <i class="material-icons" style="color: #d97706; font-size: 24px;">campaign</i>
      <div style="flex-grow: 1;">
        <strong style="display: block; color: #92400e; font-size: 0.9rem;">
          Announcement — ${escapeHtml(latest.date)}
        </strong>
        <span style="color: #b45309; font-size: 0.95rem;">
          ${escapeHtml(latest.message)}
        </span>
      </div>
      <button onclick="this.parentElement.style.display='none'" style="
        background: none; 
        border: none; 
        cursor: pointer; 
        color: #92400e;
        display: flex;
        align-items: center;
      ">
        <i class="material-icons">close</i>
      </button>
    </div>
  `;
}
