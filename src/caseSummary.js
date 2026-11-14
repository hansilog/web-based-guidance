// caseSummary.js
// --- PRINTABLE CASE SUMMARY: one confidential page about a student ---
// For referrals and parent meetings. Private case notes are left out unless
// the counselor ticks "Include private case notes".
import { escapeHtml } from "./syncUtil.js";
import { appointmentStart, formatTime12, parseDate } from "./store.js";

const STATUS = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Cancelled",
  completed: "Completed",
  "no-show": "No-show",
};

const day = (date) =>
  parseDate(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

export function caseSummaryHtml(
  student,
  apps,
  { includeNotes = false, printedBy = "", now = new Date() } = {},
) {
  const sorted = [...apps].sort(
    (a, b) => appointmentStart(a) - appointmentStart(b),
  );
  const count = (s) => sorted.filter((a) => a.status === s).length;
  const rated = sorted.filter((a) => a.feedback?.rating);
  const avg = rated.length
    ? (rated.reduce((s, a) => s + a.feedback.rating, 0) / rated.length).toFixed(
        1,
      )
    : "—";
  const checkIns = sorted.filter((a) => a.checkIn?.level);
  const flags = checkIns.filter((a) => a.checkIn.safetyFlag).length;
  const types = [...new Set(sorted.map((a) => a.type))].join(", ") || "—";
  const e = escapeHtml;

  const profileRows = [
    ["Name", student.name],
    [
      "Course / section",
      [student.course, student.section].filter(Boolean).join(" "),
    ],
    ["Year level", student.yearLevel],
    ["Email", student.email],
  ].filter(([, v]) => v);

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Case summary: ${e(student.name)}</title>
  <style>
    body { font-family: Arial, sans-serif; color: #1e2a3b; margin: 28px; font-size: 12px; }
    header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #16325c; padding-bottom: 8px; }
    h1 { font-size: 18px; margin: 0; color: #16325c; }
    h2 { font-size: 13px; margin: 18px 0 6px; color: #16325c; }
    .tag { font-size: 11px; font-weight: bold; color: #b42318; text-transform: none; }
    .meta { font-size: 11px; color: #5b6b80; text-align: right; }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; padding: 5px 6px; border-bottom: 1px solid #d8e0ea; vertical-align: top; }
    th { background: #f5f7fa; font-weight: bold; }
    .profile th { width: 28%; background: none; }
    .stats { display: flex; gap: 8px; }
    .stat { flex: 1; border: 1px solid #d8e0ea; border-radius: 6px; padding: 6px 8px; }
    .stat strong { display: block; font-size: 16px; color: #16325c; }
    .flag { color: #b42318; font-weight: bold; }
    .notes { white-space: pre-wrap; }
    footer { margin-top: 18px; font-size: 10px; color: #5b6b80; border-top: 1px solid #d8e0ea; padding-top: 6px; }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>Granby Gateway · Guidance Office</h1>
      <div class="tag">Confidential: student case summary</div>
    </div>
    <div class="meta">Printed ${e(now.toLocaleString("en-US"))}${printedBy ? `<br>by ${e(printedBy)}` : ""}</div>
  </header>

  <h2>Student</h2>
  <table class="profile">${profileRows.map(([k, v]) => `<tr><th>${e(k)}</th><td>${e(v)}</td></tr>`).join("")}</table>

  <h2>At a glance</h2>
  <div class="stats">
    <div class="stat"><strong>${count("completed")}</strong>Sessions completed</div>
    <div class="stat"><strong>${count("no-show")}</strong>Missed</div>
    <div class="stat"><strong>${count("pending") + count("approved")}</strong>Upcoming / pending</div>
    <div class="stat"><strong>${avg}</strong>Average rating</div>
  </div>
  <p>Concerns raised: ${e(types)}</p>

  <h2>Wellbeing check-ins</h2>
  ${
    checkIns.length
      ? `<table><tr><th>Date</th><th>Score (of 15)</th><th>Level</th><th>Safety flag</th></tr>
      ${checkIns
        .map(
          (a) =>
            `<tr><td>${day(a.date)}</td><td>${e(a.checkIn.score)}</td><td>${e(a.checkIn.level)}</td><td>${a.checkIn.safetyFlag ? '<span class="flag">Yes</span>' : "No"}</td></tr>`,
        )
        .join("")}</table>
      ${flags ? `<p class="flag">${flags} check-in${flags === 1 ? "" : "s"} with a safety flag.</p>` : ""}`
      : "<p>No check-ins on file.</p>"
  }

  <h2>Sessions</h2>
  ${
    sorted.length
      ? `<table><tr><th>Date</th><th>Type</th><th>Mode</th><th>Status</th><th>Counselor</th><th>Follow-up</th>${includeNotes ? "<th>Private case notes</th>" : ""}</tr>
      ${sorted
        .map(
          (a) =>
            `<tr><td>${day(a.date)}, ${e(formatTime12(a.time))}</td><td>${e(a.type)}</td><td>${e(a.mode || "")}</td><td>${e(STATUS[a.status] || a.status)}</td><td>${e(a.counselorName || "")}</td><td>${a.followUp ? "Recommended" : ""}</td>${includeNotes ? `<td class="notes">${e(a.caseNotes || "")}</td>` : ""}</tr>`,
        )
        .join("")}</table>`
      : "<p>No sessions on file.</p>"
  }

  <footer>Handle under the Data Privacy Act of 2012 (RA 10173). Share only with people directly involved in the student's care, and do not leave this page unattended.${includeNotes ? "" : " Private case notes are not included."}</footer>
</body>
</html>`;
}

// Print from a hidden frame (pop-up blockers can't stop it)
export function printCaseSummary(student, apps, options) {
  const frame = document.createElement("iframe");
  frame.title = "Case summary";
  frame.style.cssText =
    "position:fixed;width:0;height:0;border:0;visibility:hidden;";
  frame.onload = () => {
    const win = frame.contentWindow;
    win.onafterprint = () => frame.remove();
    win.focus();
    win.print();
  };
  frame.srcdoc = caseSummaryHtml(student, apps, options);
  document.body.appendChild(frame);
}
