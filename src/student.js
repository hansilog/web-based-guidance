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
import { listenForRealTimeUpdates } from "./syncUtil.js";
import { getPreBookingAdvice } from "./ai.js";
import { createCalendarEvent } from "./calendar.js";

emailjs.init("6_rFpZEVOh3AVEsIM");

// --- VIEW COMPONENTS ---
export function renderRightSidebar(myApps) {
  const now = new Date();

  // 1. Get the single next approved appointment
  const nextApp = myApps
    .filter((a) => a.status.toLowerCase() === "approved" && new Date(a.date) >= now)
    .sort((a, b) => new Date(a.date) - new Date(b.date))[0];

  // 2. Build the Calendar HTML Grid Layout
  const startDay = getDay(startOfMonth(now));
  const totalDays = getDate(endOfMonth(now));
  const padding = Array(startDay).fill('<div class="day-num muted"></div>');
  const days = [];

  for (let d = 1; d <= totalDays; d++) {
    const currentIterationDate = new Date(now.getFullYear(), now.getMonth(), d);
    const isToday = isSameDay(currentIterationDate, now) ? "today" : "";
    const hasEvent = myApps.some(
      (app) => isSameDay(new Date(app.date), currentIterationDate) && app.status.toLowerCase() === "approved"
    ) ? "has-event" : "";

    days.push(`<div class="day-num ${isToday} ${hasEvent}">${d}</div>`);
  }

  // 3. Return the Sidebar HTML string with the INLINE click dispatcher attached
  return `
        <aside class="right-sidebar">
            <div class="next-up-card">
                <div class="card-tag">NEXT SESSION</div>
                ${
                  nextApp
                    ? `
                    <div class="next-app-info">
                        <h2>${format(new Date(nextApp.date), "MMMM dd, yyyy")}</h2>
                        <p>${nextApp.time} | Guidance Office</p>
                        
                        <button class="gcal-sync-btn" 
                                data-date="${nextApp.date}" 
                                data-time="${nextApp.time}" 
                                data-type="${nextApp.type || 'Counseling Session'}"
                                onclick="window.handleStudentInlineSync(this)">
                          🗓️ Sync to Google Calendar
                        </button>
                    </div>
                `
                    : `<p style="font-size:0.8rem; color:#94a3b8; margin-top:10px;">No upcoming sessions.</p>`
                }
            </div>

            <div class="calendar-card">
                <div class="calendar-header">
                    <span style="font-weight:800;">${format(now, "MMMM yyyy")}</span>
                </div>
                <div class="calendar-grid">
                    <div class="day-name">S</div><div class="day-name">M</div><div class="day-name">T</div>
                    <div class="day-name">W</div><div class="day-name">T</div><div class="day-name">F</div>
                    <div class="day-name">S</div>
                    ${padding.join("")}${days.join("")}
                </div>
            </div>

            <div class="support-card">
                <h4>Support</h4>
                <p style="font-size: 0.85rem;">Office hours: 8AM - 5PM.</p>
            </div>
        </aside>
    `;
}
export function renderDashboard(session = {}) {
  // 1. Data Retrieval & Filtering
  const appointments =
    JSON.parse(localStorage.getItem("gh_appointments")) || [];

  // Filter appointments belonging to this specific logged-in student
  const rawMyApps = appointments.filter(
    (a) => a.studentId === session.id || a.studentEmail === session.email,
  );

  // 2. Custom Multi-Tier Sorting for Students
  const myApps = [...rawMyApps].sort((a, b) => {
    const studentStatusRank = {
      approved: 1, // Top Priority: Show confirmed active calendar schedules first
      pending: 2, // Second Priority: Show requests currently in queue review
      rejected: 3, // Low Priority: Historical logs
      cancelled: 3, // Low Priority: Historical logs
    };

    const rankA = studentStatusRank[a.status.toLowerCase()] || 4;
    const rankB = studentStatusRank[b.status.toLowerCase()] || 4;

    // Sort by priority rank grouping first
    if (rankA !== rankB) {
      return rankA - rankB;
    }

    // Secondary Fallback: Chronological order (closest upcoming date first)
    return new Date(a.date).getTime() - new Date(b.date).getTime();
  });

  const pendingCount = myApps.filter((a) => a.status === "pending").length;
  const approvedCount = myApps.filter((a) => a.status === "approved").length;

  // 3. Return the combined updated layout view
  return `
        
        <div class="dashboard-wrapper">
            <div class="dashboard-main-col">
                <div class="dashboard-hero" style="padding-top: 40px;"> 
                    <span class="badge">Student Portal</span>
                    <h1>Welcome Back, ${session.name || "Student"}!</h1>
                    <p>You have <strong>${pendingCount}</strong> pending requests.</p>
                </div>

                <div class="stats-grid-horizontal">
                    <div class="stat-box">
                        <span class="label">Total Sessions</span>
                        <span class="value">${myApps.length}</span>
                    </div>
                    <div class="stat-box">
                        <span class="label">Confirmed</span>
                        <span class="value" style="color: #22c55e;">${approvedCount}</span>
                    </div>
                    <div class="stat-box">
                        <span class="label">Status</span>
                        <span class="value" style="font-size: 0.9rem; color: #3b82f6;">● Active Student</span>
                    </div>
                </div>

                <div class="table-card">
                    <div class="card-header-flex" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
                        <h3>Recent History</h3>
                        <button class="view-all-btn" onclick="document.querySelector('[data-target=records]').click()">View All</button>
                    </div>
                    <div class="table-responsive">
                        <table>
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
                                      // Date evaluation checks
                                      const appointmentDate = new Date(
                                        app.date,
                                      );
                                      const today = new Date();
                                      today.setHours(0, 0, 0, 0);
                                      appointmentDate.setHours(0, 0, 0, 0);

                                      const isPastDate =
                                        appointmentDate < today;
                                      const isInactiveLog =
                                        app.status === "cancelled" ||
                                        app.status === "rejected";

                                      // Core cancellation constraints validation rule
                                      const canCancel =
                                        app.status === "pending" ||
                                        (app.status === "approved" &&
                                          !isPastDate);

                                      return `
                                    <tr style="${isInactiveLog || (app.status === "approved" && isPastDate) ? "opacity: 0.55; background-color: #f8fafc;" : ""}">
                                        <td><strong>${format(new Date(app.date), "MMMM dd, yyyy")}</strong></td>
                                        <td>${app.type}</td>
                                        <td><span class="status-pill ${app.status.toLowerCase()}">${app.status}</span></td>
                                        <td style="text-align: center;">
                                            ${
                                              canCancel
                                                ? `
                                                <button class="cancel-btn-table" data-id="${app.id}" title="Cancel Appointment" style="background: none; border: none; color: #ef4444; cursor: pointer; display: inline-flex; align-items: center; padding: 4px;">
                                                    <i class="material-icons" style="font-size: 18px;">cancel</i>
                                                </button>
                                            `
                                                : `
                                                ${
                                                  app.status === "approved" &&
                                                  isPastDate
                                                    ? `
                                                    <i class="material-icons" title="Completed Past Session" style="color: #10b981; font-size: 18px; cursor: default; vertical-align: middle;">check_circle</i>
                                                `
                                                    : `
                                                    <span style="color: #94a3b8; font-size: 12px;">—</span>
                                                `
                                                }
                                            `
                                            }
                                        </td>
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
            </div>

            ${renderRightSidebar(myApps)}
        </div>
    `;
}
export function renderBookingForm(session = {}) {
  // 1. Get appointments data for the sidebar
  const allAppointments =
    JSON.parse(localStorage.getItem("gh_appointments")) || [];
  const myApps = allAppointments.filter((a) => a.studentId === session.id);

  // 2. Fetch global users database and filter down to available counselors
  const allUsers = JSON.parse(localStorage.getItem("gh_users")) || [];
  const counselors = allUsers.filter((u) => u.role === "guidance");

  // 3. Programmatically compile the HTML option elements for the dropdown menu
  let counselorOptions = `<option value="">Select a preferred counselor...</option>`;

  // Add an automated "any available" fallback choice first
  counselorOptions += `<option value="auto">Any Available Counselor (Round-Robin)</option>`;

  // Append choices for all real registered guidance objects found in database
  counselors.forEach((c) => {
    counselorOptions += `
      <option value="${c.id}" data-name="${c.name}">
        ${c.name} — (${c.specialty || "General Counseling"})
      </option>
    `;
  });

  return `
    <div class="dashboard-wrapper">
        <div class="dashboard-main-col">
            <div class="dashboard-hero" style="padding-top: 40px;">
                <span class="badge">Scheduling</span>
                <h1>Book an Appointment</h1>
                <p>Select a date, time, and counselor that works for you.</p>
            </div>

            <div class="table-card booking-container">
                <div id="booking-error" class="error-banner hidden"></div>
                
                <form id="appointment-form" class="styled-form">
                    <div class="form-row">
                        <div class="form-group">
                            <label for="appCounselor">Assigned Guidance Counselor</label>
                            <select id="appCounselor" required>
                                ${counselorOptions}
                            </select>
                        </div>
                    </div>

                    <div class="form-row">
                        <div class="form-group">
                            <label for="appType">Counseling Type</label>
                            <select id="appType" required>
                                <option value="">Select a reason...</option>
                                <option value="Academic Guidance">Academic Guidance</option>
                                <option value="Personal Concern">Personal Concern</option>
                                <option value="Career Consultation">Career Consultation</option>
                            </select>
                        </div>
                    </div>

                    <div class="form-row flex-row">
                        <div class="form-group">
                            <label for="appDate">Preferred Date</label>
                            <input type="date" id="appDate" required min="${new Date().toISOString().split("T")[0]}">
                        </div>
                        <div class="form-group">
                            <label for="appTime">Preferred Time</label>
                            <input type="time" id="appTime" required>
                        </div>
                    </div>

                    <div class="form-group">
                        <div class="form-group">
                            <label for="appNotes">Additional Notes (Optional)</label>
                            <textarea id="appNotes" rows="4" placeholder="Briefly describe your concern..."></textarea>
                        </div>
                    </div>

                    <div class="form-actions">
                        <button type="submit" id="submitBooking" class="primary-btn">
                            <i class="material-icons">check_circle</i> Confirm Booking
                        </button>
                    </div>
                </form>
            </div>
        </div>

        ${renderRightSidebar(myApps)}
    </div>
  `;
}
export function renderHistory(session = {}) {
  // 1. Data Retrieval
  const allApps = JSON.parse(localStorage.getItem("gh_appointments")) || [];
  const myApps = allApps.filter((app) => app.studentEmail === session.email);

  // 2. Sort by ID (assuming higher ID = newer)
  const sortedApps = [...myApps].sort((a, b) => b.id - a.id);

  return `
        <div class="dashboard-wrapper">
            <div class="dashboard-main-col">
                <div class="dashboard-hero" style="padding-top: 40px;"> 
                    <span class="badge">Records</span>
                    <h1>Appointment History</h1>
                    <p>Track and manage your past and upcoming guidance requests.</p>
                </div>

                <div class="table-card history-container">
                    <div class="history-list">
                        ${
                          sortedApps.length > 0
                            ? sortedApps
                                .map(
                                  (app) => `
                            <div class="history-item ${app.status.toLowerCase()}">
                                <div class="history-main">
                                    <div class="history-icon">
                                        <i class="material-icons">${getStatusIcon(app.status)}</i>
                                    </div>
                                    <div class="history-info">
                                        <span class="app-type">${app.type}</span>
                                        <span class="app-date">${format(new Date(app.date), "MMMM dd, yyyy")} • ${app.time}</span>
                                    </div>
                                </div>
                                <div class="history-status">
                                    <span class="status-badge">${app.status.toUpperCase()}</span>
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

            ${renderRightSidebar(myApps)}
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
                <input type="text" id="setName" value="${session.name || ""}" required>
            </div>
            <div class="input-wrapper plain">
                <label>Email Address</label>
                <input type="email" id="setEmail" value="${session.email || ""}" required>
            </div>
            <div class="input-group-row" style="display: flex; gap: 16px; margin-bottom: 20px;">
                 <div class="input-wrapper plain" style="flex: 1;">
                    <label>Course</label>
                    <input type="text" id="setCourse" value="${session.course || ""}" placeholder="e.g. BSIT" required>
                </div>
                <div class="input-wrapper plain" style="flex: 1;">
                    <label>Section</label>
                    <input type="text" id="setSection" value="${session.section || ""}" placeholder="e.g. 1A" required>
                </div>
            </div>
            <button type="submit" class="primary-btn">
                <i class="material-icons">save</i> Save Changes
            </button>
        </form>
    </div>
  `;

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

    const users = JSON.parse(localStorage.getItem("gh_users")) || [];
    const userIndex = users.findIndex((u) => u.id === session.id);

    if (userIndex !== -1) {
      // Update DB database arrays
      users[userIndex] = { ...users[userIndex], ...updatedData };
      localStorage.setItem("gh_users", JSON.stringify(users));

      // Update Active Session state parameters
      const newSession = { ...session, ...updatedData };
      localStorage.setItem("gh_session", JSON.stringify(newSession));

      alert("Profile updated successfully!");

      // Forces layout refresh engine context to pickup updated session states
      window.location.reload();
    } else {
      alert(
        "Error: Active student account profile not located in system ledger files.",
      );
    }
  };
}
function getStatusIcon(status) {
  switch (status.toLowerCase()) {
    case "approved":
      return "check_circle";
    case "pending":
      return "schedule";
    case "rejected":
      return "cancel";
    default:
      return "event";
  }
}
// --- LOGIC FUNCTIONS ---

function attachBookingListener(session) {
  const form = document.getElementById("appointment-form");
  if (!form) return;

  form.onsubmit = (e) => {
    e.preventDefault();
    const submitBtn = document.getElementById("submitBooking");

    // NEW: Get Counselor Dropdown elements
    const counselorSelect = document.getElementById("appCounselor");
    const selectedOption =
      counselorSelect.options[counselorSelect.selectedIndex];
    const isAutoAssign = counselorSelect.value === "auto";

    const newApp = {
      id: Date.now(),
      studentId: session.id,
      studentName: session.name,
      studentEmail: session.email,

      // NEW: Dynamic counselor storage assignments
      counselorId: isAutoAssign ? null : parseInt(counselorSelect.value, 10),
      counselorName: isAutoAssign
        ? "Unassigned (Auto)"
        : selectedOption.getAttribute("data-name"),

      type: document.getElementById("appType").value,
      date: document.getElementById("appDate").value,
      time: document.getElementById("appTime").value,
      notes: document.getElementById("appNotes").value,
      status: "pending",
      counselorNotes: "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    submitBtn.innerText = "Sending...";
    submitBtn.disabled = true;

    // 1. Save to LocalStorage
    const allApps = JSON.parse(localStorage.getItem("gh_appointments")) || [];
    allApps.push(newApp);
    localStorage.setItem("gh_appointments", JSON.stringify(allApps));

    // 2. Resolve target email routes
    const users = JSON.parse(localStorage.getItem("gh_users")) || [];
    let targetEmails = "";
    let recipientName = "Guidance Team";

    if (isAutoAssign) {
      // Send to ALL counselors if auto-assignment is requested
      targetEmails = users
        .filter((u) => u.role === "guidance")
        .map((u) => u.email)
        .join(",");
    } else {
      // Send ONLY to the selected counselor's registered email
      const chosenCounselor = users.find((u) => u.id === newApp.counselorId);
      if (chosenCounselor) {
        targetEmails = chosenCounselor.email;
        recipientName = chosenCounselor.name;
      } else {
        // Fallback catch-all just in case
        targetEmails = users
          .filter((u) => u.role === "guidance")
          .map((u) => u.email)
          .join(",");
      }
    }

    // 3. Send via EmailJS
    emailjs
      .send("service_mtv9cbi", "template_mublumh", {
        subject_line: `New Appointment Request - ${session.name}`,
        to_email: targetEmails, // Optimized single or group target routing string
        recipient_name: recipientName,

        // Dynamic Content
        header_title: "New Appointment Request",
        main_message: `A new appointment request has been submitted by ${session.name} and assigned to ${newApp.counselorName}. Please review the details below.`,

        // Table Data
        app_type: newApp.type,
        app_date: newApp.date,
        app_time: newApp.time,
        status: "Pending",

        // Student Notes
        notes: newApp.notes || "No notes provided by student.",
      })
      .then((res) => {
        console.log("Email Sent Successfully!", res.status, res.text);
        alert(
          `Success! Appointment booked. ${isAutoAssign ? "Guidance Team" : recipientName} has been notified.`,
        );
        window.location.reload();
      })
      .catch((err) => {
        console.error("EmailJS Detailed Error:", err);
        alert(
          `Email Error: ${err.text} (Code: ${err.status}). Booking still saved locally.`,
        );
        window.location.reload();
      });
  };
}

export function attachCancelListeners() {
  const container = document.getElementById("app");
  if (!container) return;

  container.addEventListener("click", (e) => {
    const cancelBtn = e.target.closest(".cancel-btn-table");
    if (!cancelBtn) return;

    const appId = parseInt(cancelBtn.dataset.id, 10);

    showCustomConfirmModal({
      title: "Cancel Appointment",
      message:
        "Are you sure you want to cancel this counseling appointment request? This action cannot be undone.",
      onConfirm: () => {
        // 1. Fetch current datasets
        const allApps =
          JSON.parse(localStorage.getItem("gh_appointments")) || [];

        let targetApp = null;

        // 2. Locate and modify the target state values
        const updatedApps = allApps.map((app) => {
          if (app.id === appId) {
            targetApp = {
              ...app,
              status: "cancelled",
              updatedAt: new Date().toISOString(),
            };
            return targetApp;
          }
          return app;
        });

        // 3. Commit mutations back down to local disk
        localStorage.setItem("gh_appointments", JSON.stringify(updatedApps));

        // 4. Send automatic EmailJS alert to the counselor before refreshing
        if (targetApp) {
          notifyCounselorOfCancellation(targetApp);
        } else {
          // If fallback is required due to synchronous timing issues
          window.location.reload();
        }
      },
    });
  });
} 

// --- EmailJS Counselor Cancellation Notification Engine ---
function notifyCounselorOfCancellation(appointment) {
  const users = JSON.parse(localStorage.getItem("gh_users")) || [];
  let targetEmails = "";
  let recipientName = "Guidance Team";

  // 1. Resolve where this email should go based on counselor assignment
  if (appointment.counselorId) {
    const chosenCounselor = users.find((u) => u.id === appointment.counselorId);
    if (chosenCounselor) {
      targetEmails = chosenCounselor.email;
      recipientName = chosenCounselor.name;
    }
  }

  // 2. Fallback: If no specific counselor was assigned, email the entire guidance team
  if (!targetEmails) {
    targetEmails = users
      .filter((u) => u.role === "guidance")
      .map((u) => u.email)
      .join(",");
  }

  // 3. Dispatch data object payload via EmailJS
  emailjs
    .send("service_mtv9cbi", "template_mublumh", {
      subject_line: `Cancellation Alert: Appointment Cancelled by ${appointment.studentName}`,
      to_email: targetEmails,
      recipient_name: recipientName,

      // Dynamic Display Text Card Configurations
      header_title: "Appointment Cancelled By Student",
      main_message: `Please look over your schedule logs. The following appointment slot has been officially cancelled by ${appointment.studentName}.`,

      // Table Details Layout Mapping
      app_type: appointment.type,
      app_date: appointment.date,
      app_time: appointment.time,
      status: "Cancelled",

      // Fallback description handling
      notes: appointment.notes || "No additional comments left by student.",
    })
    .then((res) => {
      console.log(
        "Cancellation Email Sent Successfully!",
        res.status,
        res.text,
      );
      alert(
        "Appointment successfully cancelled. The counselor has been notified via email.",
      );
      window.location.reload(); // Refresh viewport layout after successful email handshake
    })
    .catch((err) => {
      console.error("EmailJS Cancellation Error:", err);
      alert(
        `Cancelled locally, but failed to alert counselor via email (Code: ${err.status}).`,
      );
      window.location.reload(); // Refresh anyway so the dashboard stays accurate locally
    });
}

// --- PRIVATE MODAL UI HELPER ---
function showCustomConfirmModal({ title, message, onConfirm }) {
  // Create a overlay wrapper element block
  const modalOverlay = document.createElement("div");
  modalOverlay.className = "custom-modal-overlay";

  // Inject clean HTML template structural layout
  modalOverlay.innerHTML = `
    <div class="custom-modal-card">
      <div class="custom-modal-header">
        <i class="material-icons error-icon">warning</i>
        <h3>${title}</h3>
      </div>
      <div class="custom-modal-body">
        <p>${message}</p>
      </div>
      <div class="custom-modal-actions">
        <button type="button" class="modal-btn secondary-btn" id="modal-cancel-action">Keep Appointment</button>
        <button type="button" class="modal-btn danger-btn" id="modal-confirm-action">Yes, Cancel It</button>
      </div>
    </div>
  `;

  document.body.appendChild(modalOverlay);

  // Focus trap lifecycle configuration handlers
  const confirmBtn = modalOverlay.querySelector("#modal-confirm-action");
  const cancelBtn = modalOverlay.querySelector("#modal-cancel-action");

  const closeModal = () => modalOverlay.remove();

  confirmBtn.onclick = () => {
    closeModal();
    onConfirm();
  };

  cancelBtn.onclick = closeModal;
  modalOverlay.onclick = (e) => {
    if (e.target === modalOverlay) closeModal();
  };
}
// --- GLOBAL WINDOW GCAL INTERCEPT HANDLER ---
window.handleStudentInlineSync = async (btn) => {
  if (btn.disabled) return;

  const dateStr = btn.getAttribute("data-date"); // e.g. "2026-05-12"
  const timeStr = btn.getAttribute("data-time"); // e.g. "02:30 PM" or "14:30"
  const typeStr = btn.getAttribute("data-type") || "Counseling Session";

  if (!dateStr || !timeStr) {
    console.error("❌ Google Calendar Hook Aborted: Missing structural appointment metrics.");
    return;
  }

  console.log("🚀 Normalizing Google payload layout parameters for properties:", { dateStr, timeStr });

  let cleanTime = timeStr.trim();
  
  // SANITIZATION STEP: Normalize 12-hour formats ("02:30 PM") into robust 24-hour targets ("14:30")
  if (cleanTime.toLowerCase().includes("am") || cleanTime.toLowerCase().includes("pm")) {
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
    const [year, month, day] = dateStr.split("-").map(num => parseInt(num, 10));
    
    // Construct real Date objects locally to avoid offset zone shifting issues
    const startEventDate = new Date(year, month - 1, day, parseInt(hoursStr, 10), parseInt(minutesStr, 10), 0);
    const endEventDate = new Date(startEventDate);
    endEventDate.setHours(startEventDate.getHours() + 1); // Allocate a stable 1-hour session window

    btn.innerText = "🔄 Syncing...";
    btn.disabled = true;

    // Send verified standardized ISO formatting data strings directly to Google calendar client layers
    const success = await createCalendarEvent({
      summary: `Granby Guidance: ${typeStr}`,
      description: "Scheduled consultation slot with the Granby Counseling Department.",
      startTime: startEventDate.toISOString(),
      endTime: endEventDate.toISOString()
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
    console.error("❌ Exception captured inside the Google Calendar formatting sequence:", err);
    btn.innerText = "🗓️ Try Sync Again";
    btn.disabled = false;
  }
};
// --- MAIN RENDERER ---

export function renderStudentView(root, session, onLogout) {
  root.innerHTML = `
    <div class="student-container">
        <aside class="sidebar" id="sidebar">
            <div class="sidebar-header">
                <h2><i class="material-icons">school</i> Granby Gateway</h2>
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
            
            <section id="dynamic-content">${renderDashboard(session)}</section>
        </main>

        <div id="floating-ai-chatbox" class="chatbox-window hidden" style="position: fixed; bottom: 20px; right: 20px; width: 360px; height: 460px; background: #ffffff; border-radius: 12px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1); border: 1px solid #e2e8f0; display: flex; flex-direction: column; z-index: 9999; overflow: hidden; transition: all 0.25s ease-in-out;">
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
  attachCancelListeners();
  initializeFloatingChatboxEngine();

  
  listenForRealTimeUpdates(() => {
  const content = document.getElementById("dynamic-content");
  const activeNav = document.querySelector(".nav-item.active");
  
  // 1. Dashboard Routing & Persistence Guard
  if (!activeNav || activeNav.getAttribute("data-target") !== "dashboard") {
    // If not on dashboard, ensure the banner slot is empty to save space/distraction

    return;
  }

  console.log("Synchronizing student dashboard metrics...");

  // 2. Structural Guard: Draw dashboard shell ONCE
  if (content && !content.querySelector(".dashboard-loaded-marker")) {
    content.innerHTML = `<div class="dashboard-loaded-marker"></div>${renderDashboard(session)}`;
    attachCancelListeners();
  }
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
      userBubble.style.cssText = "background: #3b82f6; color: white; padding: 10px 12px; border-radius: 8px 8px 0px 8px; max-width: 85%; align-self: flex-end; line-height: 1.5; word-break: break-word; margin-bottom: 8px;";
      userBubble.textContent = userText; // Protects completely against XSS script injection
      viewport.appendChild(userBubble);
      viewport.scrollTop = viewport.scrollHeight;

      // 2. RENDER LIVE LOADING PROGRESS BUBBLE
      const loadingBubbleId = `ai-loading-${Date.now()}`;
      const loadingBubble = document.createElement("div");
      loadingBubble.id = loadingBubbleId;
      loadingBubble.style.cssText = "background: #e2e8f0; color: #64748b; padding: 10px 12px; border-radius: 8px 8px 8px 0px; max-width: 85%; align-self: flex-start; font-style: italic; margin-bottom: 8px;";

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
          const statusNode = document.getElementById(`status-text-${loadingBubbleId}`);
          if (statusNode) {
            statusNode.textContent = progressText.length > 40
              ? `🤖 ${progressText.substring(0, 37)}...`
              : `🤖 ${progressText}`;
          }
        },
      );

      // Extract and strip away loader indicator row cleanly
      document.getElementById(loadingBubbleId)?.remove();

      // 4. RENDER FINAL PROCESSED REASONING VALUE
      const aiBubble = document.createElement("div");
      aiBubble.style.cssText = "background: #e2e8f0; color: #334155; padding: 10px 12px; border-radius: 8px 8px 8px 0px; max-width: 85%; align-self: flex-start; line-height: 1.5; margin-bottom: 8px;";
      
      // innerHTML is safe here since the systemInstruction prompt output structure uses markdown formatting tags
      aiBubble.innerHTML = aiReply || "I'm here to help! Could you please elaborate a bit more on your concern so I can check our campus regulations accurately?";
      viewport.appendChild(aiBubble);

    } catch (err) {
      // Emergency teardown layout clear steps on pipeline breaks
      const activeLoader = viewport.querySelector("[id^='ai-loading-']");
      if (activeLoader) activeLoader.remove();
      
      console.error("Local inference execution failed:", err);
      
      const errorBubble = document.createElement("div");
      errorBubble.style.cssText = "background: #fee2e2; color: #991b1b; padding: 10px 12px; border-radius: 8px 8px 8px 0px; max-width: 85%; align-self: flex-start; margin-bottom: 8px;";
      errorBubble.textContent = "⚠️ Cloud processing encountered a rate-limit layout bump. Please try your request again in a few moments.";
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
  const navButtons = document.querySelectorAll(".nav-item:not(.logout)");
  const sidebar = document.getElementById("sidebar");
  const mobileMenuBtn = document.getElementById("mobileMenuBtn");

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
      window.innerWidth <= 768 &&
      sidebar.classList.contains("active") &&
      !sidebar.contains(e.target) &&
      e.target !== mobileMenuBtn
    ) {
      sidebar.classList.remove("active");
    }
  });

  // 3. Navigation View Switcher Grid Engine
  navButtons.forEach((btn) => {
    btn.onclick = () => {
      navButtons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      if (window.innerWidth <= 768) {
        sidebar.classList.remove("active");
      }

      const target = btn.getAttribute("data-target");
     

      // --- CORE SUB-ROUTING ENGINE ---
      if (target === "dashboard") {
        // Drop the template string back into the DOM
        content.innerHTML = renderDashboard(session);
        attachCancelListeners();
        
      } else if (target === "book") {
        content.innerHTML = renderBookingForm(session);
        attachBookingListener(session);
      } else if (target === "records") {
        content.innerHTML = renderHistory(session);
      } else if (target === "settings") {
        renderSettings(content, session);
      }
    };
  });

  // 4. Logout Session Termination Flow
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.onclick = onLogout;
  }
}