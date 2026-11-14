// checkon.js
// --- "STUDENTS TO CHECK ON": counselor's list of students who may need outreach ---
// Built from data the system already has; nothing is sent to the student
// until the counselor chooses "Reach out".
import { getAppointments, appointmentStart } from "./store.js";

const DAY = 86400000;
const ACTIVE = ["pending", "approved"];
// A counselor who reached out within this window sees the row as handled
export const REACHED_DAYS = 7;

const fmt = (date) =>
  date.toLocaleDateString("en-US", { month: "short", day: "numeric" });

// Reasons, most serious first (the number is the sort priority)
const REASONS = {
  safety: 1,
  highTwice: 2,
  missed: 3,
};

export function getStudentsToCheckOn(counselorId, now = new Date()) {
  const mine = getAppointments().filter((a) => a.counselorId === counselorId);
  const byStudent = new Map();
  mine.forEach((a) => {
    if (!byStudent.has(a.studentId)) byStudent.set(a.studentId, []);
    byStudent.get(a.studentId).push(a);
  });

  const rows = [];
  byStudent.forEach((apps, studentId) => {
    apps.sort((a, b) => appointmentStart(a) - appointmentStart(b));
    const reasons = [];
    const triggers = [];

    // 1. A safety flag on a recent (or upcoming) booking's check-in
    const flagged = apps
      .filter(
        (a) =>
          a.checkIn?.safetyFlag &&
          appointmentStart(a) >= new Date(now.getTime() - 30 * DAY) &&
          a.status !== "rejected",
      )
      .pop();
    if (flagged) {
      reasons.push({
        kind: "safety",
        label: `Safety flag on check-in (${fmt(appointmentStart(flagged))})`,
      });
      triggers.push(flagged);
    }

    // 2. The last two check-ins were both High
    const checkIns = apps.filter((a) => a.checkIn?.level);
    const [prev, last] = checkIns.slice(-2);
    if (
      prev &&
      last &&
      prev.checkIn.level === "High" &&
      last.checkIn.level === "High" &&
      appointmentStart(last) >= new Date(now.getTime() - 60 * DAY)
    ) {
      reasons.push({
        kind: "highTwice",
        label: "High check-in twice in a row",
      });
      triggers.push(last);
    }

    // 3. Missed a session in the last 2 weeks and hasn't booked again
    const lastNoShow = apps
      .filter(
        (a) =>
          a.status === "no-show" &&
          appointmentStart(a) >= new Date(now.getTime() - 14 * DAY) &&
          appointmentStart(a) <= now,
      )
      .pop();
    if (
      lastNoShow &&
      !apps.some(
        (a) =>
          appointmentStart(a) > appointmentStart(lastNoShow) &&
          [...ACTIVE, "completed"].includes(a.status),
      )
    ) {
      reasons.push({
        kind: "missed",
        label: `Missed session on ${fmt(appointmentStart(lastNoShow))}, not rebooked`,
      });
      triggers.push(lastNoShow);
    }

    if (reasons.length === 0) return;

    // Most recent outreach on any of the triggering bookings
    const reachedAt = triggers
      .map((a) => a.checkedOnAt)
      .filter(Boolean)
      .sort()
      .pop();
    const reached =
      reachedAt && now - new Date(reachedAt) < REACHED_DAYS * DAY
        ? reachedAt
        : null;
    const next = apps.find(
      (a) => ACTIVE.includes(a.status) && appointmentStart(a) > now,
    );
    const latest = apps[apps.length - 1];

    rows.push({
      studentId,
      studentName: latest.studentName,
      reasons,
      priority: Math.min(...reasons.map((r) => REASONS[r.kind])),
      // The booking that records "Reached out"
      triggerId: triggers[0].id,
      reachedAt: reached,
      nextSession: next ? appointmentStart(next) : null,
    });
  });

  // Not yet reached first, then most serious, then by name
  return rows.sort(
    (a, b) =>
      Boolean(a.reachedAt) - Boolean(b.reachedAt) ||
      a.priority - b.priority ||
      a.studentName.localeCompare(b.studentName),
  );
}
