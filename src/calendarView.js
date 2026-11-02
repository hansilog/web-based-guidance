// calendarView.js
// --- COUNSELOR WEEK CALENDAR + DAYS OFF ---
import { escapeHtml } from "./syncUtil.js";
import {
  SLOTS,
  getAppointments,
  getBlocks,
  saveBlocks,
  isDayOff,
  toDateStr,
  parseDate,
  formatTime12,
} from "./store.js";

const SHOWN_STATUSES = ["pending", "approved", "completed", "no-show"];

// Weeks away from the current week (0 = this week)
let weekOffset = 0;

function getWeekDays(offset) {
  const monday = new Date();
  monday.setHours(0, 0, 0, 0);
  const day = monday.getDay();
  // Sunday belongs to the week that starts the next day
  monday.setDate(monday.getDate() - (day === 0 ? -1 : day - 1) + offset * 7);
  return Array.from({ length: 5 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return toDateStr(d);
  });
}

function dayLabel(date) {
  return parseDate(date).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function renderCounselorCalendar(container, session) {
  const days = getWeekDays(weekOffset);
  const today = toDateStr(new Date());
  const myApps = getAppointments().filter(
    // Walk-ins can start at any minute, so they stay out of the hourly grid
    (a) =>
      a.counselorId === session.id &&
      SHOWN_STATUSES.includes(a.status) &&
      !a.walkIn,
  );

  const cell = (date, time) => {
    const app = myApps.find((a) => a.date === date && a.time === time);
    if (!app) return `<div class="cal-cell"></div>`;
    return `
      <div class="cal-cell">
        <button type="button" class="cal-event ${escapeHtml(app.status)} case-link" data-student="${app.studentId}" title="Open ${escapeHtml(app.studentName)}'s case file">
          <strong>${escapeHtml(app.studentName)}</strong>
          <span>${escapeHtml(app.type)}</span>
        </button>
      </div>`;
  };

  container.innerHTML = `
    <div class="admin-card">
      <div class="card-header cal-toolbar">
        <h2><i class="material-icons">calendar_month</i> My Calendar</h2>
        <div class="cal-nav">
          <button type="button" class="btn-secondary" data-week="-1" aria-label="Previous week"><i class="material-icons">chevron_left</i></button>
          <button type="button" class="btn-secondary" data-week="0">This week</button>
          <button type="button" class="btn-secondary" data-week="1" aria-label="Next week"><i class="material-icons">chevron_right</i></button>
        </div>
      </div>
      <p class="subtitle cal-help">Click a day's header to mark it as a day off. Students can't book you on days off.</p>

      <div class="cal-legend">
        <span class="cal-dot pending"></span> Pending
        <span class="cal-dot approved"></span> Approved
        <span class="cal-dot completed"></span> Completed
        <span class="cal-dot no-show"></span> No-show
        <span class="cal-dot off"></span> Day off
      </div>

      <div class="cal-scroll">
        <div class="cal-grid">
          <div class="cal-corner"></div>
          ${days
            .map((date) => {
              const off = isDayOff(session.id, date);
              return `
              <button type="button" class="cal-day-head ${date === today ? "today" : ""} ${off ? "off" : ""}"
                      data-date="${date}" title="${off ? "Click to make this day available" : "Click to mark as day off"}">
                ${dayLabel(date)}
                <small>${off ? "Day off" : "Available"}</small>
              </button>`;
            })
            .join("")}
          ${SLOTS.map(
            (time) => `
            <div class="cal-time">${formatTime12(time)}</div>
            ${days
              .map((date) =>
                isDayOff(session.id, date)
                  ? `<div class="cal-cell off"></div>`
                  : cell(date, time),
              )
              .join("")}`,
          ).join("")}
        </div>
      </div>
    </div>
  `;

  container.querySelectorAll("[data-week]").forEach((btn) => {
    btn.onclick = () => {
      const step = Number(btn.dataset.week);
      weekOffset = step === 0 ? 0 : weekOffset + step;
      renderCounselorCalendar(container, session);
    };
  });

  container.querySelectorAll(".cal-day-head").forEach((btn) => {
    btn.onclick = () => toggleDayOff(container, session, btn.dataset.date);
  });
}

function toggleDayOff(container, session, date) {
  const blocks = getBlocks();
  const existing = blocks.find(
    (b) => b.counselorId === session.id && b.date === date,
  );

  if (existing) {
    saveBlocks(blocks.filter((b) => b !== existing));
    window.logActivity(session, `Marked ${date} as available`);
  } else {
    const booked = getAppointments().filter(
      (a) =>
        a.counselorId === session.id &&
        a.date === date &&
        ["pending", "approved"].includes(a.status),
    );
    if (booked.length > 0) {
      alert(
        `You have ${booked.length} pending or approved session(s) on ${dayLabel(date)}. Reject or finish them before taking the day off.`,
      );
      return;
    }
    saveBlocks([
      ...blocks,
      { counselorId: session.id, date, reason: "Day off" },
    ]);
    window.logActivity(session, `Marked ${date} as a day off`);
  }
  renderCounselorCalendar(container, session);
}
