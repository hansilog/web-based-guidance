import emailjs from "@emailjs/browser";
import "./styles/guidance.css";
import { listenForRealTimeUpdates } from "./syncUtil.js";
import { createCalendarEvent } from "./calendar.js";

// 📦 IMPORT THE VIEW COMPONENT FILE CHUNKS
import {
  generateAppointmentsTableHtml,
  renderConfirmationModal,
  renderStudentRecords,
  renderReports,
  renderGuidanceSettings,
  renderLogs
} from "./guidanceView.js";

emailjs.init("6_rFpZEVOh3AVEsIM");

// --- 1. CORE OPERATIONAL DOM RENDERING CONTROL ---

export function renderAppointmentsTable() {
  const contentContainer = document.getElementById("admin-dynamic-content");
  if (contentContainer) {
    const rawAppointments = JSON.parse(localStorage.getItem("gh_appointments")) || [];
    
    // 🔥 SOLID SORT: Force "pending" to the absolute top of the list
    const sorted = [...rawAppointments].sort((a, b) => {
      const statusA = (a.status || "").toLowerCase().trim();
      const statusB = (b.status || "").toLowerCase().trim();

      // If 'a' is pending and 'b' is not, 'a' moves up (comes first)
      if (statusA === "pending" && statusB !== "pending") return -1;
      // If 'b' is pending and 'a' is not, 'b' moves up
      if (statusB === "pending" && statusA !== "pending") return 1;

      // Secondary sort: If they are both pending (or both processed), sort by date
      return new Date(a.date).getTime() - new Date(b.date).getTime();
    });

    contentContainer.innerHTML = generateAppointmentsTableHtml(sorted);
    setupTableSearch(); 
  }
}

// --- 2. LIFECYCLE INTERACTION PIPELINES ---

window.openActionModal = (id, status) => {
  const existingModal = document.getElementById("modal-root");
  if (existingModal) existingModal.remove();

  const apps = JSON.parse(localStorage.getItem("gh_appointments")) || [];
  const targetApp = apps.find((a) => a.id === id);
  if (!targetApp) return;

  const modalContainer = document.createElement("div");
  modalContainer.id = "modal-root";
  modalContainer.innerHTML = renderConfirmationModal(targetApp, status);
  document.body.appendChild(modalContainer);
};

window.closeModal = () => {
  const modal = document.getElementById("modal-root");
  if (modal) modal.remove();
};

window.processStatusUpdate = async (id, newStatus) => {
  const notes = document.getElementById("modalNotes").value;
  const timeInput = document.getElementById("modalTime");
  const newTime = timeInput ? timeInput.value : null;

  if (newStatus === "rejected" && !notes.trim()) {
    alert("Please provide a reason for rejection.");
    return;
  }

  let appointments = JSON.parse(localStorage.getItem("gh_appointments")) || [];
  const targetApp = appointments.find((a) => a.id === id);
  if (!targetApp) {
    alert("Appointment not found.");
    return;
  }
  
  const rawTime = newTime || targetApp.time;
  let finalTime = rawTime;

  if (rawTime.toLowerCase().includes("am") || rawTime.toLowerCase().includes("pm")) {
    const [timePart, modifier] = rawTime.split(" ");
    const timeSegments = timePart.split(":");
    let hours = timeSegments[0];
    const minutes = timeSegments[1];

    if (hours === "12") hours = "00";
    if (modifier.toLowerCase() === "pm") hours = String(parseInt(hours, 10) + 12);
    
    finalTime = `${hours.padStart(2, "0")}:${minutes}`;
  }

  appointments = appointments.map((app) => {
    if (app.id === id) {
      return {
        ...app,
        status: newStatus,
        counselorNotes: notes,
        time: finalTime,
        updatedAt: new Date().toISOString(),
      };
    }
    return app;
  });

  localStorage.setItem("gh_appointments", JSON.stringify(appointments));

  if (newStatus === "approved") {
    try {
      const [hoursStr, minutesStr] = finalTime.split(":");
      const startHours = parseInt(hoursStr, 10);
      const minutesVal = parseInt(minutesStr, 10);
      const [year, month, day] = targetApp.date.split("-").map(num => parseInt(num, 10));
      
      const startEventDate = new Date(year, month - 1, day, startHours, minutesVal, 0);
      const endEventDate = new Date(startEventDate);
      endEventDate.setHours(startEventDate.getHours() + 1);

      await createCalendarEvent({
        summary: `Guidance Appointment: ${targetApp.studentName}`,
        description: `Service Type: ${targetApp.serviceType || "General Consultation"}\nNotes: ${notes || "No additional counselor notes."}`,
        startTime: startEventDate.toISOString(),
        endTime: endEventDate.toISOString()
      });
    } catch (gcalError) {
      console.error("⚠️ Automated Google Calendar synchronization stalled:", gcalError);
    }
  }

  const templateParams = {
    subject_line: `Update: Your Appointment is ${newStatus.toUpperCase()}`,
    to_email: targetApp.studentEmail,
    recipient_name: targetApp.studentName,
    header_title: "Appointment Status Update",
    main_message: `Your guidance appointment request has been ${newStatus}. Please see details below.`,
    app_type: targetApp.serviceType || targetApp.type,
    app_date: targetApp.date,
    app_time: rawTime,
    status: newStatus,
    notes: notes || "No additional notes provided.",
  };

  try {
    await emailjs.send("service_mtv9cbi", "template_mublumh", templateParams);
  } catch (error) {
    console.error("Failed to send email:", error);
  }

  closeModal();
  renderAppointmentsTable();
  updateSidebarBadges();

  if (window.addNotification) {
    window.addNotification(`Appointment for ${targetApp.studentName} has been ${newStatus}.`);
  }
};

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
      if (row.classList.contains("empty-row") || row.classList.contains("no-search-results")) return;
      const rowText = row.textContent.toLowerCase();
      row.style.display = rowText.includes(filter) ? "" : "none";
    });

    const visibleRows = Array.from(rows).filter((r) => r.style.display !== "none" && !r.classList.contains("no-search-results"));
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
            <i class="material-icons" style="vertical-align: middle;">search_off</i> No matches found for "${filter}"
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

// --- 4. MAIN LAYOUT INITIALIZER & ROUTER ---

export function renderGuidanceView(root, session, onLogout) {

// 2. Generate the amber marquee ticker frame if announcements exist

  // Mount the real-time syncing subscription hook exactly ONCE
  listenForRealTimeUpdates(() => {
  const activeSection = document.querySelector(".nav-item.active");
  if (!activeSection) return;

  const currentTab = activeSection.getAttribute("data-target");

  // 1. Prevent table layout thrashing: Only render if the view container is blank
  if (currentTab === "appointments") {
    const tableContainer = document.getElementById("admin-dynamic-content");
    if (tableContainer && !tableContainer.querySelector(".table-rendered-marker")) {
      tableContainer.innerHTML = `<div class="table-rendered-marker"></div>`;
      renderAppointmentsTable();
    }
  }
  
  updateSidebarBadges();

 
  
});

  root.innerHTML = `
    <div class="admin-container">
        <aside class="sidebar" id="admin-sidebar">
            <div class="sidebar-header">
                <div class="brand">
                    <i class="material-icons">gavel</i>
                    <div class="brand-info">
                        <span class="brand-name">Granby Gateway</span>
                        <span class="system-tag">v2.4.0 High-Volume</span>
                    </div>
                </div>
            </div>

            <div class="nav-label">Main Menu</div>
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
                    <button class="nav-item" data-target="students">
                        <i class="material-icons">people</i> 
                        <span>Student Records</span>
                    </button>

                    <div class="nav-label">Analysis & Reports</div>
                    <button class="nav-item" data-target="reports">
                        <i class="material-icons">bar_chart</i> 
                        <span>Analytics Dashboard</span>
                    </button>
                    <button class="nav-item" data-target="logs">
                        <i class="material-icons">history</i> 
                        <span>Activity Logs</span>
                    </button>

                    <div class="nav-label">System</div>
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
                    <h1>Guidance Dashboard</h1>
                    <span class="status-badge admin-badge">Good day! ${session.name}</span>
                </div>
                <div class="header-actions">
                    <div class="notification-wrapper" style="position: relative;">
                        <button class="btn-secondary icon-only" id="notificationBtn" title="Notifications">
                            <i class="material-icons">notifications</i>
                            <span class="notification-badge" id="notifBadge">0</span>
                        </button>
                        <div class="notification-dropdown hidden" id="notificationDropdown">
                            <div class="notif-header">
                                <span>Notifications</span>
                                <button id="clearNotifs">Clear All</button>
                            </div>
                            <div class="notif-body" id="notifBody">
                                <p class="empty-notif">No new notifications</p>
                            </div>
                        </div>
                    </div>
                </div>
            </header>

            <section id="admin-dynamic-content"></section>
        </main>
    </div>
  `;

  // 🔥 EXECUTE TARGET SORTED RENDER IMMEDIATELY ON DOM INITIALIZATION
  renderAppointmentsTable();

  setupAdminListeners(onLogout);
  updateSidebarBadges();
}
function updateSidebarBadges() {
  const apps = JSON.parse(localStorage.getItem("gh_appointments")) || [];
  const pendingCount = apps.filter((a) => a.status === "pending").length;
  const badge = document.getElementById("pendingBadge");
  if (badge) {
    badge.innerText = pendingCount;
    badge.style.display = pendingCount > 0 ? "block" : "none";
  }
}

function setupAdminListeners(onLogout) {
  const content = document.getElementById("admin-dynamic-content");
  const navButtons = document.querySelectorAll(".nav-item:not(.logout)");
  const globalSearch = document.getElementById("globalNavSearch");

  navButtons.forEach((btn) => {
    btn.onclick = () => {
      navButtons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      const target = btn.getAttribute("data-target");

      // --- CORE COUNSELOR NAVIGATION ROUTING SUB-ENGINE ---
      if (target === "appointments") {
        renderAppointmentsTable();
      } else if (target === "students") {
        const allUsers = JSON.parse(localStorage.getItem("gh_users")) || [];
        const students = allUsers.filter((user) => user.role === "student");
        content.innerHTML = renderStudentRecords(students);
        setupStudentSearch();
      } else if (target === "reports") {
        const stats = getAnalytics();
        content.innerHTML = renderReports(stats);
      } else if (target === "settings") {
        const savedEmail = localStorage.getItem("admin_notification_email") || "jellopancake213@gmail.com";
        content.innerHTML = renderGuidanceSettings(savedEmail);
        attachSettingsListener();
      } else if (target === "logs") {
        const appointments = JSON.parse(localStorage.getItem("gh_appointments")) || [];
        const activities = appointments
          .filter((app) => app.updatedAt)
          .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
        content.innerHTML = renderLogs(activities);
      }

      if (globalSearch) globalSearch.value = "";
    };
  });

  if (globalSearch) {
    globalSearch.oninput = (e) => {
      const searchTerm = e.target.value.toLowerCase();
      const rows = document.querySelectorAll("#admin-dynamic-content tbody tr");
      rows.forEach((row) => {
        if (row.classList.contains("empty-row") || row.classList.contains("no-search-results")) return;
        const text = row.innerText.toLowerCase();
        row.style.display = text.includes(searchTerm) ? "" : "none";
      });
    };
  }

  function attachSettingsListener() {
    const form = document.getElementById("settingsForm");
    if (form) {
      form.onsubmit = (e) => {
        e.preventDefault();
        const email = document.getElementById("adminEmail").value;
        localStorage.setItem("admin_notification_email", email);
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
    const requestBtn = document.getElementById("requestOtpBtn");
    const verifyBtn = document.getElementById("verifyOtpBtn");
    const otpContainer = document.getElementById("otpContainer");
    const newPassInput = document.getElementById("newPassword");
    const otpInput = document.getElementById("otpInput");

    if (requestBtn) {
      requestBtn.onclick = async () => {
        const newPass = newPassInput.value;
        if (newPass.length < 8) return alert("Password must be at least 8 characters long.");
        
        const session = JSON.parse(localStorage.getItem("gh_user_session"));
        const savedNotification = localStorage.getItem("admin_notification_email");
        const recipientEmail = savedNotification || (session ? session.email : "jellopancake213@gmail.com");
        
        generatedOTP = Math.floor(100000 + Math.random() * 900000).toString();
        const expiryTime = new Date(Date.now() + 15 * 60000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

        requestBtn.innerText = "Sending OTP...";
        requestBtn.disabled = true;

        try {
          await emailjs.send("service_mtv9cbi", "template_gbmoria", {
            to_email: recipientEmail,
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
      verifyBtn.onclick = () => {
        if (otpInput.value.trim() === generatedOTP) {
          const users = JSON.parse(localStorage.getItem("gh_users")) || [];
          const adminIndex = users.findIndex((u) => u.role === "guidance");

          if (adminIndex !== -1) {
            users[adminIndex].pass = newPassInput.value;
            localStorage.setItem("gh_users", JSON.stringify(users));

            const session = JSON.parse(localStorage.getItem("gh_user_session"));
            if (session) {
              session.pass = newPassInput.value;
              localStorage.setItem("gh_user_session", JSON.stringify(session));
            }

            alert("Success! Your password has been updated.");
            otpContainer.classList.add("hidden");
            newPassInput.value = "";
            otpInput.value = "";
            requestBtn.classList.remove("hidden");
            requestBtn.disabled = false;
            requestBtn.innerText = "Request OTP to Change Password";
          }
        } else {
          alert("Invalid OTP code.");
        }
      };
    }

    document.querySelectorAll(".settings-card .toggle-password").forEach((btn) => {
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

  // Notification Core DOM Actions
  const notifBtn = document.getElementById("notificationBtn");
  const notifDropdown = document.getElementById("notificationDropdown");
  const notifBadge = document.getElementById("notifBadge");
  const notifBody = document.getElementById("notifBody");
  const clearNotifs = document.getElementById("clearNotifs");
  const appointmentsData = JSON.parse(localStorage.getItem("gh_appointments")) || [];
  const pendingApps = appointmentsData.filter((app) => app.status === "pending");

  if (notifBtn) {
    notifBtn.onclick = (e) => {
      e.stopPropagation();
      notifDropdown.classList.toggle("hidden");
      if (!notifDropdown.classList.contains("hidden")) {
        notifBadge.style.display = "none";
        notifBadge.innerText = "0";
      }
    };
  }

  document.addEventListener("click", (e) => {
    if (notifDropdown && !notifDropdown.contains(e.target)) {
      notifDropdown.classList.add("hidden");
    }
  });

  if (clearNotifs) {
    clearNotifs.onclick = () => {
      notifBody.innerHTML = '<p class="empty-notif">No new notifications</p>';
    };
  }

  window.addNotification = (message) => {
    if (!notifBody) return;
    const emptyMsg = notifBody.querySelector(".empty-notif");
    if (emptyMsg) emptyMsg.remove();

    const notifItem = document.createElement("div");
    notifItem.className = "notif-item";
    notifItem.innerHTML = `<p>${message}</p><small>${new Date().toLocaleTimeString()}</small>`;
    notifBody.prepend(notifItem);

    const currentCount = parseInt(notifBadge.innerText || 0, 10);
    notifBadge.innerText = currentCount + 1;
    notifBadge.style.display = "block";
  };

  if (pendingApps.length > 0 && !sessionStorage.getItem("notified_pending")) {
    window.addNotification(`You have ${pendingApps.length} pending appointment(s) to review.`);
    sessionStorage.setItem("notified_pending", "true");
  }

  content.onclick = (e) => {
    if (e.target.closest("#printStudentBtn")) printReport("students");
    if (e.target.closest("#printAnalyticsBtn")) printReport("analytics");
  };

  const logoutBtn = document.getElementById("adminLogoutBtn");
  if (logoutBtn) logoutBtn.onclick = onLogout;
}

// --- 5. DATA ANALYTICS & EXPORTS ---

function getAnalytics() {
  const apps = JSON.parse(localStorage.getItem("gh_appointments")) || [];
  const users = JSON.parse(localStorage.getItem("gh_users")) || [];

  const yearBreakdown = { "1st Year": 0, "2nd Year": 0, "3rd Year": 0, "4th Year": 0, Irregular: 0 };
  const courseBreakdown = {};
  const statusBreakdown = { pending: 0, approved: 0, rejected: 0, cancelled: 0 };
  const dailyTrends = {};

  apps.forEach((app) => {
    const statusKey = app.status?.toLowerCase();
    if (statusBreakdown[statusKey] !== undefined) statusBreakdown[statusKey]++;

    const date = new Date(app.createdAt || Date.now()).toLocaleDateString();
    dailyTrends[date] = (dailyTrends[date] || 0) + 1;

    const student = users.find((u) => u.email === app.studentEmail);
    if (student) {
      if (student.yearLevel && yearBreakdown[student.yearLevel] !== undefined) yearBreakdown[student.yearLevel]++;
      if (student.course) {
        courseBreakdown[student.course] = (courseBreakdown[student.course] || 0) + 1;
      }
    }
  });

  const dates = Object.keys(dailyTrends);
  const avgDaily = dates.length ? (apps.length / dates.length).toFixed(1) : 0;

  return {
    totalApps: apps.length,
    approved: statusBreakdown.approved,
    pending: statusBreakdown.pending,
    totalStudents: users.filter((u) => u.role === "student").length,
    academic: apps.filter((a) => a.type?.toLowerCase().includes("academic")).length,
    personal: apps.filter((a) => a.type?.toLowerCase().includes("personal")).length,
    career: apps.filter((a) => a.type?.toLowerCase().includes("career")).length,
    yearBreakdown,
    courseBreakdown,
    statusBreakdown,
    avgDaily,
    mostActiveYear: Object.keys(yearBreakdown).reduce((a, b) => (yearBreakdown[a] > yearBreakdown[b] ? a : b), "N/A"),
  };
}

export function printReport(type) {
  const stats = getAnalytics();
  const allUsers = JSON.parse(localStorage.getItem("gh_users")) || [];
  const students = allUsers.filter((user) => user.role === "student");

  let printContent = "";
  if (type === "analytics") {
    printContent = `
      <h1>Guidance Intelligence Report</h1>
      <p>Generated on: ${new Date().toLocaleString()}</p>
      <h3>Summary Statistics</h3>
      <table border="1" style="width:100%; border-collapse: collapse; margin-bottom: 20px;">
        <thead>
          <tr style="background: #f1f5f9;"><th>Metric</th><th>Value</th></tr>
        </thead>
        <tbody>
          <tr><td>Total Requests</td><td>${stats.totalApps}</td></tr>
          <tr><td>Most Active Year</td><td>${stats.mostActiveYear}</td></tr>
          <tr><td>Total Students</td><td>${stats.totalStudents}</td></tr>
          <tr><td>Daily Average</td><td>${stats.avgDaily}</td></tr>
        </tbody>
      </table>
    `;
  } else if (type === "students") {
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
          ${students.map((std) => `<tr><td>${std.name}</td><td>${std.yearLevel || "N/A"}</td><td>${std.course || "N/A"}</td><td>${std.email}</td><td>${std.id}</td></tr>`).join("")}
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