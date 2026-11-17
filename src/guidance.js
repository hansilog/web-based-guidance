import emailjs from "@emailjs/browser";
import {
  EMAIL_PUBLIC_KEY,
  EMAIL_SERVICE,
  EMAIL_TEMPLATE,
  EMAIL_CODE_TEMPLATE,
} from "./emailConfig.js";
import schoolLogo from "./assets/school-logo-128.png";
import "./styles/guidance.css";
import {
  listenForRealTimeUpdates,
  renderBroadcastBanner,
  hashPassword,
  escapeHtml,
} from "./syncUtil.js";
import { createCalendarEvent } from "./calendar.js";
import { generateStudentSummary } from "./ai.js";
import {
  getAppointments,
  saveAppointments,
  updateAppointment,
  getUsers,
  saveUsers,
  getUserById,
  getSlotStates,
  isTimeOpen,
  overlappingSession,
  canReceiveEmail,
  addNotification,
  appointmentStart,
  formatTime12,
  toDateStr,
  getConcerns,
  updateConcern,
  isMeetingLink,
  getBroadcasts,
} from "./store.js";
import { openModal, renderBellHtml, setupBell, refreshBell } from "./ui.js";
import {
  isRemote,
  startPasswordChange,
  finishPasswordChange,
} from "./remote.js";
import { renderCounselorCalendar } from "./calendarView.js";
import { renderInsights } from "./insights.js";
import { getStudentsToCheckOn } from "./checkon.js";
import { printCaseSummary } from "./caseSummary.js";

// 📦 IMPORT THE VIEW COMPONENT FILE CHUNKS
import {
  generateAppointmentsTableHtml,
  renderOverview,
  renderWalkInBody,
  renderDecisionBody,
  renderCloseBody,
  renderCaseFile,
  renderStudentRecords,
  renderGuidanceSettings,
  renderLogs,
  renderConcerns,
  formatDateShort,
  NOTE_TEMPLATES,
} from "./guidanceView.js";

emailjs.init(EMAIL_PUBLIC_KEY);

// The logged-in counselor, set when the view is rendered
let currentSession = null;
// Status filter chosen on the Appointments table
let tableFilter = "all";
// Filter chosen on the Concerns tab
let concernFilter = "open";
// Time range on the Insights tab
let insightsRange = "90";

// Appointments assigned to this counselor, plus unassigned ("Any Available") requests
function getMyAppointments() {
  const all = getAppointments();
  if (!currentSession) return all;
  return all.filter(
    (a) => a.counselorId == null || a.counselorId === currentSession.id,
  );
}

const needsClosing = (a) =>
  a.status === "approved" && appointmentStart(a) <= new Date();

const isTodaySession = (a) =>
  a.status === "approved" && a.date === toDateStr(new Date());

const isUrgentRequest = (a) => a.status === "pending" && a.urgent;

// Completed sessions with a recommended follow-up the student hasn't booked yet
function getFollowUpsDue() {
  const all = getAppointments();
  return all
    .filter(
      (a) =>
        a.status === "completed" &&
        a.followUp &&
        a.counselorId === currentSession?.id &&
        !all.some(
          (b) =>
            b.studentId === a.studentId &&
            b.id !== a.id &&
            ["pending", "approved", "completed"].includes(b.status) &&
            appointmentStart(b) > appointmentStart(a),
        ),
    )
    .sort((a, b) => appointmentStart(b) - appointmentStart(a));
}

function matchesFilter(app) {
  switch (tableFilter) {
    case "all":
      return true;
    case "urgent":
      return isUrgentRequest(app);
    case "today":
      return isTodaySession(app);
    case "walk-in":
      return Boolean(app.walkIn);
    case "to-close":
      return needsClosing(app);
    case "closed":
      return ["rejected", "cancelled", "no-show"].includes(app.status);
    default:
      return app.status === tableFilter;
  }
}

// --- 1. CORE OPERATIONAL DOM RENDERING CONTROL ---

export function renderAppointmentsTable() {
  const contentContainer = document.getElementById("admin-dynamic-content");
  if (!contentContainer) return;

  // Pending first, then sessions waiting to be closed, then upcoming, then history
  const rank = (a) => {
    if (a.status === "pending" && a.checkIn?.safetyFlag) return -1;
    if (a.status === "pending") return a.urgent ? 0 : 1;
    if (needsClosing(a)) return 2;
    if (a.status === "approved") return 3;
    return 4;
  };
  const sorted = getMyAppointments()
    .filter(matchesFilter)
    .sort((a, b) => {
      if (rank(a) !== rank(b)) return rank(a) - rank(b);
      const diff = appointmentStart(a) - appointmentStart(b);
      // History reads newest first
      return rank(a) === 4 ? -diff : diff;
    });

  const mine = getMyAppointments();
  const today = mine
    .filter(isTodaySession)
    .sort((a, b) => appointmentStart(a) - appointmentStart(b));

  contentContainer.innerHTML =
    renderOverview({
      stats: {
        pending: mine.filter((a) => a.status === "pending").length,
        urgent: mine.filter(isUrgentRequest).length,
        today: today.length,
        toClose: mine.filter(needsClosing).length,
      },
      filter: tableFilter,
      today,
      followUps: getFollowUpsDue(),
      checkOn: getStudentsToCheckOn(currentSession.id),
    }) + generateAppointmentsTableHtml(sorted, tableFilter);
  setupTableSearch();

  const filterSelect = document.getElementById("statusFilter");
  if (filterSelect) {
    filterSelect.onchange = () => {
      tableFilter = filterSelect.value;
      renderAppointmentsTable();
    };
  }
}

// --- 2. LIFECYCLE INTERACTION PIPELINES ---

function emailStudent(app, status, notes) {
  if (!canReceiveEmail(app.studentEmail)) return Promise.resolve();
  return emailjs
    .send(EMAIL_SERVICE, EMAIL_TEMPLATE, {
      subject_line: `Update: Your Appointment is ${status.toUpperCase()}`,
      to_email: app.studentEmail,
      recipient_name: app.studentName,
      header_title: "Appointment Status Update",
      main_message: `Your guidance appointment request has been ${status}. Please see details below.`,
      app_type: app.type,
      app_date: app.date,
      app_time: formatTime12(app.time),
      status,
      notes: notes || "No additional notes provided.",
    })
    .catch((error) => console.error("Failed to send email:", error));
}

async function addToGoogleCalendar(app, notes) {
  try {
    const start = appointmentStart(app);
    const end = new Date(start);
    end.setHours(start.getHours() + 1);
    await createCalendarEvent({
      summary: `Guidance Appointment: ${app.studentName}`,
      description: `Service Type: ${app.type}\nNotes: ${notes || "No additional counselor notes."}`,
      startTime: start.toISOString(),
      endTime: end.toISOString(),
    });
  } catch (gcalError) {
    console.error("⚠️ Google Calendar sync failed:", gcalError);
  }
}

// Approve or reject a pending request
function openDecisionModal(app, status) {
  const isApprove = status === "approved";
  const slots = getSlotStates(app.date, currentSession.id, app.id, {
    staff: true,
  });

  openModal({
    title: isApprove ? "Approve Request" : "Reject Request",
    icon: isApprove ? "check_circle" : "block",
    danger: !isApprove,
    confirmText: isApprove ? "Approve & Notify" : "Reject & Notify",
    bodyHtml: renderDecisionBody(app, status, slots),
    onConfirm: async ({ card, showError }) => {
      const notes = card.querySelector("#decisionNotes").value.trim();
      if (!isApprove && !notes) {
        showError("Please give the student a reason.");
        return false;
      }

      // decidedAt feeds the admin's response-time report
      const changes = {
        status,
        counselorNotes: notes,
        decidedAt: new Date().toISOString(),
      };
      if (isApprove) {
        const time = card.querySelector("#decisionTime").value;
        if (!isTimeOpen(currentSession.id, app.date, time, app.id)) {
          showError("You already have another session at that time.");
          return false;
        }
        // Online sessions: an https meeting link (optional, can be added later)
        const linkInput = card.querySelector("#decisionLink");
        const link = linkInput ? linkInput.value.trim() : "";
        if (link && !isMeetingLink(link)) {
          showError(
            "The meeting link must start with https:// (copy it from Google Meet or Zoom).",
          );
          return false;
        }
        if (linkInput) changes.meetingLink = link || null;
        // Approving an unassigned request makes it yours
        Object.assign(changes, {
          time,
          counselorId: currentSession.id,
          counselorName: currentSession.name,
        });
      }

      const updated = updateAppointment(app.id, changes);
      const when = `${formatDateShort(updated.date)}, ${formatTime12(updated.time)}`;
      addNotification(
        updated.studentId,
        isApprove
          ? `Your ${updated.type} session on ${when} was approved by ${currentSession.name}.${updated.meetingLink ? " It's online: use the Join button on your Dashboard, 10 minutes before it starts." : ""}${notes ? ` Note: ${notes}` : ""}`
          : `Your ${updated.type} request for ${when} was not approved. Reason: ${notes}`,
      );
      window.logActivity(
        currentSession,
        `${isApprove ? "Approved" : "Rejected"} ${updated.studentName}'s session on ${updated.date} ${formatTime12(updated.time)}`,
      );

      refreshCurrentView();
      if (isApprove) await addToGoogleCalendar(updated, notes);
      emailStudent(
        updated,
        status,
        [notes, updated.meetingLink && `Meeting link: ${updated.meetingLink}`]
          .filter(Boolean)
          .join(" | "),
      );
      return true;
    },
  });
}

// Note templates: insert a structure, keeping anything already typed
function bindNoteTemplates(card) {
  card.querySelectorAll(".note-template").forEach((btn) => {
    btn.onclick = () => {
      const template = NOTE_TEMPLATES.find(
        (t) => t.key === btn.dataset.template,
      );
      const area = card.querySelector(`#${btn.dataset.target}`);
      if (!template || !area) return;
      const current = area.value.trim();
      area.value = current ? `${current}\n\n${template.text}` : template.text;
      area.focus();
      // Cursor goes after the first heading so typing can start right away
      const firstLine = area.value.indexOf(
        "\n",
        current ? current.length + 2 : 0,
      );
      area.setSelectionRange(firstLine, firstLine);
      if (!current) area.scrollTop = 0;
    };
  });
}

// Close an approved session that has started: completed or no-show
function openCloseModal(app, status) {
  const isComplete = status === "completed";

  openModal({
    title: isComplete ? "Complete Session" : "Mark as No-show",
    icon: isComplete ? "task_alt" : "person_off",
    danger: !isComplete,
    confirmText: isComplete ? "Save & Complete" : "Mark No-show",
    bodyHtml: renderCloseBody(app, status),
    onOpen: ({ card }) => bindNoteTemplates(card),
    onConfirm: ({ card }) => {
      const caseNotes = card.querySelector("#closeCaseNotes").value.trim();
      const changes = { status, caseNotes };
      if (isComplete) {
        changes.followUp = card.querySelector("#closeFollowUp").checked;
        const message = card.querySelector("#closeMessage").value.trim();
        if (message) changes.counselorNotes = message;
      }

      const updated = updateAppointment(app.id, changes);
      const when = formatDateShort(updated.date);
      let studentMessage = `You missed your ${updated.type} session on ${when}. Please book a new appointment if you still need help.`;
      if (isComplete) {
        studentMessage = `Your ${updated.type} session on ${when} is complete. You can now rate it in My History.`;
        if (updated.followUp) {
          studentMessage += " Your counselor recommends a follow-up session.";
        }
      }
      addNotification(updated.studentId, studentMessage);
      window.logActivity(
        currentSession,
        `Marked ${updated.studentName}'s session on ${updated.date} as ${status}`,
      );
      refreshCurrentView();
    },
  });
}

// Record a visit from a student who came in without booking
function openWalkInModal() {
  const now = new Date();
  const students = getUsers()
    .filter((u) => u.role === "student" && u.active !== false)
    .sort((a, b) => a.name.localeCompare(b.name));

  openModal({
    title: "Log Walk-in Session",
    icon: "directions_walk",
    confirmText: "Save Session",
    bodyHtml: renderWalkInBody(
      students,
      toDateStr(now),
      `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`,
    ),
    onOpen: ({ card }) => bindNoteTemplates(card),
    onConfirm: ({ card, showError }) => {
      const student = getUserById(
        Number(card.querySelector("#walkInStudent").value),
      );
      const type = card.querySelector("#walkInType").value;
      const date = card.querySelector("#walkInDate").value;
      const time = card.querySelector("#walkInTime").value;

      if (!student) {
        showError("Please select the student.");
        return false;
      }
      if (!type) {
        showError("Please select the reason for the visit.");
        return false;
      }
      if (!date || !time) {
        showError("Please enter the date and time of the visit.");
        return false;
      }
      if (appointmentStart({ date, time }) > new Date()) {
        showError("A walk-in can't be in the future.");
        return false;
      }
      // Sessions are one hour: no overlap with the counselor's or student's others
      const all = getAppointments();
      const clash =
        overlappingSession(
          all.filter((a) => a.counselorId === currentSession.id),
          date,
          time,
        ) ||
        overlappingSession(
          all.filter((a) => a.studentId === student.id),
          date,
          time,
        );
      if (clash) {
        showError(
          clash.date === date && clash.time === time
            ? `There's already a session on this date and time (${clash.studentName}). Pick a different time.`
            : `This overlaps ${clash.studentName}'s session at ${formatTime12(clash.time)}. Sessions are 1 hour, so start at least an hour apart.`,
        );
        return false;
      }

      const stamp = new Date().toISOString();
      const walkIn = {
        id: Date.now(),
        studentId: student.id,
        studentName: student.name,
        studentEmail: student.email,
        counselorId: currentSession.id,
        counselorName: currentSession.name,
        type,
        mode: "Walk-in",
        walkIn: true,
        urgent: false,
        date,
        time,
        notes: "",
        status: "completed",
        counselorNotes: "",
        caseNotes: card.querySelector("#walkInNotes").value.trim(),
        followUp: card.querySelector("#walkInFollowUp").checked,
        createdAt: stamp,
        updatedAt: stamp,
      };
      saveAppointments([...getAppointments(), walkIn]);

      addNotification(
        student.id,
        `Your walk-in ${type} session on ${formatDateShort(date)} was recorded by ${currentSession.name}. You can rate it in My History.${walkIn.followUp ? " Your counselor recommends a follow-up session." : ""}`,
      );
      window.logActivity(
        currentSession,
        `Logged a walk-in session for ${student.name}`,
      );
      refreshCurrentView();
      return true;
    },
  });
}

// Student case file with AI summary
function openCaseFile(studentId) {
  const student = getUserById(studentId);
  if (!student) return;
  const apps = getAppointments()
    .filter((a) => a.studentId === studentId)
    .sort((a, b) => appointmentStart(b) - appointmentStart(a));

  openModal({
    title: `Case File: ${student.name}`,
    icon: "folder_shared",
    cancelText: "Close",
    wide: true,
    bodyHtml: renderCaseFile(student, apps),
    onOpen: ({ card }) => {
      card.querySelector("#printSummaryBtn").onclick = () => {
        const includeNotes = card.querySelector("#printWithNotes").checked;
        printCaseSummary(student, apps, {
          includeNotes,
          printedBy: currentSession.name,
        });
        window.logActivity(
          currentSession,
          `Printed the case summary of ${student.name}${includeNotes ? " (with case notes)" : ""}`,
        );
      };
      const btn = card.querySelector("#aiSummaryBtn");
      const output = card.querySelector("#aiSummaryOutput");
      if (!btn) return;
      btn.onclick = async () => {
        btn.disabled = true;
        output.textContent = "Generating summary...";
        const summary = await generateStudentSummary(student.name, apps);
        // Escape the model output, then keep **bold** and line breaks
        output.innerHTML = escapeHtml(summary || "No summary returned.")
          .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
          .replace(/\n/g, "<br>");
        btn.disabled = false;
        btn.textContent = "Regenerate";
      };
    },
  });
  window.logActivity(currentSession, `Opened case file of ${student.name}`);
}

// Add or change the meeting link of an approved online session
function openLinkModal(app) {
  openModal({
    title: app.meetingLink ? "Edit Meeting Link" : "Add Meeting Link",
    icon: "videocam",
    confirmText: "Save Link",
    bodyHtml: `
      <p class="modal-lead"><strong>${escapeHtml(app.studentName)}</strong> · ${escapeHtml(app.type)}<br>
      ${formatDateShort(app.date)}, ${formatTime12(app.time)} · Online</p>
      <label class="modal-label" for="meetingLinkInput">Meeting link (Google Meet, Zoom, Teams)</label>
      <input type="url" id="meetingLinkInput" class="modal-input" placeholder="https://meet.google.com/..." value="${escapeHtml(app.meetingLink || "")}">
      <p class="modal-hint"><i class="material-icons">notifications</i> The student is notified and gets a Join button 10 minutes before the session.</p>`,
    onConfirm: ({ card, showError }) => {
      const link = card.querySelector("#meetingLinkInput").value.trim();
      if (!isMeetingLink(link)) {
        showError(
          "Paste the full meeting link, starting with https:// (copy it from Google Meet or Zoom).",
        );
        return false;
      }
      const updated = updateAppointment(app.id, { meetingLink: link });
      addNotification(
        updated.studentId,
        `Your online ${updated.type} session on ${formatDateShort(updated.date)}, ${formatTime12(updated.time)} has a meeting link. Use the Join button on your Dashboard, 10 minutes before it starts.`,
      );
      window.logActivity(
        currentSession,
        `Set the meeting link for ${updated.studentName}'s session on ${updated.date}`,
      );
      refreshCurrentView();
      return true;
    },
  });
}

// "Students to check on": send a caring message and record the outreach
function openReachOutModal(appointmentId, studentId) {
  const student = getUserById(studentId);
  const name = student?.name || "this student";
  const first = name.split(" ")[0];
  openModal({
    title: `Reach out to ${name}`,
    icon: "chat",
    confirmText: "Send Message",
    bodyHtml: `
      <p class="modal-lead">${escapeHtml(first)} gets this in their notifications. Keep it short and warm; don't mention check-in answers.</p>
      <label class="modal-label" for="reachOutText">Message</label>
      <textarea id="reachOutText" class="modal-input" rows="4">Hi ${escapeHtml(first)}, this is ${escapeHtml(currentSession.name)} from the guidance office. I'd like to check in with you. You can book a time that works for you, or drop by the office any day.</textarea>
      <p class="modal-hint"><i class="material-icons">lock</i> The student only sees your message, not why they're on this list.</p>`,
    onConfirm: ({ card, showError }) => {
      const message = card.querySelector("#reachOutText").value.trim();
      if (message.length < 10) {
        showError("Please write a short message to the student.");
        return false;
      }
      addNotification(studentId, message);
      updateAppointment(appointmentId, {
        checkedOnAt: new Date().toISOString(),
      });
      window.logActivity(currentSession, `Reached out to ${name}`);
      refreshCurrentView();
      return true;
    },
  });
}

// Nudge a student through their notification bell to book the follow-up
function remindFollowUp(app) {
  addNotification(
    app.studentId,
    `${currentSession.name} recommends a follow-up to your ${app.type} session. You can book it from My History.`,
  );
  updateAppointment(app.id, { followUpRemindedAt: new Date().toISOString() });
  window.logActivity(
    currentSession,
    `Sent ${app.studentName} a follow-up reminder`,
  );
  refreshCurrentView();
}

// --- 3. FILTER & STRUCTURAL NAV HANDLERS ---

function setupTableSearch() {
  const searchInput = document.getElementById("tableSearch");
  const table = document.getElementById("adminTable");
  if (!searchInput || !table) return;

  searchInput.oninput = () => {
    const filter = searchInput.value.toLowerCase().trim();
    const tbody = table.querySelector("tbody");
    if (!tbody) return;

    const rows = tbody.querySelectorAll("tr");
    rows.forEach((row) => {
      if (
        row.classList.contains("empty-row") ||
        row.classList.contains("no-search-results")
      )
        return;
      const rowText = row.textContent.toLowerCase();
      row.style.display = rowText.includes(filter) ? "" : "none";
    });

    const visibleRows = Array.from(rows).filter(
      (r) =>
        r.style.display !== "none" &&
        !r.classList.contains("no-search-results"),
    );
    handleNoSearchResults(tbody, visibleRows.length, filter);
  };
}

function handleNoSearchResults(tbody, visibleCount, filter) {
  let noResultRow = tbody.querySelector(".no-search-results");
  if (visibleCount === 0 && filter !== "") {
    if (!noResultRow) {
      noResultRow = document.createElement("tr");
      noResultRow.className = "no-search-results";
      noResultRow.innerHTML = `
        <td colspan="5" style="text-align: center; padding: 20px; color: #64748b;">
            <i class="material-icons" style="vertical-align: middle;">search_off</i> No matches found for "${escapeHtml(filter)}"
        </td>
      `;
      tbody.appendChild(noResultRow);
    }
  } else if (noResultRow) {
    noResultRow.remove();
  }
}

export function setupStudentSearch() {
  const searchInput = document.getElementById("studentSearch");
  const table = document.getElementById("studentTable");
  if (!searchInput || !table) return;

  searchInput.oninput = () => {
    const filter = searchInput.value.toLowerCase().trim();
    const rows = table.querySelectorAll("tbody tr");
    rows.forEach((row) => {
      if (row.classList.contains("empty-row")) return;
      const text = row.textContent.toLowerCase();
      row.style.display = text.includes(filter) ? "" : "none";
    });
  };
}

function getActiveTab() {
  return document
    .querySelector("#admin-nav .nav-item.active")
    ?.getAttribute("data-target");
}

// Draw a tab's content
function renderTab(target) {
  const content = document.getElementById("admin-dynamic-content");
  if (!content) return;

  if (target === "appointments") {
    renderAppointmentsTable();
  } else if (target === "calendar") {
    renderCounselorCalendar(content, currentSession);
  } else if (target === "students") {
    const students = getUsers().filter((user) => user.role === "student");
    content.innerHTML = renderStudentRecords(students);
    setupStudentSearch();
  } else if (target === "settings") {
    const me = getUserById(currentSession.id) || currentSession;
    content.innerHTML = renderGuidanceSettings(me.notifyEmail || me.email);
    attachSettingsListener();
  } else if (target === "insights") {
    insightsRange = renderInsights(content, currentSession, insightsRange);
  } else if (target === "concerns") {
    content.innerHTML = renderConcerns(getConcerns(), concernFilter);
  } else if (target === "logs") {
    const activities = getMyAppointments()
      .filter((app) => app.updatedAt)
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    content.innerHTML = renderLogs(activities);
  }
}

// Redraw data-driven tabs after a change; leave forms and searches alone
function refreshCurrentView() {
  const target = getActiveTab();
  const search = document.getElementById("tableSearch");
  if (target === "appointments" && !(search && search.value)) {
    renderAppointmentsTable();
  } else if (
    target === "calendar" ||
    target === "logs" ||
    target === "insights"
  ) {
    renderTab(target);
  } else if (
    target === "concerns" &&
    !document.activeElement?.closest?.(".concern-form")
  ) {
    // Don't wipe a reply the counselor is typing
    renderTab(target);
  }
  updateSidebarBadges();
}

// --- 4. MAIN LAYOUT INITIALIZER & ROUTER ---

// "Good morning" / "Good afternoon" / "Good evening"
function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export function renderGuidanceView(root, session, onLogout) {
  currentSession = session;
  // Lets dialogs (added to <body>) share the counselor portal's look
  document.body.classList.add("counselor-portal");

  // Mount the real-time syncing subscription hook exactly ONCE
  listenForRealTimeUpdates(() => {
    const broadcastSlot = document.getElementById("broadcast-slot");
    if (broadcastSlot)
      broadcastSlot.innerHTML = renderBroadcastBanner(getBroadcasts());
    refreshBell(session.id);
    refreshCurrentView();
  });

  root.innerHTML = `
    <div class="admin-container guidance-portal">
        <aside class="sidebar" id="admin-sidebar">
            <div class="sidebar-header">
                <div class="brand">
                    <img class="brand-logo" src="${schoolLogo}" alt="Granby Colleges of Science and Technology seal" width="36" height="36">
                    <div class="brand-info">
                        <span class="brand-name">Granby Gateway</span>
                        <span class="system-tag">Guidance Office</span>
                    </div>
                </div>
            </div>

            <div class="sidebar-search">
                <i class="material-icons">search</i>
                <input type="text" id="globalNavSearch" class="search" placeholder="Quick find">
            </div>

            <nav id="admin-nav">
                <div class="nav-group">
                    <div class="nav-label">Operations</div>
                    <button class="nav-item active" data-target="appointments">
                        <i class="material-icons">calendar_today</i>
                        <span>Appointments</span>
                        <span class="badge" id="pendingBadge">0</span>
                    </button>
                    <button class="nav-item" data-target="insights">
                        <i class="material-icons">insights</i>
                        <span>Insights</span>
                    </button>
                    <button class="nav-item" data-target="calendar">
                        <i class="material-icons">calendar_month</i>
                        <span>My Calendar</span>
                    </button>
                    <button class="nav-item" data-target="students">
                        <i class="material-icons">people</i>
                        <span>Student Records</span>
                    </button>
                    <button class="nav-item" data-target="concerns">
                        <i class="material-icons">shield</i>
                        <span>Concerns</span>
                        <span class="badge" id="concernBadge">0</span>
                    </button>

                    <button class="nav-item" data-target="logs">
                        <i class="material-icons">history</i>
                        <span>Activity Logs</span>
                    </button>

                    <div class="nav-label">Account</div>
                    <button class="nav-item" data-target="settings">
                        <i class="material-icons">settings</i>
                        <span>Settings</span>
                    </button>
                </div>

                <div class="nav-footer">
                    <button class="nav-item logout" id="adminLogoutBtn">
                        <i class="material-icons">power_settings_new</i>
                        <span>Logout</span>
                    </button>
                </div>
            </nav>
        </aside>

        <main class="content-area">
            <header class="view-header">
                <div class="header-info">
                    <h1>${greeting()}, ${escapeHtml(session.name)}</h1>
                    <p class="header-greeting">${new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</p>
                </div>
                <div class="header-actions">
                    ${renderBellHtml()}
                </div>
            </header>

            <div id="broadcast-slot">${renderBroadcastBanner(getBroadcasts())}</div>
            <section id="admin-dynamic-content"></section>
        </main>
    </div>
  `;

  renderAppointmentsTable();
  setupAdminListeners(onLogout);
  setupBell(session.id);
  updateSidebarBadges();
}

function updateSidebarBadges() {
  const apps = getMyAppointments();
  const count = apps.filter(
    (a) => a.status === "pending" || needsClosing(a),
  ).length;
  const badge = document.getElementById("pendingBadge");
  if (badge) {
    badge.innerText = count;
    badge.title = "Pending requests and sessions to close";
    badge.style.display = count > 0 ? "block" : "none";
  }

  const newConcerns = getConcerns().filter((c) => c.status === "new").length;
  const concernBadge = document.getElementById("concernBadge");
  if (concernBadge) {
    concernBadge.innerText = newConcerns;
    concernBadge.title = "New anonymous concerns";
    concernBadge.style.display = newConcerns > 0 ? "block" : "none";
  }
}

function saveConcernCard(btn) {
  const id = Number(btn.dataset.id);
  const card = btn.closest(".concern-card");
  const before = getConcerns().find((c) => c.id === id);
  if (!before || !card) return;

  const status = card.querySelector(".concern-status").value;
  const updated = updateConcern(id, {
    status,
    response: card.querySelector(".concern-response").value.trim(),
    internalNotes: card.querySelector(".concern-notes").value.trim(),
    handledBy: currentSession.name,
  });
  window.logActivity(
    currentSession,
    `Updated anonymous concern ${updated.ref} (${status})`,
  );
  btn.blur();
  renderTab("concerns");
  updateSidebarBadges();
}

function attachSettingsListener() {
  const form = document.getElementById("settingsForm");
  if (form) {
    form.onsubmit = (e) => {
      e.preventDefault();
      const email = document.getElementById("adminEmail").value.trim();
      const users = getUsers();
      const me = users.find((u) => u.id === currentSession.id);
      if (me) {
        me.notifyEmail = email;
        saveUsers(users);
        window.logActivity(currentSession, "Updated notification email");
      }
      const btn = form.querySelector("button");
      btn.innerText = "Settings Saved!";
      btn.style.background = "#10b981";
      setTimeout(() => {
        btn.innerText = "Update Email";
        btn.style.background = "";
      }, 2000);
    };
  }

  let generatedOTP = null;
  let otpExpiresAt = 0;
  let otpTriesLeft = 0;
  const requestBtn = document.getElementById("requestOtpBtn");
  const verifyBtn = document.getElementById("verifyOtpBtn");
  const otpContainer = document.getElementById("otpContainer");
  const newPassInput = document.getElementById("newPassword");
  const otpInput = document.getElementById("otpInput");

  if (requestBtn) {
    requestBtn.onclick = async () => {
      const newPass = newPassInput.value;
      if (newPass.length < 8)
        return alert("Password must be at least 8 characters long.");

      // Send the OTP to the logged-in counselor's own account email
      const recipientEmail = currentSession.email;

      if (isRemote) {
        // Supabase emails a confirmation code for the signed-in account
        requestBtn.innerText = "Sending OTP...";
        requestBtn.disabled = true;
        const problem = await startPasswordChange();
        if (problem) {
          alert(problem);
          requestBtn.disabled = false;
          requestBtn.innerText = "Request OTP to Change Password";
          return null;
        }
        generatedOTP = "sent";
        otpExpiresAt = Infinity;
        alert(`OTP Sent to ${recipientEmail}`);
        otpContainer.classList.remove("hidden");
        requestBtn.classList.add("hidden");
        return null;
      }

      const rand = crypto.getRandomValues(new Uint32Array(1))[0];
      generatedOTP = String(100000 + (rand % 900000));
      otpExpiresAt = Date.now() + 15 * 60000;
      otpTriesLeft = 5;
      const expiryTime = new Date(otpExpiresAt).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });

      requestBtn.innerText = "Sending OTP...";
      requestBtn.disabled = true;

      try {
        await emailjs.send(EMAIL_SERVICE, EMAIL_CODE_TEMPLATE, {
          to_email: recipientEmail,
          otp: generatedOTP,
          otp_code: generatedOTP,
          time: expiryTime,
        });
        alert(`OTP Sent to ${recipientEmail}`);
        otpContainer.classList.remove("hidden");
        requestBtn.classList.add("hidden");
      } catch (error) {
        console.error("EmailJS Error:", error);
        alert("Failed to send OTP.");
        requestBtn.disabled = false;
        requestBtn.innerText = "Request OTP to Change Password";
      }
    };
  }

  if (verifyBtn) {
    const resetOtp = (message) => {
      generatedOTP = null;
      otpContainer.classList.add("hidden");
      otpInput.value = "";
      requestBtn.classList.remove("hidden");
      requestBtn.disabled = false;
      requestBtn.innerText = "Request OTP to Change Password";
      alert(message);
    };

    verifyBtn.onclick = async () => {
      if (generatedOTP && Date.now() > otpExpiresAt) {
        resetOtp("This code has expired. Please request a new one.");
        return;
      }
      if (isRemote && generatedOTP) {
        verifyBtn.disabled = true;
        const problem = await finishPasswordChange(
          otpInput.value.trim(),
          newPassInput.value,
        );
        verifyBtn.disabled = false;
        if (problem) {
          alert(problem);
          return;
        }
        window.logActivity(currentSession, "Changed password");
        newPassInput.value = "";
        resetOtp("Success! Your password has been updated.");
        return;
      }
      if (generatedOTP && otpInput.value.trim() === generatedOTP) {
        const users = getUsers();
        const me = users.find((u) => u.id === currentSession.id);

        if (me) {
          me.pass = await hashPassword(newPassInput.value);
          saveUsers(users);
          generatedOTP = null;
          window.logActivity(currentSession, "Changed password");

          alert("Success! Your password has been updated.");
          otpContainer.classList.add("hidden");
          newPassInput.value = "";
          otpInput.value = "";
          requestBtn.classList.remove("hidden");
          requestBtn.disabled = false;
          requestBtn.innerText = "Request OTP to Change Password";
        }
      } else {
        otpTriesLeft -= 1;
        if (otpTriesLeft <= 0) {
          resetOtp("Too many wrong codes. Please request a new one.");
        } else {
          alert(`Invalid OTP code. ${otpTriesLeft} attempt(s) left.`);
        }
      }
    };
  }

  document
    .querySelectorAll(".settings-card .toggle-password")
    .forEach((btn) => {
      btn.onclick = () => {
        const targetId = btn.getAttribute("data-target");
        const input = document.getElementById(targetId);
        const icon = btn.querySelector("i");
        if (input.type === "password") {
          input.type = "text";
          icon.innerText = "visibility_off";
        } else {
          input.type = "password";
          icon.innerText = "visibility";
        }
      };
    });
}

function setupAdminListeners(onLogout) {
  const content = document.getElementById("admin-dynamic-content");
  const navButtons = document.querySelectorAll(
    "#admin-nav .nav-item:not(.logout)",
  );
  const globalSearch = document.getElementById("globalNavSearch");

  navButtons.forEach((btn) => {
    btn.onclick = () => {
      navButtons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      renderTab(btn.getAttribute("data-target"));
      if (globalSearch) globalSearch.value = "";
    };
  });

  if (globalSearch) {
    globalSearch.oninput = (e) => {
      const searchTerm = e.target.value.toLowerCase();
      const rows = document.querySelectorAll("#admin-dynamic-content tbody tr");
      rows.forEach((row) => {
        if (
          row.classList.contains("empty-row") ||
          row.classList.contains("no-search-results")
        )
          return;
        const text = row.innerText.toLowerCase();
        row.style.display = text.includes(searchTerm) ? "" : "none";
      });
    };
  }

  // One delegated handler for every button inside the content area
  content.onclick = (e) => {
    if (e.target.closest("#printStudentBtn")) {
      printReport("students");
      return;
    }

    const caseLink = e.target.closest(".case-link");
    if (caseLink) {
      openCaseFile(Number(caseLink.dataset.student));
      return;
    }

    if (e.target.closest("#logWalkInBtn")) {
      openWalkInModal();
      return;
    }

    const rangeBtn = e.target.closest("[data-range]");
    if (rangeBtn) {
      insightsRange = rangeBtn.dataset.range;
      renderTab("insights");
      return;
    }

    const concernFilterBtn = e.target.closest("[data-concern-filter]");
    if (concernFilterBtn) {
      concernFilter = concernFilterBtn.dataset.concernFilter;
      renderTab("concerns");
      return;
    }

    const concernSave = e.target.closest(".concern-save");
    if (concernSave) {
      saveConcernCard(concernSave);
      return;
    }

    // Stat cards filter the queue; clicking the active card clears it
    const statCard = e.target.closest(".overview-stat");
    if (statCard) {
      const { filter } = statCard.dataset;
      tableFilter = tableFilter === filter ? "all" : filter;
      renderAppointmentsTable();
      return;
    }

    const checkOnBtn = e.target.closest(".checkon-btn");
    if (checkOnBtn) {
      openReachOutModal(
        Number(checkOnBtn.dataset.id),
        Number(checkOnBtn.dataset.student),
      );
      return;
    }

    const remindBtn = e.target.closest(".remind-btn");
    if (remindBtn) {
      const app = getAppointments().find(
        (a) => a.id === Number(remindBtn.dataset.id),
      );
      if (app) {
        remindBtn.disabled = true;
        remindFollowUp(app);
      }
      return;
    }

    const actBtn = e.target.closest(".act-btn");
    if (actBtn) {
      const app = getAppointments().find(
        (a) => a.id === Number(actBtn.dataset.id),
      );
      if (!app) return;
      const { action } = actBtn.dataset;
      if (action === "approved" || action === "rejected") {
        openDecisionModal(app, action);
      } else if (action === "link") {
        openLinkModal(app);
      } else {
        openCloseModal(app, action);
      }
    }
  };

  const logoutBtn = document.getElementById("adminLogoutBtn");
  if (logoutBtn) logoutBtn.onclick = onLogout;
}

// --- 5. DATA ANALYTICS & EXPORTS ---

export function printReport(type) {
  const students = getUsers().filter((user) => user.role === "student");

  let printContent = "";

  if (type === "students") {
    printContent = `
      <h1>Student Directory Export</h1>
      <p>Total Registered Students: ${students.length}</p>
      <table border="1" style="width:100%; border-collapse: collapse;">
        <thead>
          <tr style="background: #f1f5f9;">
            <th>Student Name</th><th>Year Level</th><th>Course</th><th>Email</th><th>ID</th>
          </tr>
        </thead>
        <tbody>
          ${students.map((std) => `<tr><td>${escapeHtml(std.name)}</td><td>${escapeHtml(std.yearLevel || "N/A")}</td><td>${escapeHtml(std.course || "N/A")}</td><td>${escapeHtml(std.email)}</td><td>${std.id}</td></tr>`).join("")}
        </tbody>
      </table>
    `;
  }

  const win = window.open("", "PRINT", "height=600,width=800");
  win.document.write(`
    <html>
      <head>
        <title>Export - Granby Gateway</title>
        <style>
          body { font-family: sans-serif; padding: 20px; }
          table { margin-top: 10px; width:100%; border-collapse:collapse; }
          th, td { padding: 8px; text-align: left; border: 1px solid #cbd5e1; }
          h1 { color: #1e293b; }
        </style>
      </head>
      <body>${printContent}</body>
    </html>
  `);
  win.document.close();
  win.focus();
  setTimeout(() => {
    win.print();
    win.close();
  }, 500);
}
