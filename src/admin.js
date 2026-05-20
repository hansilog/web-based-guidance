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
                        ? counselors.map((c) => `
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
                        `).join("")
                        : `<tr><td colspan="4" style="text-align:center; padding: 3rem; color: #64748b;">No active counselor records deployed to the platform database.</td></tr>`
                    }
                </tbody>
            </table>
        </div>
    </div>
  `;
}
export function renderAdminView(root, session, onLogout) {
  root.innerHTML = `
    <div class="admin-container">
        <aside class="sidebar" id="sidebar">
            <div class="sidebar-header">
                <h2><i class="material-icons">security</i> Admin Portal</h2>
                <p>System Control Center</p>
            </div>
            <nav id="admin-nav">
                <button class="nav-item active" data-target="staff">
                    <i class="material-icons">badge</i> Manage Staff
                </button>
                <button class="nav-item" data-target="students">
                    <i class="material-icons">groups</i> View Students
                </button>
                <button class="nav-item" data-target="announcements">
                    <i class="material-icons">campaign</i> Global Broadcast
                </button>
                <button class="nav-item" data-target="system">
                    <i class="material-icons">settings_suggest</i> System Health
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
  const currentFeed = JSON.parse(localStorage.getItem("gh_global_broadcasts")) || [];

  // 2. Create the structured data entry
  const newBroadcast = {
    id: Date.now(), // Unique ID used for tracking DOM re-renders later
    message: messageText,
    date: new Date().toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
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

  } else { // Now this clean fallback block links perfectly
    container.innerHTML = `<div class="admin-card"><h2>Module coming soon...</h2></div>`;
  }
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
                                        <span style="font-size: 0.75rem; color: #64748b; font-family: monospace;">UID: ${s.id || 'N/A'}</span>
                                    </div>
                                </td>
                                <td data-label="Email Address" style="color: #475569;">${s.email}</td>
                                <td data-label="Course Profile">
                                    <span style="background: #eff6ff; color: #1e40af; padding: 3px 8px; border-radius: 4px; font-size: 0.8rem; font-weight: 600;">
                                        ${s.course || 'Unassigned'}
                                    </span>
                                </td>
                                <td data-label="Account Status" style="text-align: right;">
                                    <span class="badge status-pill approved" style="font-size: 0.75rem; background: #ecfdf5; color: #065f46; border: 1px solid #a7f3d0; padding: 2px 8px;">Active</span>
                                </td>
                            </tr>
                        `
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
    const password = document.getElementById("counselorPasswordField").value.trim();

    if (!name || !email) {
      alert("Name and Email are strict required parameters!");
      return;
    }

    const users = JSON.parse(localStorage.getItem("gh_users")) || [];

    if (id) {
      const index = users.findIndex(u => u.id === id);
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
        specialty // Bind custom focus value to record object schema
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
  document.getElementById("modalTitle").innerHTML = '<i class="material-icons" style="color: #2563eb;">person_add</i> Add Counselor';
  document.getElementById("counselorIdField").value = "";
  document.getElementById("counselorNameField").value = "";
  document.getElementById("counselorEmailField").value = "";
  document.getElementById("counselorSpecialtyField").value = "General Counseling";
  document.getElementById("counselorPasswordField").value = "";
  document.getElementById("passwordLabel").textContent = "Password";
  
  document.getElementById("counselorModal").style.display = "flex";
};

window.openEditCounselorModal = (id) => {
  const users = JSON.parse(localStorage.getItem("gh_users")) || [];
  const targetUser = users.find(u => u.id === id);

  if (!targetUser) return;

  document.getElementById("modalTitle").innerHTML = '<i class="material-icons" style="color: #2563eb;">edit</i> Edit Counselor Details';
  document.getElementById("counselorIdField").value = targetUser.id;
  document.getElementById("counselorNameField").value = targetUser.name;
  document.getElementById("counselorEmailField").value = targetUser.email;
  document.getElementById("counselorSpecialtyField").value = targetUser.specialty || "General Counseling";
  document.getElementById("counselorPasswordField").value = ""; 
  document.getElementById("passwordLabel").textContent = "New Password (Leave blank to keep old password)";
  
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