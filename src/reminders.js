// reminders.js
// --- SESSION REMINDERS: a day before and an hour before approved sessions ---
// With no backend, reminders go out while the app is open in a browser.
// Once the database is in place, this check belongs in a scheduled server job.
import emailjs from "@emailjs/browser";
import {
  getAppointments,
  saveAppointments,
  addNotification,
  appointmentStart,
  formatTime12,
  parseDate,
} from "./store.js";

const HOUR = 60 * 60 * 1000;
const CHECK_EVERY_MS = 60 * 1000;

function whenText(app) {
  const day = parseDate(app.date).toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
  return `${day} at ${formatTime12(app.time)}`;
}

function emailReminder(app, message) {
  if (!app.studentEmail) return;
  emailjs
    .send("service_mtv9cbi", "template_mublumh", {
      subject_line: "Reminder: Your Guidance Session",
      to_email: app.studentEmail,
      recipient_name: app.studentName,
      header_title: "Session Reminder",
      main_message: message,
      app_type: app.type,
      app_date: app.date,
      app_time: formatTime12(app.time),
      status: "Approved",
      notes: app.counselorNotes || "Please arrive on time.",
    })
    .catch(() => {
      // The in-app notification still reaches the student
    });
}

// Sends any reminders that are due. Returns how many were sent.
export function runReminders(now = new Date()) {
  const apps = getAppointments();
  const due = [];

  const updated = apps.map((app) => {
    if (app.status !== "approved" || app.walkIn) return app;
    const msLeft = appointmentStart(app) - now;
    if (msLeft <= 0) return app;

    const sent = app.reminders || {};
    if (msLeft <= HOUR && !sent.hour) {
      due.push({ app, kind: "hour" });
      // An hour-before reminder covers the day-before one too
      return { ...app, reminders: { ...sent, day: true, hour: true } };
    }
    if (msLeft <= 24 * HOUR && !sent.day) {
      due.push({ app, kind: "day" });
      return { ...app, reminders: { ...sent, day: true } };
    }
    return app;
  });

  if (due.length === 0) return 0;
  // Save first so another open tab doesn't send the same reminder
  saveAppointments(updated);

  due.forEach(({ app, kind }) => {
    const who = app.counselorName || "your counselor";
    if (kind === "hour") {
      addNotification(
        app.studentId,
        `Starting soon: your ${app.type} session with ${who} is at ${formatTime12(app.time)} today.`,
      );
      if (app.counselorId) {
        addNotification(
          app.counselorId,
          `Coming up at ${formatTime12(app.time)}: ${app.type} session with ${app.studentName}.`,
        );
      }
    } else {
      const message = `Reminder: your ${app.type} session with ${who} is on ${whenText(app)}. If you can't make it, please reschedule or cancel from your Dashboard.`;
      addNotification(app.studentId, message);
      emailReminder(app, message);
    }
  });
  return due.length;
}

let timer = null;

export function startReminderService() {
  runReminders();
  if (!timer) timer = setInterval(runReminders, CHECK_EVERY_MS);
}
