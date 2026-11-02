import emailjs from "@emailjs/browser";
import { renderLoginPage } from "./auth.js";
import { renderStudentView } from "./student.js";
import { renderGuidanceView } from "./guidance.js";
import { renderLandingPage } from "./landing.js";
import { renderAdminView } from "./admin.js";
import { initGoogleAuth, handleSignOut } from "./calendar.js";
import { hashPassword } from "./syncUtil.js";
import { getUsers, migrateData, toDateStr } from "./store.js";
import "./styles/styles.css";

const IDLE_LIMIT_MS = 15 * 60 * 1000;

emailjs.init("6_rFpZEVOh3AVEsIM");

// --- UPDATED SEED USERS ---
const seedUsers = async () => {
  const existingUsers = localStorage.getItem("gh_users");
  if (!existingUsers) {
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
    localStorage.setItem("gh_users", JSON.stringify(initialUsers));
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
  const existingApps = localStorage.getItem("gh_appointments");

  if (!existingApps) {
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

    localStorage.setItem(
      "gh_appointments",
      JSON.stringify(initialAppointments),
    );
  }
};

// --- HANDLERS ---
function handleLogout() {
  sessionStorage.removeItem("gh_session");
  sessionStorage.removeItem("gh_entered");
  handleSignOut();
  window.location.reload();
}

async function handleLogin(identifier, p, showError) {
  const users = JSON.parse(localStorage.getItem("gh_users")) || [];
  const inputHash = await hashPassword(p);

  const found = users.find(
    (u) =>
      (u.user === identifier || u.email === identifier) && u.pass === inputHash,
  );

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
    showError("Invalid username/email or password.");
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
  const users = JSON.parse(localStorage.getItem("gh_users")) || [];
  const exists = users.some((user) => user.user === u || user.email === email);

  if (exists) {
    return showError("Username or Email already exists!");
  }

  const securedHash = await hashPassword(p);

  const newUser = {
    id: Date.now(),
    name,
    user: u,
    pass: securedHash,
    email,
    yearLevel: yl,
    course,
    section: sec,
    role: "student",
    active: true,
  };

  users.push(newUser);
  localStorage.setItem("gh_users", JSON.stringify(users));

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
      window.location.reload();
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
  await seedUsers();
  seedAppointments();
  await migrateData();
  initApp();
};

// 🏁 FIX: Initialize Google Auth silently without looking for the deleted listener function
initGoogleAuth((isAuthReady) => {
  console.log("⚡ Google Core Initialization Status:", isAuthReady);
});

document.addEventListener("DOMContentLoaded", initializeSystemSequence);
