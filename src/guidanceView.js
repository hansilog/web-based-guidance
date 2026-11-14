import { escapeHtml } from "./syncUtil.js";
import {
  formatTime12,
  parseDate,
  appointmentStart,
  COUNSELING_TYPES,
  CONCERN_STATUSES,
} from "./store.js";
import { checkInTag, checkInDetailsHtml } from "./checkin.js";

// guidanceView.js
// --- PURE HTML COMPONENT MODULE ---

const STATUS_LABELS = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Cancelled",
  completed: "Completed",
  "no-show": "No-show",
};

export function statusPill(status) {
  return `<span class="status-pill ${escapeHtml(status)}">${STATUS_LABELS[status] || escapeHtml(status)}</span>`;
}

export function formatDateShort(date) {
  return parseDate(date).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function stars(rating) {
  return "★★★★★".slice(0, rating) + "☆☆☆☆☆".slice(0, 5 - rating);
}

function actionButton(action, id, icon, label, cls) {
  return `<button type="button" class="act-btn ${cls}" data-action="${action}" data-id="${id}" title="${label}"><i class="material-icons">${icon}</i><span>${label}</span></button>`;
}

function renderRowActions(app) {
  if (app.status === "pending") {
    return (
      actionButton("approved", app.id, "check", "Approve", "approve") +
      actionButton("rejected", app.id, "close", "Reject", "reject")
    );
  }
  if (app.status === "approved") {
    if (appointmentStart(app) <= new Date()) {
      return (
        actionButton("completed", app.id, "task_alt", "Complete", "complete") +
        actionButton("no-show", app.id, "person_off", "No-show", "noshow")
      );
    }
    return `<span class="row-note">Upcoming</span>`;
  }
  if (app.status === "cancelled") {
    return `<span class="row-note">Cancelled by student</span>`;
  }
  if (app.status === "completed" && app.feedback) {
    return `<span class="row-note stars" title="Student rating">${stars(app.feedback.rating)}</span>`;
  }
  return `<span class="row-note">Closed</span>`;
}

// At-a-glance row + today's schedule + follow-ups, shown above the queue
// Students who may need outreach (see checkon.js); hidden when the list is empty
function renderCheckOnPanel(rows = []) {
  if (rows.length === 0) return "";
  const open = rows.filter((r) => !r.reachedAt).length;
  const chip = (r) =>
    `<span class="checkon-reason ${r.kind}">${r.kind === "safety" ? '<i class="material-icons" aria-hidden="true">warning</i>' : ""}${escapeHtml(r.label)}</span>`;
  return `
    <section class="overview-panel checkon-panel">
      <h3><i class="material-icons">volunteer_activism</i> Students to check on
        <span class="checkon-count">${open ? `${open} need${open === 1 ? "s" : ""} outreach` : "All reached out"}</span>
      </h3>
      <p class="checkon-intro">Based on check-ins and missed sessions. Nothing is sent until you press Reach out.</p>
      <ul class="checkon-list">
        ${rows
          .map(
            (r) => `
          <li class="checkon-row ${r.reachedAt ? "reached" : ""}">
            <div class="checkon-main">
              <button type="button" class="case-link" data-student="${r.studentId}" title="Open case file">${escapeHtml(r.studentName)}</button>
              <div class="checkon-reasons">${r.reasons.map(chip).join("")}</div>
              <small>${r.nextSession ? `Next session ${formatDateShort(toDateKey(r.nextSession))}, ${formatTime12(timeKey(r.nextSession))}` : "No upcoming session"}</small>
            </div>
            ${
              r.reachedAt
                ? `<span class="checkon-done"><i class="material-icons" aria-hidden="true">done</i> Reached out ${formatDateShort(toDateKey(new Date(r.reachedAt)))}</span>`
                : `<button type="button" class="act-btn complete checkon-btn" data-id="${r.triggerId}" data-student="${r.studentId}"><i class="material-icons">chat</i><span>Reach out</span></button>`
            }
          </li>`,
          )
          .join("")}
      </ul>
    </section>`;
}

const pad = (n) => String(n).padStart(2, "0");
const toDateKey = (d) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const timeKey = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

export function renderOverview({ stats, filter, today, followUps, checkOn }) {
  const statCard = (key, icon, label, value, hint) => `
    <button type="button" class="overview-stat ${key} ${filter === key ? "active" : ""} ${value > 0 ? "has-items" : ""}" data-filter="${key}" aria-pressed="${filter === key}">
      <span class="overview-icon"><i class="material-icons">${icon}</i></span>
      <span class="overview-text">
        <span class="overview-value">${value}</span>
        <span class="overview-label">${label}</span>
        <span class="overview-hint">${hint}</span>
      </span>
    </button>`;

  return `
    <div class="overview-stats">
      ${statCard("pending", "inbox", "Pending Requests", stats.pending, "Waiting for your decision")}
      ${statCard("urgent", "priority_high", "Urgent", stats.urgent, "Review these first")}
      ${statCard("today", "today", "Today's Sessions", stats.today, "Approved for today")}
      ${statCard("to-close", "task_alt", "Needs Closing", stats.toClose, "Session time has passed")}
    </div>

    ${renderCheckOnPanel(checkOn)}

    <div class="overview-panels">
      <section class="overview-panel">
        <h3><i class="material-icons">schedule</i> Today's Schedule</h3>
        ${
          today.length
            ? `<ul class="panel-list">${today
                .map(
                  (app) => `
              <li class="panel-row">
                <span class="panel-time">${formatTime12(app.time)}</span>
                <span class="panel-main">
                  <button type="button" class="case-link" data-student="${app.studentId}" title="Open case file">${escapeHtml(app.studentName)}</button>
                  <small>${escapeHtml(app.type)}${app.mode ? ` · ${escapeHtml(app.mode)}` : ""}</small>
                </span>
                <span class="action-btns">${renderRowActions(app)}</span>
              </li>`,
                )
                .join("")}</ul>`
            : `<p class="panel-empty">No sessions scheduled today.</p>`
        }
      </section>

      <section class="overview-panel">
        <h3><i class="material-icons">event_repeat</i> Follow-ups to Schedule</h3>
        ${
          followUps.length
            ? `<ul class="panel-list">${followUps
                .map(
                  (app) => `
              <li class="panel-row">
                <span class="panel-main">
                  <button type="button" class="case-link" data-student="${app.studentId}" title="Open case file">${escapeHtml(app.studentName)}</button>
                  <small>${escapeHtml(app.type)} · Last seen ${formatDateShort(app.date)}</small>
                </span>
                <button type="button" class="act-btn complete remind-btn" data-id="${app.id}" ${app.followUpRemindedAt ? "disabled" : ""}>
                  <i class="material-icons">${app.followUpRemindedAt ? "done" : "notifications_active"}</i>
                  <span>${app.followUpRemindedAt ? "Reminded" : "Remind"}</span>
                </button>
              </li>`,
                )
                .join("")}</ul>`
            : `<p class="panel-empty">No follow-ups waiting. Students you recommend for a follow-up appear here until they book again.</p>`
        }
      </section>
    </div>
  `;
}

const ACTIVE = ["pending", "approved"];

const FILTERS = [
  ["all", "All"],
  ["pending", "Pending"],
  ["urgent", "Urgent"],
  ["today", "Today's sessions"],
  ["approved", "Approved"],
  ["to-close", "Needs closing"],
  ["completed", "Completed"],
  ["walk-in", "Walk-ins"],
  ["closed", "Rejected / Cancelled / No-show"],
];

export function generateAppointmentsTableHtml(
  appointments = [],
  filter = "all",
) {
  return `
    <div class="table-card">
        <div class="table-header-main">
            <h2><i class="material-icons">event_note</i> Appointment Requests</h2>
            <div class="table-tools">
                <button type="button" id="logWalkInBtn" class="act-btn complete">
                    <i class="material-icons">directions_walk</i><span>Log Walk-in</span>
                </button>
                <select id="statusFilter" aria-label="Filter by status">
                  ${FILTERS.map(
                    ([value, label]) =>
                      `<option value="${value}" ${value === filter ? "selected" : ""}>${label}</option>`,
                  ).join("")}
                </select>
                <input type="text" id="tableSearch" placeholder="Search student name...">
            </div>
        </div>
        <div class="table-responsive">
            <table id="adminTable">
                <thead>
                    <tr>
                        <th>Student</th>
                        <th>Type</th>
                        <th>Date & Time</th>
                        <th>Status</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${
                      appointments.length > 0
                        ? appointments
                            .map(
                              (app) => `
                        <tr class="${["cancelled", "rejected", "no-show"].includes(app.status) ? "faded-row" : ""} ${app.urgent && app.status === "pending" ? "urgent-row" : ""}">
                            <td data-label="Student">
                                <div class="user-info">
                                    <button type="button" class="case-link user-name" data-student="${app.studentId}" title="Open case file">${escapeHtml(app.studentName)}</button>
                                    <span class="user-email">${escapeHtml(app.studentEmail || "no-email")}</span>
                                </div>
                            </td>
                            <td data-label="Category">
                                <span class="type-tag">${escapeHtml(app.type)}</span>
                                ${app.urgent && app.status === "pending" ? '<span class="urgent-tag">Urgent</span>' : ""}
                                ${ACTIVE.includes(app.status) ? checkInTag(app.checkIn) : ""}
                                ${app.mode ? `<div class="row-sub">${escapeHtml(app.mode)}</div>` : ""}
                                ${app.notes ? `<div class="row-sub" title="${escapeHtml(app.notes)}">“${escapeHtml(app.notes.length > 60 ? `${app.notes.slice(0, 57)}...` : app.notes)}”</div>` : ""}
                            </td>
                            <td data-label="Schedule">
                                <div class="date-info">
                                    <div>${formatDateShort(app.date)}</div>
                                    <small>${formatTime12(app.time)}</small>
                                    ${
                                      app.rescheduledFrom
                                        ? `<div class="row-sub accent">Moved from ${formatDateShort(app.rescheduledFrom.date)}, ${formatTime12(app.rescheduledFrom.time)}</div>`
                                        : ""
                                    }
                                    ${!app.counselorId ? `<div class="row-sub">Unassigned — approve to take it</div>` : ""}
                                </div>
                            </td>
                            <td data-label="Status">${statusPill(app.status)}</td>
                            <td data-label="Actions">
                                <div class="action-btns">${renderRowActions(app)}</div>
                            </td>
                        </tr>`,
                            )
                            .join("")
                        : '<tr><td colspan="5" class="empty-row">No appointments match this view.</td></tr>'
                    }
                </tbody>
            </table>
        </div>
    </div>
  `;
}

// Body of the approve / reject dialog
export function renderDecisionBody(app, status, slotOptions) {
  const isApprove = status === "approved";
  return `
    <p class="modal-lead"><strong>${escapeHtml(app.studentName)}</strong> · ${escapeHtml(app.type)}${app.mode ? ` · ${escapeHtml(app.mode)}` : ""}${app.urgent ? ' <span class="urgent-tag">Urgent</span>' : ""}<br>
    ${formatDateShort(app.date)}, ${formatTime12(app.time)}</p>
    ${app.notes ? `<p class="modal-quote">“${escapeHtml(app.notes)}”</p>` : ""}
    ${checkInDetailsHtml(app.checkIn)}
    ${
      isApprove
        ? `
      <label class="modal-label" for="decisionTime">Time</label>
      <select id="decisionTime" class="modal-input">
        ${slotOptions
          .map(
            (s) =>
              `<option value="${s.time}" ${s.time === app.time ? "selected" : ""} ${s.free || s.time === app.time ? "" : "disabled"}>${formatTime12(s.time)}${s.time === app.time ? " (requested)" : ""}${!s.free && s.time !== app.time ? " — taken" : ""}</option>`,
          )
          .join("")}
      </select>
      <label class="modal-label" for="decisionNotes">Instructions for the student (optional)</label>
      <textarea id="decisionNotes" class="modal-input" rows="3" placeholder="e.g. Please bring your student ID."></textarea>
      <p class="modal-hint">The student is emailed and notified. The session is also added to your Google Calendar.</p>`
        : `
      <label class="modal-label" for="decisionNotes">Reason for rejection (required)</label>
      <textarea id="decisionNotes" class="modal-input" rows="3" placeholder="e.g. Schedule conflict, please choose another date."></textarea>
      <p class="modal-hint">The student is emailed and notified.</p>`
    }
  `;
}

// Body of the complete / no-show dialog
export function renderCloseBody(app, status) {
  const isComplete = status === "completed";
  return `
    <p class="modal-lead"><strong>${escapeHtml(app.studentName)}</strong> · ${escapeHtml(app.type)}${app.mode ? ` · ${escapeHtml(app.mode)}` : ""}${app.urgent ? ' <span class="urgent-tag">Urgent</span>' : ""}<br>
    ${formatDateShort(app.date)}, ${formatTime12(app.time)}</p>
    ${
      isComplete
        ? `
      <label class="modal-label" for="closeCaseNotes">Private case notes</label>
      <textarea id="closeCaseNotes" class="modal-input" rows="4" placeholder="What was discussed, observations, agreed next steps..."></textarea>
      <p class="modal-hint"><i class="material-icons">lock</i> Only guidance counselors can see case notes.</p>
      <label class="modal-label" for="closeMessage">Message to the student (optional)</label>
      <textarea id="closeMessage" class="modal-input" rows="2" placeholder="e.g. Great progress today. Keep the study plan going."></textarea>
      <label class="modal-check"><input type="checkbox" id="closeFollowUp"> Recommend a follow-up session</label>`
        : `
      <label class="modal-label" for="closeCaseNotes">Private note (optional)</label>
      <textarea id="closeCaseNotes" class="modal-input" rows="3" placeholder="e.g. Did not arrive, no message received."></textarea>
      <p class="modal-hint">The student is notified that they missed the session.</p>`
    }
  `;
}

// Body of the log walk-in dialog
export function renderWalkInBody(students, date, time) {
  return `
    <p class="modal-hint">For students who came to the office without booking. This saves a completed session to their case file.</p>
    <label class="modal-label" for="walkInStudent">Student</label>
    <select id="walkInStudent" class="modal-input">
      <option value="">Select a student...</option>
      ${students
        .map(
          (s) =>
            `<option value="${s.id}">${escapeHtml(s.name)}${s.course ? ` (${escapeHtml(s.course)}${s.section ? ` ${escapeHtml(s.section)}` : ""})` : ""}</option>`,
        )
        .join("")}
    </select>
    <label class="modal-label" for="walkInType">Reason for visit</label>
    <select id="walkInType" class="modal-input">
      <option value="">Select a reason...</option>
      ${COUNSELING_TYPES.map((t) => `<option value="${t}">${t}</option>`).join("")}
    </select>
    <div class="walkin-when">
      <div>
        <label class="modal-label" for="walkInDate">Date</label>
        <input type="date" id="walkInDate" class="modal-input" value="${date}" max="${date}">
      </div>
      <div>
        <label class="modal-label" for="walkInTime">Time</label>
        <input type="time" id="walkInTime" class="modal-input" value="${time}">
      </div>
    </div>
    <label class="modal-label" for="walkInNotes">Private case notes</label>
    <textarea id="walkInNotes" class="modal-input" rows="4" placeholder="What was discussed, observations, agreed next steps..."></textarea>
    <p class="modal-hint"><i class="material-icons">lock</i> Only guidance counselors can see case notes.</p>
    <label class="modal-check"><input type="checkbox" id="walkInFollowUp"> Recommend a follow-up session</label>
  `;
}

// Student case file: profile, rating, AI summary, full session timeline
export function renderCaseFile(student, apps) {
  const rated = apps.filter((a) => a.feedback);
  const avg = rated.length
    ? (
        rated.reduce((sum, a) => sum + a.feedback.rating, 0) / rated.length
      ).toFixed(1)
    : null;
  const count = (status) => apps.filter((a) => a.status === status).length;

  return `
    <div class="case-profile">
      <div><span class="case-label">Course</span>${escapeHtml(student.course || "N/A")} ${escapeHtml(student.section || "")}</div>
      <div><span class="case-label">Year</span>${escapeHtml(student.yearLevel || "N/A")}</div>
      <div><span class="case-label">Email</span>${escapeHtml(student.email)}</div>
      <div><span class="case-label">Sessions</span>${count("completed")} completed · ${count("no-show")} no-show · ${count("pending") + count("approved")} active</div>
      <div><span class="case-label">Avg. rating</span>${avg ? `${avg} / 5` : "No ratings yet"}</div>
    </div>

    <div class="ai-summary-box">
      <div class="ai-summary-head">
        <span><i class="material-icons">psychology</i> AI case summary</span>
        <button type="button" id="aiSummaryBtn" class="modal-btn secondary-btn" ${apps.length ? "" : "disabled"}>Generate</button>
      </div>
      <div id="aiSummaryOutput" class="ai-summary-output">Summarizes this student's sessions and notes with Gemini. Notes are sent to Google to create the summary.</div>
    </div>

    <h4 class="case-heading">Session timeline</h4>
    <div class="case-timeline">
      ${
        apps.length
          ? apps
              .map(
                (a) => `
        <div class="case-entry">
          <div class="case-entry-head">
            <strong>${formatDateShort(a.date)}, ${formatTime12(a.time)}</strong>
            ${statusPill(a.status)}
          </div>
          <div class="case-entry-meta">${escapeHtml(a.type)} · ${escapeHtml(a.counselorName || "Unassigned")}${a.walkIn ? " · Walk-in" : ""}</div>
          ${a.notes ? `<div class="case-line"><span>Student:</span> ${escapeHtml(a.notes)}</div>` : ""}
          ${checkInDetailsHtml(a.checkIn)}
          ${a.counselorNotes ? `<div class="case-line"><span>To student:</span> ${escapeHtml(a.counselorNotes)}</div>` : ""}
          ${a.caseNotes ? `<div class="case-line private"><span><i class="material-icons">lock</i> Case notes:</span> ${escapeHtml(a.caseNotes)}</div>` : ""}
          ${a.followUp ? `<div class="case-line accent">Follow-up recommended</div>` : ""}
          ${a.feedback ? `<div class="case-line"><span>Rating:</span> <span class="stars">${stars(a.feedback.rating)}</span> ${escapeHtml(a.feedback.comment || "")}</div>` : ""}
        </div>`,
              )
              .join("")
          : `<p class="empty-msg">No sessions on file yet.</p>`
      }
    </div>
  `;
}

export function renderStudentRecords(students = []) {
  return `
    <div class="admin-card">
        <div class="card-header">
            <h2><i class="material-icons">people</i> Student Directory</h2>
            <div class="table-tools">
                <input type="text" id="studentSearch" placeholder="Search by name, course, or email...">
            </div>
        </div>
        <div class="table-container">
            <table id="studentTable">
                <thead>
                    <tr>
                        <th>Student Name</th>
                        <th>Year Level</th>
                        <th>Course & Section</th>
                        <th>Email Address</th>
                        <th>Case File</th>
                    </tr>
                </thead>
                <tbody>
                    ${
                      students.length > 0
                        ? students
                            .map(
                              (std) => `
                        <tr>
                            <td data-label="Student" class="user-name"><strong>${escapeHtml(std.name)}</strong>${std.active === false ? ' <span class="row-note">(deactivated)</span>' : ""}</td>
                            <td data-label="Year"><span class="level-badge">${escapeHtml(std.yearLevel || "N/A")}</span></td>
                            <td data-label="Course">
                                <div class="course-info">
                                    <span class="course-text">${escapeHtml(std.course || "N/A")}</span>
                                    <small class="section-text">${std.section ? `- ${escapeHtml(std.section)}` : ""}</small>
                                </div>
                            </td>
                            <td data-label="Email">${escapeHtml(std.email)}</td>
                            <td data-label="Case File">
                                <button type="button" class="case-link case-btn" data-student="${std.id}">
                                    <i class="material-icons">folder_open</i> Open
                                </button>
                            </td>
                        </tr>
                    `,
                            )
                            .join("")
                        : '<tr><td colspan="5" class="empty-row">No registered students found.</td></tr>'
                    }
                </tbody>
            </table>
            <button id="printStudentBtn" class="btn-secondary" style="margin-top: 15px;">
                <i class="material-icons">print</i> Export PDF
            </button>
        </div>
    </div>
  `;
}

export function renderGuidanceSettings(notifyEmail) {
  return `
    <div class="glass-card settings-card">
        <div class="card-header">
            <h2><i class="material-icons">settings</i> Settings</h2>
            <p>Choose where booking emails go and change your password.</p>
        </div>

        <form id="settingsForm" class="settings-form">
            <div class="form-group">
                <label for="adminEmail">Send booking, cancellation, and reschedule emails to</label>
                <input type="email" id="adminEmail" value="${escapeHtml(notifyEmail)}" required>
            </div>
            <button type="submit" class="primary-btn">Update Email</button>
        </form>

        <hr style="margin: 30px 0; border: 0; border-top: 1px solid #e2e8f0;">

        <div class="settings-form">
            <div class="form-group">
                <label>Change Password</label>
                <div class="input-wrapper password-wrapper">
                    <input type="password" id="newPassword" placeholder="Enter new password (8+ characters)">
                    <button type="button" class="toggle-password" data-target="newPassword">
                        <i class="material-icons">visibility</i>
                    </button>
                </div>
            </div>

            <div id="otpContainer" class="form-group hidden" style="margin-top: 15px;">
                <label for="otpInput">Enter the 6-digit OTP sent to your account email</label>
                <div class="input-wrapper password-wrapper">
                    <input type="password" id="otpInput" maxlength="6" placeholder="000000" style="letter-spacing: 5px; text-align: center; font-weight: bold;">
                    <button type="button" class="toggle-password" data-target="otpInput">
                        <i class="material-icons">visibility</i>
                    </button>
                </div>
                <button type="button" id="verifyOtpBtn" class="primary-btn" style="margin-top: 10px; background: #8b5cf6;">Verify & Save Password</button>
            </div>

            <div class="settings-actions" id="passActionContainer">
                <button type="button" id="requestOtpBtn" class="btn-secondary">Request OTP to Change Password</button>
            </div>
        </div>
    </div>
  `;
}

const LOG_ICONS = {
  approved: "check_circle",
  rejected: "block",
  cancelled: "cancel",
  completed: "task_alt",
  "no-show": "person_off",
  pending: "schedule",
};

export function renderLogs(activities = []) {
  return `
    <div class="admin-card">
        <div class="card-header">
            <h2><i class="material-icons">history</i> Activity Logs</h2>
            <p class="subtitle">Latest changes to your appointments.</p>
        </div>
        <div class="log-container">
            ${
              activities.length > 0
                ? activities
                    .map(
                      (log) => `
                <div class="log-entry">
                    <div class="log-icon ${escapeHtml(log.status)}">
                        <i class="material-icons">${LOG_ICONS[log.status] || "event"}</i>
                    </div>
                    <div class="log-details">
                        <p><strong>${escapeHtml((STATUS_LABELS[log.status] || log.status).toUpperCase())}</strong>: ${escapeHtml(log.type)} for <span>${escapeHtml(log.studentName)}</span> on ${formatDateShort(log.date)}, ${formatTime12(log.time)}</p>
                        <small>Updated: ${new Date(log.updatedAt).toLocaleString()}</small>
                        ${log.counselorNotes ? `<div class="log-notes">Note: "${escapeHtml(log.counselorNotes)}"</div>` : ""}
                    </div>
                </div>
            `,
                    )
                    .join("")
                : '<p class="empty-msg">No recent activity found.</p>'
            }
        </div>
    </div>
  `;
}

// --- ANONYMOUS CONCERNS ---

function concernStatusPill(status) {
  return `<span class="concern-pill ${escapeHtml(status)}">${CONCERN_STATUSES[status] || escapeHtml(status)}</span>`;
}

export function renderConcerns(concerns = [], filter = "open") {
  const counts = {
    new: concerns.filter((c) => c.status === "new").length,
    reviewing: concerns.filter((c) => c.status === "reviewing").length,
    resolved: concerns.filter((c) => c.status === "resolved").length,
  };
  const shown = concerns
    .filter((c) => {
      if (filter === "open") return c.status !== "resolved";
      if (filter === "all") return true;
      return c.status === filter;
    })
    // Newest unresolved first
    .sort(
      (a, b) =>
        (a.status === "resolved") - (b.status === "resolved") ||
        new Date(b.createdAt) - new Date(a.createdAt),
    );

  const filterBtn = (key, label) =>
    `<button type="button" class="concern-filter ${filter === key ? "active" : ""}" data-concern-filter="${key}" aria-pressed="${filter === key}">${label}</button>`;

  return `
    <div class="admin-card">
      <div class="card-header concern-header">
        <div>
          <h2><i class="material-icons">shield</i> Anonymous Concerns</h2>
          <p class="subtitle">Reports sent from the landing page without signing in. Reporters check for your reply with their reference code.</p>
        </div>
        <div class="concern-filters">
          ${filterBtn("open", `Open (${counts.new + counts.reviewing})`)}
          ${filterBtn("new", `New (${counts.new})`)}
          ${filterBtn("resolved", `Resolved (${counts.resolved})`)}
          ${filterBtn("all", "All")}
        </div>
      </div>

      ${
        shown.length
          ? `<div class="concern-list">${shown
              .map(
                (c) => `
        <article class="concern-card ${escapeHtml(c.status)}">
          <header class="concern-card-head">
            <div>
              <strong>${escapeHtml(c.category)}</strong>
              <small>${escapeHtml(c.ref)} · ${new Date(c.createdAt).toLocaleString()}</small>
            </div>
            ${concernStatusPill(c.status)}
          </header>
          <p class="concern-text">${escapeHtml(c.description)}</p>
          <dl class="concern-meta">
            ${c.location ? `<div><dt>Where</dt><dd>${escapeHtml(c.location)}</dd></div>` : ""}
            ${c.when ? `<div><dt>When</dt><dd>${escapeHtml(c.when)}</dd></div>` : ""}
            <div><dt>Contact</dt><dd>${c.contact ? escapeHtml(c.contact) : "Anonymous (no contact given)"}</dd></div>
            ${c.handledBy ? `<div><dt>Handled by</dt><dd>${escapeHtml(c.handledBy)}</dd></div>` : ""}
          </dl>
          <div class="concern-form">
            <label class="modal-label" for="concernStatus-${c.id}">Status</label>
            <select id="concernStatus-${c.id}" class="modal-input concern-status">
              ${Object.entries(CONCERN_STATUSES)
                .map(
                  ([key, label]) =>
                    `<option value="${key}" ${c.status === key ? "selected" : ""}>${label}</option>`,
                )
                .join("")}
            </select>
            <label class="modal-label" for="concernResponse-${c.id}">Reply to the reporter (they see this with their code)</label>
            <textarea id="concernResponse-${c.id}" class="modal-input concern-response" rows="2" placeholder="e.g. Thank you. We are looking into this and have spoken with the class adviser.">${escapeHtml(c.response || "")}</textarea>
            <label class="modal-label" for="concernNotes-${c.id}">Internal notes (counselors only)</label>
            <textarea id="concernNotes-${c.id}" class="modal-input concern-notes" rows="2">${escapeHtml(c.internalNotes || "")}</textarea>
            <div class="concern-actions">
              <button type="button" class="act-btn complete concern-save" data-id="${c.id}"><i class="material-icons">save</i><span>Save</span></button>
            </div>
          </div>
        </article>`,
              )
              .join("")}</div>`
          : `<p class="empty-msg">No concerns in this view.</p>`
      }
    </div>
  `;
}
