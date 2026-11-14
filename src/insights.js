// insights.js
// --- COUNSELOR INSIGHTS: stat tiles + charts about the counselor's own sessions ---
// Charts are plain HTML/CSS (no chart library). Every chart has a hover/focus
// tooltip and a "Show as table" view, so no value depends on color or hover.
import { escapeHtml } from "./syncUtil.js";
import { getAppointments, appointmentStart } from "./store.js";

const DAY = 86400000;

export const RANGES = [
  { key: "30", label: "Last 30 days", days: 30 },
  { key: "90", label: "Last 90 days", days: 90 },
  { key: "365", label: "Past year", days: 365 },
];

// Outcome colors: categorical slots 1-4, validated (adjacent CVD ΔE 9.1)
const OUTCOMES = [
  { status: "completed", label: "Completed", color: "#2a78d6", ink: "#fff" },
  { status: "no-show", label: "No-show", color: "#eb6834", ink: "#fff" },
  { status: "cancelled", label: "Cancelled", color: "#1baf7a", ink: "#fff" },
  { status: "rejected", label: "Rejected", color: "#eda100", ink: "#0b0b0b" },
];

// Check-in levels: one blue ramp, light → dark (validated as ordinal)
const LEVELS = [
  { level: "Low", color: "#86b6ef" },
  { level: "Moderate", color: "#2a78d6" },
  { level: "High", color: "#104281" },
];

// --- helpers ---

const fmtDay = (date) =>
  date.toLocaleDateString("en-US", { month: "short", day: "numeric" });

function mondayOf(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

// Weeks (Monday starts) covering [from, to]
function weeksBetween(from, to) {
  const weeks = [];
  for (let w = mondayOf(from); w <= to; w = new Date(w.getTime() + 7 * DAY)) {
    weeks.push(w);
  }
  return weeks;
}

// Round axis maximum and ticks: 0 and up to 3 clean steps
function niceTicks(max) {
  if (max <= 0) return [0, 1];
  const raw = max / 3;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= raw);
  const ticks = [];
  for (let t = 0; t < max + step; t += step) ticks.push(Math.round(t));
  return [...new Set(ticks)];
}

const pct = (part, whole) => (whole ? Math.round((part / whole) * 100) : 0);

function formatHours(hours) {
  if (hours == null) return "—";
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min`;
  if (hours < 48) return `${hours.toFixed(1)} h`;
  return `${(hours / 24).toFixed(1)} days`;
}

// --- numbers ---

export function computeInsights(counselorId, days, now = new Date()) {
  const to = now;
  const from = new Date(now.getTime() - days * DAY);
  const prevFrom = new Date(from.getTime() - days * DAY);

  const mine = getAppointments().filter((a) => a.counselorId === counselorId);
  const inRange = (a, start = from, end = to) => {
    const t = appointmentStart(a);
    return t >= start && t <= end;
  };
  const current = mine.filter((a) => inRange(a));
  const previous = mine.filter((a) => inRange(a, prevFrom, from));

  const completed = current.filter((a) => a.status === "completed");
  const prevCompleted = previous.filter((a) => a.status === "completed");
  const noShows = current.filter((a) => a.status === "no-show").length;
  const bookedDone = completed.filter((a) => !a.walkIn).length;
  const rated = completed.filter((a) => a.feedback?.rating);
  const decided = mine.filter(
    (a) =>
      a.decidedAt &&
      a.createdAt &&
      new Date(a.createdAt) >= from &&
      new Date(a.createdAt) <= to,
  );

  // Sessions held per week
  const weeks = weeksBetween(from, to);
  const perWeek = weeks.map((start) => {
    const end = new Date(start.getTime() + 7 * DAY);
    const list = completed.filter((a) => {
      const t = appointmentStart(a);
      return t >= start && t < end;
    });
    return {
      start,
      count: list.length,
      walkIns: list.filter((a) => a.walkIn).length,
    };
  });

  // Concerns: every request in range, by counseling type, largest first
  const typeCounts = {};
  current.forEach((a) => {
    typeCounts[a.type] = (typeCounts[a.type] || 0) + 1;
  });
  let concerns = Object.entries(typeCounts)
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type));
  if (concerns.length > 6) {
    const rest = concerns.slice(5).reduce((sum, c) => sum + c.count, 0);
    concerns = [...concerns.slice(0, 5), { type: "Other types", count: rest }];
  }

  // How closed sessions ended
  const outcomes = OUTCOMES.map((o) => ({
    ...o,
    count: current.filter((a) => a.status === o.status).length,
  }));

  // Wellbeing check-ins per week, by level
  const withCheckIn = current.filter((a) => a.checkIn);
  const checkInWeeks = weeks.map((start) => {
    const end = new Date(start.getTime() + 7 * DAY);
    const list = withCheckIn.filter((a) => {
      const t = appointmentStart(a);
      return t >= start && t < end;
    });
    return {
      start,
      levels: LEVELS.map(
        (l) => list.filter((a) => a.checkIn.level === l.level).length,
      ),
    };
  });

  return {
    days,
    from,
    to,
    sessions: completed.length,
    prevSessions: prevCompleted.length,
    walkIns: completed.length - bookedDone,
    noShowRate:
      bookedDone + noShows ? pct(noShows, bookedDone + noShows) : null,
    noShows,
    avgRating: rated.length
      ? rated.reduce((s, a) => s + a.feedback.rating, 0) / rated.length
      : null,
    ratingCount: rated.length,
    avgResponseHours: decided.length
      ? decided.reduce(
          (s, a) => s + (new Date(a.decidedAt) - new Date(a.createdAt)),
          0,
        ) /
        decided.length /
        3600000
      : null,
    decidedCount: decided.length,
    perWeek,
    concerns,
    outcomes,
    checkInWeeks,
    checkIns: withCheckIn.length,
    safetyFlags: withCheckIn.filter((a) => a.checkIn.safetyFlag).length,
  };
}

// --- pieces ---

function tipAttrs(title, value) {
  return `data-tip-title="${escapeHtml(title)}" data-tip-value="${escapeHtml(value)}"`;
}

function statTile(label, value, sub, delta = "") {
  return `
    <div class="ins-tile">
      <span class="ins-tile-label">${escapeHtml(label)}</span>
      <span class="ins-tile-value">${escapeHtml(value)}</span>
      ${delta ? `<span class="ins-tile-sub">${delta}</span>` : ""}
      <span class="ins-tile-sub">${escapeHtml(sub)}</span>
    </div>`;
}

function sessionsDelta(now, before, days) {
  if (!before && !now) return "";
  const diff = now - before;
  if (diff === 0)
    return `<span class="ins-delta flat">No change vs previous ${days} days</span>`;
  const up = diff > 0;
  return `<span class="ins-delta ${up ? "up" : "down"}"><i class="material-icons" aria-hidden="true">${up ? "arrow_upward" : "arrow_downward"}</i>${up ? "+" : "−"}${Math.abs(diff)} vs previous ${days} days</span>`;
}

function tableView(caption, head, rows) {
  return `
    <details class="ins-table">
      <summary>Show as table</summary>
      <table>
        <caption>${escapeHtml(caption)}</caption>
        <thead><tr>${head.map((h) => `<th scope="col">${escapeHtml(h)}</th>`).join("")}</tr></thead>
        <tbody>${rows
          .map(
            (r) =>
              `<tr>${r.map((c, i) => (i === 0 ? `<th scope="row">${escapeHtml(c)}</th>` : `<td>${escapeHtml(c)}</td>`)).join("")}</tr>`,
          )
          .join("")}</tbody>
      </table>
    </details>`;
}

// Column chart; each column is a stack of { value, color } segments
function columnChart(columns, { ariaLabel, maxLabels = 8 }) {
  const max = Math.max(
    ...columns.map((c) => c.segments.reduce((s, x) => s + x.value, 0)),
    0,
  );
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1];
  const every = Math.ceil(columns.length / maxLabels);
  // Label only the highest column (latest if tied) and the last one
  let peakIndex = 0;
  columns.forEach((c, i) => {
    if (c.total >= columns[peakIndex].total) peakIndex = i;
  });

  return `
    <div class="ins-cols" role="group" aria-label="${escapeHtml(ariaLabel)}">
      <div class="ins-cols-grid" aria-hidden="true">
        ${ticks
          .map(
            (t) =>
              `<div class="ins-gridline" style="bottom:${(t / top) * 100}%"><span>${t}</span></div>`,
          )
          .join("")}
      </div>
      <div class="ins-cols-plot">
        ${columns
          .map((c, i) => {
            // Evenly spaced labels counted back from the latest week
            const label = (columns.length - 1 - i) % every === 0;
            const showValue =
              c.total > 0 && (i === peakIndex || i === columns.length - 1);
            return `
          <div class="ins-col-slot">
            <button type="button" class="ins-col" ${tipAttrs(c.title, c.tip)}
                    aria-label="${escapeHtml(`${c.title}: ${c.tip}`)}"
                    style="height:${(c.total / top) * 100}%">
              ${showValue ? `<span class="ins-col-value">${c.total}</span>` : ""}
              ${c.segments
                .filter((s) => s.value > 0)
                .map(
                  (s) =>
                    `<span class="ins-seg" style="flex-grow:${s.value};background:${s.color}"></span>`,
                )
                .join("")}
            </button>
            <span class="ins-col-label" aria-hidden="true">${label ? escapeHtml(c.short) : ""}</span>
          </div>`;
          })
          .join("")}
      </div>
    </div>`;
}

function legend(items) {
  return `<ul class="ins-legend">${items
    .map(
      (i) =>
        `<li><span class="ins-swatch" style="background:${i.color}"></span>${escapeHtml(i.label)}</li>`,
    )
    .join("")}</ul>`;
}

function card(title, subtitle, body, extraClass = "") {
  return `
    <section class="ins-card ${extraClass}">
      <h3>${escapeHtml(title)}</h3>
      <p class="ins-sub">${escapeHtml(subtitle)}</p>
      ${body}
    </section>`;
}

// --- page ---

export function renderInsights(container, session, rangeKey) {
  const range = RANGES.find((r) => r.key === rangeKey) || RANGES[1];
  const d = computeInsights(session.id, range.days);
  const span = `${fmtDay(d.from)} – ${fmtDay(d.to)}`;

  const filter = `
    <div class="ins-filter" role="group" aria-label="Time range">
      ${RANGES.map(
        (r) =>
          `<button type="button" class="ins-range ${r.key === range.key ? "active" : ""}" data-range="${r.key}" aria-pressed="${r.key === range.key}">${r.label}</button>`,
      ).join("")}
      <span class="ins-span">${escapeHtml(span)}</span>
    </div>`;

  const tiles = `
    <div class="ins-tiles">
      ${statTile("Sessions held", String(d.sessions), d.walkIns ? `${d.walkIns} walk-in${d.walkIns === 1 ? "" : "s"}` : "Including walk-ins", sessionsDelta(d.sessions, d.prevSessions, d.days))}
      ${statTile("No-show rate", d.noShowRate == null ? "—" : `${d.noShowRate}%`, d.noShowRate == null ? "No booked sessions closed yet" : `${d.noShows} missed session${d.noShows === 1 ? "" : "s"}`)}
      ${statTile("Average rating", d.avgRating == null ? "—" : `${d.avgRating.toFixed(1)} / 5`, d.ratingCount ? `From ${d.ratingCount} rating${d.ratingCount === 1 ? "" : "s"}` : "No ratings yet")}
      ${statTile("Time to answer a request", formatHours(d.avgResponseHours), d.decidedCount ? `Across ${d.decidedCount} request${d.decidedCount === 1 ? "" : "s"}` : "No requests answered yet")}
    </div>`;

  // Sessions per week
  const weekCols = d.perWeek.map((w) => ({
    title: `Week of ${fmtDay(w.start)}`,
    short: fmtDay(w.start),
    total: w.count,
    tip: `${w.count} session${w.count === 1 ? "" : "s"}${w.walkIns ? `, ${w.walkIns} walk-in` : ""}`,
    segments: [{ value: w.count, color: "var(--c-blue)" }],
  }));
  const sessionsCard = card(
    "Sessions per week",
    "Completed sessions, including walk-ins",
    d.sessions
      ? columnChart(weekCols, { ariaLabel: "Sessions per week" }) +
          tableView(
            "Sessions per week",
            ["Week of", "Sessions", "Walk-ins"],
            d.perWeek.map((w) => [
              fmtDay(w.start),
              String(w.count),
              String(w.walkIns),
            ]),
          )
      : `<p class="ins-empty">No completed sessions in this period yet. Close sessions from the Appointments tab to see them here.</p>`,
  );

  // Most common concerns: ranked bars
  const topConcern = d.concerns[0]?.count || 0;
  const concernsCard = card(
    "Most common concerns",
    "All requests in this period, by counseling type",
    d.concerns.length
      ? `<ul class="ins-bars">${d.concerns
          .map(
            (c) => `
          <li ${tipAttrs(c.type, `${c.count} request${c.count === 1 ? "" : "s"}`)} tabindex="0"
              aria-label="${escapeHtml(`${c.type}: ${c.count}`)}">
            <span class="ins-bar-name">${escapeHtml(c.type)}</span>
            <span class="ins-bar-track"><span class="ins-bar-fill" style="width:${(c.count / topConcern) * 100}%"></span></span>
            <span class="ins-bar-value">${c.count}</span>
          </li>`,
          )
          .join("")}</ul>${tableView(
          "Most common concerns",
          ["Counseling type", "Requests"],
          d.concerns.map((c) => [c.type, String(c.count)]),
        )}`
      : `<p class="ins-empty">No requests in this period.</p>`,
  );

  // How sessions ended: tall segmented bar
  const closed = d.outcomes.reduce((s, o) => s + o.count, 0);
  const outcomesCard = card(
    "How sessions ended",
    `${closed} closed request${closed === 1 ? "" : "s"} in this period`,
    closed
      ? `<div class="ins-split" role="group" aria-label="How sessions ended">${d.outcomes
          .filter((o) => o.count > 0)
          .map((o) => {
            const share = pct(o.count, closed);
            return `<span class="ins-split-part" tabindex="0" style="flex-grow:${o.count};background:${o.color};color:${o.ink}"
                    ${tipAttrs(o.label, `${o.count} (${share}%)`)}
                    aria-label="${escapeHtml(`${o.label}: ${o.count}, ${share}%`)}">${share >= 12 ? `${share}%` : ""}</span>`;
          })
          .join("")}</div>${legend(d.outcomes)}${tableView(
          "How sessions ended",
          ["Outcome", "Sessions", "Share"],
          d.outcomes.map((o) => [
            o.label,
            String(o.count),
            `${pct(o.count, closed)}%`,
          ]),
        )}`
      : `<p class="ins-empty">Nothing closed in this period yet.</p>`,
  );

  // Wellbeing check-ins per week
  const checkCols = d.checkInWeeks.map((w) => {
    const total = w.levels.reduce((s, n) => s + n, 0);
    return {
      title: `Week of ${fmtDay(w.start)}`,
      short: fmtDay(w.start),
      total,
      tip: total
        ? LEVELS.map((l, i) => `${l.level} ${w.levels[i]}`).join(", ")
        : "No check-ins",
      segments: LEVELS.map((l, i) => ({
        value: w.levels[i],
        color: l.color,
      })).reverse(),
    };
  });
  const flags = d.safetyFlags
    ? `<p class="ins-flag"><i class="material-icons" aria-hidden="true">warning</i><span><strong>${d.safetyFlags} safety flag${d.safetyFlags === 1 ? "" : "s"}</strong> in this period. Each one is marked in the Appointments queue.</span></p>`
    : `<p class="ins-flag none"><i class="material-icons" aria-hidden="true">check_circle</i><span>No safety flags in this period.</span></p>`;
  const checkInCard = card(
    "Wellbeing check-ins",
    `${d.checkIns} booking${d.checkIns === 1 ? "" : "s"} included a check-in`,
    d.checkIns
      ? columnChart(checkCols, { ariaLabel: "Wellbeing check-ins per week" }) +
          legend(LEVELS.map((l) => ({ label: l.level, color: l.color }))) +
          flags +
          tableView(
            "Wellbeing check-ins per week",
            ["Week of", ...LEVELS.map((l) => l.level)],
            d.checkInWeeks.map((w) => [
              fmtDay(w.start),
              ...w.levels.map(String),
            ]),
          )
      : `<p class="ins-empty">No check-ins in this period. Students can add one when they book.</p>${flags}`,
  );

  container.innerHTML = `
    <div class="ins-page">
      <div class="ins-head">
        <div>
          <h2>Insights</h2>
          <p class="ins-sub">Your own sessions only.</p>
        </div>
        ${filter}
      </div>
      ${tiles}
      <div class="ins-grid">
        ${sessionsCard}
        ${concernsCard}
        ${outcomesCard}
        ${checkInCard}
      </div>
      <div class="ins-tip" role="tooltip" hidden>
        <strong class="ins-tip-value"></strong>
        <span class="ins-tip-title"></span>
      </div>
    </div>`;

  bindTooltip(container);
  return range.key;
}

// One tooltip for the page; text set with textContent
function bindTooltip(container) {
  const page = container.querySelector(".ins-page");
  const tip = container.querySelector(".ins-tip");
  if (!page || !tip) return;

  const show = (el) => {
    tip.querySelector(".ins-tip-value").textContent =
      el.getAttribute("data-tip-value");
    tip.querySelector(".ins-tip-title").textContent =
      el.getAttribute("data-tip-title");
    tip.hidden = false;
    const box = el.getBoundingClientRect();
    const host = page.getBoundingClientRect();
    // Keep the whole tooltip inside the page, measured after its text is set
    const half = tip.offsetWidth / 2;
    const left = box.left - host.left + box.width / 2;
    tip.style.left = `${Math.min(Math.max(left, half), host.width - half)}px`;
    tip.style.top = `${box.top - host.top}px`;
  };
  const hide = () => {
    tip.hidden = true;
  };

  page.addEventListener("pointerover", (e) => {
    const el = e.target.closest("[data-tip-value]");
    if (el) show(el);
  });
  page.addEventListener("pointerout", (e) => {
    if (e.target.closest("[data-tip-value]")) hide();
  });
  page.addEventListener("focusin", (e) => {
    const el = e.target.closest("[data-tip-value]");
    if (el) show(el);
  });
  page.addEventListener("focusout", hide);
}

// Exposed for tests
export const testHelpers = { niceTicks, mondayOf, weeksBetween };
