import "./styles/student.css";
import emailjs from "@emailjs/browser";
import {
  format,
  startOfMonth,
  endOfMonth,
  getDay,
  getDate,
  isSameDay,
} from "date-fns";
import {
  listenForRealTimeUpdates,
  renderBroadcastBanner,
  escapeHtml,
} from "./syncUtil.js";
import { getPreBookingAdvice } from "./ai.js";
import { createCalendarEvent } from "./calendar.js";
import {
  getAppointments,
  saveAppointments,
  updateAppointment,
  getCounselors,
  checkDate,
  getSlotStates,
  isCounselorFree,
  autoAssignCounselor,
  getCounselorTargets,
  notifyCounselors,
  appointmentStart,
  parseDate,
  formatTime12,
  toDateStr,
  MAX_DAYS_AHEAD,
  ACTIVE_STATUSES,
  COUNSELING_TYPES,
  SESSION_MODES,
  getHoliday,
  officeHoursText,
  getMyWaitlist,
  joinWaitlist,
  leaveWaitlist,
  isOnWaitlist,
  clearWaitlistForDay,
  getBroadcasts,
  updateUser,
  syncStudentOnAppointments,
  findUserByEmail,
  isRemote,
  getUserById,
  getNotifications,
} from "./store.js";
import { openModal, renderBellHtml, setupBell, refreshBell } from "./ui.js";
import { checkInFormHtml, readCheckIn } from "./checkin.js";
import { renderWellbeing } from "./wellbeing.js";

emailjs.init("6_rFpZEVOh3AVEsIM");

const EMAIL_SERVICE = "service_mtv9cbi";
const EMAIL_TEMPLATE = "template_mublumh";

const STATUS_LABELS = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Cancelled",
  completed: "Completed",
  "no-show": "No-show",
};

// Choices carried into the booking form by "Book follow-up"
let bookingPrefill = null;
// Set while the booking form is open, so live updates can refresh open times
let refreshBookingSlots = null;
// Months ahead of the current one shown by the booking page calendar
let calendarMonthOffset = 0;

// --- SMALL HELPERS ---

function getMyApps(session) {
  return getAppointments().filter((a) => a.studentId === session.id);
}

function formatDate(date) {
  return format(parseDate(date), "MMMM dd, yyyy");
}

function isUpcoming(app) {
  return appointmentStart(app) > new Date();
}

function goTo(target) {
  document.querySelector(`.nav-item[data-target="${target}"]`)?.click();
}

function statusPill(status) {
  return `<span class="status-pill ${escapeHtml(status)}">${STATUS_LABELS[status] || escapeHtml(status)}</span>`;
}

function stars(rating) {
  return "★★★★★".slice(0, rating) + "☆☆☆☆☆".slice(0, 5 - rating);
}

// What the student can do with an appointment right now
function getStudentActions(app) {
  const canChange =
    app.status === "pending" || (app.status === "approved" && isUpcoming(app));
  return {
    canCancel: canChange,
    canReschedule: canChange,
    canRate: app.status === "completed" && !app.feedback,
    canBookFollowUp: app.status === "completed" && app.followUp,
    canPrintSlip: app.status === "approved" && isUpcoming(app),
  };
}

function renderActionButtons(app) {
  const act = getStudentActions(app);
  const buttons = [];
  if (act.canPrintSlip) {
    buttons.push(
      `<button type="button" class="row-action slip-btn" data-id="${app.id}" title="Print appointment slip" aria-label="Print appointment slip"><i class="material-icons">print</i></button>`,
    );
  }
  if (act.canReschedule) {
    buttons.push(
      `<button type="button" class="row-action reschedule-btn" data-id="${app.id}" title="Reschedule"><i class="material-icons">event_repeat</i></button>`,
    );
  }
  if (act.canCancel) {
    buttons.push(
      `<button type="button" class="row-action danger cancel-btn-table" data-id="${app.id}" title="Cancel appointment"><i class="material-icons">cancel</i></button>`,
    );
  }
  if (act.canRate) {
    buttons.push(
      `<button type="button" class="row-action rate-btn" data-id="${app.id}" title="Rate this session"><i class="material-icons">star_rate</i></button>`,
    );
  }
  if (act.canBookFollowUp) {
    buttons.push(
      `<button type="button" class="row-action followup-btn" data-id="${app.id}" title="Book the follow-up your counselor recommended"><i class="material-icons">event_available</i></button>`,
    );
  }
  if (buttons.length > 0) {
    return `<div class="row-actions">${buttons.join("")}</div>`;
  }
  if (app.status === "approved") {
    return `<i class="material-icons muted-icon" title="Waiting for your counselor to close this session">hourglass_bottom</i>`;
  }
  if (app.status === "completed") {
    return `<i class="material-icons done-icon" title="Completed">check_circle</i>`;
  }
  return `<span class="muted-dash">—</span>`;
}

// --- APPOINTMENT SLIP ---

// Leaves out the counseling type and notes: a printed slip can be seen by others
function slipHtml(session, app) {
  const courseSection = [session.course, session.section]
    .filter(Boolean)
    .join(" - ");
  const rows = [
    ["Student", session.name],
    ["Course / Section", courseSection],
    ["Date", formatDate(app.date)],
    ["Time", formatTime12(app.time)],
    ["Counselor", app.counselorName || "Guidance Office"],
    ["Session Mode", app.mode],
  ].filter(([, value]) => value);

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Appointment Slip GG-${app.id}</title>
  <style>
    body { font-family: Arial, sans-serif; color: #0f172a; margin: 32px; }
    .slip { max-width: 480px; margin: 0 auto; border: 2px solid #0f172a; border-radius: 12px; padding: 28px; }
    h1 { font-size: 20px; margin: 0; }
    h2 { font-size: 14px; font-weight: 600; color: #475569; margin: 4px 0 20px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 9px 0; border-bottom: 1px solid #e2e8f0; font-size: 14px; text-align: left; vertical-align: top; }
    th { width: 42%; color: #475569; font-weight: 600; }
    td { font-weight: 700; }
    .ref { margin: 18px 0 0; font-size: 13px; font-weight: 700; }
    .note { margin: 8px 0 0; font-size: 12px; line-height: 1.5; color: #475569; }
  </style>
</head>
<body>
  <div class="slip">
    <h1>Granby Gateway</h1>
    <h2>Guidance Appointment Slip</h2>
    <table>
      ${rows.map(([label, value]) => `<tr><th>${label}</th><td>${escapeHtml(value)}</td></tr>`).join("")}
    </table>
    <p class="ref">Reference No.: GG-${app.id}</p>
    <p class="note">Please arrive on time and present this slip at the guidance office. Office hours: ${escapeHtml(officeHoursText())}.</p>
  </div>
</body>
</html>`;
}

// Prints from a hidden frame so popup blockers can't stop it
function printSlip(session, app) {
  const frame = document.createElement("iframe");
  frame.title = "Appointment slip";
  frame.className = "slip-frame";
  frame.style.cssText =
    "position:fixed;width:0;height:0;border:0;visibility:hidden;";
  frame.onload = () => {
    const win = frame.contentWindow;
    win.onafterprint = () => frame.remove();
    win.focus();
    win.print();
  };
  frame.srcdoc = slipHtml(session, app);
  document.body.appendChild(frame);
}

// --- SLOT PICKER (booking form + reschedule dialog) ---

function parseCounselorValue(value) {
  if (value === "auto") return "auto";
  return value ? Number(value) : null;
}

// Taken (not past) times a student can wait for
function waitlistHtml(slots, date, counselorKey, studentId) {
  const taken = slots.filter((s) => s.reason === "Booked");
  if (!studentId || taken.length === 0) return "";
  return `
    <div class="waitlist-row">
      <span class="waitlist-label"><i class="material-icons">hourglass_empty</i> Want a taken time? Join its waitlist and we'll notify you if it opens:</span>
      <div class="waitlist-times">
        ${taken
          .map((s) => {
            const joined = isOnWaitlist(studentId, date, s.time, counselorKey);
            return `<button type="button" class="waitlist-btn ${joined ? "joined" : ""}" data-time="${s.time}" ${joined ? "disabled" : ""}>
              <i class="material-icons">${joined ? "check" : "add"}</i>${formatTime12(s.time)}${joined ? " · waiting" : ""}
            </button>`;
          })
          .join("")}
      </div>
    </div>`;
}

function slotPickerHtml(
  date,
  counselorKey,
  selected = "",
  ignoreAppId = null,
  waitlistFor = null,
) {
  if (!counselorKey) {
    return `<p class="slot-hint">Choose a counselor to see open times.</p>`;
  }
  if (!date) return `<p class="slot-hint">Choose a date to see open times.</p>`;

  const reason = checkDate(date, counselorKey);
  if (reason) return `<p class="slot-hint warn">${escapeHtml(reason)}</p>`;

  const slots = getSlotStates(date, counselorKey, ignoreAppId);
  const waitlist = waitlistHtml(slots, date, counselorKey, waitlistFor);
  if (!slots.some((s) => s.free)) {
    return `<p class="slot-hint warn">No open times on this day. Please try another date.</p>${waitlist}`;
  }
  return `
    <div class="slot-grid">
      ${slots
        .map(
          (s) => `
        <button type="button" class="slot-btn ${s.time === selected ? "selected" : ""}"
                data-time="${s.time}" ${s.free ? "" : "disabled"}
                title="${s.free ? "Available" : s.reason}">
          ${formatTime12(s.time)}
        </button>`,
        )
        .join("")}
    </div>
    ${waitlist}`;
}

// Clicking a slot marks it selected and stores its time in the hidden input
function bindSlotPicker(box, hiddenInput) {
  box.onclick = (e) => {
    const btn = e.target.closest(".slot-btn:not([disabled])");
    if (!btn) return;
    box
      .querySelectorAll(".slot-btn")
      .forEach((b) => b.classList.remove("selected"));
    btn.classList.add("selected");
    hiddenInput.value = btn.dataset.time;
  };
}

function dateLimits() {
  const max = new Date();
  max.setDate(max.getDate() + MAX_DAYS_AHEAD);
  return { min: toDateStr(new Date()), max: toDateStr(max) };
}

// --- VIEW COMPONENTS ---

// Month grid. When pickable (booking page), open weekdays can be clicked to choose the date.
function calendarInnerHtml(myApps, { pickable = false, selected = "" } = {}) {
  const now = new Date();
  const month = new Date(
    now.getFullYear(),
    now.getMonth() + (pickable ? calendarMonthOffset : 0),
    1,
  );
  const { min, max } = dateLimits();

  const startDay = getDay(startOfMonth(month));
  const totalDays = getDate(endOfMonth(month));
  const padding = Array(startDay).fill('<div class="day-num muted"></div>');
  const days = [];

  for (let d = 1; d <= totalDays; d++) {
    const day = new Date(month.getFullYear(), month.getMonth(), d);
    const dateStr = toDateStr(day);
    const onDay = (status) =>
      myApps.some((app) => app.date === dateStr && app.status === status);
    const holiday = getHoliday(dateStr);
    const closed =
      pickable &&
      (day.getDay() === 0 ||
        day.getDay() === 6 ||
        Boolean(holiday) ||
        dateStr < min ||
        dateStr > max);

    const classes = [
      isSameDay(day, now) && "today",
      onDay("approved") && "has-event",
      !onDay("approved") && onDay("pending") && "has-pending",
      closed && "closed",
      pickable && !closed && "pickable",
      dateStr === selected && "selected",
    ].filter(Boolean);

    days.push(
      `<div class="day-num ${classes.join(" ")}" ${
        pickable && !closed
          ? `data-date="${dateStr}" role="button" tabindex="0" title="Pick ${format(day, "MMM d")}"`
          : ""
      } ${holiday ? `title="Office closed: ${escapeHtml(holiday.name)}"` : ""}>${d}</div>`,
    );
  }

  const lastMonth = parseDate(max);
  const atEnd =
    month.getFullYear() * 12 + month.getMonth() >=
    lastMonth.getFullYear() * 12 + lastMonth.getMonth();

  return `
    <div class="calendar-header">
        ${pickable ? `<button type="button" class="cal-nav" data-step="-1" ${calendarMonthOffset <= 0 ? "disabled" : ""} aria-label="Previous month"><i class="material-icons">chevron_left</i></button>` : ""}
        <span style="font-weight:800;">${format(month, "MMMM yyyy")}</span>
        ${pickable ? `<button type="button" class="cal-nav" data-step="1" ${atEnd ? "disabled" : ""} aria-label="Next month"><i class="material-icons">chevron_right</i></button>` : ""}
    </div>
    <div class="calendar-grid">
        <div class="day-name">S</div><div class="day-name">M</div><div class="day-name">T</div>
        <div class="day-name">W</div><div class="day-name">T</div><div class="day-name">F</div>
        <div class="day-name">S</div>
        ${padding.join("")}${days.join("")}
    </div>
    <div class="cal-legend">
        <span><i class="legend-dot approved"></i>Approved session</span>
        <span><i class="legend-dot pending"></i>Pending request</span>
        ${pickable ? `<span><i class="legend-dot closed"></i>Closed</span>` : ""}
    </div>
    ${pickable ? `<p class="cal-hint">Tap a day to pick it as your date.</p>` : ""}
  `;
}

export function renderRightSidebar(
  myApps,
  { pickable = false, selected = "" } = {},
) {
  // The single next approved appointment
  const nextApp = myApps
    .filter((a) => a.status === "approved" && isUpcoming(a))
    .sort((a, b) => appointmentStart(a) - appointmentStart(b))[0];

  return `
        <aside class="right-sidebar">
            <div class="next-up-card">
                <div class="card-tag">Next session</div>
                ${
                  nextApp
                    ? `
                    <div class="next-app-info">
                        <h2>${formatDate(nextApp.date)}</h2>
                        <p>${formatTime12(nextApp.time)} | ${escapeHtml(nextApp.counselorName || "Guidance Office")}</p>

                        <button class="gcal-sync-btn"
                                data-date="${nextApp.date}"
                                data-time="${escapeHtml(nextApp.time)}"
                                data-type="${escapeHtml(nextApp.type || "Counseling Session")}"
                                onclick="window.handleStudentInlineSync(this)">
                          🗓️ Sync to Google Calendar
                        </button>
                    </div>
                `
                    : `<p style="font-size:0.8rem; color:#94a3b8; margin-top:10px;">No upcoming sessions.</p>`
                }
            </div>

            ${
              pickable
                ? `<div class="calendar-card" id="bookingCalendar">
                ${calendarInnerHtml(myApps, { pickable, selected })}
            </div>`
                : `<details class="calendar-card calendar-toggle">
                <summary><i class="material-icons">calendar_month</i>My Calendar<i class="material-icons chevron">expand_more</i></summary>
                ${calendarInnerHtml(myApps)}
            </details>`
            }

            <div class="support-card">
                <h4>Support</h4>
                <p style="font-size: 0.85rem;">Office hours: ${escapeHtml(officeHoursText())}.</p>
            </div>
        </aside>
    `;
}

export function renderDashboard(session = {}) {
  const statusRank = {
    approved: 1,
    pending: 2,
    completed: 3,
  };

  const myApps = getMyApps(session).sort((a, b) => {
    const rankA = statusRank[a.status] || 4;
    const rankB = statusRank[b.status] || 4;
    if (rankA !== rankB) return rankA - rankB;
    return appointmentStart(a) - appointmentStart(b);
  });

  const pendingCount = myApps.filter((a) => a.status === "pending").length;
  const upcomingCount = myApps.filter(
    (a) => a.status === "approved" && isUpcoming(a),
  ).length;
  const completedCount = myApps.filter((a) => a.status === "completed").length;
  const toRate = myApps.filter((a) => getStudentActions(a).canRate).length;

  return `
        <div class="dashboard-wrapper">
            <div class="dashboard-main-col">
                <div class="dashboard-hero" style="padding-top: 40px;">
                    <span class="badge">Student Portal</span>
                    <h1>Welcome back, ${escapeHtml(session.name || "Student")}</h1>
                    <p>You have <strong>${pendingCount}</strong> pending request${pendingCount === 1 ? "" : "s"}${
                      toRate > 0
                        ? ` and <strong>${toRate}</strong> session${toRate === 1 ? "" : "s"} to rate`
                        : ""
                    }.</p>
                </div>

                <div class="stats-grid-horizontal">
                    <div class="stat-box">
                        <span class="label">Total Sessions</span>
                        <span class="value">${myApps.length}</span>
                    </div>
                    <div class="stat-box">
                        <span class="label">Upcoming</span>
                        <span class="value" style="color: #22c55e;">${upcomingCount}</span>
                    </div>
                    <div class="stat-box">
                        <span class="label">Completed</span>
                        <span class="value" style="color: #3b82f6;">${completedCount}</span>
                    </div>
                </div>

                <div class="table-card">
                    <div class="card-header-flex" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
                        <h3>Recent Appointments</h3>
                        <button class="view-all-btn" onclick="document.querySelector('[data-target=records]').click()">View All</button>
                    </div>
                    <div class="table-responsive">
                        <table class="recent-table">
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Type</th>
                                    <th>Status</th>
                                    <th style="text-align: center;">Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${
                                  myApps
                                    .slice(0, 5)
                                    .map((app) => {
                                      const faded =
                                        !ACTIVE_STATUSES.includes(app.status) ||
                                        !isUpcoming(app);
                                      return `
                                    <tr class="${faded ? "faded-row" : ""}">
                                        <td data-label="Date" class="date-cell"><strong>${format(parseDate(app.date), "MMM d, yyyy")}</strong><small>${formatTime12(app.time)}</small></td>
                                        <td data-label="Type">${escapeHtml(app.type)}<div class="row-sub">${escapeHtml(app.counselorName || "Unassigned")}</div></td>
                                        <td data-label="Status">${statusPill(app.status)}</td>
                                        <td data-label="Action" style="text-align: center;">${renderActionButtons(app)}</td>
                                    </tr>
                                `;
                                    })
                                    .join("") ||
                                  '<tr><td colspan="4" style="text-align:center; padding:20px;">No appointments yet.</td></tr>'
                                }
                            </tbody>
                        </table>
                    </div>
                </div>

                ${renderWaitlistCard(session)}
            </div>

            ${renderRightSidebar(myApps)}
        </div>
    `;
}

// Times the student is waiting for; "Book now" appears once one opens up
function renderWaitlistCard(session) {
  const entries = getMyWaitlist(session.id);
  if (entries.length === 0) return "";
  const counselorName = (id) =>
    id === "auto"
      ? "Any available counselor"
      : getCounselors().find((c) => c.id === id)?.name || "Counselor";

  return `
    <div class="table-card waitlist-card">
      <h3><i class="material-icons">hourglass_empty</i> My Waitlist</h3>
      <ul class="waitlist-list">
        ${entries
          .map((w) => {
            const open =
              getSlotStates(w.date, w.counselorId).find(
                (s) => s.time === w.time,
              )?.free ?? false;
            return `
          <li class="waitlist-item ${open ? "open" : ""}">
            <div>
              <strong>${formatDate(w.date)}, ${formatTime12(w.time)}</strong>
              <small>${escapeHtml(counselorName(w.counselorId))} · ${open ? "This time is open now!" : "Waiting for a cancellation"}</small>
            </div>
            <div class="row-actions">
              ${open ? `<button type="button" class="primary-btn small waitlist-book" data-id="${w.id}"><i class="material-icons">event_available</i> Book now</button>` : ""}
              <button type="button" class="row-action danger waitlist-leave" data-id="${w.id}" title="Leave waitlist" aria-label="Leave waitlist"><i class="material-icons">close</i></button>
            </div>
          </li>`;
          })
          .join("")}
      </ul>
    </div>
  `;
}

export function renderBookingForm(session = {}) {
  const myApps = getMyApps(session);
  const counselors = getCounselors();
  const prefill = bookingPrefill || {};
  const { min, max } = dateLimits();

  const counselorOptions = [
    `<option value="">Select a preferred counselor...</option>`,
    `<option value="auto" ${prefill.counselorId === "auto" ? "selected" : ""}>Any Available Counselor</option>`,
    ...counselors.map(
      (c) => `
      <option value="${c.id}" ${prefill.counselorId === c.id ? "selected" : ""}>
        ${escapeHtml(c.name)} — (${escapeHtml(c.specialty || "General Counseling")})
      </option>`,
    ),
  ].join("");

  // "Book now" from the waitlist carries a date and time
  const prefillDate = prefill.date || "";
  const prefillTime =
    prefillDate &&
    getSlotStates(prefillDate, prefill.counselorId).find(
      (s) => s.time === prefill.time && s.free,
    )
      ? prefill.time
      : "";
  calendarMonthOffset = 0;
  if (prefillDate) {
    const picked = parseDate(prefillDate);
    const now = new Date();
    calendarMonthOffset = Math.max(
      0,
      (picked.getFullYear() - now.getFullYear()) * 12 +
        picked.getMonth() -
        now.getMonth(),
    );
  }

  const typeOptions = [
    `<option value="">Select a reason...</option>`,
    ...COUNSELING_TYPES.map(
      (t) =>
        `<option value="${t}" ${prefill.type === t ? "selected" : ""}>${t}</option>`,
    ),
  ].join("");

  const modeOptions = SESSION_MODES.map(
    (m) =>
      `<option value="${m}" ${prefill.mode === m ? "selected" : ""}>${m}</option>`,
  ).join("");

  return `
    <div class="dashboard-wrapper">
        <div class="dashboard-main-col">
            <div class="dashboard-hero" style="padding-top: 40px;">
                <span class="badge">Scheduling</span>
                <h1>${prefill.followUp ? "Book a Follow-up" : "Book an Appointment"}</h1>
                <p>Sessions are one hour (${escapeHtml(officeHoursText())}). Pick a counselor, a date, and an open time.</p>
            </div>

            <div class="table-card booking-container">
                <div id="booking-error" class="error-banner hidden"></div>

                <form id="appointment-form" class="styled-form" novalidate>
                    <div class="form-row">
                        <div class="form-group">
                            <label for="appCounselor">Guidance Counselor</label>
                            <select id="appCounselor" required>
                                ${counselorOptions}
                            </select>
                        </div>
                    </div>

                    <div class="form-row">
                        <div class="form-group">
                            <label for="appType">Counseling Type</label>
                            <select id="appType" required>
                                ${typeOptions}
                            </select>
                        </div>
                    </div>

                    <div class="form-row">
                        <div class="form-group">
                            <label for="appMode">Session Mode</label>
                            <select id="appMode">
                                ${modeOptions}
                            </select>
                        </div>
                    </div>

                    <div class="form-row">
                        <div class="form-group">
                            <label for="appDate">Preferred Date</label>
                            <input type="date" id="appDate" class="date-field ${prefillDate ? "" : "empty"}" min="${min}" max="${max}" value="${prefillDate}">
                        </div>
                    </div>

                    <div class="form-group">
                        <label>Available Times</label>
                        <input type="hidden" id="appTime" value="${prefillTime}">
                        <div id="slotPicker">${slotPickerHtml(prefillDate, parseCounselorValue(String(prefill.counselorId || "")), prefillTime, null, session.id)}</div>
                    </div>

                    <div class="form-group">
                        <label for="appNotes" id="appNotesLabel">Additional Notes (Optional)</label>
                        <textarea id="appNotes" rows="4" placeholder="Briefly describe your concern..."></textarea>
                    </div>

                    ${checkInFormHtml()}

                    <label class="urgent-toggle">
                        <input type="checkbox" id="appUrgent">
                        <span>This is urgent — I need to talk to someone as soon as possible</span>
                    </label>
                    <div id="urgentHelp" class="urgent-help hidden">
                        <strong>If you are in danger or thinking of hurting yourself, don't wait for an appointment.</strong>
                        <ul>
                            <li>NCMH Crisis Hotline: <a href="tel:1553">1553</a> (toll-free) or <a href="tel:09178998727">0917 899 8727</a></li>
                            <li>Emergency: <a href="tel:911">911</a></li>
                            <li>Or go straight to the guidance office — you don't need an appointment.</li>
                        </ul>
                        Urgent requests are shown first in the counselor's queue.
                    </div>

                    <p class="privacy-note">
                        <i class="material-icons">lock</i>
                        <span>Only the guidance counselors can see what you write here. It stays confidential unless someone's safety is at risk.</span>
                    </p>

                    <div class="form-actions">
                        <button type="submit" id="submitBooking" class="primary-btn">
                            <i class="material-icons">check_circle</i> Confirm Booking
                        </button>
                    </div>
                </form>
            </div>
        </div>

        ${renderRightSidebar(myApps, { pickable: true, selected: prefillDate })}
    </div>
  `;
}

export function renderHistory(session = {}) {
  const sortedApps = getMyApps(session).sort(
    (a, b) => appointmentStart(b) - appointmentStart(a),
  );

  const detailLines = (app) => {
    const lines = [];
    if (app.walkIn) {
      lines.push(
        `<span class="history-note"><i class="material-icons">directions_walk</i> Walk-in session recorded by your counselor</span>`,
      );
    }
    if (app.rescheduledFrom) {
      lines.push(
        `<span class="history-note"><i class="material-icons">event_repeat</i> Moved from ${formatDate(app.rescheduledFrom.date)}, ${formatTime12(app.rescheduledFrom.time)}</span>`,
      );
    }
    if (app.counselorNotes) {
      lines.push(
        `<span class="history-note"><i class="material-icons">chat</i> Counselor: ${escapeHtml(app.counselorNotes)}</span>`,
      );
    }
    if (app.followUp && app.status === "completed") {
      lines.push(
        `<span class="history-note accent"><i class="material-icons">event_available</i> Your counselor recommends a follow-up session.</span>`,
      );
    }
    if (app.feedback) {
      lines.push(
        `<span class="history-note"><span class="stars">${stars(app.feedback.rating)}</span> Your rating${app.feedback.comment ? `: ${escapeHtml(app.feedback.comment)}` : ""}</span>`,
      );
    }
    return lines.join("");
  };

  return `
        <div class="dashboard-wrapper">
            <div class="dashboard-main-col">
                <div class="dashboard-hero" style="padding-top: 40px;">
                    <span class="badge">Records</span>
                    <h1>Appointment History</h1>
                    <p>Track, reschedule, and rate your guidance sessions.</p>
                </div>

                <div class="table-card history-container">
                    <div class="history-list">
                        ${
                          sortedApps.length > 0
                            ? sortedApps
                                .map(
                                  (app) => `
                            <div class="history-item ${escapeHtml(app.status)}">
                                <div class="history-main">
                                    <div class="history-icon">
                                        <i class="material-icons">${getStatusIcon(app.status)}</i>
                                    </div>
                                    <div class="history-info">
                                        <span class="app-type">${escapeHtml(app.type)}</span>
                                        <span class="app-date">${formatDate(app.date)} • ${formatTime12(app.time)} • ${escapeHtml(app.counselorName || "Unassigned")}</span>
                                        ${detailLines(app)}
                                    </div>
                                </div>
                                <div class="history-status">
                                    ${statusPill(app.status)}
                                    ${renderActionButtons(app)}
                                </div>
                            </div>
                        `,
                                )
                                .join("")
                            : `
                            <div class="empty-history">
                                <i class="material-icons">event_busy</i>
                                <p>You haven't made any appointments yet.</p>
                            </div>
                        `
                        }
                    </div>
                </div>
            </div>

            ${renderRightSidebar(sortedApps)}
        </div>
    `;
}
export function renderSettings(container, session) {
  container.innerHTML = `
    <div class="settings-card">
        <div class="card-header">
            <h2><i class="material-icons">settings</i> Account Settings</h2>
        </div>
        <form id="settingsForm" class="settings-form">
            <div class="input-wrapper plain">
                <label>Full Name</label>
                <input type="text" id="setName" value="${escapeHtml(session.name)}" required>
            </div>
            <div class="input-wrapper plain">
                <label>Email Address</label>
                <input type="email" id="setEmail" value="${escapeHtml(session.email)}" required ${isRemote ? 'readonly title="Your sign-in email. Ask the guidance office to change it."' : ""}>
            </div>
            <div class="input-group-row" style="display: flex; gap: 16px; margin-bottom: 20px;">
                 <div class="input-wrapper plain" style="flex: 1;">
                    <label>Course</label>
                    <input type="text" id="setCourse" value="${escapeHtml(session.course)}" placeholder="e.g. BSIT" required>
                </div>
                <div class="input-wrapper plain" style="flex: 1;">
                    <label>Section</label>
                    <input type="text" id="setSection" value="${escapeHtml(session.section)}" placeholder="e.g. 1A" required>
                </div>
            </div>
            <button type="submit" class="primary-btn">
                <i class="material-icons">save</i> Save Changes
            </button>
        </form>
    </div>

    <div class="settings-card data-card">
        <div class="card-header">
            <h2><i class="material-icons">download</i> Your data</h2>
        </div>
        <p>Under the Data Privacy Act of 2012 you can get a copy of the personal data Granby Gateway keeps about you: your profile, appointments, check-ins, ratings, notifications and waitlist.</p>
        <p class="data-note"><i class="material-icons" aria-hidden="true">lock</i> Counselors' private case notes are not included. To request them, ask the guidance office.</p>
        <button type="button" id="downloadMyData" class="primary-btn">
            <i class="material-icons">download</i> Download My Data
        </button>
    </div>
  `;

  document.getElementById("downloadMyData").onclick = () =>
    downloadMyData(session);

  // Re-attach the submit listener
  const form = document.getElementById("settingsForm");
  if (!form) return;

  // FIXED: Correct event listener binding syntax assignment
  form.onsubmit = (e) => {
    // FIXED: Corrected 'form.one' typo back to the standard event argument execution
    e.preventDefault();

    const updatedData = {
      name: document.getElementById("setName").value.trim(),
      email: document.getElementById("setEmail").value.trim(),
      course: document.getElementById("setCourse").value.trim(),
      section: document.getElementById("setSection").value.trim(),
    };

    if (!updatedData.name) {
      alert("Please enter your name.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(updatedData.email)) {
      alert("Please enter a valid email address.");
      return;
    }
    // The email is also a login name, so two accounts can't share it
    const emailOwner = findUserByEmail(updatedData.email);
    if (emailOwner && emailOwner.id !== session.id) {
      alert("Another account already uses this email.");
      return;
    }

    const updatedUser = updateUser(session.id, updatedData);

    if (updatedUser) {
      // Keep the student's name/email on their existing appointments in sync
      syncStudentOnAppointments(updatedUser);

      // Update Active Session state parameters (the session lives in sessionStorage)
      const newSession = { ...session, ...updatedData };
      sessionStorage.setItem("gh_session", JSON.stringify(newSession));

      alert("Profile updated successfully!");

      // Forces layout refresh engine context to pickup updated session states
      window.location.reload();
    } else {
      alert("Your account could not be found. Please sign in again.");
    }
  };
}

// Data Privacy Act: everything stored about this student, as a JSON file
export function buildMyData(session) {
  const me = getUserById(session.id) || session;
  const { pass, ...profile } = me;
  const mine = (list, key = "studentId") =>
    list.filter((item) => item[key] === session.id);
  return {
    about:
      "Personal data kept about you by Granby Gateway (guidance office). Counselors' private case notes are not included; ask the guidance office to request them.",
    exportedAt: new Date().toISOString(),
    profile,
    appointments: mine(getAppointments()).map(({ caseNotes, ...a }) => a),
    notifications: getNotifications(session.id),
    waitlist: getMyWaitlist(session.id),
  };
}

function downloadMyData(session) {
  const blob = new Blob([JSON.stringify(buildMyData(session), null, 2)], {
    type: "application/json",
  });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `granby-my-data-${toDateStr(new Date())}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  window.logActivity(session, "Downloaded their personal data");
}

function getStatusIcon(status) {
  switch (status) {
    case "approved":
      return "event_available";
    case "pending":
      return "schedule";
    case "rejected":
      return "block";
    case "cancelled":
      return "cancel";
    case "completed":
      return "check_circle";
    case "no-show":
      return "person_off";
    default:
      return "event";
  }
}

// --- LOGIC FUNCTIONS ---

// Sends the shared EmailJS template to the appointment's counselor(s)
function emailCounselors(app, { subject, header, message, status }) {
  const targets = getCounselorTargets(app);
  if (!targets.emails) return Promise.resolve();
  return emailjs.send(EMAIL_SERVICE, EMAIL_TEMPLATE, {
    subject_line: subject,
    to_email: targets.emails,
    recipient_name: targets.name,
    header_title: header,
    main_message: message,
    app_type: app.type,
    app_date: app.date,
    app_time: formatTime12(app.time),
    status,
    notes: app.notes || "No notes provided by student.",
  });
}

function hasOtherActiveOnDate(session, date, ignoreAppId = null) {
  return getAppointments().some(
    (a) =>
      a.id !== ignoreAppId &&
      a.studentId === session.id &&
      a.date === date &&
      ACTIVE_STATUSES.includes(a.status),
  );
}

function attachBookingListener(session) {
  const form = document.getElementById("appointment-form");
  if (!form) return;

  const counselorSelect = document.getElementById("appCounselor");
  const dateInput = document.getElementById("appDate");
  const timeInput = document.getElementById("appTime");
  const slotBox = document.getElementById("slotPicker");
  const errorBanner = document.getElementById("booking-error");

  const showError = (msg) => {
    errorBanner.textContent = msg;
    errorBanner.classList.remove("hidden");
    errorBanner.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const refreshSlots = () => {
    const keep = timeInput.value;
    const html = slotPickerHtml(
      dateInput.value,
      parseCounselorValue(counselorSelect.value),
      keep,
      null,
      session.id,
    );
    slotBox.innerHTML = html;
    // Drop the chosen time if it is no longer offered
    if (!slotBox.querySelector(`.slot-btn.selected:not([disabled])`)) {
      timeInput.value = "";
    }
  };

  // Right-hand calendar: tap a day to fill Preferred Date
  const calendarBox = document.getElementById("bookingCalendar");
  const redrawCalendar = () => {
    if (!calendarBox) return;
    calendarBox.innerHTML = calendarInnerHtml(getMyApps(session), {
      pickable: true,
      selected: dateInput.value,
    });
  };
  // Grey text while empty, red border when the date can't be booked
  const styleDateField = () => {
    dateInput.classList.toggle("empty", !dateInput.value);
    dateInput.classList.toggle(
      "has-error",
      Boolean(
        dateInput.value &&
        checkDate(dateInput.value, parseCounselorValue(counselorSelect.value)),
      ),
    );
  };
  const pickDate = (date) => {
    dateInput.value = date;
    styleDateField();
    refreshSlots();
    redrawCalendar();
  };
  // Open the browser's date picker when anywhere in the box is clicked
  dateInput.onclick = () => {
    try {
      dateInput.showPicker?.();
    } catch {
      // Older browsers: the built-in calendar icon still works
    }
  };
  if (calendarBox) {
    calendarBox.onclick = (e) => {
      const nav = e.target.closest(".cal-nav:not([disabled])");
      if (nav) {
        calendarMonthOffset += Number(nav.dataset.step);
        redrawCalendar();
        return;
      }
      const day = e.target.closest(".day-num[data-date]");
      if (day) pickDate(day.dataset.date);
    };
    calendarBox.onkeydown = (e) => {
      const day = e.target.closest(".day-num[data-date]");
      if (day && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        pickDate(day.dataset.date);
      }
    };
  }

  const typeSelect = document.getElementById("appType");
  const notesInput = document.getElementById("appNotes");
  const notesLabel = document.getElementById("appNotesLabel");
  const updateNotesLabel = () => {
    const isOther = typeSelect.value === "Other";
    notesLabel.textContent = isOther
      ? "Describe your concern (Required)"
      : "Additional Notes (Optional)";
    notesInput.placeholder = isOther
      ? "Tell us what you'd like to talk about..."
      : "Briefly describe your concern...";
  };
  typeSelect.onchange = updateNotesLabel;

  const urgentInput = document.getElementById("appUrgent");
  const urgentHelp = document.getElementById("urgentHelp");
  urgentInput.onchange = () => {
    urgentHelp.classList.toggle("hidden", !urgentInput.checked);
  };

  // Check-in: a worrying answer marks the request urgent and shows crisis lines
  const checkinBox = document.getElementById("checkinBox");
  const checkinNotice = document.getElementById("checkinNotice");
  const updateCheckInNotice = () => {
    const result = readCheckIn(form);
    if (!result || result.error || !result.flagged) {
      checkinNotice.classList.add("hidden");
      return;
    }
    checkinNotice.innerHTML = result.safetyFlag
      ? `<strong>Thank you for telling us.</strong> We've marked your request urgent so a counselor sees it first. If you might act on these thoughts, please don't wait: call <a href="tel:1553">1553</a> (NCMH Crisis Hotline) or <a href="tel:911">911</a>, or go to the guidance office now.`
      : `<strong>Thank you for sharing.</strong> It sounds like a lot right now. We've marked your request urgent so a counselor sees it first.`;
    checkinNotice.classList.remove("hidden");
    urgentInput.checked = true;
    urgentHelp.classList.remove("hidden");
  };
  if (checkinBox) {
    checkinBox.onchange = updateCheckInNotice;
    document.getElementById("checkinClear").onclick = () => {
      checkinBox.querySelectorAll("input[type=radio]").forEach((r) => {
        r.checked = false;
      });
      checkinNotice.classList.add("hidden");
    };
  }

  // Join the waitlist for a taken time
  slotBox.addEventListener("click", (e) => {
    const btn = e.target.closest(".waitlist-btn:not([disabled])");
    if (!btn) return;
    const counselorKey = parseCounselorValue(counselorSelect.value);
    const joined = joinWaitlist({
      studentId: session.id,
      date: dateInput.value,
      time: btn.dataset.time,
      counselorId: counselorKey,
    });
    if (joined) {
      window.logActivity(
        session,
        `Joined waitlist for ${dateInput.value} ${formatTime12(btn.dataset.time)}`,
      );
    }
    refreshSlots();
  });

  refreshBookingSlots = () => {
    refreshSlots();
    redrawCalendar();
  };
  bookingPrefill = null;
  bindSlotPicker(slotBox, timeInput);
  counselorSelect.onchange = () => {
    styleDateField();
    refreshSlots();
  };
  dateInput.onchange = () => {
    styleDateField();
    // Show the typed date's month on the calendar
    if (dateInput.value) {
      const picked = parseDate(dateInput.value);
      const now = new Date();
      calendarMonthOffset = Math.max(
        0,
        (picked.getFullYear() - now.getFullYear()) * 12 +
          picked.getMonth() -
          now.getMonth(),
      );
    }
    refreshSlots();
    redrawCalendar();
  };

  form.onsubmit = (e) => {
    e.preventDefault();
    errorBanner.classList.add("hidden");

    const counselorKey = parseCounselorValue(counselorSelect.value);
    const type = typeSelect.value;
    const date = dateInput.value;
    const time = timeInput.value;
    const notes = notesInput.value.trim();

    if (!counselorKey) return showError("Please choose a counselor.");
    if (!type) return showError("Please choose a counseling type.");
    if (type === "Other" && !notes) {
      return showError("Please describe your concern in the notes box.");
    }
    const dateProblem = checkDate(date, counselorKey);
    if (dateProblem) return showError(dateProblem);
    if (!time) return showError("Please pick one of the open times.");

    if (hasOtherActiveOnDate(session, date)) {
      return showError(
        "You already have a pending or approved appointment on this date. Reschedule that one instead.",
      );
    }

    const checkIn = readCheckIn(form);
    if (checkIn?.error) {
      checkinBox.open = true;
      return showError(checkIn.error);
    }

    // Re-check the slot: another student may have taken it a moment ago
    let counselor = null;
    if (counselorKey === "auto") {
      counselor = autoAssignCounselor(date, time);
    } else if (isCounselorFree(counselorKey, date, time)) {
      counselor = getCounselors().find((c) => c.id === counselorKey);
    }
    if (!counselor) {
      refreshSlots();
      return showError("That time was just taken. Please pick another one.");
    }

    const newApp = {
      id: Date.now(),
      studentId: session.id,
      studentName: session.name,
      studentEmail: session.email,
      counselorId: counselor.id,
      counselorName: counselor.name,
      type,
      mode: document.getElementById("appMode").value,
      urgent: urgentInput.checked || Boolean(checkIn?.flagged),
      date,
      time,
      notes,
      status: "pending",
      counselorNotes: "",
      checkIn: checkIn || null,
      reminders: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const submitBtn = document.getElementById("submitBooking");
    submitBtn.innerText = "Sending...";
    submitBtn.disabled = true;

    saveAppointments([...getAppointments(), newApp]);
    clearWaitlistForDay(session.id, date);
    let urgentTag = newApp.urgent ? "URGENT: " : "";
    if (checkIn?.safetyFlag) urgentTag = "URGENT (safety flag): ";
    notifyCounselors(
      newApp,
      `${urgentTag}New ${newApp.type} request (${newApp.mode}) from ${session.name} for ${formatDate(date)}, ${formatTime12(time)}.`,
    );
    window.logActivity(
      session,
      `Booked ${newApp.type} with ${counselor.name} for ${date} ${formatTime12(time)}`,
    );

    let emailOk = true;
    emailCounselors(newApp, {
      subject: `${urgentTag}New Appointment Request - ${session.name}`,
      header: `${urgentTag}New Appointment Request`,
      message: `A new ${newApp.mode} appointment request has been submitted by ${session.name} and assigned to ${counselor.name}.`,
      status: "Pending",
    })
      .catch((err) => {
        console.error("EmailJS Detailed Error:", err);
        emailOk = false;
      })
      .finally(() => {
        goTo("dashboard");
        showBookingSummary(newApp, emailOk);
      });
  };
}

// Confirmation shown after a booking is saved
function showBookingSummary(app, emailOk) {
  openModal({
    title: "Request Sent",
    icon: "check_circle",
    cancelText: "Done",
    bodyHtml: `
      <p class="modal-lead"><strong>${escapeHtml(app.type)}</strong>${app.urgent ? ' <span class="urgent-tag">Urgent</span>' : ""}<br>
      ${formatDate(app.date)}, ${formatTime12(app.time)}<br>
      ${escapeHtml(app.counselorName)} · ${escapeHtml(app.mode)}</p>
      <p>Your request is <strong>pending</strong>. You'll get a notification when ${escapeHtml(app.counselorName)} approves it.
      You can reschedule or cancel it from your Dashboard.</p>
      ${emailOk ? "" : '<p class="slot-hint warn">The email to your counselor failed, but they will still see your request in their portal.</p>'}
    `,
  });
}

function openCancelDialog(session, app) {
  openModal({
    title: "Cancel Appointment",
    icon: "warning",
    danger: true,
    cancelText: "Keep Appointment",
    confirmText: "Yes, Cancel It",
    bodyHtml: `<p>Cancel your ${escapeHtml(app.type)} session on <strong>${formatDate(app.date)}, ${formatTime12(app.time)}</strong>? This can't be undone.</p>`,
    onConfirm: () => {
      const updated = updateAppointment(app.id, { status: "cancelled" });
      notifyCounselors(
        updated,
        `${session.name} cancelled their ${updated.type} session on ${formatDate(updated.date)}, ${formatTime12(updated.time)}.`,
      );
      window.logActivity(
        session,
        `Cancelled appointment on ${updated.date} ${formatTime12(updated.time)}`,
      );
      emailCounselors(updated, {
        subject: `Cancellation Alert: Appointment Cancelled by ${session.name}`,
        header: "Appointment Cancelled By Student",
        message: `The following appointment has been cancelled by ${session.name}.`,
        status: "Cancelled",
      }).catch((err) => {
        console.error("EmailJS Cancellation Error:", err);
        alert(
          "Cancelled, but the email to your counselor failed. They will still see it in their portal.",
        );
      });
      rerenderCurrentView(session);
    },
  });
}

function openRescheduleDialog(session, app) {
  const { min, max } = dateLimits();
  const counselorKey = app.counselorId ?? "auto";

  openModal({
    title: "Reschedule Appointment",
    icon: "event_repeat",
    confirmText: "Send Request",
    bodyHtml: `
      <p class="modal-lead">Currently <strong>${formatDate(app.date)}, ${formatTime12(app.time)}</strong> with ${escapeHtml(app.counselorName || "any counselor")}.
      ${app.status === "approved" ? "Your counselor will need to approve the new time." : ""}</p>
      <label class="modal-label" for="rsDate">New date</label>
      <input type="date" id="rsDate" class="modal-input" min="${min}" max="${max}" value="${app.date}">
      <label class="modal-label">New time</label>
      <input type="hidden" id="rsTime">
      <div id="rsSlots"></div>
      <label class="modal-label" for="rsReason">Reason (optional)</label>
      <textarea id="rsReason" class="modal-input" rows="2" placeholder="e.g. Exam schedule conflict"></textarea>
    `,
    onOpen: ({ card }) => {
      const dateInput = card.querySelector("#rsDate");
      const timeInput = card.querySelector("#rsTime");
      const slotBox = card.querySelector("#rsSlots");
      const refresh = () => {
        timeInput.value = "";
        slotBox.innerHTML = slotPickerHtml(
          dateInput.value,
          counselorKey,
          "",
          app.id,
        );
      };
      bindSlotPicker(slotBox, timeInput);
      dateInput.onchange = refresh;
      refresh();
    },
    onConfirm: ({ card, showError }) => {
      const date = card.querySelector("#rsDate").value;
      const time = card.querySelector("#rsTime").value;
      const reason = card.querySelector("#rsReason").value.trim();

      const dateProblem = checkDate(date, counselorKey);
      if (dateProblem) {
        showError(dateProblem);
        return false;
      }
      if (!time) {
        showError("Please pick one of the open times.");
        return false;
      }
      if (date === app.date && time === app.time) {
        showError("Pick a different date or time.");
        return false;
      }
      if (hasOtherActiveOnDate(session, date, app.id)) {
        showError("You already have another appointment on that date.");
        return false;
      }

      let counselor = null;
      if (counselorKey === "auto") {
        counselor = autoAssignCounselor(date, time);
      } else if (isCounselorFree(counselorKey, date, time, app.id)) {
        counselor = { id: app.counselorId, name: app.counselorName };
      }
      if (!counselor) {
        showError("That time was just taken. Please pick another one.");
        return false;
      }

      const updated = updateAppointment(app.id, {
        date,
        time,
        status: "pending",
        counselorId: counselor.id,
        counselorName: counselor.name,
        rescheduledFrom: { date: app.date, time: app.time },
        rescheduleReason: reason,
        counselorNotes: "",
      });
      clearWaitlistForDay(session.id, date);

      notifyCounselors(
        updated,
        `${session.name} asked to move their ${updated.type} session from ${formatDate(app.date)}, ${formatTime12(app.time)} to ${formatDate(date)}, ${formatTime12(time)}.`,
      );
      window.logActivity(
        session,
        `Requested reschedule from ${app.date} ${formatTime12(app.time)} to ${date} ${formatTime12(time)}`,
      );
      emailCounselors(updated, {
        subject: `Reschedule Request - ${session.name}`,
        header: "Appointment Reschedule Request",
        message: `${session.name} asked to move their session from ${formatDate(app.date)}, ${formatTime12(app.time)} to the time below.${reason ? ` Reason: ${reason}` : ""}`,
        status: "Pending (rescheduled)",
      }).catch((err) => console.error("EmailJS Reschedule Error:", err));

      rerenderCurrentView(session);
      return true;
    },
  });
}

function openRatingDialog(session, app) {
  openModal({
    title: "Rate Your Session",
    icon: "star_rate",
    confirmText: "Submit Rating",
    bodyHtml: `
      <p class="modal-lead">How helpful was your ${escapeHtml(app.type)} session with ${escapeHtml(app.counselorName || "your counselor")} on ${formatDate(app.date)}?</p>
      <input type="hidden" id="rateValue">
      <div class="star-picker" role="radiogroup" aria-label="Rating">
        ${[1, 2, 3, 4, 5]
          .map(
            (n) =>
              `<button type="button" class="star-btn" data-value="${n}" aria-label="${n} star${n > 1 ? "s" : ""}">★</button>`,
          )
          .join("")}
      </div>
      <label class="modal-label" for="rateComment">Comment (optional)</label>
      <textarea id="rateComment" class="modal-input" rows="3" placeholder="What went well? What could be better?"></textarea>
      <p class="modal-hint">Your rating is shared with the guidance office to improve its services.</p>
    `,
    onOpen: ({ card }) => {
      const picker = card.querySelector(".star-picker");
      const valueInput = card.querySelector("#rateValue");
      picker.onclick = (e) => {
        const btn = e.target.closest(".star-btn");
        if (!btn) return;
        valueInput.value = btn.dataset.value;
        picker.querySelectorAll(".star-btn").forEach((b) => {
          b.classList.toggle(
            "on",
            Number(b.dataset.value) <= Number(btn.dataset.value),
          );
        });
      };
    },
    onConfirm: ({ card, showError }) => {
      const rating = Number(card.querySelector("#rateValue").value);
      if (!rating) {
        showError("Please choose from 1 to 5 stars.");
        return false;
      }
      const comment = card.querySelector("#rateComment").value.trim();

      updateAppointment(app.id, {
        feedback: { rating, comment, at: new Date().toISOString() },
      });
      notifyCounselors(
        app,
        `${session.name} rated their ${app.type} session ${rating}/5.`,
      );
      window.logActivity(session, `Rated session on ${app.date}: ${rating}/5`);
      rerenderCurrentView(session);
      return true;
    },
  });
}

// One delegated click handler for every appointment action button
export function attachAppointmentActions(session) {
  const container = document.getElementById("app");
  if (!container) return;

  // Assign (not add) so re-rendering never stacks duplicate handlers
  container.onclick = (e) => {
    const waitBtn = e.target.closest(".waitlist-leave, .waitlist-book");
    if (waitBtn) {
      const entry = getMyWaitlist(session.id).find(
        (w) => w.id === Number(waitBtn.dataset.id),
      );
      if (!entry) return;
      if (waitBtn.classList.contains("waitlist-book")) {
        bookingPrefill = {
          counselorId: entry.counselorId,
          date: entry.date,
          time: entry.time,
        };
        goTo("book");
      } else {
        leaveWaitlist(entry.id);
        rerenderCurrentView(session);
      }
      return;
    }

    const btn = e.target.closest(
      ".cancel-btn-table, .reschedule-btn, .rate-btn, .followup-btn, .slip-btn",
    );
    if (!btn) return;

    const app = getAppointments().find((a) => a.id === Number(btn.dataset.id));
    if (!app) return;

    if (btn.classList.contains("cancel-btn-table"))
      openCancelDialog(session, app);
    else if (btn.classList.contains("reschedule-btn"))
      openRescheduleDialog(session, app);
    else if (btn.classList.contains("rate-btn")) openRatingDialog(session, app);
    else if (btn.classList.contains("slip-btn")) printSlip(session, app);
    else if (btn.classList.contains("followup-btn")) {
      bookingPrefill = {
        counselorId: app.counselorId || "auto",
        type: app.type,
        mode: app.mode,
        followUp: true,
      };
      goTo("book");
    }
  };
}

// Redraw whichever tab is open (dashboard, history or booking)
function rerenderCurrentView(session) {
  const content = document.getElementById("dynamic-content");
  const target = document
    .querySelector(".nav-item.active")
    ?.getAttribute("data-target");
  if (!content) return;

  if (target === "dashboard") content.innerHTML = renderDashboard(session);
  else if (target === "records") content.innerHTML = renderHistory(session);
  else if (target === "wellbeing") renderWellbeing(content, session);
  else if (target === "book" && refreshBookingSlots) refreshBookingSlots();
}

// --- GLOBAL WINDOW GCAL INTERCEPT HANDLER ---
window.handleStudentInlineSync = async (btn) => {
  if (btn.disabled) return;

  const dateStr = btn.getAttribute("data-date"); // e.g. "2026-05-12"
  const timeStr = btn.getAttribute("data-time"); // e.g. "02:30 PM" or "14:30"
  const typeStr = btn.getAttribute("data-type") || "Counseling Session";

  if (!dateStr || !timeStr) {
    console.error(
      "❌ Google Calendar Hook Aborted: Missing structural appointment metrics.",
    );
    return;
  }

  console.log(
    "🚀 Normalizing Google payload layout parameters for properties:",
    { dateStr, timeStr },
  );

  let cleanTime = timeStr.trim();

  // SANITIZATION STEP: Normalize 12-hour formats ("02:30 PM") into robust 24-hour targets ("14:30")
  if (
    cleanTime.toLowerCase().includes("am") ||
    cleanTime.toLowerCase().includes("pm")
  ) {
    const parts = cleanTime.split(" ");
    const timePart = parts[0];
    const modifier = parts[1] ? parts[1].toLowerCase() : "";

    const timeSegments = timePart.split(":");
    let hours = timeSegments[0];
    const minutes = timeSegments[1];

    if (modifier === "pm" && hours !== "12") {
      hours = String(parseInt(hours, 10) + 12);
    }
    if (modifier === "am" && hours === "12") {
      hours = "00";
    }

    cleanTime = `${hours.padStart(2, "0")}:${minutes.substring(0, 2)}`;
  }

  try {
    const [hoursStr, minutesStr] = cleanTime.split(":");
    const [year, month, day] = dateStr
      .split("-")
      .map((num) => parseInt(num, 10));

    // Construct real Date objects locally to avoid offset zone shifting issues
    const startEventDate = new Date(
      year,
      month - 1,
      day,
      parseInt(hoursStr, 10),
      parseInt(minutesStr, 10),
      0,
    );
    const endEventDate = new Date(startEventDate);
    endEventDate.setHours(startEventDate.getHours() + 1); // Allocate a stable 1-hour session window

    btn.innerText = "🔄 Syncing...";
    btn.disabled = true;

    // Send verified standardized ISO formatting data strings directly to Google calendar client layers
    const success = await createCalendarEvent({
      summary: `Granby Guidance: ${typeStr}`,
      description:
        "Scheduled consultation slot with the Granby Counseling Department.",
      startTime: startEventDate.toISOString(),
      endTime: endEventDate.toISOString(),
    });

    if (success) {
      btn.innerText = "✅ Synced to Google";
      btn.style.backgroundColor = "#10b981";
      btn.style.color = "#ffffff";
    } else {
      btn.innerText = "🗓️ Try Sync Again";
      btn.disabled = false;
    }
  } catch (err) {
    console.error(
      "❌ Exception captured inside the Google Calendar formatting sequence:",
      err,
    );
    btn.innerText = "🗓️ Try Sync Again";
    btn.disabled = false;
  }
};
// --- MAIN RENDERER ---

export function renderStudentView(root, session, onLogout) {
  document.body.classList.add("student-portal");
  root.innerHTML = `
    <div class="student-container">
        <aside class="sidebar" id="sidebar">
            <div class="sidebar-header">
                <div class="portal-brand">
                    <i class="material-icons" aria-hidden="true">school</i>
                    <div class="portal-brand-text">
                        <span class="portal-brand-name">Granby Gateway</span>
                        <span class="portal-brand-role">Student Portal</span>
                    </div>
                </div>
            </div>
            <nav id="student-nav">
                <button class="nav-item active" data-target="dashboard">
                    <i class="material-icons">dashboard</i> Dashboard
                </button>
                <button class="nav-item" data-target="book">
                    <i class="material-icons">event</i> Book Appointment
                </button>
                <button class="nav-item" data-target="records">
                    <i class="material-icons">history</i> My History
                </button>
                <button class="nav-item" data-target="wellbeing">
                    <i class="material-icons">favorite_border</i> My Wellbeing
                </button>
                <button class="nav-item" data-target="settings">
                    <i class="material-icons">settings</i> Settings
                </button>

                <button class="nav-item ai-chat-trigger" id="openAiChatBtn" style="color: #3b82f6; font-weight: 600; margin-top: auto;">
                    <i class="material-icons">psychology</i> Ask Granby AI
                </button>

                <button class="nav-item logout" id="logoutBtn">
                    <i class="material-icons">logout</i> Logout
                </button>
            </nav>
        </aside>
        <main class="content-area" style="padding: 40px; box-sizing: border-box; flex: 1;">
            <div class="portal-topbar">
                <button type="button" id="mobileMenuBtn" class="hamburger-btn" aria-label="Open menu">
                    <i class="material-icons">menu</i>
                </button>
                ${renderBellHtml()}
            </div>
            <div id="broadcast-slot">${renderBroadcastBanner(getBroadcasts())}</div>
            <section id="dynamic-content">${renderDashboard(session)}</section>
        </main>

        <div id="floating-ai-chatbox" class="chatbox-window hidden" style="position: fixed; bottom: 20px; right: 20px; width: 360px; max-width: calc(100vw - 32px); height: 460px; background: #ffffff; border-radius: 12px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1); border: 1px solid #e2e8f0; display: flex; flex-direction: column; z-index: 9999; overflow: hidden; transition: all 0.25s ease-in-out;">
            <div style="background: #3b82f6; color: white; padding: 14px 16px; display: flex; justify-content: space-between; align-items: center; user-select: none;">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <i class="material-icons">psychology</i>
                    <span style="font-weight: 600; font-size: 0.9rem;">Granby Campus Assistant</span>
                </div>
                <button id="closeAiChatBtn" style="background: none; border: none; color: white; cursor: pointer; display: inline-flex; align-items: center; padding: 2px;">
                    <i class="material-icons" style="font-size: 20px;">remove</i>
                </button>
            </div>

            <div id="chatbox-messages-viewport" style="flex: 1; padding: 16px; overflow-y: auto; background: #f8fafc; display: flex; flex-direction: column; gap: 12px; font-size: 0.85rem;">
                <div style="background: #e2e8f0; color: #334155; padding: 10px 12px; border-radius: 8px 8px 8px 0px; max-width: 85%; align-self: flex-start; line-height: 1.5;">
                    👋 Hello! I am your virtual campus helper. Ask me anything about shifting schedules, dropping documents, or getting ready for counseling!
                </div>
            </div>

            <form id="chatbox-input-form" style="display: flex; border-top: 1px solid #e2e8f0; background: #ffffff; padding: 8px; gap: 6px; margin: 0;">
                <input type="text" id="chatbox-user-msg" placeholder="Type your campus question here..." autocomplete="off" required style="flex: 1; border: none; padding: 8px 10px; font-size: 0.85rem; outline: none;">
                <button type="submit" style="background: #3b82f6; color: white; border: none; border-radius: 6px; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0;">
                    <i class="material-icons" style="font-size: 18px;">send</i>
                </button>
            </form>
        </div>
    </div>
  `;

  setupStudentListeners(onLogout, session);
  attachAppointmentActions(session);
  setupBell(session.id);
  initializeFloatingChatboxEngine();

  listenForRealTimeUpdates(() => {
    const broadcastSlot = document.getElementById("broadcast-slot");
    if (broadcastSlot)
      broadcastSlot.innerHTML = renderBroadcastBanner(getBroadcasts());
    refreshBell(session.id);
    rerenderCurrentView(session);
  });
}
// --- Chatbox Operational Functionality Code Core Engine ---
function initializeFloatingChatboxEngine() {
  const chatbox = document.getElementById("floating-ai-chatbox");
  const openBtn = document.getElementById("openAiChatBtn");
  const closeBtn = document.getElementById("closeAiChatBtn");
  const form = document.getElementById("chatbox-input-form");
  const input = document.getElementById("chatbox-user-msg");
  const viewport = document.getElementById("chatbox-messages-viewport");

  if (!chatbox || !openBtn || !closeBtn || !form || !input || !viewport) return;

  // 🔒 CRITICAL CONCURRENCY LOCK: Prevents double-submits and layout state loop execution spikes
  let isAiResponding = false;

  // Toggle visible show/hide css state rule flags
  openBtn.onclick = (e) => {
    e.preventDefault();
    chatbox.classList.toggle("hidden");
    if (!chatbox.classList.contains("hidden")) {
      input.focus();
      viewport.scrollTop = viewport.scrollHeight;
    }
  };

  closeBtn.onclick = () => {
    chatbox.classList.add("hidden");
  };

  // Submit messages query loop interceptor routing pipeline
  form.onsubmit = async (e) => {
    e.preventDefault();
    e.stopPropagation(); // Stop event bubbling to keep background updates from firing

    // If an AI operation is ongoing, drop subsequent submit events immediately
    if (isAiResponding) return;

    const userText = input.value.trim();
    if (!userText) return; // Prevent empty spaces

    // Wipe text field instantly for UX crispness
    input.value = "";

    try {
      isAiResponding = true;

      // UI Lock down: Disable user inputs while the AI model streams chunks
      input.disabled = true;
      const submitBtn = form.querySelector("button[type='submit']");
      if (submitBtn) submitBtn.disabled = true;

      // 1. RENDER USER MESSAGE BUBBLE (Via high-performance Node construction)
      const userBubble = document.createElement("div");
      userBubble.style.cssText =
        "background: #3b82f6; color: white; padding: 10px 12px; border-radius: 8px 8px 0px 8px; max-width: 85%; align-self: flex-end; line-height: 1.5; word-break: break-word; margin-bottom: 8px;";
      userBubble.textContent = userText; // Protects completely against XSS script injection
      viewport.appendChild(userBubble);
      viewport.scrollTop = viewport.scrollHeight;

      // 2. RENDER LIVE LOADING PROGRESS BUBBLE
      const loadingBubbleId = `ai-loading-${Date.now()}`;
      const loadingBubble = document.createElement("div");
      loadingBubble.id = loadingBubbleId;
      loadingBubble.style.cssText =
        "background: #e2e8f0; color: #64748b; padding: 10px 12px; border-radius: 8px 8px 8px 0px; max-width: 85%; align-self: flex-start; font-style: italic; margin-bottom: 8px;";

      const statusSpan = document.createElement("span");
      statusSpan.id = `status-text-${loadingBubbleId}`; // Explicit context target keying
      statusSpan.textContent = "🤖 Waking up neural processor...";

      loadingBubble.appendChild(statusSpan);
      viewport.appendChild(loadingBubble);
      viewport.scrollTop = viewport.scrollHeight;

      // 3. EXECUTE ADVANCED INFERENCE LIFECYCLE
      const aiReply = await getPreBookingAdvice(
        userText,
        "General Campus Inquiry",
        (progressText) => {
          // Look up our targeted scoped sub-element node safely
          const statusNode = document.getElementById(
            `status-text-${loadingBubbleId}`,
          );
          if (statusNode) {
            statusNode.textContent =
              progressText.length > 40
                ? `🤖 ${progressText.substring(0, 37)}...`
                : `🤖 ${progressText}`;
          }
        },
      );

      // Extract and strip away loader indicator row cleanly
      document.getElementById(loadingBubbleId)?.remove();

      // 4. RENDER FINAL PROCESSED REASONING VALUE
      const aiBubble = document.createElement("div");
      aiBubble.style.cssText =
        "background: #e2e8f0; color: #334155; padding: 10px 12px; border-radius: 8px 8px 8px 0px; max-width: 85%; align-self: flex-start; line-height: 1.5; margin-bottom: 8px;";

      // Escape the model output first, then turn **bold** markdown into <strong>
      aiBubble.innerHTML = escapeHtml(
        aiReply ||
          "I'm here to help! Could you please elaborate a bit more on your concern so I can check our campus regulations accurately?",
      ).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
      viewport.appendChild(aiBubble);
    } catch (err) {
      // Emergency teardown layout clear steps on pipeline breaks
      const activeLoader = viewport.querySelector("[id^='ai-loading-']");
      if (activeLoader) activeLoader.remove();

      console.error("Local inference execution failed:", err);

      const errorBubble = document.createElement("div");
      errorBubble.style.cssText =
        "background: #fee2e2; color: #991b1b; padding: 10px 12px; border-radius: 8px 8px 8px 0px; max-width: 85%; align-self: flex-start; margin-bottom: 8px;";
      errorBubble.textContent =
        "⚠️ Cloud processing encountered a rate-limit layout bump. Please try your request again in a few moments.";
      viewport.appendChild(errorBubble);
    } finally {
      // 🔓 RELEASE THE MUTEX MUTATION LATCH
      isAiResponding = false;
      input.disabled = false;

      const submitBtn = form.querySelector("button[type='submit']");
      if (submitBtn) submitBtn.disabled = false;

      viewport.scrollTop = viewport.scrollHeight;
      input.focus(); // Keep UX snapping clean
    }
  };
}
export function setupStudentListeners(onLogout, session) {
  const content = document.getElementById("dynamic-content");
  const navButtons = document.querySelectorAll(
    ".nav-item:not(.logout):not(.ai-chat-trigger)",
  );
  const sidebar = document.getElementById("sidebar");
  const mobileMenuBtn = document.getElementById("mobileMenuBtn");
  const isMobile = () => window.innerWidth <= 1023;

  // 1. Mobile Hamburger Menu Toggle
  if (mobileMenuBtn && sidebar) {
    mobileMenuBtn.onclick = (e) => {
      e.stopPropagation();
      sidebar.classList.toggle("active");
    };
  }

  // 2. Click Outside Mobile Sidebar to Close It
  document.addEventListener("click", (e) => {
    if (
      isMobile() &&
      sidebar.classList.contains("active") &&
      !sidebar.contains(e.target) &&
      !mobileMenuBtn.contains(e.target)
    ) {
      sidebar.classList.remove("active");
    }
  });

  // 3. Navigation View Switcher
  navButtons.forEach((btn) => {
    btn.onclick = () => {
      navButtons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      if (isMobile()) sidebar.classList.remove("active");

      const target = btn.getAttribute("data-target");
      refreshBookingSlots = null;

      if (target === "dashboard") {
        content.innerHTML = renderDashboard(session);
      } else if (target === "book") {
        content.innerHTML = renderBookingForm(session);
        attachBookingListener(session);
      } else if (target === "records") {
        content.innerHTML = renderHistory(session);
      } else if (target === "wellbeing") {
        renderWellbeing(content, session);
      } else if (target === "settings") {
        renderSettings(content, session);
      }
    };
  });

  // 4. The AI chat button also closes the mobile menu
  const chatBtn = document.getElementById("openAiChatBtn");
  if (chatBtn && sidebar) {
    chatBtn.addEventListener("click", () => {
      if (isMobile()) sidebar.classList.remove("active");
    });
  }

  // 5. Logout Session Termination Flow
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.onclick = onLogout;
  }
}
