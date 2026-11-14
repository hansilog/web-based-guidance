import emailjs from "@emailjs/browser";
import schoolLogo from "./assets/school-logo.png";
import { hashPassword } from "./syncUtil.js";
import { findUserByEmail, updateUser } from "./store.js";
import { isRemote, sendResetLink, setNewPassword } from "./remote.js";
import "./styles/auth.css";

// Initialize EmailJS
emailjs.init("6_rFpZEVOh3AVEsIM");

export function renderLoginPage(
  root,
  onLogin,
  onRegister,
  startAsRegister = false,
) {
  let isRegistering = startAsRegister;
  let isForgotFlow = false;
  let generatedOTP = null;
  let otpExpiresAt = 0;
  let otpTriesLeft = 0;
  const OTP_TTL_MS = 10 * 60 * 1000;
  const OTP_MAX_TRIES = 5;

  const render = () => {
    let subtitle = "Sign in to access your portal";
    let authBtnText = "Sign In";

    if (isForgotFlow) {
      subtitle = "Reset your password";
      authBtnText = isRemote ? "Send Reset Link" : "Send OTP";
    } else if (isRegistering) {
      subtitle = "Join our school community";
      authBtnText = "Create Student Account";
    }

    root.innerHTML = `
      <div class="auth-container">
        <div class="auth-card glass-card" id="authCard">
          <div id="authContent">
            <div class="brand-section">
              <img class="auth-logo" src="${schoolLogo}" alt="Granby Colleges of Science and Technology seal" width="88" height="88">
              <span class="auth-school">Granby Colleges of Science and Technology</span>
              <h1>Granby Gateway</h1>
              <p id="authSubtitle">${subtitle}</p>
            </div>
            
            <div id="authError" class="error-banner hidden"></div>

            <div class="form-group" id="formGroup">
              ${
                isRegistering
                  ? `
                <div class="input-group-row">
                    <div class="input-wrapper plain"><input type="text" id="regFirst" placeholder="First Name" required></div>
                    <div class="input-wrapper plain"><input type="text" id="regLast" placeholder="Last Name" required></div>
                </div>
                <div class="input-wrapper plain"><input type="email" id="regEmail" placeholder="Email Address" required></div>
                <div class="input-wrapper plain">
                    <select id="regYearLevel" required>
                        <option value="" disabled selected>Select Year Level</option>
                        <option value="1st Year">1st Year</option>
                        <option value="2nd Year">2nd Year</option>
                        <option value="3rd Year">3rd Year</option>
                        <option value="4th Year">4th Year</option>
                    </select>
                </div>
                <div class="input-group-row">
                    <div class="input-wrapper plain">
                        <select id="regCourse" required>
                            <option value="" disabled selected>Course</option>
                            <option value="BSIT">BSIT</option>
                            <option value="BSCS">BSCS</option>
                            <option value="BSED">BSED</option>
                            <option value="BSBA">BSBA</option>
                        </select>
                    </div>
                    <div class="input-wrapper plain"><select id="regSection" required><option value="" disabled selected>Section</option></select></div>
                </div>
              `
                  : ""
              }

              ${
                isForgotFlow
                  ? `
                <div class="input-wrapper plain"><input type="email" id="resetEmail" placeholder="Registered Email" required></div>
                <div class="input-wrapper plain hidden" id="otpSection">
                    <input type="text" id="otpInput" placeholder="Enter 6-digit OTP">
                    <input type="password" id="newPass" placeholder="New Password">
                </div>
              `
                  : ""
              }
              
              ${
                !isForgotFlow
                  ? `
                <div class="input-wrapper plain"><input type="text" id="username" placeholder="Username" required></div>
                <div class="input-wrapper plain password-wrapper">
                    <input type="password" id="password" placeholder="Password" required>
                    <button type="button" class="toggle-password" data-target="password"><i class="material-icons">visibility</i></button>
                </div>
                ${
                  isRegistering
                    ? `
                    <div class="input-wrapper plain password-wrapper">
                        <input type="password" id="confirmPassword" placeholder="Confirm Password" required>
                        <button type="button" class="toggle-password" data-target="confirmPassword"><i class="material-icons">visibility</i></button>
                    </div>
                `
                    : ""
                }
              `
                  : ""
              }

              ${
                isRegistering
                  ? `
                <label class="consent-check">
                    <input type="checkbox" id="regConsent">
                    <span>I agree that Granby Gateway may collect my name, email, course, and appointment details to schedule and provide guidance services, under the Data Privacy Act of 2012 (RA 10173). Guidance counselors can see my session records, and they stay confidential unless someone's safety is at risk. Session notes may be sent to Google's Gemini AI when a counselor creates a case summary.</span>
                </label>
              `
                  : ""
              }

              <button id="authBtn" class="primary-btn">${authBtnText}</button>
            </div>

            <div class="auth-footer">
              ${
                !isForgotFlow
                  ? `
                <span>${isRegistering ? "Already have an account?" : "New to Granby Gateway?"}</span>
                <button id="toggleAuth" class="link-btn">${isRegistering ? "Sign In" : "Register Now"}</button>
                <button id="forgotBtn" class="link-btn">Forgot Password?</button>
              `
                  : `<button id="backToLogin" class="link-btn">Back to Login</button>`
              }
            </div>
          </div>
        </div>
      </div>
    `;
  };

  render();

  // Explain why the user landed back here (e.g. idle logout)
  const logoutReason = sessionStorage.getItem("gh_logout_reason");
  if (logoutReason) {
    sessionStorage.removeItem("gh_logout_reason");
    const banner = document.getElementById("authError");
    banner.innerText = logoutReason;
    banner.classList.remove("hidden");
  }

  root.onclick = async (e) => {
    if (e.target.id === "toggleAuth") {
      isRegistering = !isRegistering;
      render();
    } else if (e.target.id === "forgotBtn") {
      isForgotFlow = true;
      render();
    } else if (e.target.id === "backToLogin") {
      isForgotFlow = false;
      generatedOTP = null;
      render();
    }

    const toggleBtn = e.target.closest(".toggle-password");
    if (toggleBtn) {
      const input = document.getElementById(
        toggleBtn.getAttribute("data-target"),
      );
      const icon = toggleBtn.querySelector("i");
      input.type = input.type === "password" ? "text" : "password";
      icon.innerText =
        input.type === "password" ? "visibility" : "visibility_off";
    }

    if (e.target.id === "authBtn") {
      // Look the banner up each time: render() may have replaced it
      const showError = (msg) => {
        const errorBanner = document.getElementById("authError");
        errorBanner.innerText = msg;
        errorBanner.classList.remove("hidden");
      };

      if (isForgotFlow) {
        const emailVal = document
          .getElementById("resetEmail")
          .value.trim()
          .toLowerCase();

        // Supabase emails a reset link; clicking it brings the user back to
        // the "Choose a new password" screen (renderSetNewPassword below)
        if (isRemote) {
          if (!emailVal) return showError("Please enter your email.");
          e.target.disabled = true;
          const problem = await sendResetLink(emailVal);
          e.target.disabled = false;
          if (problem) return showError(problem);
          alert(
            "If that email is registered, a password reset link is on its way. Open it on this or any device (check your spam folder too).",
          );
          isForgotFlow = false;
          render();
          return null;
        }

        // An expired code or too many wrong guesses means starting over
        if (generatedOTP && Date.now() > otpExpiresAt) {
          generatedOTP = null;
          render();
          return showError("The code expired. Please request a new one.");
        }

        if (!generatedOTP) {
          if (!findUserByEmail(emailVal)) {
            return showError("Email not registered.");
          }

          // Cryptographically random 6-digit code
          const rand = crypto.getRandomValues(new Uint32Array(1))[0];
          generatedOTP = String(100000 + (rand % 900000));
          otpExpiresAt = Date.now() + OTP_TTL_MS;
          otpTriesLeft = OTP_MAX_TRIES;
          try {
            await emailjs.send("service_mtv9cbi", "template_gbmoria", {
              to_email: emailVal,
              otp: generatedOTP,
              otp_code: generatedOTP,
            });
            document.getElementById("otpSection").classList.remove("hidden");
            document.getElementById("resetEmail").disabled = true;
            e.target.innerText = "Verify & Reset";
          } catch (err) {
            generatedOTP = null;
            showError("Failed to send.");
          }
        } else if (
          document.getElementById("otpInput").value.trim() === generatedOTP
        ) {
          const newPass = document.getElementById("newPass").value;
          if (
            newPass.length < 8 ||
            !/[A-Za-z]/.test(newPass) ||
            !/\d/.test(newPass)
          )
            return showError(
              "New password must be at least 8 characters and include a letter and a number.",
            );

          const user = findUserByEmail(emailVal);
          if (!user) return showError("Email not registered.");

          updateUser(user.id, { pass: await hashPassword(newPass) });
          window.logActivity(user, "Reset password with email code");
          generatedOTP = null;
          alert("Password updated!");
          isForgotFlow = false;
          render();
        } else {
          otpTriesLeft -= 1;
          if (otpTriesLeft <= 0) {
            generatedOTP = null;
            render();
            return showError("Too many wrong codes. Please request a new one.");
          }
          showError(
            `Invalid code. ${otpTriesLeft} attempt${otpTriesLeft === 1 ? "" : "s"} left.`,
          );
        }
      } else if (isRegistering) {
        const first = document.getElementById("regFirst").value.trim();
        const last = document.getElementById("regLast").value.trim();
        const fullName = `${first} ${last}`.trim();
        const required = [
          "regFirst",
          "regLast",
          "regEmail",
          "regYearLevel",
          "regCourse",
          "regSection",
          "username",
          "password",
        ];
        if (required.some((id) => !document.getElementById(id).value.trim())) {
          return showError("Please fill in all required fields.");
        }
        if (
          document.getElementById("password").value !==
          document.getElementById("confirmPassword").value
        ) {
          return showError("Passwords do not match.");
        }
        if (!document.getElementById("regConsent").checked) {
          return showError(
            "Please agree to the data privacy notice to register.",
          );
        }

        onRegister(
          fullName,
          document.getElementById("username").value,
          document.getElementById("password").value,
          document.getElementById("regEmail").value,
          document.getElementById("regYearLevel").value,
          document.getElementById("regCourse").value,
          document.getElementById("regSection").value,
          showError,
          () => {
            isRegistering = false;
            render();
          },
        );
      } else {
        onLogin(
          document.getElementById("username").value,
          document.getElementById("password").value,
          showError,
        );
      }
    }
  };

  root.onchange = (e) => {
    if (e.target.id === "regYearLevel") {
      const sectionSelect = document.getElementById("regSection");
      sectionSelect.innerHTML =
        '<option value="" disabled selected>Section</option>';
      ["A", "B", "C"].forEach((s) => {
        const sectionValue = `${e.target.value.charAt(0)}${s}`;
        sectionSelect.innerHTML += `<option value="${sectionValue}">Section ${sectionValue}</option>`;
      });
    }
  };
}

// Shown after opening a password reset link from the email (Supabase mode)
export function renderSetNewPassword(root, onDone) {
  root.innerHTML = `
    <div class="auth-container">
      <div class="auth-card glass-card">
        <div class="brand-section">
          <img class="auth-logo" src="${schoolLogo}" alt="Granby Colleges of Science and Technology seal" width="88" height="88">
              <span class="auth-school">Granby Colleges of Science and Technology</span>
              <h1>Granby Gateway</h1>
          <p>Choose a new password</p>
        </div>
        <div id="authError" class="error-banner hidden"></div>
        <form class="form-group" id="newPassForm">
          <div class="input-wrapper plain password-wrapper">
            <input type="password" id="newPassword" placeholder="New password" autocomplete="new-password" required>
          </div>
          <div class="input-wrapper plain password-wrapper">
            <input type="password" id="newPasswordAgain" placeholder="Type it again" autocomplete="new-password" required>
          </div>
          <button type="submit" id="savePassBtn" class="primary-btn">Save New Password</button>
        </form>
      </div>
    </div>
  `;
  const form = root.querySelector("#newPassForm");
  const showError = (msg) => {
    const banner = root.querySelector("#authError");
    banner.innerText = msg;
    banner.classList.remove("hidden");
  };
  form.onsubmit = async (e) => {
    e.preventDefault();
    const pass = root.querySelector("#newPassword").value;
    if (pass.length < 8 || !/[A-Za-z]/.test(pass) || !/\d/.test(pass)) {
      showError(
        "Password must be at least 8 characters and include a letter and a number.",
      );
      return;
    }
    if (pass !== root.querySelector("#newPasswordAgain").value) {
      showError("The two passwords don't match.");
      return;
    }
    const btn = root.querySelector("#savePassBtn");
    btn.disabled = true;
    const problem = await setNewPassword(pass);
    btn.disabled = false;
    if (problem) {
      showError(problem);
      return;
    }
    alert("Password updated! You can now sign in with it.");
    onDone();
  };
}
