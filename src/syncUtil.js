export function listenForRealTimeUpdates(renderCallback) {
  window.addEventListener("storage", (e) => {
    // Only trigger a re-render if the changes happened to the appointments database
    if (e.key === "gh_appointments") {
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
    action // e.g., "Logged in", "Created Appointment", "Updated Status"
  };

  logs.push(newLog);
  localStorage.setItem("gh_activity_logs", JSON.stringify(logs));
};

export function renderBroadcastBanner() {
  const broadcasts = JSON.parse(localStorage.getItem("gh_global_broadcasts") || "[]");
  
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
          Announcement — ${latest.date}
        </strong>
        <span style="color: #b45309; font-size: 0.95rem;">
          ${latest.message}
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