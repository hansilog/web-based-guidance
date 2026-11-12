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
  let previous = null;
  const apps = getAppointments().map((a) => {
    if (a.id !== id) return a;
    previous = a;
    updated = { ...a, ...changes, updatedAt: new Date().toISOString() };
    // A new date or time needs fresh reminders
    if (updated.date !== a.date || updated.time !== a.time) {
      updated.reminders = {};
    }
    return updated;
  });
  saveAppointments(apps);
  if (previous) releaseSlotIfFreed(previous, updated);
  return updated;
}

// --- 2. DATES & TIMES ---

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

// --- 2b. OFFICE SETTINGS (set by the admin) ---

// Hours are whole 24-hour numbers; lunchHour null means no lunch break.
// holidays: [{ date: "YYYY-MM-DD", name }] closes the office for everyone.
export const DEFAULT_SETTINGS = {
  openHour: 8,
  closeHour: 17,
  lunchHour: 12,
  holidays: [],
};

export function getSettings() {
  return { ...DEFAULT_SETTINGS, ...read("gh_settings", {}) };
}

export const saveSettings = (settings) => write("gh_settings", settings);

// One-hour session start times inside office hours, skipping lunch
export function getSlots(settings = getSettings()) {
  const slots = [];
  for (let h = settings.openHour; h < settings.closeHour; h++) {
    if (h !== settings.lunchHour)
      slots.push(`${String(h).padStart(2, "0")}:00`);
  }
  return slots;
}

export function getHoliday(date) {
  return getSettings().holidays.find((h) => h.date === date) || null;
}

const hourLabel = (h) => `${h % 12 || 12}${h >= 12 ? "PM" : "AM"}`;

// e.g. "Mon–Fri, 8AM – 5PM (lunch 12–1PM)"
export function officeHoursText(settings = getSettings()) {
  const lunch =
    settings.lunchHour == null
      ? ""
      : ` (lunch ${settings.lunchHour % 12 || 12}–${hourLabel(settings.lunchHour + 1)})`;
  return `Mon–Fri, ${hourLabel(settings.openHour)} – ${hourLabel(settings.closeHour)}${lunch}`;
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
  const holiday = getHoliday(date);
  if (holiday) {
    return `The guidance office is closed on this day (${holiday.name}).`;
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
  return getSlots().map((time) => {
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

// --- 7. WAITLIST: students waiting for a taken time ---
// Entry: { id, studentId, date, time, counselorId (number or "auto"), createdAt, notifiedAt }

export const getWaitlist = () => read("gh_waitlist", []);
export const saveWaitlist = (list) => write("gh_waitlist", list);

// Drop entries whose time has passed
function liveWaitlist() {
  const now = new Date();
  return getWaitlist().filter((w) => appointmentStart(w) > now);
}

export function getMyWaitlist(studentId) {
  return liveWaitlist()
    .filter((w) => w.studentId === studentId)
    .sort((a, b) => appointmentStart(a) - appointmentStart(b));
}

export function isOnWaitlist(studentId, date, time, counselorId) {
  return getWaitlist().some(
    (w) =>
      w.studentId === studentId &&
      w.date === date &&
      w.time === time &&
      w.counselorId === counselorId,
  );
}

export function joinWaitlist({ studentId, date, time, counselorId }) {
  if (isOnWaitlist(studentId, date, time, counselorId)) return false;
  saveWaitlist([
    ...liveWaitlist(),
    {
      id: Date.now() + Math.random(),
      studentId,
      date,
      time,
      counselorId,
      createdAt: new Date().toISOString(),
      notifiedAt: null,
    },
  ]);
  return true;
}

export function leaveWaitlist(entryId) {
  saveWaitlist(getWaitlist().filter((w) => w.id !== entryId));
}

// Once a student has a booking that day, their waitlist entries for it are done
export function clearWaitlistForDay(studentId, date) {
  saveWaitlist(
    getWaitlist().filter(
      (w) => !(w.studentId === studentId && w.date === date),
    ),
  );
}

// Tell everyone waiting for this time that it is open. First to book gets it.
export function notifyWaitlist(date, time, counselorId) {
  const start = appointmentStart({ date, time });
  if (start <= new Date()) return 0;
  let count = 0;
  const list = liveWaitlist().map((w) => {
    const matches =
      w.date === date &&
      w.time === time &&
      (w.counselorId === "auto" || w.counselorId === counselorId);
    if (!matches || !isCounselorFree(counselorId, date, time)) return w;
    count += 1;
    addNotification(
      w.studentId,
      `A spot opened up on ${parseDate(date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} at ${formatTime12(time)}. Book it from your Dashboard before someone else does.`,
    );
    return { ...w, notifiedAt: new Date().toISOString() };
  });
  saveWaitlist(list);
  return count;
}

// Every slot of a day, e.g. after a counselor removes a day off
export function notifyWaitlistForDay(date, counselorId) {
  getSlots().forEach((time) => notifyWaitlist(date, time, counselorId));
}

// Called by updateAppointment: an active booking that leaves its slot frees it
function releaseSlotIfFreed(before, after) {
  if (!ACTIVE_STATUSES.includes(before.status) || !before.counselorId) return;
  const moved =
    !ACTIVE_STATUSES.includes(after.status) ||
    after.date !== before.date ||
    after.time !== before.time ||
    after.counselorId !== before.counselorId;
  if (moved) notifyWaitlist(before.date, before.time, before.counselorId);
}

// --- 8. ANONYMOUS CONCERNS ---
// { id, ref, category, description, location, when, contact,
//   status: "new" | "reviewing" | "resolved", response, internalNotes,
//   handledBy, createdAt, updatedAt }

export const CONCERN_CATEGORIES = [
  "Bullying",
  "Harassment",
  "Worried about a friend",
  "Safety concern on campus",
  "Discrimination",
  "Other",
];

export const CONCERN_STATUSES = {
  new: "New",
  reviewing: "Being reviewed",
  resolved: "Resolved",
};

export const getConcerns = () => read("gh_concerns", []);
export const saveConcerns = (list) => write("gh_concerns", list);

// Short code the reporter keeps to check for a reply (no look-alike characters)
function makeConcernRef() {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const taken = new Set(getConcerns().map((c) => c.ref));
  let ref = "";
  do {
    const rand = crypto.getRandomValues(new Uint32Array(6));
    ref = `GC-${Array.from(rand, (n) => chars[n % chars.length]).join("")}`;
  } while (taken.has(ref));
  return ref;
}

export function addConcern(fields) {
  const stamp = new Date().toISOString();
  const concern = {
    id: Date.now(),
    ref: makeConcernRef(),
    status: "new",
    response: "",
    internalNotes: "",
    handledBy: null,
    createdAt: stamp,
    updatedAt: stamp,
    ...fields,
  };
  saveConcerns([...getConcerns(), concern]);
  return concern;
}

export function updateConcern(id, changes) {
  let updated = null;
  saveConcerns(
    getConcerns().map((c) => {
      if (c.id !== id) return c;
      updated = { ...c, ...changes, updatedAt: new Date().toISOString() };
      return updated;
    }),
  );
  return updated;
}

export function findConcernByRef(ref) {
  const clean = String(ref || "")
    .trim()
    .toUpperCase();
  return getConcerns().find((c) => c.ref === clean) || null;
}
