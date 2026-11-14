// wellbeing.js
// --- STUDENT "MY WELLBEING": the student's own check-in history ---
// Each booking can include the 5-question check-in (checkin.js). This page
// shows the student their scores over time, their latest answers, and where
// to get help. It reuses the chart pieces from insights.js.
import { escapeHtml } from "./syncUtil.js";
import { getAppointments, appointmentStart, parseDate } from "./store.js";
import { CHECKIN_QUESTIONS, CHECKIN_SCALE } from "./checkin.js";
import {
  LEVELS,
  statTile,
  tableView,
  columnChart,
  legend,
  card,
  bindTooltip,
} from "./insights.js";

const MAX_SCORE = CHECKIN_QUESTIONS.length * (CHECKIN_SCALE.length - 1);
const levelColor = (level) =>
  (LEVELS.find((l) => l.level === level) || LEVELS[0]).color;

const fmt = (date, withYear = false) =>
  parseDate(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(withYear ? { year: "numeric" } : {}),
  });

// The student's check-ins, oldest first
export function getMyCheckIns(studentId) {
  return getAppointments()
    .filter((a) => a.studentId === studentId && a.checkIn?.answers)
    .sort((a, b) => appointmentStart(a) - appointmentStart(b))
    .map((a) => ({
      date: a.date,
      type: a.type,
      score: a.checkIn.score,
      level: a.checkIn.level,
      safetyFlag: Boolean(a.checkIn.safetyFlag),
      answers: a.checkIn.answers,
    }));
}

// Score change from the check-in before the latest: lower is better
function changeLine(list) {
  if (list.length < 2) return "";
  const diff = list[list.length - 1].score - list[list.length - 2].score;
  if (diff === 0) {
    return `<span class="ins-delta flat">Same as last time</span>`;
  }
  const better = diff < 0;
  return `<span class="ins-delta ${better ? "up" : "down"}"><i class="material-icons" aria-hidden="true">${better ? "arrow_downward" : "arrow_upward"}</i>${Math.abs(diff)} point${Math.abs(diff) === 1 ? "" : "s"} ${better ? "lower" : "higher"} than last time</span>`;
}

function helpBox(latest) {
  if (latest?.safetyFlag) {
    return `
      <div class="wb-help urgent" role="note">
        <i class="material-icons" aria-hidden="true">favorite</i>
        <div>
          <strong>You don't have to wait for your appointment.</strong>
          <p>If you might hurt yourself, call the NCMH Crisis Hotline <a href="tel:1553">1553</a> or <a href="tel:911">911</a>, or go to the guidance office now. You can also tell any teacher you trust.</p>
        </div>
      </div>`;
  }
  if (latest?.level === "High") {
    return `
      <div class="wb-help" role="note">
        <i class="material-icons" aria-hidden="true">support_agent</i>
        <div>
          <strong>It sounds like a lot right now.</strong>
          <p>Your counselor sees your check-in before your session. If things get worse before then, walk in to the guidance office or call <a href="tel:1553">1553</a>.</p>
        </div>
      </div>`;
  }
  return "";
}

export function renderWellbeing(container, session) {
  const list = getMyCheckIns(session.id);
  const latest = list[list.length - 1];

  if (!latest) {
    container.innerHTML = `
      <div class="ins-page wb-page">
        <div class="dashboard-hero">
          <h1>My wellbeing</h1>
          <p>See how you've been feeling over time, from the short check-in you can add when you book.</p>
        </div>
        <div class="ins-card wb-empty">
          <i class="material-icons" aria-hidden="true">favorite_border</i>
          <h3>No check-ins yet</h3>
          <p>When you book a session, open "Quick wellbeing check-in" and answer 5 short questions. Your results will show up here.</p>
          <button type="button" class="primary-btn wb-book">Book a session</button>
        </div>
      </div>`;
    container.querySelector(".wb-book").onclick = () =>
      document.querySelector('.nav-item[data-target="book"]')?.click();
    return;
  }

  const tiles = `
    <div class="ins-tiles wb-tiles">
      ${statTile("Latest check-in", latest.level, `Score ${latest.score} of ${MAX_SCORE} on ${fmt(latest.date, true)}`, changeLine(list))}
      ${statTile("Check-ins so far", String(list.length), `Since ${fmt(list[0].date, true)}`)}
      ${statTile("Average score", (list.reduce((s, c) => s + c.score, 0) / list.length).toFixed(1), `Out of ${MAX_SCORE}. Lower means fewer worries.`)}
    </div>`;

  const columns = list.map((c) => ({
    title: `${fmt(c.date, true)} · ${c.type}`,
    short: fmt(c.date),
    total: c.score,
    tip: `Score ${c.score} of ${MAX_SCORE}, ${c.level}`,
    segments: [{ value: c.score, color: levelColor(c.level) }],
  }));
  const chartCard = card(
    "Your check-in scores",
    "One column per check-in. Lower is better.",
    columnChart(columns, {
      ariaLabel: "Check-in scores over time",
      ticks: [0, 5, 10, 15],
    }) +
      legend(LEVELS.map((l) => ({ label: l.level, color: l.color }))) +
      tableView(
        "Your check-in scores",
        ["Date", "Session", "Score", "Level"],
        list.map((c) => [
          fmt(c.date, true),
          c.type,
          `${c.score} of ${MAX_SCORE}`,
          c.level,
        ]),
      ),
  );

  const answersCard = card(
    "Your latest answers",
    `From ${fmt(latest.date, true)}, before your ${latest.type} session`,
    `<ul class="wb-answers">${CHECKIN_QUESTIONS.map((q, i) => {
      const n = latest.answers[i] ?? 0;
      return `
        <li>
          <span class="wb-q">${escapeHtml(q)}</span>
          <span class="wb-a">
            <span class="wb-dots" aria-hidden="true">${CHECKIN_SCALE.map((_, k) => `<span class="${k <= n && n > 0 ? "on" : ""}"></span>`).join("")}</span>
            ${escapeHtml(CHECKIN_SCALE[n])}
          </span>
        </li>`;
    }).join("")}</ul>`,
  );

  container.innerHTML = `
    <div class="ins-page wb-page">
      <div class="dashboard-hero">
        <h1>My wellbeing</h1>
        <p>How you've been feeling, from the check-ins you add when you book. Only you and the guidance counselors can see this.</p>
      </div>
      ${helpBox(latest)}
      ${tiles}
      <div class="ins-grid">
        ${chartCard}
        ${answersCard}
      </div>
      <p class="wb-note"><i class="material-icons" aria-hidden="true">info</i> The check-in helps your counselor prepare. It isn't a test or a diagnosis.</p>
      <div class="ins-tip" role="tooltip" hidden>
        <strong class="ins-tip-value"></strong>
        <span class="ins-tip-title"></span>
      </div>
    </div>`;

  bindTooltip(container);
}
