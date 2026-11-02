// store.js
// --- SHARED DATA LAYER: storage access + scheduling rules ---
import { hashPassword } from "./syncUtil.js";

function read(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

// --- 1. COLLECTIONS ---

export const getUsers = () => read("gh_users", []);
export const saveUsers = (users) => write("gh_users", users);

export const getAppointments = () => read("gh_appointments", []);
export const saveAppointments = (apps) => write("gh_appointments", apps);

// Counselor days off: [{ counselorId, date, reason }]
export const getBlocks = () => read("gh_counselor_blocks", []);
export const saveBlocks = (blocks) => write("gh_counselor_blocks", blocks);

export const getUserById = (id) => getUsers().find((u) => u.id === id);

// Active counselors only (deactivated staff can't take new bookings)
export const getCounselors = () =>
  getUsers().filter((u) => u.role === "guidance" && u.active !== false);

export function updateAppointment(id, changes) {
  let updated = null;
  const apps = getAppointments().map((a) => {
    if (a.id !== id) return a;
    updated = { ...a, ...changes, updatedAt: new Date().toISOString() };
    return updated;
  });
  saveAppointments(apps);
  return updated;
}

// --- 2. DATES & TIMES ---

// One-hour sessions inside office hours, lunch break at 12:00
export const SLOTS = [
  "08:00",
  "09:00",
  "10:00",
  "11:00",
  "13:00",
  "14:00",
  "15:00",
  "16:00",
];
export const ACTIVE_STATUSES = ["pending", "approved"];
export const MAX_DAYS_AHEAD = 60;

export const COUNSELING_TYPES = [
  "Academic Guidance",
  "Career Consultation",
  "Personal Concern",
  "Family Concern",
  "Bullying / Peer Conflict",
  "Behavioral Concern",
  "Grief / Loss",
  "Scholarship / Financial",
  "Other",
];
export const SESSION_MODES = ["In-person", "Online (video call)"];

export function toDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Parse "YYYY-MM-DD" as a LOCAL date (new Date("YYYY-MM-DD") would be UTC)
export function parseDate(str) {
  const [y, m, d] = String(str).split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function appointmentStart(app) {
  const start = parseDate(app.date);
  const [h, min] = String(app.time || "00:00")
    .split(":")
    .map(Number);
  start.setHours(h || 0, min || 0, 0, 0);
  return start;
}

export function formatTime12(time) {
  if (!/^\d{1,2}:\d{2}$/.test(time || "")) return time || "";
  const [h, m] = time.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${suffix}`;
}

export function to24h(time) {
  const match = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(
    String(time || "").trim(),
  );
  if (!match) return time;
  let h = Number(match[1]) % 12;
  if (match[3].toUpperCase() === "PM") h += 12;
  return `${String(h).padStart(2, "0")}:${match[2]}`;
}

// --- 3. AVAILABILITY ---

export function isDayOff(counselorId, date) {
  return getBlocks().some(
    (b) => b.counselorId === counselorId && b.date === date,
  );
}

// Returns a reason the date can't be booked, or "" when it's fine
export function checkDate(date, counselorId = null) {
  if (!date) return "Pick a date.";
  const day = parseDate(date);
  const today = parseDate(toDateStr(new Date()));
  if (day < today) return "That date has already passed.";
  if (day.getDay() === 0 || day.getDay() === 6) {
    return "The guidance office is closed on weekends.";
  }
  if ((day - today) / 86400000 > MAX_DAYS_AHEAD) {
    return `You can book up to ${MAX_DAYS_AHEAD} days ahead.`;
  }
  if (typeof counselorId === "number" && isDayOff(counselorId, date)) {
    return "This counselor is not available on this day.";
  }
  if (
    counselorId === "auto" &&
    getCounselors().every((c) => isDayOff(c.id, date))
  ) {
    return "No counselors are available on this day.";
  }
  return "";
}

export function isCounselorFree(counselorId, date, time, ignoreAppId = null) {
  if (isDayOff(counselorId, date)) return false;
  return !getAppointments().some(
    (a) =>
      a.id !== ignoreAppId &&
      a.counselorId === counselorId &&
      a.date === date &&
      a.time === time &&
      ACTIVE_STATUSES.includes(a.status),
  );
}

// Every slot for a date with whether it can be booked.
// counselorId may be a counselor's id, or "auto" for "any available counselor".
export function getSlotStates(date, counselorId, ignoreAppId = null) {
  const now = new Date();
  const counselors = getCounselors();
  return SLOTS.map((time) => {
    const start = appointmentStart({ date, time });
    if (start <= now) return { time, free: false, reason: "Past" };
    const free =
      counselorId === "auto"
        ? counselors.some((c) => isCounselorFree(c.id, date, time, ignoreAppId))
        : isCounselorFree(counselorId, date, time, ignoreAppId);
    return { time, free, reason: free ? "" : "Booked" };
  });
}

// Free counselor with the fewest active appointments (ties: lowest id)
export function autoAssignCounselor(date, time) {
  const apps = getAppointments();
  const load = (c) =>
    apps.filter(
      (a) => a.counselorId === c.id && ACTIVE_STATUSES.includes(a.status),
    ).length;
  return (
    getCounselors()
      .filter((c) => isCounselorFree(c.id, date, time))
      .sort((a, b) => load(a) - load(b) || a.id - b.id)[0] || null
  );
}

// Where emails about an appointment go: its counselor, or every counselor if unassigned
export function getCounselorTargets(app) {
  const assigned = app.counselorId ? getUserById(app.counselorId) : null;
  const list = assigned ? [assigned] : getCounselors();
  return {
    counselors: list,
    emails: list.map((c) => c.notifyEmail || c.email).join(","),
    name: assigned ? assigned.name : "Guidance Team",
  };
}

// --- 4. IN-APP NOTIFICATIONS ---

export function getNotifications(userId) {
  return read("gh_notifications", [])
    .filter((n) => n.userId === userId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export function addNotification(userId, message) {
  if (userId == null) return;
  const all = read("gh_notifications", []);
  all.push({
    id: Date.now() + Math.random(),
    userId,
    message,
    read: false,
    createdAt: new Date().toISOString(),
  });
  write("gh_notifications", all.slice(-300));
}

export function notifyCounselors(app, message) {
  getCounselorTargets(app).counselors.forEach((c) =>
    addNotification(c.id, message),
  );
}

export function markNotificationsRead(userId) {
  write(
    "gh_notifications",
    read("gh_notifications", []).map((n) =>
      n.userId === userId ? { ...n, read: true } : n,
    ),
  );
}

export function clearNotifications(userId) {
  write(
    "gh_notifications",
    read("gh_notifications", []).filter((n) => n.userId !== userId),
  );
}

// --- 5. MIGRATION OF OLDER SAVED DATA ---

export async function migrateData() {
  const users = getUsers();
  let usersChanged = false;
  await Promise.all(
    users.map(async (u) => {
      // Passwords saved before hashing was enforced are stored as plain text
      if (u.pass && !/^[0-9a-f]{64}$/.test(u.pass)) {
        u.pass = await hashPassword(u.pass);
        usersChanged = true;
      }
      if (u.active === undefined) {
        u.active = true;
        usersChanged = true;
      }
    }),
  );
  if (usersChanged) saveUsers(users);

  const apps = getAppointments();
  const migrated = apps.map((a) => ({ ...a, time: to24h(a.time) }));
  if (migrated.some((a, i) => a.time !== apps[i].time)) {
    saveAppointments(migrated);
  }
}

// --- 6. EXPORT ---

export function toCsv(rows) {
  return rows
    .map((row) =>
      row
        .map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`)
        .join(","),
    )
    .join("\r\n");
}
