import schoolLogo from "./assets/school-logo-128.png";
import "./styles/landing.css";
import { escapeHtml } from "./syncUtil.js";
import { openModal } from "./ui.js";
import {
  CONCERN_CATEGORIES,
  CONCERN_STATUSES,
  addConcern,
  lookupConcern,
  getCounselors,
  addNotification,
  isRemote,
} from "./store.js";

// Light spam guard for the public form: a few reports per hour per browser
const MAX_REPORTS_PER_HOUR = 3;

function recentReports() {
  try {
    const hourAgo = Date.now() - 60 * 60 * 1000;
    return JSON.parse(localStorage.getItem("gh_concern_sent") || "[]").filter(
      (t) => t > hourAgo,
    );
  } catch {
    return [];
  }
}

function rememberReport() {
  try {
    localStorage.setItem(
      "gh_concern_sent",
      JSON.stringify([...recentReports(), Date.now()]),
    );
  } catch {
    // Storage blocked: the report itself is already saved
  }
}

function showConcernReceipt(ref) {
  openModal({
    title: "Report Sent",
    icon: "check_circle",
    cancelText: "Done",
    bodyHtml: `
      <p class="modal-lead">Thank you for speaking up. A guidance counselor will review your report.</p>
      <p>Your reference code:</p>
      <p class="concern-ref">${escapeHtml(ref)}</p>
      <p class="modal-hint"><i class="material-icons">info</i> Write this code down. Use "Check a Report" on this page to see the status and any reply. Without the code, nobody (including you) can link the report to you.</p>
    `,
  });
}

function openConcernForm() {
  openModal({
    title: "Report a Concern Anonymously",
    icon: "shield",
    confirmText: "Send Report",
    wide: true,
    bodyHtml: `
      <p class="modal-lead">Tell the guidance office about bullying, harassment, a safety issue, or a friend you're worried about. <strong>You don't need to sign in, and your name isn't recorded.</strong></p>
      <div class="urgent-help">
        <strong>If someone is in danger right now, don't use this form.</strong>
        Call <a href="tel:911">911</a> or the NCMH Crisis Hotline <a href="tel:1553">1553</a>, or go to the guidance office.
      </div>
      <label class="modal-label" for="concernCategory">What is it about?</label>
      <select id="concernCategory" class="modal-input">
        <option value="">Choose one...</option>
        ${CONCERN_CATEGORIES.map((c) => `<option value="${c}">${c}</option>`).join("")}
      </select>
      <label class="modal-label" for="concernText">What happened?</label>
      <textarea id="concernText" class="modal-input" rows="5" maxlength="2000" placeholder="Describe what happened. Avoid writing your own name if you want to stay anonymous."></textarea>
      <div class="walkin-when">
        <div>
          <label class="modal-label" for="concernWhere">Where? (optional)</label>
          <input type="text" id="concernWhere" class="modal-input" maxlength="120" placeholder="e.g. Building A, 2nd floor">
        </div>
        <div>
          <label class="modal-label" for="concernWhen">When? (optional)</label>
          <input type="text" id="concernWhen" class="modal-input" maxlength="120" placeholder="e.g. Most lunch breaks this week">
        </div>
      </div>
      <label class="modal-label" for="concernContact">Contact (optional)</label>
      <input type="text" id="concernContact" class="modal-input" maxlength="120" placeholder="Leave blank to stay anonymous">
      <p class="modal-hint"><i class="material-icons">lock</i> Only guidance counselors can read reports.</p>
    `,
    onConfirm: ({ card, showError }) => {
      const category = card.querySelector("#concernCategory").value;
      const description = card.querySelector("#concernText").value.trim();
      if (!category) {
        showError("Please choose what the concern is about.");
        return false;
      }
      if (description.length < 20) {
        showError("Please describe what happened (at least 20 characters).");
        return false;
      }
      if (recentReports().length >= MAX_REPORTS_PER_HOUR) {
        showError(
          "You've sent several reports in the last hour. Please wait a bit, or visit the guidance office.",
        );
        return false;
      }

      const concern = addConcern({
        category,
        description,
        location: card.querySelector("#concernWhere").value.trim(),
        when: card.querySelector("#concernWhen").value.trim(),
        contact: card.querySelector("#concernContact").value.trim(),
      });
      rememberReport();
      // With Supabase the database alerts counselors itself (and anonymous
      // visitors can't write to notifications or the activity log)
      if (!isRemote) {
        getCounselors().forEach((c) =>
          addNotification(
            c.id,
            `New anonymous concern (${category}). Open the Concerns tab to review it.`,
          ),
        );
        window.logActivity(
          { name: "Anonymous", role: "public" },
          `Submitted anonymous concern ${concern.ref}`,
        );
      }
      showConcernReceipt(concern.ref);
      return true;
    },
  });
}

function openConcernLookup() {
  openModal({
    title: "Check a Report",
    icon: "search",
    confirmText: "Check",
    bodyHtml: `
      <label class="modal-label" for="concernRef">Reference code</label>
      <input type="text" id="concernRef" class="modal-input" placeholder="GC-XXXXXX" autocomplete="off" style="text-transform: uppercase;">
      <div id="concernResult"></div>
    `,
    onConfirm: async ({ card, showError }) => {
      const box = card.querySelector("#concernResult");
      let concern;
      try {
        concern = await lookupConcern(card.querySelector("#concernRef").value);
      } catch (err) {
        showError(err.message);
        return false;
      }
      if (!concern) {
        box.innerHTML = "";
        showError("No report found with that code. Check for typos.");
        return false;
      }
      box.innerHTML = `
        <div class="concern-status-box">
          <p><strong>Status:</strong> <span class="concern-pill ${escapeHtml(concern.status)}">${CONCERN_STATUSES[concern.status]}</span></p>
          <p><strong>Sent:</strong> ${new Date(concern.createdAt).toLocaleDateString()}</p>
          <p><strong>Reply from the guidance office:</strong><br>${concern.response ? escapeHtml(concern.response) : "No reply yet."}</p>
        </div>`;
      // Keep the dialog open to show the result
      return false;
    },
  });
}

export function renderLandingPage(root, onGetStarted, onLogin) {
  root.innerHTML = `
        <div class="landing-page">
            <nav class="glass-nav">
                <div class="logo">
                    <img class="landing-logo" src="${schoolLogo}" alt="Granby Colleges of Science and Technology seal" width="36" height="36">
                    <span>Granby Colleges of Science and Technology</span>
                </div>
            </nav>

            <section class="hero">
                <div class="hero-content">
                    <span class="badge">New: 2026 Academic Portal</span>
                    <h1>Your Academic Success, <br><span class="highlight">Simplified.</span></h1>
                    <p>Connect with guidance counselors, manage appointments, and track your records through the secure Granby College portal.</p>
                    <div class="cta-group">
                        <button class="btn-primary cta-btn" id="getStartedBtn">
                            Get Started <i class="material-icons">arrow_forward</i>
                        </button>
                        <button class="btn-secondary cta-btn" id="navLoginBtn">
                            Sign In <i class="material-icons">login</i>
                        </button>
                    </div>
                    <button type="button" class="services-link" id="viewServicesBtn">
                        View services <i class="material-icons">expand_more</i>
                    </button>
                </div>
            </section>

            <section class="features-grid" id="services-section">
                <div class="glass-card">
                    <div class="icon-box"><i class="material-icons">calendar_month</i></div>
                    <h3>Smart Booking</h3>
                    <p>No more queues. Book your guidance sessions in seconds.</p>
                </div>
                <div class="glass-card">
                    <div class="icon-box"><i class="material-icons">insights</i></div>
                    <h3>Live Analytics</h3>
                    <p>Real-time status updates on all your pending requests.</p>
                </div>
                <div class="glass-card">
                    <div class="icon-box"><i class="material-icons">lock</i></div>
                    <h3>Kept confidential</h3>
                    <p>Your counselor's case notes stay with the guidance office.</p>
                </div>
            </section>

            <section class="concern-section">
                <div class="concern-banner">
                    <div class="icon-box"><i class="material-icons">shield</i></div>
                    <div class="concern-copy">
                        <h2>See something? Say something.</h2>
                        <p>Report bullying, harassment, or a safety concern to the guidance office anonymously. No account needed.</p>
                    </div>
                    <div class="concern-cta">
                        <button class="btn-primary" id="reportConcernBtn">
                            <i class="material-icons">report</i> Report a Concern
                        </button>
                        <button class="btn-secondary" id="checkConcernBtn">Check a Report</button>
                    </div>
                </div>
            </section>

            <section class="team-section" id="team-section">
                <div class="section-header">
                    <h2>Project Team</h2>
                    <p>Our Team Members behind this Project</p>
                </div>
                <div class="team-grid">
                    <div class="member-card">
                        <div class="member-avatar"><i class="material-icons">person</i></div>
                        <h3>Jhefrei Gaspar</h3>
                        <span>Project Lead</span>
                    </div>
                    <div class="member-card">
                        <div class="member-avatar"><i class="material-icons">person</i></div>
                        <h3>Antonio Jaucian IV</h3>
                        <span>Developer</span>
                    </div>
                    <div class="member-card">
                        <div class="member-avatar"><i class="material-icons">person</i></div>
                        <h3>Rhaessian Mhaye Delfin</h3>
                        <span>Developer</span>
                    </div>
                    <div class="member-card">
                        <div class="member-avatar"><i class="material-icons">person</i></div>
                        <h3>Christine Mae Bombeza</h3>
                        <span>Developer</span>
                    </div>
                    <div class="member-card">
                        <div class="member-avatar"><i class="material-icons">person</i></div>
                        <h3>Hans Balasbas</h3>
                        <span>Documentation</span>
                    </div>
                    <div class="member-card">
                        <div class="member-avatar"><i class="material-icons">person</i></div>
                        <h3>Argenjeff Argente</h3>
                        <span>Documentation</span>
                    </div>
                </div>
            </section>
        </div>
    `;

  // Listeners
  document.getElementById("getStartedBtn").onclick = onGetStarted;
  document.getElementById("navLoginBtn").onclick = onLogin;
  document.getElementById("reportConcernBtn").onclick = openConcernForm;
  document.getElementById("checkConcernBtn").onclick = openConcernLookup;

  // View Services Smooth Scroll
  document.getElementById("viewServicesBtn").onclick = () => {
    const target = document.getElementById("services-section");
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  };
}
