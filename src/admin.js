/**
 * Renders the Super Admin View
 * @param {HTMLElement} root - The root element
 * @param {Object} session - Current admin session data
 * @param {Function} onLogout - Logout handler
 * @param {HTMLElement} container - The target inner dynamic layout slot
 */
function renderStaffManager(container) {
  const users = JSON.parse(localStorage.getItem("gh_users")) || [];
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
                                        <strong style="color: #1e293b;">${c.name}</strong>
                                        <span style="font-size: 0.725rem; color: #64748b; font-family: monospace;">ID: ${c.id}</span>
                                    </div>
                                </td>
                                <td data-label="Email Account" style="color: #475569;">${c.email}</td>
                                <td data-label="Specialty Focus Area">
                                    <span style="background: #fef3c7; color: #92400e; padding: 4px 10px; border-radius: 6px; font-size: 0.8rem; font-weight: 600;">
                                        ${c.specialty || "General Counseling"}
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
        <div class="card-header">
            <h2><i class="material-icons">insights</i> Guidance Intelligence Dashboard</h2>
            
<button onclick="window.printReport('analytics', ${JSON.stringify(stats).replace(/"/g, "'")})" class="btn-primary">
    <i class="material-icons">download</i> Generate Report
</button>
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
                </div>
            </div>

            <div class="report-section">
                <h3><i class="material-icons">assignment_turned_in</i> Case Resolution Status</h3>
                <div class="chart-container">
                    ${renderChartRow("Approved", stats.statusBreakdown.approved, (stats.statusBreakdown.approved / total) * 100, "bg-green")}
                    ${renderChartRow("Pending", stats.statusBreakdown.pending, (stats.statusBreakdown.pending / total) * 100, "bg-orange")}
                    ${renderChartRow("Rejected", stats.statusBreakdown.rejected, (stats.statusBreakdown.rejected / total) * 100, "bg-red")}
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

function renderChartRow(label, count, width, colorClass) {
  const barWidth = count > 0 ? width : 0;
  return `
    <div class="chart-row" style="display: flex; align-items: center; margin-bottom: 12px;">
        <span style="width: 130px; font-size: 0.85rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${label}</span>
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
  const efficiencyRate = ((stats.statusBreakdown.approved / total) * 100).toFixed(1);

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
      <tr><td rowspan="3">Request Types</td><td>Academic</td><td>${stats.academic}</td><td>${((stats.academic/total)*100).toFixed(1)}%</td></tr>
      <tr><td>Personal</td><td>${stats.personal}</td><td>${((stats.personal/total)*100).toFixed(1)}%</td></tr>
      <tr><td>Career</td><td>${stats.career}</td><td>${((stats.personal/total)*100).toFixed(1)}%</td></tr>
      
      <tr><td rowspan="3">Case Status</td><td>Approved</td><td>${stats.statusBreakdown.approved}</td><td>${((stats.statusBreakdown.approved/total)*100).toFixed(1)}%</td></tr>
      <tr><td>Pending</td><td>${stats.statusBreakdown.pending}</td><td>${((stats.statusBreakdown.pending/total)*100).toFixed(1)}%</td></tr>
      <tr><td>Rejected</td><td>${stats.statusBreakdown.rejected}</td><td>${((stats.statusBreakdown.rejected/total)*100).toFixed(1)}%</td></tr>
    </table>
  `;

  const win = window.open("", "PRINT", "height=700,width=900");
  win.document.write(`<html><body>${printContent}</body></html>`);
  win.document.close();
  win.print();
  win.close();
};
export function renderAdminView(root, session, onLogout) {
  root.innerHTML = `
    <div class="admin-container">
        <aside class="sidebar" id="sidebar">
            <div class="sidebar-header">
                <h2><i class="material-icons">security</i> Admin Portal</h2>
                <p>System Control Center</p>
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
                        <option value="General Counseling">General Counseling</option>
                        <option value="Academic Guidance">Academic Guidance</option>
                        <option value="Career & Placement">Career & Placement</option>
                        <option value="Mental Health & Wellness">Mental Health & Wellness</option>
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
  } else if(target === "reports"){
    const stats = getAnalytics(); 
    container.innerHTML = renderReports(stats);
  }else if (target === "logs") {
      renderLogsView(container);
  } else if (target === "students") {
    renderStudentViewer(container);
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

      // 1. Retrieve the existing announcements array stack from storage, fallback to empty array if blank
      const currentFeed =
        JSON.parse(localStorage.getItem("gh_global_broadcasts")) || [];

      // 2. Create the structured data entry
      const newBroadcast = {
        id: Date.now(), // Unique ID used for tracking DOM re-renders later
        message: messageText,
        date: new Date().toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }),
      };

      // 3. Unshift places the newly written message at index [0] so it displays at the top of the feed
      currentFeed.unshift(newBroadcast);

      // 4. Commit back to localStorage using the plural key name
      localStorage.setItem("gh_global_broadcasts", JSON.stringify(currentFeed));

      // 5. Force a cross-window synchronization event manually for real-time reactivity
      window.dispatchEvent(new Event("storage"));

      alert("Broadcast posted successfully to all user dashboards!");
      msgInput.value = "";
    }; // 👈 THIS was the missing curly brace + semicolon closing the click handler!
  } else {
    // Now this clean fallback block links perfectly
    container.innerHTML = `<div class="admin-card"><h2>Module coming soon...</h2></div>`;
  }
}

export function renderLogsView(container) {
  // 1. Initial Data Load
  const allLogs = JSON.parse(localStorage.getItem("gh_activity_logs") || "[]");
  
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
    const filtered = allLogs.filter(log => 
      log.action.toLowerCase().includes(filterText.toLowerCase()) ||
      log.userName.toLowerCase().includes(filterText.toLowerCase())
    ).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    tableContainer.innerHTML = `
      <table class="admin-table">
        <thead>
          <tr><th>Time</th><th>User</th><th>Role</th><th>Action</th></tr>
        </thead>
        <tbody>
          ${filtered.map(log => `
            <tr>
              <td>${new Date(log.timestamp).toLocaleString()}</td>
              <td>${log.userName}</td>
              <td>${log.userRole}</td>
              <td>${log.action}</td>
            </tr>
          `).join("")}
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
  const users = JSON.parse(localStorage.getItem("gh_users")) || [];
  const students = users.filter((u) => u.role === "student");

  container.innerHTML = `
        <div class="admin-card full-width">
            <div class="card-header">
                <h2><i class="material-icons">school</i> Registered Students Roster</h2>
                <span style="font-size: 0.9rem; color: #64748b; font-weight: 500; background: #f1f5f9; padding: 4px 12px; border-radius: 20px;">
                    Total: ${students.length} System Records
                </span>
            </div>
            <div class="table-container">
                <table class="admin-table">
                    <thead>
                        <tr>
                            <th>Student ID / Name</th>
                            <th>Email Address</th>
                            <th>Course Profile</th>
                            <th style="text-align: right;">Account Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${
                          students.length > 0
                            ? students
                                .map(
                                  (s) => `
                            <tr>
                                <td data-label="Student ID / Name">
                                    <div style="display: flex; flex-direction: column;">
                                        <strong style="color: #1e293b;">${s.name}</strong>
                                        <span style="font-size: 0.75rem; color: #64748b; font-family: monospace;">UID: ${s.id || "N/A"}</span>
                                    </div>
                                </td>
                                <td data-label="Email Address" style="color: #475569;">${s.email}</td>
                                <td data-label="Course Profile">
                                    <span style="background: #eff6ff; color: #1e40af; padding: 3px 8px; border-radius: 4px; font-size: 0.8rem; font-weight: 600;">
                                        ${s.course || "Unassigned"}
                                    </span>
                                </td>
                                <td data-label="Account Status" style="text-align: right;">
                                    <span class="badge status-pill approved" style="font-size: 0.75rem; background: #ecfdf5; color: #065f46; border: 1px solid #a7f3d0; padding: 2px 8px;">Active</span>
                                </td>
                            </tr>
                        `,
                                )
                                .join("")
                            : '<tr><td colspan="4" style="text-align:center; padding: 2rem;">No registered students found in local database.</td></tr>'
                        }
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

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

  saveBtn.onclick = () => {
    const id = document.getElementById("counselorIdField").value;
    const name = document.getElementById("counselorNameField").value.trim();
    const email = document.getElementById("counselorEmailField").value.trim();
    const specialty = document.getElementById("counselorSpecialtyField").value;
    const password = document
      .getElementById("counselorPasswordField")
      .value.trim();

    if (!name || !email) {
      alert("Name and Email are strict required parameters!");
      return;
    }

    const users = JSON.parse(localStorage.getItem("gh_users")) || [];

    if (id) {
      const index = users.findIndex((u) => u.id === id);
      if (index !== -1) {
        users[index].name = name;
        users[index].email = email;
        [users[index].user] = email.split("@");
        users[index].specialty = specialty; // Save modified specialty parameter

        if (password) {
          users[index].pass = password;
        }

        localStorage.setItem("gh_users", JSON.stringify(users));
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
        user: email.split("@")[0],
        pass: password,
        role: "guidance",
        specialty, // Bind custom focus value to record object schema
      };

      users.push(newUser);
      localStorage.setItem("gh_users", JSON.stringify(users));
      alert("Counselor initialization complete!");
    }

    modal.style.display = "none";
    const content = document.getElementById("admin-dynamic-content");
    renderStaffManager(content);
  };
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

  document.getElementById("counselorModal").style.display = "flex";
};

window.openEditCounselorModal = (id) => {
  const users = JSON.parse(localStorage.getItem("gh_users")) || [];
  const targetUser = users.find((u) => u.id === id);

  if (!targetUser) return;

  document.getElementById("modalTitle").innerHTML =
    '<i class="material-icons" style="color: #2563eb;">edit</i> Edit Counselor Details';
  document.getElementById("counselorIdField").value = targetUser.id;
  document.getElementById("counselorNameField").value = targetUser.name;
  document.getElementById("counselorEmailField").value = targetUser.email;
  document.getElementById("counselorSpecialtyField").value =
    targetUser.specialty || "General Counseling";
  document.getElementById("counselorPasswordField").value = "";
  document.getElementById("passwordLabel").textContent =
    "New Password (Leave blank to keep old password)";

  document.getElementById("counselorModal").style.display = "flex";
};

window.removeUser = (id) => {
  if (window.confirm("Are you sure you want to remove this staff member?")) {
    const users = JSON.parse(localStorage.getItem("gh_users")) || [];
    const filtered = users.filter((u) => u.id !== id);
    localStorage.setItem("gh_users", JSON.stringify(filtered));

    const content = document.getElementById("admin-dynamic-content");
    renderStaffManager(content);
  }
};


function getAnalytics() {
  const apps = JSON.parse(localStorage.getItem("gh_appointments")) || [];
  const users = JSON.parse(localStorage.getItem("gh_users")) || [];

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
  };
  const dailyTrends = {};

  apps.forEach((app) => {
    const statusKey = app.status?.toLowerCase();
    if (statusBreakdown[statusKey] !== undefined) statusBreakdown[statusKey]++;

    const date = new Date(app.createdAt || Date.now()).toLocaleDateString();
    dailyTrends[date] = (dailyTrends[date] || 0) + 1;

    const student = users.find((u) => u.email === app.studentEmail);
    if (student) {
      if (student.yearLevel && yearBreakdown[student.yearLevel] !== undefined)
        yearBreakdown[student.yearLevel]++;
      if (student.course) {
        courseBreakdown[student.course] =
          (courseBreakdown[student.course] || 0) + 1;
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
    academic: apps.filter((a) => a.type?.toLowerCase().includes("academic"))
      .length,
    personal: apps.filter((a) => a.type?.toLowerCase().includes("personal"))
      .length,
    career: apps.filter((a) => a.type?.toLowerCase().includes("career")).length,
    yearBreakdown,
    courseBreakdown,
    statusBreakdown,
    avgDaily,
    mostActiveYear: Object.keys(yearBreakdown).reduce(
      (a, b) => (yearBreakdown[a] > yearBreakdown[b] ? a : b),
      "N/A",
    ),
  };
}