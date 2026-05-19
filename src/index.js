import emailjs from "@emailjs/browser";
import { renderLoginPage } from "./auth.js";
import { renderStudentView } from "./student.js";
import { renderGuidanceView } from "./guidance.js";
import { renderLandingPage } from "./landing.js";
import { renderAdminView } from "./admin.js";
import "./styles/styles.css";

emailjs.init("6_rFpZEVOh3AVEsIM");

// --- CRYPTOGRAPHIC UTILITY ---
// Securely hashes plain text strings using the browser's native Web Crypto API
async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// --- UPDATED SEED USERS ---
// FIXED: Marked function as 'async' so 'await hashPassword' works properly
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

const seedAppointments = () => {
  const existingApps = localStorage.getItem("gh_appointments");

  if (!existingApps) {
    const initialAppointments = [
      {
        id: Date.now() + 1,
        studentId: 1,
        studentName: "Rhae",
        studentEmail: "parungaorhaessian@gmail.com",
        type: "Academic Counseling",
        date: "2026-05-15",
        time: "10:00 AM",
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
        type: "Career Guidance",
        date: "2026-05-12",
        time: "02:30 PM",
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
        type: "Personal Issue",
        date: "2026-05-08",
        time: "09:00 AM",
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
  window.location.reload();
}

// FIXED: Converted to async & encrypted incoming string to match stored SHA-256 hash
async function handleLogin(identifier, p, showError) {
  const users = JSON.parse(localStorage.getItem("gh_users")) || [];
  const inputHash = await hashPassword(p);

  const found = users.find(
    (u) =>
      (u.user === identifier || u.email === identifier) && u.pass === inputHash,
  );

  if (found) {
    const { pass, ...sessionData } = found;
    sessionStorage.setItem("gh_session", JSON.stringify(sessionData));
    initApp();
  } else {
    showError("Invalid username/email or password.");
  }
}

// FIXED: Converted to async & encrypted password before saving to data model array
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
  };

  users.push(newUser);
  localStorage.setItem("gh_users", JSON.stringify(users));

  if (showSuccess) {
    showSuccess();
  }
}

// --- ROUTER ---
function initApp() {
  const root = document.getElementById("app");
  const session = JSON.parse(sessionStorage.getItem("gh_session"));
  const hasEntered = sessionStorage.getItem("gh_entered");

  if (!session && !hasEntered) {
    renderLandingPage(root, () => {
      sessionStorage.setItem("gh_entered", "true");
      initApp();
    });
  } else if (!session) {
    renderLoginPage(root, handleLogin, handleRegister);
  } else if (session.role === "admin") {
    renderAdminView(root, session, handleLogout);
  } else if (session.role === "guidance") {
    renderGuidanceView(root, session, handleLogout);
  } else {
    renderStudentView(root, session, handleLogout);
  }
}

// System Startup Lifecycle wrapper to cleanly handle asynchronous seeding rules
const initializeSystemSequence = async () => {
  await seedUsers();
  seedAppointments();
  initApp();
};

document.addEventListener("DOMContentLoaded", initializeSystemSequence);
