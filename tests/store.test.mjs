// Logic tests for store.js, checkin.js and reminders.js in localStorage mode.
// Run with: npm test
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const src = path.join(fileURLToPath(new URL("..", import.meta.url)), "src");
const mem = new Map();
globalThis.window = globalThis;
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};
const load = (f) => import(pathToFileURL(path.join(src, f)).href);

const store = await load("store.js");
const { scoreCheckIn } = await load("checkin.js");
const { runReminders } = await load("reminders.js");

let passed = 0;
const test = (name, fn) => {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
};

// Next weekday at least `days` ahead
function weekday(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return store.toDateStr(d);
}

store.saveUsers([
  { id: 1, role: "student", name: "A", email: "a@x.com", active: true },
  { id: 99, role: "student", name: "B", email: "b@x.com", active: true },
  { id: 2, role: "guidance", name: "C1", active: true },
  { id: 4, role: "guidance", name: "C2", active: true },
]);

test("default slots match the old fixed SLOTS", () => {
  assert.deepEqual(store.getSlots(), [
    "08:00",
    "09:00",
    "10:00",
    "11:00",
    "13:00",
    "14:00",
    "15:00",
    "16:00",
  ]);
  assert.equal(store.officeHoursText(), "Mon–Fri, 8AM – 5PM (lunch 12–1PM)");
});

test("custom office hours change the slots", () => {
  store.saveSettings({
    ...store.getSettings(),
    openHour: 9,
    closeHour: 16,
    lunchHour: null,
  });
  assert.deepEqual(store.getSlots(), [
    "09:00",
    "10:00",
    "11:00",
    "12:00",
    "13:00",
    "14:00",
    "15:00",
  ]);
  assert.equal(store.officeHoursText(), "Mon–Fri, 9AM – 4PM");
  store.saveSettings({ ...store.DEFAULT_SETTINGS });
});

test("holidays block booking", () => {
  const day = weekday(5);
  assert.equal(store.checkDate(day, 2), "");
  store.saveSettings({
    ...store.getSettings(),
    holidays: [{ date: day, name: "Test Day" }],
  });
  assert.match(store.checkDate(day, 2), /closed on this day \(Test Day\)/);
  store.saveSettings({ ...store.DEFAULT_SETTINGS });
});

const day = weekday(3);
const base = {
  studentId: 1,
  studentName: "A",
  counselorId: 2,
  counselorName: "C1",
  type: "Academic Guidance",
  date: day,
  time: "10:00",
  status: "approved",
  createdAt: new Date().toISOString(),
};

test("waitlist: cancelling notifies waiting students (specific + auto)", () => {
  store.saveAppointments([{ ...base, id: 500 }]);
  assert.equal(store.isCounselorFree(2, day, "10:00"), false);
  assert.equal(
    store.joinWaitlist({
      studentId: 99,
      date: day,
      time: "10:00",
      counselorId: 2,
    }),
    true,
  );
  assert.equal(
    store.joinWaitlist({
      studentId: 99,
      date: day,
      time: "10:00",
      counselorId: 2,
    }),
    false,
    "no duplicates",
  );
  store.joinWaitlist({
    studentId: 7,
    date: day,
    time: "10:00",
    counselorId: "auto",
  });
  store.joinWaitlist({
    studentId: 8,
    date: day,
    time: "10:00",
    counselorId: 4,
  }); // other counselor

  store.updateAppointment(500, { status: "cancelled" });
  const notified = (id) =>
    store.getNotifications(id).some((n) => /spot opened up/.test(n.message));
  assert.ok(notified(99));
  assert.ok(notified(7));
  assert.ok(!notified(8), "waiting for a different counselor");
  const entry = store.getMyWaitlist(99)[0];
  assert.ok(entry.notifiedAt);
});

test("waitlist: rescheduling frees the old slot and resets reminders", () => {
  store.saveWaitlist([]);
  store.saveAppointments([{ ...base, id: 600, reminders: { day: true } }]);
  store.joinWaitlist({
    studentId: 99,
    date: day,
    time: "10:00",
    counselorId: 2,
  });
  const moved = store.updateAppointment(600, {
    time: "11:00",
    status: "pending",
  });
  assert.deepEqual(moved.reminders, {});
  assert.ok(store.getMyWaitlist(99)[0].notifiedAt);
});

test("waitlist: non-moving updates don't notify", () => {
  store.saveWaitlist([]);
  store.saveAppointments([{ ...base, id: 700 }]);
  store.joinWaitlist({
    studentId: 99,
    date: day,
    time: "10:00",
    counselorId: 2,
  });
  store.updateAppointment(700, { counselorNotes: "Bring ID" });
  assert.equal(store.getMyWaitlist(99)[0].notifiedAt, null);
});

test("waitlist: booking a day clears that day's entries", () => {
  store.clearWaitlistForDay(99, day);
  assert.equal(store.getMyWaitlist(99).length, 0);
});

test("reminders: day-before once, then hour-before", () => {
  const start = new Date(Date.now() + 23 * 3600000);
  start.setMinutes(0, 0, 0);
  const app = {
    ...base,
    id: 800,
    studentId: 1,
    date: store.toDateStr(start),
    time: `${String(start.getHours()).padStart(2, "0")}:00`,
  };
  store.saveAppointments([app]);
  const reminders = () =>
    store
      .getNotifications(1)
      .filter((n) => /Reminder|Starting soon/.test(n.message)).length;
  const before = reminders();
  assert.equal(runReminders(), 1);
  assert.equal(runReminders(), 0, "no repeat");
  assert.equal(reminders(), before + 1);
  const soon = new Date(start.getTime() - 30 * 60000);
  assert.equal(runReminders(soon), 1);
  assert.equal(runReminders(soon), 0);
  const saved = store.getAppointments()[0];
  assert.deepEqual(saved.reminders, { day: true, hour: true });
});

test("reminders: pending, past and walk-in sessions are skipped", () => {
  store.saveAppointments([
    { ...base, id: 900, status: "pending", date: weekday(0) },
    { ...base, id: 901, walkIn: true, status: "approved" },
  ]);
  assert.equal(
    runReminders(
      new Date(store.appointmentStart({ date: day, time: "09:30" })),
    ),
    0,
  );
});

test("check-in scoring and flags", () => {
  assert.deepEqual(scoreCheckIn([0, 0, 0, 0, 0]), {
    score: 0,
    level: "Low",
    safetyFlag: false,
    flagged: false,
  });
  assert.equal(scoreCheckIn([1, 1, 1, 2, 0]).level, "Moderate");
  assert.equal(scoreCheckIn([3, 3, 2, 2, 0]).flagged, true);
  const safety = scoreCheckIn([0, 0, 0, 0, 1]);
  assert.equal(safety.safetyFlag, true);
  assert.equal(safety.flagged, true);
});

test("concerns: add, look up by code, update", () => {
  const c = store.addConcern({
    category: "Bullying",
    description: "x".repeat(30),
    contact: "",
  });
  assert.match(c.ref, /^GC-[A-Z2-9]{6}$/);
  assert.equal(store.findConcernByRef(c.ref.toLowerCase())?.id, c.id);
  assert.equal(store.findConcernByRef("GC-NOPE00"), null);
  const u = store.updateConcern(c.id, {
    status: "resolved",
    response: "Handled",
  });
  assert.equal(u.status, "resolved");
  assert.equal(store.findConcernByRef(c.ref).response, "Handled");
});

test("users: login lookup, duplicate check, update + appointment sync", () => {
  store.saveUsers([
    {
      id: 1,
      user: "JohnDoe",
      email: "John@X.com",
      role: "student",
      name: "John",
    },
  ]);
  assert.equal(store.findUserByLogin(" johndoe ")?.id, 1);
  assert.equal(store.findUserByLogin("JOHN@x.com")?.id, 1);
  assert.equal(store.findUserByLogin("nobody"), null);
  assert.equal(store.isUsernameOrEmailTaken("JOHNDOE", "new@x.com"), true);
  assert.equal(store.isUsernameOrEmailTaken("other", "john@x.com"), true);
  assert.equal(
    store.isUsernameOrEmailTaken("johndoe", "john@x.com", 1),
    false,
    "own record ignored",
  );
  store.addUser({
    id: 2,
    user: "jane",
    email: "jane@x.com",
    role: "student",
    name: "Jane",
  });
  assert.equal(store.getUsers().length, 2);
  store.saveAppointments([
    { id: 1, studentId: 1, studentName: "John", studentEmail: "John@X.com" },
  ]);
  const u = store.updateUser(1, { name: "John D", email: "jd@x.com" });
  store.syncStudentOnAppointments(u);
  assert.equal(store.getAppointments()[0].studentName, "John D");
  assert.equal(store.getAppointments()[0].studentEmail, "jd@x.com");
  assert.equal(store.updateUser(999, { name: "x" }), null);
});

test("seeding: hasCollection sees an empty saved list", () => {
  mem.delete("gh_users");
  assert.equal(store.hasCollection("gh_users"), false);
  store.saveUsers([]);
  assert.equal(store.hasCollection("gh_users"), true);
});

test("activity log is capped and window.logActivity writes to it", () => {
  for (let i = 0; i < 1005; i++)
    window.logActivity({ name: "A", role: "student" }, `act ${i}`);
  const logs = store.getActivityLogs();
  assert.equal(logs.length, 1000);
  assert.equal(logs.at(-1).action, "act 1004");
});

test("broadcasts are stored newest first", () => {
  store.addBroadcast("first");
  store.addBroadcast("second");
  assert.equal(store.getBroadcasts()[0].message, "second");
});

const { computeInsights, testHelpers } = await load("insights.js");

test("insights: tiles count the counselor's own sessions in range", () => {
  const now = new Date();
  const ago = (days, time = "10:00") => {
    const d = new Date(now.getTime() - days * 86400000);
    return { date: store.toDateStr(d), time };
  };
  const base = { counselorId: 2, studentId: 1, type: "Academic Guidance" };
  const iso = (days, hours = 0) =>
    new Date(now.getTime() - days * 86400000 + hours * 3600000).toISOString();
  store.saveAppointments([
    { ...base, id: 1, ...ago(3), status: "completed", feedback: { rating: 5 } },
    { ...base, id: 2, ...ago(10), status: "completed", walkIn: true },
    {
      ...base,
      id: 3,
      ...ago(12),
      status: "completed",
      feedback: { rating: 3 },
    },
    { ...base, id: 4, ...ago(5), status: "no-show" },
    { ...base, id: 5, ...ago(6), status: "cancelled", type: "Grief / Loss" },
    {
      ...base,
      id: 6,
      ...ago(8),
      status: "rejected",
      createdAt: iso(9),
      decidedAt: iso(9, 4),
    },
    {
      ...base,
      id: 7,
      ...ago(4),
      status: "approved",
      createdAt: iso(5),
      decidedAt: iso(5, 2),
      checkIn: { level: "High", safetyFlag: true },
    },
    { ...base, id: 8, ...ago(40), status: "completed" }, // previous 30 days
    { ...base, id: 9, ...ago(2), status: "completed", counselorId: 4 }, // someone else
  ]);
  const d = computeInsights(2, 30, now);
  assert.equal(d.sessions, 3);
  assert.equal(d.prevSessions, 1);
  assert.equal(d.walkIns, 1);
  // 1 no-show out of 2 booked completed + 1 no-show
  assert.equal(d.noShowRate, 33);
  assert.equal(d.avgRating, 4);
  assert.equal(d.avgResponseHours, 3);
  assert.equal(
    d.perWeek.reduce((s, w) => s + w.count, 0),
    3,
  );
  assert.deepEqual(
    d.outcomes.map((o) => [o.status, o.count]),
    [
      ["completed", 3],
      ["no-show", 1],
      ["cancelled", 1],
      ["rejected", 1],
    ],
  );
  assert.equal(d.checkIns, 1);
  assert.equal(d.safetyFlags, 1);
  assert.equal(
    d.checkInWeeks.reduce((s, w) => s + w.levels[2], 0),
    1,
  );
  assert.equal(d.concerns[0].type, "Academic Guidance");
});

test("insights: more than 6 concern types fold into 'Other types'", () => {
  const today = store.toDateStr(new Date(Date.now() - 86400000));
  store.saveAppointments(
    ["A", "B", "C", "D", "E", "F", "G", "H"].map((t, i) => ({
      id: 100 + i,
      counselorId: 2,
      studentId: 1,
      type: `Type ${t}`,
      date: today,
      time: "09:00",
      status: "pending",
    })),
  );
  const d = computeInsights(2, 30);
  assert.equal(d.concerns.length, 6);
  assert.equal(d.concerns[5].type, "Other types");
  assert.equal(d.concerns[5].count, 3);
});

test("insights: clean axis ticks and Monday weeks", () => {
  assert.deepEqual(testHelpers.niceTicks(5), [0, 2, 4, 6]);
  assert.deepEqual(testHelpers.niceTicks(23), [0, 10, 20, 30]);
  assert.deepEqual(testHelpers.niceTicks(0), [0, 1]);
  const monday = testHelpers.mondayOf(new Date(2026, 10, 14)); // Saturday
  assert.equal(monday.getDay(), 1);
  assert.equal(monday.getDate(), 9);
});

const { getMyCheckIns } = await load("wellbeing.js");

test("my wellbeing: only my check-ins, oldest first", () => {
  const ci = (score, level) => ({ answers: [1, 1, 1, 0, 0], score, level });
  store.saveAppointments([
    {
      id: 1,
      studentId: 1,
      type: "A",
      date: "2026-10-05",
      time: "09:00",
      checkIn: ci(8, "Moderate"),
    },
    {
      id: 2,
      studentId: 1,
      type: "B",
      date: "2026-09-01",
      time: "09:00",
      checkIn: ci(3, "Low"),
    },
    { id: 3, studentId: 1, type: "C", date: "2026-10-10", time: "09:00" }, // no check-in
    {
      id: 4,
      studentId: 99,
      type: "D",
      date: "2026-10-01",
      time: "09:00",
      checkIn: ci(12, "High"),
    },
  ]);
  const mine = getMyCheckIns(1);
  assert.deepEqual(
    mine.map((c) => [c.date, c.score, c.level]),
    [
      ["2026-09-01", 3, "Low"],
      ["2026-10-05", 8, "Moderate"],
    ],
  );
  assert.equal(getMyCheckIns(5).length, 0);
});

const { getStudentsToCheckOn } = await load("checkon.js");

test("check-on list: safety flags, two Highs, missed and not rebooked", () => {
  const now = new Date();
  const day = (offset) =>
    store.toDateStr(new Date(now.getTime() + offset * 86400000));
  const a = (id, studentId, offset, extra) => ({
    id,
    studentId,
    studentName: `S${studentId}`,
    counselorId: 2,
    type: "T",
    date: day(offset),
    time: "09:00",
    status: "completed",
    ...extra,
  });
  const high = { level: "High", score: 11, answers: [3, 3, 3, 2, 0] };
  store.saveAppointments([
    // S1: safety flag 5 days ago -> listed, priority 1
    a(1, 1, -5, { checkIn: { ...high, safetyFlag: true } }),
    // S2: two Highs in a row -> listed
    a(2, 2, -20, { checkIn: high }),
    a(3, 2, -6, { checkIn: high }),
    // S3: no-show 4 days ago, nothing booked after -> listed
    a(4, 3, -4, { status: "no-show" }),
    // S4: no-show but rebooked -> not listed
    a(5, 4, -4, { status: "no-show" }),
    a(6, 4, 3, { status: "pending" }),
    // S5: one High then Low -> not listed
    a(7, 5, -10, { checkIn: high }),
    a(8, 5, -2, {
      checkIn: { level: "Low", score: 3, answers: [1, 1, 1, 0, 0] },
    }),
    // S6: safety flag but for another counselor -> not mine
    a(9, 6, -3, { counselorId: 4, checkIn: { ...high, safetyFlag: true } }),
    // S7: old safety flag (60 days) -> not listed
    a(10, 7, -60, { checkIn: { ...high, safetyFlag: true } }),
  ]);
  const rows = getStudentsToCheckOn(2, now);
  assert.deepEqual(
    rows.map((r) => r.studentId),
    [1, 2, 3],
  );
  assert.equal(rows[0].reasons[0].kind, "safety");
  assert.equal(rows[1].reasons[0].kind, "highTwice");
  assert.equal(rows[2].reasons[0].kind, "missed");
  assert.equal(rows[0].triggerId, 1);
});

test("check-on list: reaching out marks the row and moves it last for a week", () => {
  const now = new Date();
  const appt = (id, studentId, extra) => ({
    id,
    studentId,
    studentName: `S${studentId}`,
    counselorId: 2,
    type: "T",
    date: store.toDateStr(new Date(now.getTime() - 3 * 86400000)),
    time: "09:00",
    status: "completed",
    checkIn: {
      level: "High",
      score: 12,
      answers: [3, 3, 3, 2, 1],
      safetyFlag: true,
    },
    ...extra,
  });
  store.saveAppointments([
    appt(1, 1, {
      checkedOnAt: new Date(now.getTime() - 86400000).toISOString(),
    }),
    appt(2, 2, {}),
    appt(3, 3, {
      checkedOnAt: new Date(now.getTime() - 10 * 86400000).toISOString(),
    }), // too long ago
  ]);
  const rows = getStudentsToCheckOn(2, now);
  assert.deepEqual(
    rows.map((r) => [r.studentId, Boolean(r.reachedAt)]),
    [
      [2, false],
      [3, false],
      [1, true],
    ],
  );
});

test("online sessions: only https links; Join opens 10 min before, closes after an hour", () => {
  assert.equal(
    store.isMeetingLink("https://meet.google.com/abc-defg-hij"),
    true,
  );
  assert.equal(store.isMeetingLink("  https://zoom.us/j/123  "), true);
  assert.equal(store.isMeetingLink("http://meet.google.com/abc"), false);
  assert.equal(store.isMeetingLink("javascript:alert(1)"), false);
  assert.equal(store.isMeetingLink("meet.google.com/abc"), false);
  assert.equal(store.isMeetingLink(""), false);

  assert.equal(store.isOnlineSession({ mode: "Online (video call)" }), true);
  assert.equal(store.isOnlineSession({ mode: "In-person" }), false);

  const app = {
    status: "approved",
    meetingLink: "https://meet.google.com/x",
    date: "2026-11-16",
    time: "15:00",
  };
  const at = (h, m) => new Date(2026, 10, 16, h, m);
  assert.equal(store.joinWindow(app, at(14, 49)).state, "early");
  assert.equal(store.joinWindow(app, at(14, 50)).state, "open");
  assert.equal(store.joinWindow(app, at(15, 59)).state, "open");
  assert.equal(store.joinWindow(app, at(16, 1)).state, "over");
  assert.equal(store.joinWindow({ ...app, meetingLink: null }), null);
  assert.equal(store.joinWindow({ ...app, status: "pending" }), null);
});

const { NOTE_TEMPLATES } = await load("guidanceView.js");
const { caseSummaryHtml } = await load("caseSummary.js");

test("note templates: headings separated by blank lines", () => {
  const general = NOTE_TEMPLATES.find((t) => t.key === "general");
  assert.equal(
    general.text,
    "Concern:\n\nWhat we discussed:\n\nPlan:\n\nNext steps:\n",
  );
  assert.deepEqual(
    NOTE_TEMPLATES.map((t) => t.key),
    ["general", "academic", "wellbeing", "career"],
  );
  assert.ok(
    NOTE_TEMPLATES.find((t) => t.key === "wellbeing").text.includes(
      "Risk check",
    ),
  );
});

test("case summary: private notes only when asked, names escaped", () => {
  const student = {
    name: "Ana <b>Cruz</b>",
    course: "BSIT",
    section: "3A",
    yearLevel: "3rd Year",
    email: "ana@x.com",
  };
  const apps = [
    {
      date: "2026-10-01",
      time: "09:00",
      type: "Personal Concern",
      status: "completed",
      caseNotes: "SECRET NOTE",
      counselorName: "Ms. C",
      followUp: true,
      feedback: { rating: 4 },
      checkIn: { level: "High", score: 11, safetyFlag: true },
    },
    {
      date: "2026-10-20",
      time: "13:00",
      type: "Academic Guidance",
      status: "no-show",
      counselorName: "Ms. C",
    },
  ];
  const plain = caseSummaryHtml(student, apps, { printedBy: "Ms. C" });
  assert.ok(!plain.includes("SECRET NOTE"), "notes left out by default");
  assert.ok(plain.includes("Private case notes are not included"));
  assert.ok(plain.includes("Ana &lt;b&gt;Cruz&lt;/b&gt;"), "name escaped");
  assert.ok(!plain.includes("<b>Cruz</b>"));
  assert.ok(plain.includes("1 check-in with a safety flag"));
  assert.ok(plain.includes("Confidential"));
  const withNotes = caseSummaryHtml(student, apps, { includeNotes: true });
  assert.ok(withNotes.includes("SECRET NOTE"));
});

console.log(`\n${passed} tests passed`);
