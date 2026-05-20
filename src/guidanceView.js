// guidanceViews.js
// --- PURE HTML COMPONENT MODULE ---

export function generateAppointmentsTableHtml(appointments = []) {
  return `
    <div class="table-card">
        <div class="table-header-main">
            <h2><i class="material-icons">event_note</i> Appointment Requests</h2>
            <div class="table-tools">
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
                            .map((app) => {
                              const isCancelled = app.status === "cancelled";
                              const isPending = app.status === "pending";

                              return `
                        <tr style="${isCancelled ? "opacity: 0.65; background-color: #f8fafc;" : ""}">
                            <td data-label="Student">
                                <div class="user-info">
                                    <span class="user-name">${app.studentName}</span>
                                    <span class="user-email">${app.studentEmail || "no-email"}</span>
                                </div>
                            </td>
                            <td data-label="Category"><span class="type-tag">${app.type}</span></td>
                            <td data-label="Schedule">
                                <div class="date-info">
                                    <div>${app.date}</div>
                                    <small>${app.time}</small>
                                </div>
                            </td>
                            <td data-label="Status">
                                <span class="status-pill ${app.status.toLowerCase()}">${app.status}</span>
                            </td>
                            <td data-label="Actions">
                                <div class="action-btns">
                                    ${
                                      isPending
                                        ? `
                                        <button class="btn-approve" onclick="openActionModal(${app.id}, 'approved')" title="Approve Request">
                                            <i class="material-icons">check</i>
                                        </button>
                                        <button class="btn-reject" onclick="openActionModal(${app.id}, 'rejected')" title="Reject Request">
                                            <i class="material-icons">close</i>
                                        </button>
                                    `
                                        : `
                                        ${
                                          isCancelled
                                            ? `
                                            <span style="color: #64748b; font-size: 0.85rem; font-style: italic; display: inline-flex; align-items: center; gap: 4px;">
                                                <i class="material-icons" style="font-size: 14px;">remove_circle_outline</i> Cancelled by Student
                                            </span>
                                        `
                                            : `
                                            <span style="color: #94a3b8; font-size: 0.85rem; font-style: italic;">Processed</span>
                                        `
                                        }
                                    `
                                    }
                                </div>
                            </td>
                        </tr>`;
                            })
                            .join("")
                        : '<tr><td colspan="5" class="empty-row">No appointment requests found.</td></tr>'
                    }
                </tbody>
            </table>
        </div>
    </div>
  `;
}

export function renderConfirmationModal(app, status) {
  const isApprove = status === "approved";
  return `
    <div id="statusModal" class="modal-overlay">
        <div class="modal-content">
            <h3>${isApprove ? "Confirm Approval" : "Reason for Rejection"}</h3>
            <p>Student: <strong>${app.studentName}</strong></p>
            
            <div class="modal-body">
                ${
                  isApprove
                    ? `
                    <label>Update Schedule (Optional):</label>
                    <input type="time" id="modalTime" value="${app.time}">
                    <label>Notes/Instructions for Student:</label>
                `
                    : `
                    <label>Reason for Rejection (Required):</label>
                `
                }
                <textarea id="modalNotes" placeholder="${isApprove ? "e.g. Please bring your student ID..." : "e.g. Schedule conflict, please choose another date."}"></textarea>
            </div>

            <div class="modal-actions">
                <button class="btn-cancel" onclick="closeModal()">Cancel</button>
                <button class="btn-confirm ${status}" onclick="processStatusUpdate(${app.id}, '${status}')">
                    Confirm & Send Email
                </button>
            </div>
        </div>
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
                        <th>Account ID</th>
                    </tr>
                </thead>
                <tbody>
                    ${
                      students.length > 0
                        ? students
                            .map(
                              (std) => `
                        <tr>
                            <td class="user-name"><strong>${std.name}</strong></td>
                            <td><span class="level-badge">${std.yearLevel || "N/A"}</span></td>
                            <td>
                                <div class="course-info">
                                    <span class="course-text">${std.course || "N/A"}</span>
                                    <small class="section-text">${std.section ? `- ${std.section}` : ""}</small>
                                </div>
                            </td>
                            <td>${std.email}</td>
                            <td><code class="id-badge">${std.id}</code></td>
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

export function renderReports(stats) {
  const total = stats.totalApps || 1;
  return `
    <div class="admin-card">
        <div class="card-header">
            <h2><i class="material-icons">insights</i> Guidance Intelligence Dashboard</h2>
            <button id="printAnalyticsBtn" class="btn-primary">
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
                      .map(([year, count]) => renderChartRow(year, count, (count / total) * 100, "bg-purple"))
                      .join("")}
                </div>
            </div>

            <div class="report-section">
                <h3><i class="material-icons">school</i> Volume by Course</h3>
                <div class="chart-container">
                    ${
                      Object.keys(stats.courseBreakdown).length > 0
                        ? Object.entries(stats.courseBreakdown)
                            .map(([course, count]) => renderChartRow(course, count, (count / total) * 100, "bg-cyan"))
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

export function renderGuidanceSettings(savedEmail) {
  return `
    <div class="glass-card settings-card">
        <div class="card-header">
            <h2><i class="material-icons">settings</i> System Settings</h2>
            <p>Configure notifications and security credentials.</p>
        </div>
        
        <form id="settingsForm" class="settings-form">
            <div class="form-group">
                <label for="adminEmail">Notification Recipient Email</label>
                <input type="email" id="adminEmail" value="${savedEmail}" required>
            </div>
            <button type="submit" class="primary-btn">Update Email</button>
        </form>

        <hr style="margin: 30px 0; border: 0; border-top: 1px solid #e2e8f0;">

        <div class="settings-form">
            <div class="form-group">
                <label>Change Administrator Password</label>
                <div class="input-wrapper password-wrapper">
                    <input type="password" id="newPassword" placeholder="Enter new password">
                    <button type="button" class="toggle-password" data-target="newPassword">
                        <i class="material-icons">visibility</i>
                    </button>
                </div>
            </div>

            <div id="otpContainer" class="form-group hidden" style="margin-top: 15px;">
                <label for="otpInput">Enter 6-Digit OTP sent to ${savedEmail}</label>
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

export function renderLogs(activities = []) {
  return `
    <div class="admin-card">
        <div class="card-header">
            <h2><i class="material-icons">history</i> System Activity Logs</h2>
            <p class="subtitle">Tracking all recent status changes and counselor actions.</p>
        </div>
        <div class="log-container">
            ${
              activities.length > 0
                ? activities
                    .map(
                      (log) => `
                <div class="log-entry">
                    <div class="log-icon ${log.status}">
                        <i class="material-icons">${log.status === "approved" ? "check_circle" : "cancel"}</i>
                    </div>
                    <div class="log-details">
                        <p><strong>${log.status.toUpperCase()}</strong>: Appointment for <span>${log.studentName}</span></p>
                        <small>Action taken on: ${new Date(log.updatedAt).toLocaleString()}</small>
                        ${log.counselorNotes ? `<div class="log-notes">Note: "${log.counselorNotes}"</div>` : ""}
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