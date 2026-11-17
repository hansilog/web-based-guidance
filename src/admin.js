import schoolLogo from "./assets/school-logo-128.png";
import { hashPassword, escapeHtml } from "./syncUtil.js";
import { createCounselor, sendResetEmail } from "./remote.js";
import {
  getUsers,
  saveUsers,
  getAppointments,
  saveAppointments,
  getBlocks,
  saveBlocks,
  addNotification,
  formatTime12,
  toCsv,
  getSettings,
  saveSettings,
  getSlots,
  officeHoursText,
  appointmentStart,
  parseDate,
  toDateStr,
  ACTIVE_STATUSES,
  COUNSELOR_SPECIALTIES,
  isRemote,
  getUserById,
  getActivityLogs,
  addBroadcast,
  isUsernameOrEmailTaken,
} from "./store.js";

// The logged-in admin, used for activity logging
let adminSession = null;

/**
 * Renders the Super Admin View
 * @param {HTMLElement} root - The root element
 * @param {Object} session - Current admin session data
 * @param {Function} onLogout - Logout handler
 * @param {HTMLElement} container - The target inner dynamic layout slot
 */
function renderStaffManager(container) {
  const users = getUsers();
  // Filter for guidance counselor accounts exclusively
  const counselors = users.filter((u) => u.role === "guidance");

  container.innerHTML = `
    <div class="admin-card full-width">
        <div class="card-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
            <div>
                <h2><i class="material-icons">badge</i> Guidance Staff Management</h2>
                <p class="subtitle" style="margin: 4px 0 0 0; color: #64748b; font-size: 0.85rem;">Provision and update functional counselor assignments.</p>
            </div>
            <button class="primary-btn" onclick="window.openAddCounselorModal()" style="display: flex; align-items: center; gap: 6px; padding: 10px 16px; background: #2563eb; color: white; border: none; border-radius: 6px; font-weight: 600; cursor: pointer;">
                <i class="material-icons" style="font-size: 18px;">person_add</i> Add New Staff
            </button>
        </div>
        
        <div class="table-container">
            <table class="admin-table">
                <thead>
                    <tr>
                        <th>Counselor Profile</th>
                        <th>Email Account</th>
                        <th>Specialty Focus Area</th>
                        <th style="text-align: right;">Administrative Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${
                      counselors.length > 0
                        ? counselors
                            .map(
                              (c) => `
                            <tr>
                                <td data-label="Counselor Profile">
                                    <div style="display: flex; flex-direction: column;">
                                        <strong style="color: #1e293b;">${escapeHtml(c.name)}</strong>
                                        <span style="font-size: 0.725rem; color: #64748b; font-family: monospace;">ID: ${c.id}</span>
                                    </div>
                                </td>
                                <td data-label="Email Account" style="color: #475569;">${escapeHtml(c.email)}</td>
                                <td data-label="Specialty Focus Area">
                                    <span style="background: #fef3c7; color: #92400e; padding: 4px 10px; border-radius: 6px; font-size: 0.8rem; font-weight: 600;">
                                        ${escapeHtml(c.specialty || "General Counseling")}
                                    </span>
                                </td>
                                <td data-label="Administrative Actions" style="text-align: right;">
                                    <div style="display: flex; justify-content: flex-end; gap: 8px;">
                                        <button onclick="window.openEditCounselorModal(${c.id})" class="btn-secondary" style="padding: 6px 12px; background: #f1f5f9; color: #2563eb; border: 1px solid #cbd5e1; border-radius: 4px; cursor: pointer; font-weight: 500; font-size: 0.85rem; display: inline-flex; align-items: center; gap: 4px;">
                                            <i class="material-icons" style="font-size: 16px;">edit</i> Edit
                                        </button>
                                        <button onclick="window.removeUser(${c.id})" class="btn-danger" style="padding: 6px 12px; background: #fff5f5; color: #e11d48; border: 1px solid #fecdd3; border-radius: 4px; cursor: pointer; font-weight: 500; font-size: 0.85rem; display: inline-flex; align-items: center; gap: 4px;">
                                            <i class="material-icons" style="font-size: 16px;">delete</i> Delete
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        `,
                            )
                            .join("")
                        : `<tr><td colspan="4" style="text-align:center; padding: 3rem; color: #64748b;">No active counselor records deployed to the platform database.</td></tr>`
                    }
                </tbody>
            </table>
        </div>
    </div>
  `;
}
export function renderReports(stats) {
  const total = stats.totalApps || 1;
  return `
    <div class="admin-card">
        <div class="card-header reports-header">
            <h2><i class="material-icons">insights</i> Guidance Intelligence Dashboard</h2>
            
            <div class="report-actions">
                <button onclick="window.exportAppointmentsCsv()" class="btn-secondary">
                    <i class="material-icons">table_view</i> Export CSV
                </button>
                <button onclick="window.printReport('analytics', window.lastReportStats)" class="btn-primary">
                    <i class="material-icons">download</i> Generate Report
                </button>
            </div>
        </div>

        <div class="stats-grid">
            <div class="stat-item">
                <span class="stat-label">Total Requests</span>
                <span class="stat-value">${stats.totalApps}</span>
            </div>
            <div class="stat-item">
                <span class="stat-label">Most Active Year</span>
                <span class="stat-value warning">${stats.mostActiveYear}</span>
            </div>
            <div class="stat-item">
                <span class="stat-label">Pending Triage</span>
                <span class="stat-value info">${stats.pending}</span>
            </div>
            <div class="stat-item">
                <span class="stat-label">Total Students</span>
                <span class="stat-value success">${stats.totalStudents}</span>
            </div>
        </div>

        <div class="reports-main-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(350px, 1fr)); gap: 20px; margin-top: 20px;">
            <div class="report-section">
                <h3><i class="material-icons">category</i> Request Type Distribution</h3>
                <div class="chart-container">
                    ${renderChartRow("Academic", stats.academic, (stats.academic / total) * 100, "bg-blue")}
                    ${renderChartRow("Personal", stats.personal, (stats.personal / total) * 100, "bg-red")}
                    ${renderChartRow("Career", stats.career, (stats.career / total) * 100, "bg-green")}
                    ${renderChartRow("Other types", stats.otherTypes, (stats.otherTypes / total) * 100, "bg-blue")}
                </div>
            </div>

            <div class="report-section">
                <h3><i class="material-icons">assignment_turned_in</i> Case Resolution Status</h3>
                <div class="chart-container">
                    ${renderChartRow("Approved", stats.statusBreakdown.approved, (stats.statusBreakdown.approved / total) * 100, "bg-green")}
                    ${renderChartRow("Pending", stats.statusBreakdown.pending, (stats.statusBreakdown.pending / total) * 100, "bg-orange")}
                    ${renderChartRow("Rejected", stats.statusBreakdown.rejected, (stats.statusBreakdown.rejected / total) * 100, "bg-red")}
                    ${renderChartRow("Completed", stats.statusBreakdown.completed, (stats.statusBreakdown.completed / total) * 100, "bg-blue")}
                    ${renderChartRow("No-show", stats.statusBreakdown["no-show"], (stats.statusBreakdown["no-show"] / total) * 100, "bg-purple")}
                    ${renderChartRow("Cancelled", stats.statusBreakdown.cancelled, (stats.statusBreakdown.cancelled / total) * 100, "bg-cyan")}
                </div>
            </div>

            <div class="report-section">
                <h3><i class="material-icons">star_rate</i> Student Satisfaction</h3>
                <div class="trend-highlight" style="padding: 12px; text-align: center; background: #f8fafc; border-radius: 8px; margin-bottom: 12px;">
                    <span style="font-size: 2rem; font-weight: 800; color: #f59e0b;">${stats.ratings.overall ?? "—"}</span>
                    <p style="margin-top: 2px; color: #64748b; font-size: 0.8rem;">Average rating out of 5 · ${stats.ratings.count} rating${stats.ratings.count === 1 ? "" : "s"}</p>
                </div>
                <div class="chart-container">
                    ${
                      stats.ratings.byCounselor.length > 0
                        ? stats.ratings.byCounselor
                            .map((c) =>
                              renderChartRow(
                                `${c.name} (${c.avg})`,
                                c.count,
                                (c.avg / 5) * 100,
                                "bg-orange",
                              ),
                            )
                            .join("")
                        : '<p class="empty-msg">No ratings yet.</p>'
                    }
                </div>
            </div>

            <div class="report-section">
                <h3><i class="material-icons">leaderboard</i> Volume by Year Level</h3>
                <div class="chart-container">
                    ${Object.entries(stats.yearBreakdown)
                      .map(([year, count]) =>
                        renderChartRow(
                          year,
                          count,
                          (count / total) * 100,
                          "bg-purple",
                        ),
                      )
                      .join("")}
                </div>
            </div>

            <div class="report-section">
                <h3><i class="material-icons">school</i> Volume by Course</h3>
                <div class="chart-container">
                    ${
                      Object.keys(stats.courseBreakdown).length > 0
                        ? Object.entries(stats.courseBreakdown)
                            .map(([course, count]) =>
                              renderChartRow(
                                course,
                                count,
                                (count / total) * 100,
                                "bg-cyan",
                              ),
                            )
                            .join("")
                        : '<p class="empty-msg">No course data available yet.</p>'
                    }
                </div>
            </div>
            
            <div class="report-section report-wide">
                <h3><i class="material-icons">groups</i> Counselor Performance</h3>
                ${renderPerformanceTable(stats.performance)}
            </div>

            <div class="report-section">
                <h3><i class="material-icons">trending_up</i> Demand Pulse (Daily Avg)</h3>
                <div class="trend-highlight" style="padding: 20px; text-align: center; background: #f8fafc; border-radius: 8px;">
                    <span style="font-size: 2.5rem; font-weight: 800; color: #3b82f6;">${stats.avgDaily}</span>
                    <p style="margin-top: 5px; color: #64748b; font-size: 0.8rem;">Requests per active day</p>
                </div>
            </div>
        </div>
    </div>
  `;
}

// Per-counselor numbers: workload, attendance, ratings and how fast requests get answered
function getCounselorPerformance(apps, users) {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 86400000);
  return users
    .filter((u) => u.role === "guidance")
    .map((c) => {
      const mine = apps.filter((a) => a.counselorId === c.id);
      const completed = mine.filter((a) => a.status === "completed");
      const noShows = mine.filter((a) => a.status === "no-show").length;
      const booked = completed.filter((a) => !a.walkIn).length;
      const rated = mine.filter((a) => a.feedback?.rating);
      const decided = mine.filter((a) => a.decidedAt && a.createdAt);
      const avgHours = decided.length
        ? decided.reduce(
            (sum, a) => sum + (new Date(a.decidedAt) - new Date(a.createdAt)),
            0,
          ) /
          decided.length /
          3600000
        : null;
      return {
        name: c.name,
        completed: completed.length,
        walkIns: completed.length - booked,
        lastWeek: completed.filter((a) => {
          const start = appointmentStart(a);
          return start >= weekAgo && start <= now;
        }).length,
        active: mine.filter((a) => ACTIVE_STATUSES.includes(a.status)).length,
        // Walk-ins can't be no-shows, so leave them out of the rate
        noShowRate:
          booked + noShows
            ? Math.round((noShows / (booked + noShows)) * 100)
            : null,
        avgRating: rated.length
          ? (
              rated.reduce((s, a) => s + a.feedback.rating, 0) / rated.length
            ).toFixed(1)
          : null,
        ratingCount: rated.length,
        avgResponse: avgHours,
      };
    });
}

function formatHours(hours) {
  if (hours == null) return "—";
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min`;
  if (hours < 48) return `${hours.toFixed(1)} h`;
  return `${(hours / 24).toFixed(1)} days`;
}

function renderPerformanceTable(rows = []) {
  if (rows.length === 0) return '<p class="empty-msg">No counselors yet.</p>';
  return `
    <div class="table-container">
      <table class="admin-table perf-table">
        <thead>
          <tr>
            <th>Counselor</th>
            <th title="Completed sessions, including walk-ins">Completed</th>
            <th title="Completed in the last 7 days">Last 7 days</th>
            <th title="Pending + approved right now">Active now</th>
            <th title="No-shows out of booked sessions that were closed">No-show rate</th>
            <th>Avg. rating</th>
            <th title="Average time from request to approve/reject">Avg. response</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (r) => `
            <tr>
              <td data-label="Counselor"><strong>${escapeHtml(r.name)}</strong></td>
              <td data-label="Completed">${r.completed}${r.walkIns ? ` <small class="perf-sub">(${r.walkIns} walk-in)</small>` : ""}</td>
              <td data-label="Last 7 days">${r.lastWeek}</td>
              <td data-label="Active now">${r.active}</td>
              <td data-label="No-show rate"><span class="perf-rate ${r.noShowRate >= 25 ? "bad" : ""}">${r.noShowRate == null ? "—" : `${r.noShowRate}%`}</span></td>
              <td data-label="Avg. rating">${r.avgRating ? `★ ${r.avgRating} <small class="perf-sub">(${r.ratingCount})</small>` : "—"}</td>
              <td data-label="Avg. response">${formatHours(r.avgResponse)}</td>
            </tr>`,
            )
            .join("")}
        </tbody>
      </table>
    </div>
    <p class="modal-hint">Response time counts requests decided since this report was added.</p>
  `;
}

function renderChartRow(label, count, width, colorClass) {
  const barWidth = count > 0 ? width : 0;
  return `
    <div class="chart-row" style="display: flex; align-items: center; margin-bottom: 12px;">
        <span style="width: 130px; font-size: 0.85rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(label)}</span>
        <div style="flex-grow: 1; height: 10px; background: #f1f5f9; border-radius: 5px; margin: 0 12px; overflow: hidden;">
            <div class="${colorClass}" style="width: ${barWidth}%; height: 100%; border-radius: 5px; transition: width 0.6s ease;"></div>
        </div>
        <span style="font-weight: bold; width: 25px; text-align: right;">${count}</span>
    </div>
  `;
}
window.printReport = (type, stats = null) => {
  if (type !== "analytics" || !stats) return;

  const total = stats.totalApps || 1;
  const efficiencyRate = (
    (stats.statusBreakdown.approved / total) *
    100
  ).toFixed(1);

  const printContent = `
    <h1>Granby Gateway Intelligence Report</h1>
    <p>Generated on: ${new Date().toLocaleString()}</p>
    
    <style>
      table { width: 100%; border-collapse: collapse; margin-bottom: 25px; }
      th { background-color: #f2f2f2; text-align: left; padding: 8px; }
      td { border: 1px solid #ddd; padding: 8px; }
      .highlight { font-weight: bold; color: #2563eb; }
    </style>

    <h3>Summary Analytics</h3>
    <table>
      <tr><th>Metric</th><th>Value</th><th>Note</th></tr>
      <tr><td>Total Requests</td><td>${stats.totalApps}</td><td>Baseline Volume</td></tr>
      <tr><td>Pending Triage</td><td>${stats.pending}</td><td>Action Required</td></tr>
      <tr><td>Resolution Efficiency</td><td>${efficiencyRate}%</td><td>Approval/Total Ratio</td></tr>
    </table>

    <h3>Detailed Breakdown (Spreadsheet View)</h3>
    <table>
      <tr><th>Category</th><th>Breakdown Item</th><th>Count</th><th>% of Total</th></tr>
      <tr><td rowspan="4">Request Types</td><td>Academic</td><td>${stats.academic}</td><td>${((stats.academic / total) * 100).toFixed(1)}%</td></tr>
      <tr><td>Personal</td><td>${stats.personal}</td><td>${((stats.personal / total) * 100).toFixed(1)}%</td></tr>
      <tr><td>Career</td><td>${stats.career}</td><td>${((stats.career / total) * 100).toFixed(1)}%</td></tr>
      <tr><td>Other types</td><td>${stats.otherTypes}</td><td>${((stats.otherTypes / total) * 100).toFixed(1)}%</td></tr>
      
      <tr><td rowspan="3">Case Status</td><td>Approved</td><td>${stats.statusBreakdown.approved}</td><td>${((stats.statusBreakdown.approved / total) * 100).toFixed(1)}%</td></tr>
      <tr><td>Pending</td><td>${stats.statusBreakdown.pending}</td><td>${((stats.statusBreakdown.pending / total) * 100).toFixed(1)}%</td></tr>
      <tr><td>Rejected</td><td>${stats.statusBreakdown.rejected}</td><td>${((stats.statusBreakdown.rejected / total) * 100).toFixed(1)}%</td></tr>
    </table>

    <h3>Counselor Performance</h3>
    <table>
      <tr><th>Counselor</th><th>Completed</th><th>Last 7 days</th><th>Active now</th><th>No-show rate</th><th>Avg. rating</th><th>Avg. response</th></tr>
      ${stats.performance
        .map(
          (r) =>
            `<tr><td>${escapeHtml(r.name)}</td><td>${r.completed}</td><td>${r.lastWeek}</td><td>${r.active}</td><td>${r.noShowRate == null ? "—" : `${r.noShowRate}%`}</td><td>${r.avgRating ?? "—"}</td><td>${formatHours(r.avgResponse)}</td></tr>`,
        )
        .join("")}
    </table>
  `;

  const win = window.open("", "PRINT", "height=700,width=900");
  win.document.write(`<html><body>${printContent}</body></html>`);
  win.document.close();
  win.print();
  win.close();
};
export function renderAdminView(root, session, onLogout) {
  document.body.classList.add("admin-portal");
  root.innerHTML = `
    <div class="admin-container">
        <aside class="sidebar" id="sidebar">
            <div class="sidebar-header">
                <div class="portal-brand">
                    <img class="brand-logo" src="${schoolLogo}" alt="Granby Colleges of Science and Technology seal" width="36" height="36">
                    <div class="portal-brand-text">
                        <span class="portal-brand-name">Granby Gateway</span>
                        <span class="portal-brand-role">Administrator</span>
                    </div>
                </div>
            </div>
            <nav id="admin-nav">

                <button class="nav-item" data-target="reports">
    <i class="material-icons">assessment</i> View Reports
</button>
                <button class="nav-item active" data-target="staff">
                    <i class="material-icons">badge</i> Manage Staff
                </button>
                <button class="nav-item" data-target="students">
                    <i class="material-icons">groups</i> View Students
                </button>
                <button class="nav-item" data-target="announcements">
                    <i class="material-icons">campaign</i> Global Broadcast
                </button>
                <button class="nav-item" data-target="office">
                    <i class="material-icons">schedule</i> Office Hours
                </button>
                <button class="nav-item" data-target="logs">
                        <i class="material-icons">history</i> 
                        <span>Activity Logs</span>
                    </button>
                <button class="nav-item logout" id="logoutBtn">
                    <i class="material-icons">logout</i> Logout
                </button>
            </nav>
        </aside>
        <main class="content-area">
            <div id="admin-dynamic-content"></div>
        </main>
    </div>

    <div id="counselorModal" class="modal-overlay" style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(15, 23, 42, 0.6); z-index: 2000; align-items: center; justify-content: center; backdrop-filter: blur(4px);">
        <div class="modal-card" style="background: white; width: 100%; max-width: 450px; padding: 30px; border-radius: 12px; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.15); border: 1px solid #e2e8f0; position: relative;">
            <h2 id="modalTitle" style="margin-bottom: 20px; display: flex; align-items: center; gap: 10px; color: #1e293b; font-size: 1.35rem;"><i class="material-icons" style="color: #2563eb;">person_add</i> Add Counselor</h2>
            <input type="hidden" id="counselorIdField">
            
            <div style="display: flex; flex-direction: column; gap: 16px; margin-bottom: 24px;">
                <div style="display: flex; flex-direction: column; gap: 6px;">
                    <label style="font-size: 0.85rem; font-weight: 600; color: #475569;">Full Name</label>
                    <input type="text" id="counselorNameField" placeholder="e.g. Juan Dela Cruz" style="padding: 10px 12px; border: 1px solid #cbd5e1; border-radius: 6px; outline: none; font-size: 0.95rem;">
                </div>
                <div style="display: flex; flex-direction: column; gap: 6px;">
                    <label style="font-size: 0.85rem; font-weight: 600; color: #475569;">Email Address</label>
                    <input type="email" id="counselorEmailField" placeholder="name@domain.com" style="padding: 10px 12px; border: 1px solid #cbd5e1; border-radius: 6px; outline: none; font-size: 0.95rem;">
                </div>
                
                <div style="display: flex; flex-direction: column; gap: 6px;">
                    <label style="font-size: 0.85rem; font-weight: 600; color: #475569;">Specialty / Focus Field</label>
                    <select id="counselorSpecialtyField" style="padding: 10px 12px; border: 1px solid #cbd5e1; border-radius: 6px; outline: none; font-size: 0.95rem; background: white;">
                        ${COUNSELOR_SPECIALTIES.map((s) => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join("")}
                    </select>
                </div>

                <div style="display: flex; flex-direction: column; gap: 6px;">
                    <label id="passwordLabel" style="font-size: 0.85rem; font-weight: 600; color: #475569;">Password</label>
                    <input type="password" id="counselorPasswordField" placeholder="••••••••" style="padding: 10px 12px; border: 1px solid #cbd5e1; border-radius: 6px; outline: none; font-size: 0.95rem;">
                </div>
            </div>

            <div style="display: flex; justify-content: flex-end; gap: 10px;">
                <button type="button" id="closeModalBtn" style="padding: 10px 16px; background: #f1f5f9; color: #475569; border: none; border-radius: 6px; font-weight: 600; cursor: pointer;">Cancel</button>
                <button type="button" id="saveCounselorBtn" style="padding: 10px 20px; background: #2563eb; color: white; border: none; border-radius: 6px; font-weight: 600; cursor: pointer; box-shadow: 0 4px 6px -1px rgba(37,99,235,0.2);">Save Counselor</button>
            </div>
        </div>
    </div>
  `;

  setupAdminListeners(onLogout, session);
  setupModalHandlers();
}

function setupAdminListeners(onLogout, session) {
  adminSession = session;
  const content = document.getElementById("admin-dynamic-content");
  const navButtons = document.querySelectorAll(".nav-item:not(.logout)");

  navButtons.forEach((btn) => {
    btn.onclick = () => {
      navButtons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      const target = btn.getAttribute("data-target");
      renderSection(target, content);
    };
  });

  document.getElementById("logoutBtn").onclick = onLogout;
  renderSection("staff", content);
}

function renderSection(target, container) {
  if (target === "staff") {
    renderStaffManager(container);
  } else if (target === "reports") {
    const stats = getAnalytics();
    window.lastReportStats = stats;
    container.innerHTML = renderReports(stats);
  } else if (target === "logs") {
    renderLogsView(container);
  } else if (target === "students") {
    renderStudentViewer(container);
  } else if (target === "office") {
    renderOfficeSettings(container);
  } else if (target === "announcements") {
    container.innerHTML = `
        <div class="admin-card">
            <h2><i class="material-icons">campaign</i> Create Global Broadcast</h2>
            <p class="subtitle">This message will appear instantly at the top of all Student and Guidance Counselor dashboards.</p>
            <textarea id="broadcastMsg" placeholder="Type announcement here..." rows="4" class="admin-input" style="width: 100%; margin: 15px 0; padding: 12px; border-radius: 8px; border: 1px solid #cbd5e1; font-family: inherit; resize: none; outline: none;"></textarea>
            <button class="primary-btn" id="sendBroadcastBtn">Post Announcement</button>
        </div>
    `;

    // Handle clicking the post button
    document.getElementById("sendBroadcastBtn").onclick = () => {
      const msgInput = document.getElementById("broadcastMsg");
      const messageText = msgInput.value.trim();

      if (!messageText) {
        alert("Please write a message before posting your announcement!");
        return;
      }

      // Newest first; other open tabs pick it up through the storage event
      addBroadcast(messageText);
      window.logActivity(adminSession, "Posted a global announcement");

      alert("Broadcast posted successfully to all user dashboards!");
      msgInput.value = "";
    }; // 👈 THIS was the missing curly brace + semicolon closing the click handler!
  } else {
    // Now this clean fallback block links perfectly
    container.innerHTML = `<div class="admin-card"><h2>Module coming soon...</h2></div>`;
  }
}

// --- OFFICE HOURS & HOLIDAYS ---

const hourName = (h) => `${h % 12 || 12}:00 ${h >= 12 ? "PM" : "AM"}`;

function hourOptions(from, to, selected) {
  const options = [];
  for (let h = from; h <= to; h++) {
    options.push(
      `<option value="${h}" ${h === selected ? "selected" : ""}>${hourName(h)}</option>`,
    );
  }
  return options.join("");
}

// Active bookings that the given settings would no longer allow
function bookingsOutside(settings) {
  const slots = getSlots(settings);
  const closed = new Set(settings.holidays.map((h) => h.date));
  const now = new Date();
  return getAppointments().filter(
    (a) =>
      ACTIVE_STATUSES.includes(a.status) &&
      appointmentStart(a) > now &&
      (!slots.includes(a.time) || closed.has(a.date)),
  );
}

function renderOfficeSettings(container) {
  const settings = getSettings();
  const today = toDateStr(new Date());
  const holidays = [...settings.holidays].sort((a, b) =>
    a.date.localeCompare(b.date),
  );

  container.innerHTML = `
    <div class="admin-card office-card">
      <h2><i class="material-icons">schedule</i> Office Hours</h2>
      <p class="subtitle">Sets the one-hour booking times students see. Currently: <strong>${escapeHtml(officeHoursText(settings))}</strong>.</p>

      <div class="office-grid">
        <label>Opens at
          <select id="openHour" class="admin-input">${hourOptions(6, 12, settings.openHour)}</select>
        </label>
        <label>Closes at
          <select id="closeHour" class="admin-input">${hourOptions(12, 21, settings.closeHour)}</select>
        </label>
        <label>Lunch break
          <select id="lunchHour" class="admin-input">
            <option value="" ${settings.lunchHour == null ? "selected" : ""}>No lunch break</option>
            ${hourOptions(10, 14, settings.lunchHour)}
          </select>
        </label>
        <label>Max sessions per counselor per day
          <select id="maxPerDay" class="admin-input">
            ${Array.from({ length: 12 }, (_, i) => i + 1)
              .map(
                (n) =>
                  `<option value="${n}" ${n === settings.maxPerDay ? "selected" : ""}>${n}</option>`,
              )
              .join("")}
          </select>
        </label>
      </div>
      <p class="modal-hint" id="slotPreview"></p>
      <button type="button" class="primary-btn" id="saveHoursBtn">Save Office Hours</button>
    </div>

    <div class="admin-card office-card">
      <h2><i class="material-icons">event_busy</i> Holidays &amp; Closures</h2>
      <p class="subtitle">The office is closed for everyone on these days. Students can't book them.</p>
      <div class="office-grid">
        <label>Date
          <input type="date" id="holidayDate" class="admin-input" min="${today}">
        </label>
        <label>Name
          <input type="text" id="holidayName" class="admin-input" maxlength="60" placeholder="e.g. Bonifacio Day">
        </label>
        <div class="office-add"><button type="button" class="primary-btn" id="addHolidayBtn"><i class="material-icons">add</i> Add Closure</button></div>
      </div>
      <ul class="holiday-list">
        ${
          holidays.length
            ? holidays
                .map(
                  (h) => `
          <li class="${h.date < today ? "past" : ""}">
            <span><strong>${parseDate(h.date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}</strong> · ${escapeHtml(h.name)}</span>
            <button type="button" class="roster-btn danger" data-remove-holiday="${h.date}"><i class="material-icons">delete</i> Remove</button>
          </li>`,
                )
                .join("")
            : '<li class="empty-msg">No closures added.</li>'
        }
      </ul>
    </div>
  `;

  const read = () => {
    const lunch = container.querySelector("#lunchHour").value;
    return {
      ...settings,
      openHour: Number(container.querySelector("#openHour").value),
      closeHour: Number(container.querySelector("#closeHour").value),
      lunchHour: lunch === "" ? null : Number(lunch),
      maxPerDay: Number(container.querySelector("#maxPerDay").value),
    };
  };
  const preview = container.querySelector("#slotPreview");
  const updatePreview = () => {
    const next = read();
    const slots = getSlots(next);
    preview.textContent = slots.length
      ? `${slots.length} one-hour booking times a day: ${slots.map(formatTime12).join(", ")}. Each counselor takes at most ${next.maxPerDay} booked sessions a day.`
      : "No booking times. Check the hours.";
  };
  container
    .querySelectorAll("#openHour, #closeHour, #lunchHour, #maxPerDay")
    .forEach((s) => {
      s.onchange = updatePreview;
    });
  updatePreview();

  // Existing bookings are kept; the admin is told so counselors can follow up
  const confirmAffected = (next) => {
    const affected = bookingsOutside(next).length;
    return (
      affected === 0 ||
      window.confirm(
        `${affected} upcoming pending/approved session(s) fall outside these hours or on a closure. They will stay booked, so counselors should reschedule them. Continue?`,
      )
    );
  };

  container.querySelector("#saveHoursBtn").onclick = () => {
    const next = read();
    if (next.openHour >= next.closeHour) {
      alert("Closing time must be after opening time.");
      return;
    }
    if (
      next.lunchHour != null &&
      (next.lunchHour <= next.openHour || next.lunchHour >= next.closeHour - 1)
    ) {
      alert(
        "Lunch must fall inside office hours, not at the first or last hour.",
      );
      return;
    }
    if (!confirmAffected(next)) return;
    saveSettings(next);
    window.logActivity(
      adminSession,
      `Changed office hours to ${officeHoursText(next)}`,
    );
    renderOfficeSettings(container);
  };

  container.querySelector("#addHolidayBtn").onclick = () => {
    const date = container.querySelector("#holidayDate").value;
    const name = container.querySelector("#holidayName").value.trim();
    if (!date || !name) {
      alert("Please enter both the date and a name for the closure.");
      return;
    }
    if (settings.holidays.some((h) => h.date === date)) {
      alert("That date is already closed.");
      return;
    }
    const next = {
      ...settings,
      holidays: [...settings.holidays, { date, name }],
    };
    if (!confirmAffected(next)) return;
    saveSettings(next);
    window.logActivity(adminSession, `Added office closure ${date} (${name})`);
    renderOfficeSettings(container);
  };

  container.querySelectorAll("[data-remove-holiday]").forEach((btn) => {
    btn.onclick = () => {
      const date = btn.dataset.removeHoliday;
      saveSettings({
        ...settings,
        holidays: settings.holidays.filter((h) => h.date !== date),
      });
      window.logActivity(adminSession, `Removed office closure ${date}`);
      renderOfficeSettings(container);
    };
  });
}

export function renderLogsView(container) {
  // 1. Initial Data Load
  const allLogs = getActivityLogs();

  // 2. Render the layout with Search Bar
  container.innerHTML = `
    <div class="admin-card">
      <div class="card-header" style="display: flex; justify-content: space-between; align-items: center;">
        <h2><i class="material-icons">history</i> System Activity Logs</h2>
        <input type="text" id="logSearch" placeholder="Search logs (e.g. login, booking)..." 
               style="padding: 8px; border: 1px solid #ddd; border-radius: 4px; width: 300px;">
      </div>
      <div id="logsTableContainer"></div>
    </div>
  `;

  const tableContainer = document.getElementById("logsTableContainer");
  const searchInput = document.getElementById("logSearch");

  // 3. Render Table Function
  const updateTable = (filterText = "") => {
    const filtered = allLogs
      .filter(
        (log) =>
          log.action.toLowerCase().includes(filterText.toLowerCase()) ||
          log.userName.toLowerCase().includes(filterText.toLowerCase()),
      )
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    tableContainer.innerHTML = `
      <table class="admin-table">
        <thead>
          <tr><th>Time</th><th>User</th><th>Role</th><th>Action</th></tr>
        </thead>
        <tbody>
          ${filtered
            .map(
              (log) => `
            <tr>
              <td>${new Date(log.timestamp).toLocaleString()}</td>
              <td>${escapeHtml(log.userName)}</td>
              <td>${escapeHtml(log.userRole)}</td>
              <td>${escapeHtml(log.action)}</td>
            </tr>
          `,
            )
            .join("")}
        </tbody>
      </table>
    `;
  };

  // 4. Attach Event Listener for Search
  searchInput.oninput = (e) => updateTable(e.target.value);

  // Initial render
  updateTable();
}

function renderStudentViewer(container) {
  const students = getUsers().filter((u) => u.role === "student");
  const activeCount = students.filter((s) => s.active !== false).length;

  container.innerHTML = `
        <div class="admin-card full-width">
            <div class="card-header" style="display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap;">
                <div>
                    <h2><i class="material-icons">school</i> Registered Students</h2>
                    <p class="subtitle" style="margin: 4px 0 0; color: #64748b; font-size: 0.85rem;">${activeCount} active · ${students.length - activeCount} deactivated</p>
                </div>
                <input type="text" id="rosterSearch" placeholder="Search name, email, course..." style="padding: 8px 10px; border: 1px solid #cbd5e1; border-radius: 6px; min-width: 0; width: 260px; max-width: 100%;">
            </div>
            <div class="table-container">
                <table class="admin-table" id="rosterTable">
                    <thead>
                        <tr>
                            <th>Student</th>
                            <th>Email Address</th>
                            <th>Course</th>
                            <th>Status</th>
                            <th style="text-align: right;">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${
                          students.length > 0
                            ? students
                                .map((s) => {
                                  const active = s.active !== false;
                                  return `
                            <tr>
                                <td data-label="Student">
                                    <div style="display: flex; flex-direction: column;">
                                        <strong style="color: #1e293b;">${escapeHtml(s.name)}</strong>
                                        <span style="font-size: 0.75rem; color: #64748b; font-family: monospace;">@${escapeHtml(s.user)} · ${escapeHtml(s.yearLevel || "")}</span>
                                    </div>
                                </td>
                                <td data-label="Email" style="color: #475569;">${escapeHtml(s.email)}</td>
                                <td data-label="Course">
                                    <span style="background: #eff6ff; color: #1e40af; padding: 3px 8px; border-radius: 4px; font-size: 0.8rem; font-weight: 600;">
                                        ${escapeHtml(s.course || "Unassigned")} ${escapeHtml(s.section || "")}
                                    </span>
                                </td>
                                <td data-label="Status">
                                    <span class="status-pill ${active ? "approved" : "cancelled"}">${active ? "Active" : "Deactivated"}</span>
                                </td>
                                <td data-label="Actions" style="text-align: right;">
                                    <div style="display: flex; justify-content: flex-end; gap: 8px; flex-wrap: wrap;">
                                        <button type="button" class="roster-btn" onclick="window.resetStudentPassword(${s.id})">
                                            <i class="material-icons">key</i> Reset password
                                        </button>
                                        <button type="button" class="roster-btn ${active ? "danger" : ""}" onclick="window.toggleStudentActive(${s.id})">
                                            <i class="material-icons">${active ? "block" : "check_circle"}</i> ${active ? "Deactivate" : "Activate"}
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        `;
                                })
                                .join("")
                            : '<tr><td colspan="5" style="text-align:center; padding: 2rem;">No registered students yet.</td></tr>'
                        }
                    </tbody>
                </table>
            </div>
        </div>
    `;

  document.getElementById("rosterSearch").oninput = (e) => {
    const term = e.target.value.toLowerCase().trim();
    container.querySelectorAll("#rosterTable tbody tr").forEach((row) => {
      row.style.display = row.textContent.toLowerCase().includes(term)
        ? ""
        : "none";
    });
  };
}

window.toggleStudentActive = (id) => {
  const users = getUsers();
  const student = users.find((u) => u.id === id);
  if (!student) return;
  const deactivating = student.active !== false;

  if (
    deactivating &&
    !window.confirm(
      `Deactivate ${student.name}? They won't be able to sign in until you activate the account again.`,
    )
  ) {
    return;
  }

  student.active = !deactivating;
  saveUsers(users);
  window.logActivity(
    adminSession,
    `${deactivating ? "Deactivated" : "Activated"} student account ${student.name}`,
  );
  renderStudentViewer(document.getElementById("admin-dynamic-content"));
};

window.resetStudentPassword = async (id) => {
  const users = getUsers();
  const student = users.find((u) => u.id === id);
  if (!student) return;
  if (isRemote) {
    // With Supabase, admins never see or set passwords: the student gets a link
    if (
      !window.confirm(
        `Email ${student.name} a password reset link at ${student.email}?`,
      )
    )
      return;
    const problem = await sendResetEmail(student.email);
    if (problem) {
      alert(problem);
      return;
    }
    window.logActivity(adminSession, `Sent password reset to ${student.name}`);
    alert(
      `Reset link sent. ${student.name} opens it from their email and chooses a new password.`,
    );
    return;
  }
  if (!window.confirm(`Reset the password for ${student.name}?`)) return;

  // Readable temporary password, e.g. "gg-7k2m9p"
  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  const rand = crypto.getRandomValues(new Uint32Array(6));
  const temp = `gg-${Array.from(rand, (n) => chars[n % chars.length]).join("")}`;
  student.pass = await hashPassword(temp);
  saveUsers(users);
  window.logActivity(adminSession, `Reset password for ${student.name}`);

  // prompt() shows the password in a selectable field so it can be copied
  window.prompt(
    `Temporary password for ${student.name}. Copy it now; it won't be shown again. They can change it with "Forgot Password".`,
    temp,
  );
};

// --- MODAL ENGINE OPERATIONAL CONTROLS ---

function setupModalHandlers() {
  const modal = document.getElementById("counselorModal");
  const closeBtn = document.getElementById("closeModalBtn");
  const saveBtn = document.getElementById("saveCounselorBtn");

  closeBtn.onclick = () => {
    modal.style.display = "none";
  };

  modal.onclick = (e) => {
    if (e.target === modal) {
      modal.style.display = "none";
    }
  };

  saveBtn.onclick = async () => {
    const id =
      Number(document.getElementById("counselorIdField").value) || null;
    const name = document.getElementById("counselorNameField").value.trim();
    const email = document.getElementById("counselorEmailField").value.trim();
    const specialty = document.getElementById("counselorSpecialtyField").value;
    const password = document
      .getElementById("counselorPasswordField")
      .value.trim();

    if (!name || !email) {
      alert("Name and email are required.");
      return;
    }
    if (password && password.length < 8) {
      alert("Counselor passwords must be at least 8 characters.");
      return;
    }

    const users = getUsers();
    const username = email.split("@")[0];
    if (isUsernameOrEmailTaken(username, email, id)) {
      alert("Another account already uses this email or username.");
      return;
    }

    if (isRemote && !id) {
      await addCounselorRemote({ name, email, password, specialty });
      return;
    }
    if (id) {
      const index = users.findIndex((u) => u.id === id);
      if (index !== -1) {
        // Keep the counselor's name current on their appointments
        if (users[index].name !== name) {
          saveAppointments(
            getAppointments().map((a) =>
              a.counselorId === id ? { ...a, counselorName: name } : a,
            ),
          );
        }
        users[index].name = name;
        // The sign-in email can't be changed here once accounts live in Supabase
        if (!isRemote) {
          users[index].email = email;
          [users[index].user] = email.split("@");
        }
        users[index].specialty = specialty; // Save modified specialty parameter

        if (password && !isRemote) {
          users[index].pass = await hashPassword(password);
        }

        saveUsers(users);
        window.logActivity(adminSession, `Updated counselor ${name}`);
        alert("Counselor profiles updated successfully!");
      }
    } else {
      if (!password) {
        alert("Password parameter is required for initializing new records!");
        return;
      }

      const newUser = {
        id: Date.now(),
        name,
        email,
        user: username,
        pass: await hashPassword(password),
        role: "guidance",
        specialty, // Bind custom focus value to record object schema
        active: true,
      };

      users.push(newUser);
      saveUsers(users);
      window.logActivity(adminSession, `Added counselor ${name}`);
      alert("Counselor initialization complete!");
    }

    modal.style.display = "none";
    const content = document.getElementById("admin-dynamic-content");
    renderStaffManager(content);
  };
}

async function addCounselorRemote({ name, email, password, specialty }) {
  if (!password) {
    alert("Please set a starting password for the new counselor.");
    return;
  }
  const saveBtn = document.getElementById("saveCounselorBtn");
  saveBtn.disabled = true;
  saveBtn.textContent = "Creating...";
  const result = await createCounselor({ name, email, password, specialty });
  saveBtn.disabled = false;
  saveBtn.textContent = "Save Counselor";
  if (result.error) {
    alert(result.error);
    return;
  }
  window.logActivity(adminSession, `Added counselor ${name}`);
  alert(
    result.needsConfirmation
      ? `Counselor added. ${name} must click the confirmation link sent to ${email} before signing in.`
      : "Counselor added.",
  );
  document.getElementById("counselorModal").style.display = "none";
  renderStaffManager(document.getElementById("admin-dynamic-content"));
}

window.openAddCounselorModal = () => {
  document.getElementById("modalTitle").innerHTML =
    '<i class="material-icons" style="color: #2563eb;">person_add</i> Add Counselor';
  document.getElementById("counselorIdField").value = "";
  document.getElementById("counselorNameField").value = "";
  document.getElementById("counselorEmailField").value = "";
  document.getElementById("counselorSpecialtyField").value =
    "General Counseling";
  document.getElementById("counselorPasswordField").value = "";
  document.getElementById("passwordLabel").textContent = "Password";
  document.getElementById("counselorEmailField").readOnly = false;
  document.getElementById("counselorPasswordField").disabled = false;

  document.getElementById("counselorModal").style.display = "flex";
};

window.openEditCounselorModal = (id) => {
  const targetUser = getUserById(id);

  if (!targetUser) return;

  document.getElementById("modalTitle").innerHTML =
    '<i class="material-icons" style="color: #2563eb;">edit</i> Edit Counselor Details';
  document.getElementById("counselorIdField").value = targetUser.id;
  document.getElementById("counselorNameField").value = targetUser.name;
  document.getElementById("counselorEmailField").value = targetUser.email;
  // Keep an older specialty that's no longer in the list instead of blanking it
  const specialtySelect = document.getElementById("counselorSpecialtyField");
  const specialty = targetUser.specialty || "General Counseling";
  if (![...specialtySelect.options].some((o) => o.value === specialty)) {
    specialtySelect.add(new Option(specialty, specialty));
  }
  specialtySelect.value = specialty;
  document.getElementById("counselorPasswordField").value = "";
  document.getElementById("passwordLabel").textContent = isRemote
    ? 'Password (counselors change their own, or use "Forgot Password?")'
    : "New Password (Leave blank to keep old password)";
  document.getElementById("counselorPasswordField").disabled = isRemote;
  // The sign-in email belongs to the counselor's Supabase account
  document.getElementById("counselorEmailField").readOnly = isRemote;

  document.getElementById("counselorModal").style.display = "flex";
};

window.removeUser = (id) => {
  const counselor = getUsers().find((u) => u.id === id);
  if (!counselor) return;

  // Don't leave students with appointments pointing at a deleted counselor
  const active = getAppointments().filter(
    (a) => a.counselorId === id && ["pending", "approved"].includes(a.status),
  );
  const question = active.length
    ? `${counselor.name} has ${active.length} pending or approved appointment(s). They will move back to the shared queue so another counselor can take them. Delete ${counselor.name}?`
    : `Are you sure you want to remove ${counselor.name}?`;
  if (!window.confirm(question)) return;

  if (active.length) {
    const activeIds = active.map((a) => a.id);
    saveAppointments(
      getAppointments().map((a) =>
        activeIds.includes(a.id)
          ? {
              ...a,
              counselorId: null,
              counselorName: "Unassigned",
              status: "pending",
              updatedAt: new Date().toISOString(),
            }
          : a,
      ),
    );
    active.forEach((a) =>
      addNotification(
        a.studentId,
        `Your ${a.type} session on ${a.date} is being moved to another counselor. It is pending again until they confirm.`,
      ),
    );
  }

  saveUsers(getUsers().filter((u) => u.id !== id));
  saveBlocks(getBlocks().filter((b) => b.counselorId !== id));
  window.logActivity(adminSession, `Deleted counselor ${counselor.name}`);
  renderStaffManager(document.getElementById("admin-dynamic-content"));
};

// Download every appointment as a spreadsheet-friendly CSV file
window.exportAppointmentsCsv = () => {
  const header = [
    "Date",
    "Time",
    "Student",
    "Student Email",
    "Counselor",
    "Type",
    "Status",
    "Rating",
    "Created",
  ];
  const rows = getAppointments()
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
    .map((a) => [
      a.date,
      formatTime12(a.time),
      a.studentName,
      a.studentEmail,
      a.counselorName || "Unassigned",
      a.type,
      a.status,
      a.feedback?.rating ?? "",
      a.createdAt,
    ]);
  // Notes of any kind stay out of the export: only counselors should read them
  // Leading byte-order mark so Excel reads the file as UTF-8
  const blob = new Blob(
    [String.fromCharCode(0xfeff), toCsv([header, ...rows])],
    {
      type: "text/csv;charset=utf-8",
    },
  );
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `granby-appointments-${toDateStr(new Date())}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  window.logActivity(adminSession, "Exported appointments CSV");
};

function getAnalytics() {
  const apps = getAppointments();
  const users = getUsers();

  const yearBreakdown = {
    "1st Year": 0,
    "2nd Year": 0,
    "3rd Year": 0,
    "4th Year": 0,
    Irregular: 0,
  };
  const courseBreakdown = {};
  const statusBreakdown = {
    pending: 0,
    approved: 0,
    rejected: 0,
    cancelled: 0,
    completed: 0,
    "no-show": 0,
  };
  const dailyTrends = {};

  // Student feedback on completed sessions
  const rated = apps.filter((a) => a.feedback?.rating);
  const average = (list) =>
    (list.reduce((sum, a) => sum + a.feedback.rating, 0) / list.length).toFixed(
      1,
    );
  const byCounselor = Object.values(
    rated.reduce((groups, a) => {
      const key = a.counselorName || "Unassigned";
      (groups[key] ||= { name: key, list: [] }).list.push(a);
      return groups;
    }, {}),
  ).map((g) => ({ name: g.name, count: g.list.length, avg: average(g.list) }));
  const ratings = {
    overall: rated.length ? average(rated) : null,
    count: rated.length,
    byCounselor,
  };

  apps.forEach((app) => {
    const statusKey = app.status?.toLowerCase();
    if (statusBreakdown[statusKey] !== undefined) statusBreakdown[statusKey]++;

    const date = new Date(app.createdAt || Date.now()).toLocaleDateString();
    dailyTrends[date] = (dailyTrends[date] || 0) + 1;

    const student = users.find((u) => u.id === app.studentId);
    if (student) {
      if (student.yearLevel && yearBreakdown[student.yearLevel] !== undefined)
        yearBreakdown[student.yearLevel]++;
      if (student.course) {
        courseBreakdown[student.course] =
          (courseBreakdown[student.course] || 0) + 1;
      }
    }
  });

  const typeCount = (word) =>
    apps.filter((a) => a.type?.toLowerCase().includes(word)).length;
  const academic = typeCount("academic");
  const personal = typeCount("personal");
  const career = typeCount("career");

  const dates = Object.keys(dailyTrends);
  const avgDaily = dates.length ? (apps.length / dates.length).toFixed(1) : 0;

  return {
    totalApps: apps.length,
    approved: statusBreakdown.approved,
    pending: statusBreakdown.pending,
    totalStudents: users.filter((u) => u.role === "student").length,
    academic,
    personal,
    career,
    // Family, bullying, scholarship, etc.
    otherTypes: apps.length - academic - personal - career,
    yearBreakdown,
    courseBreakdown,
    statusBreakdown,
    ratings,
    performance: getCounselorPerformance(apps, users),
    avgDaily,
    mostActiveYear: Object.keys(yearBreakdown).reduce(
      (a, b) => (yearBreakdown[b] > (yearBreakdown[a] || 0) ? b : a),
      "N/A",
    ),
  };
}
