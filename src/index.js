import emailjs from "@emailjs/browser";
import { renderLoginPage } from "./auth.js";
import { renderStudentView } from "./student.js";
import { renderGuidanceView } from "./guidance.js";
import { renderLandingPage } from "./landing.js";
import { renderAdminView } from "./admin.js";
import { initGoogleAuth, handleSignOut } from "./calendar.js";
import { hashPassword } from "./syncUtil.js";
import {
  getUsers,
  saveUsers,
  saveAppointments,
  hasCollection,
  findUserByLogin,
  isUsernameOrEmailTaken,
  addUser,
  getLoginAttempts,
  saveLoginAttempts,
  migrateData,
  toDateStr,
} from "./store.js";
import { startReminderService } from "./reminders.js";
import {
  isRemote,
  loadAll,
  restoreSession,
  remoteSignIn,
  remoteSignUp,
  remoteSignOut,
} from "./remote.js";
import "./styles/styles.css";
import "./styles/features.css";

const IDLE_LIMIT_MS = 15 * 60 * 1000;

emailjs.init("6_rFpZEVOh3AVEsIM");

// --- UPDATED SEED USERS ---
const seedUsers = async () => {
  if (!hasCollection("gh_users")) {
    const defaultStudentHash = await hashPassword("123");
    const defaultGuidanceHash = await hashPassword("123");
    const otherStudentHash = await hashPassword("pass123");
    const defaultAdminHash = await hashPassword("admin123");

    const initialUsers = [
      {
        id: 1,
        user: "student",
        pass: defaultStudentHash,
        role: "student",
        name: "Rhae",
        email: "parungaorhaessian@gmail.com",
        yearLevel: "3rd Year",
        course: "BSIT",
        section: "3A",
      },
      {
        id: 99,
        user: "johndoe",
        pass: otherStudentHash,
        role: "student",
        name: "John Doe",
        email: "johndoe@example.com",
        yearLevel: "1st Year",
        course: "BSIT",
        section: "1B",
      },
      {
        id: 100,
        user: "janesmith",
        pass: otherStudentHash,
        role: "student",
        name: "Jane Smith",
        email: "janesmith@example.com",
        yearLevel: "4th Year",
        course: "BSED",
        section: "4C",
      },
      {
        id: 2,
        user: "guidance",
        pass: defaultGuidanceHash,
        role: "guidance",
        name: "Ms. Delfin",
        specialty: "Academic & Career Shifting",
        email: "jellopancake213@gmail.com",
      },
      {
        id: 4,
        user: "guidance2",
        pass: defaultGuidanceHash,
        role: "guidance",
        name: "Mr. BossBeza",
        specialty: "Mental Health & Personal Wellness",
        email: "bossbeza@granby.shoo",
      },
      {
        id: 3,
        user: "admin",
        pass: defaultAdminHash,
        role: "admin",
        name: "System Administrator",
        email: "jellopancake213@gmail.com",
      },
    ];
    saveUsers(initialUsers);
  }
};

// Nearest weekday `offset` days from today, as "YYYY-MM-DD"
function weekdayFromToday(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  while (d.getDay() === 0 || d.getDay() === 6) {
    d.setDate(d.getDate() + (offset < 0 ? -1 : 1));
  }
  return toDateStr(d);
}

const seedAppointments = () => {
  if (!hasCollection("gh_appointments")) {
    const initialAppointments = [
      {
        id: Date.now() + 1,
        studentId: 1,
        studentName: "Rhae",
        studentEmail: "parungaorhaessian@gmail.com",
        counselorId: 2,
        counselorName: "Ms. Delfin",
        type: "Academic Guidance",
        date: weekdayFromToday(3),
        time: "10:00",
        notes: "I need help with my shifting process.",
        status: "pending",
        counselorNotes: "",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: Date.now() + 2,
        studentId: 1,
        studentName: "Rhae",
        studentEmail: "parungaorhaessian@gmail.com",
        counselorId: 2,
        counselorName: "Ms. Delfin",
        type: "Career Consultation",
        date: weekdayFromToday(-2),
        time: "14:00",
        notes: "Discussing internship opportunities for BSIT.",
        status: "approved",
        counselorNotes: "Approved. Please bring your draft resume.",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: Date.now() + 3,
        studentId: 99,
        studentName: "John Doe",
        studentEmail: "johndoe@example.com",
        counselorId: 4,
        counselorName: "Mr. BossBeza",
        type: "Personal Concern",
        date: weekdayFromToday(-5),
        time: "09:00",
        notes: "Requesting a mental health break talk.",
        status: "rejected",
        counselorNotes: "Please coordinate with the health office first.",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    saveAppointments(initialAppointments);
  }
};

// --- HANDLERS ---
async function handleLogout() {
  if (isRemote) await remoteSignOut().catch(() => {});
  sessionStorage.removeItem("gh_session");
  sessionStorage.removeItem("gh_entered");
  handleSignOut();
  window.location.reload();
}

// Brute-force protection: lock an identifier after repeated wrong passwords
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_MS = 5 * 60 * 1000;

async function handleLogin(rawIdentifier, p, showError) {
  const identifier = String(rawIdentifier || "")
    .trim()
    .toLowerCase();
  if (!identifier || !p) {
    return showError("Please enter your username/email and password.");
  }

  if (isRemote) {
    // Supabase Auth checks the password and rate-limits guesses itself
    const { profile, error } = await remoteSignIn(identifier, p);
    if (error) return showError(error);
    sessionStorage.setItem("gh_session", JSON.stringify(profile));
    await loadAll(profile);
    window.logActivity(profile, "Logged in");
    const root = document.getElementById("app");
    root.onclick = null;
    root.onchange = null;
    return initApp();
  }

  const attempts = getLoginAttempts();
  const record = attempts[identifier];
  if (record && record.lockedUntil > Date.now()) {
    const mins = Math.ceil((record.lockedUntil - Date.now()) / 60000);
    return showError(
      `Too many failed attempts. Try again in ${mins} minute${mins === 1 ? "" : "s"}.`,
    );
  }

  const candidate = findUserByLogin(identifier);
  const inputHash = await hashPassword(p);
  const found = candidate && candidate.pass === inputHash ? candidate : null;

  if (found) {
    delete attempts[identifier];
  } else {
    const count = (record?.count || 0) + 1;
    attempts[identifier] = {
      count: count >= MAX_LOGIN_ATTEMPTS ? 0 : count,
      lockedUntil: count >= MAX_LOGIN_ATTEMPTS ? Date.now() + LOCKOUT_MS : 0,
    };
  }
  saveLoginAttempts(attempts);

  if (found && found.active === false) {
    showError(
      "This account has been deactivated. Please contact the guidance office.",
    );
  } else if (found) {
    const { pass, ...sessionData } = found;
    sessionStorage.setItem("gh_session", JSON.stringify(sessionData));
    window.logActivity(sessionData, "Logged in");
    // Detach the login page's delegated handlers before showing the portal
    const root = document.getElementById("app");
    root.onclick = null;
    root.onchange = null;
    initApp();
  } else {
    const left = MAX_LOGIN_ATTEMPTS - (attempts[identifier].count || 0);
    showError(
      attempts[identifier].lockedUntil
        ? "Too many failed attempts. Try again in 5 minutes."
        : `Invalid username/email or password. ${left} attempt${left === 1 ? "" : "s"} left.`,
    );
  }
}

async function handleRegister(
  name,
  u,
  p,
  email,
  yl,
  course,
  sec,
  showError,
  showSuccess,
) {
  const username = String(u || "").trim();
  const cleanEmail = String(email || "")
    .trim()
    .toLowerCase();

  if (!/^[a-zA-Z0-9._]{3,20}$/.test(username)) {
    return showError(
      "Username must be 3–20 characters: letters, numbers, dots or underscores.",
    );
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cleanEmail)) {
    return showError("Please enter a valid email address.");
  }
  if (p.length < 8 || !/[A-Za-z]/.test(p) || !/\d/.test(p)) {
    return showError(
      "Password must be at least 8 characters and include a letter and a number.",
    );
  }

  if (isRemote) {
    const result = await remoteSignUp({
      name,
      username,
      email: cleanEmail,
      password: p,
      yearLevel: yl,
      course,
      section: sec,
    });
    if (result.error) return showError(result.error);
    alert(
      result.needsConfirmation
        ? "Account created! Check your email and click the confirmation link, then sign in."
        : "Account created! You can now sign in.",
    );
    if (showSuccess) showSuccess();
    return null;
  }

  if (isUsernameOrEmailTaken(username, cleanEmail)) {
    return showError("Username or Email already exists!");
  }

  const securedHash = await hashPassword(p);

  const newUser = {
    id: Date.now(),
    name,
    user: username,
    pass: securedHash,
    email: cleanEmail,
    yearLevel: yl,
    course,
    section: sec,
    role: "student",
    active: true,
    // The register form can't submit without the consent checkbox
    consentAt: new Date().toISOString(),
  };

  addUser(newUser);

  if (showSuccess) {
    showSuccess();
  }
}

// --- IDLE LOGOUT (shared school computers) ---
let idleTimer = null;

function startIdleTimer(session) {
  const reset = () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      window.logActivity(session, "Auto logged out after inactivity");
      sessionStorage.setItem(
        "gh_logout_reason",
        "You were signed out after 15 minutes of inactivity.",
      );
      sessionStorage.removeItem("gh_session");
      handleSignOut();
      const signOut = isRemote ? remoteSignOut() : Promise.resolve();
      signOut.catch(() => {}).finally(() => window.location.reload());
    }, IDLE_LIMIT_MS);
  };
  ["click", "keydown", "mousemove", "scroll", "touchstart"].forEach((evt) =>
    document.addEventListener(evt, reset, { passive: true }),
  );
  reset();
}

// Re-check the saved session against the user list, so an edited role,
// a deleted account, or a deactivated account can't keep a portal open
function loadValidSession() {
  const raw = sessionStorage.getItem("gh_session");
  if (!raw) return null;
  let saved;
  try {
    saved = JSON.parse(raw);
  } catch {
    saved = null;
  }
  const user = saved && getUsers().find((u) => u.id === saved.id);
  if (!user || user.role !== saved.role || user.active === false) {
    sessionStorage.removeItem("gh_session");
    return null;
  }
  const { pass, ...fresh } = user;
  sessionStorage.setItem("gh_session", JSON.stringify(fresh));
  return fresh;
}

// --- ROUTER ---
function initApp() {
  const root = document.getElementById("app");
  const session = loadValidSession();
  const hasEntered = sessionStorage.getItem("gh_entered");

  // 1. If we have a session, show the appropriate view
  if (session) {
    startIdleTimer(session);
    if (session.role === "admin")
      return renderAdminView(root, session, handleLogout);
    if (session.role === "guidance")
      return renderGuidanceView(root, session, handleLogout);
    return renderStudentView(root, session, handleLogout);
  }

  // 2. If no session, check if they have "Entered" (clicked Get Started or Sign In)
  if (hasEntered) {
    // We pass handleLogin and handleRegister from your entry file scope
    return renderLoginPage(root, handleLogin, handleRegister);
  }

  // 3. Otherwise, show the landing page
  renderLandingPage(
    root,
    () => {
      // "Get Started"
      sessionStorage.setItem("gh_entered", "true");
      renderLoginPage(root, handleLogin, handleRegister, true);
    },
    () => {
      // "Sign In"
      sessionStorage.setItem("gh_entered", "true");
      renderLoginPage(root, handleLogin, handleRegister, false);
    },
  );
}
// System Startup Lifecycle wrapper
const initializeSystemSequence = async () => {
  if (isRemote) {
    // Signed in from an earlier visit? Load what this account may see first.
    const profile = await restoreSession().catch(() => null);
    if (profile) {
      sessionStorage.setItem("gh_session", JSON.stringify(profile));
      await loadAll(profile).catch(() => {
        alert("Can't reach the server. Some data may be missing.");
      });
    } else {
      sessionStorage.removeItem("gh_session");
    }
    // Reminders run on the server (pg_cron), not in the browser
    initApp();
    return;
  }

  await seedUsers();
  seedAppointments();
  await migrateData();
  initApp();
  // Day-before and hour-before reminders for approved sessions
  startReminderService();
};

// 🏁 FIX: Initialize Google Auth silently without looking for the deleted listener function
initGoogleAuth((isAuthReady) => {
  console.log("⚡ Google Core Initialization Status:", isAuthReady);
});

document.addEventListener("DOMContentLoaded", initializeSystemSequence);
