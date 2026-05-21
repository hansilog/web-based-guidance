import emailjs from "@emailjs/browser";
import "./styles/auth.css";

// Initialize EmailJS
emailjs.init("6_rFpZEVOh3AVEsIM");

export function renderLoginPage(root, onLogin, onRegister, startAsRegister = false) {
  let isRegistering = startAsRegister;
  let isForgotFlow = false;
  let generatedOTP = null;

  const render = () => {
    let subtitle = "Sign in to access your portal";
    let authBtnText = "Sign In";

    if (isForgotFlow) {
      subtitle = "Reset your password";
      authBtnText = "Send OTP";
    } else if (isRegistering) {
      subtitle = "Join our school community";
      authBtnText = "Create Student Account";
    }

    root.innerHTML = `
      <div class="auth-container">
        <div class="auth-card glass-card" id="authCard">
          <div id="authContent">
            <div class="brand-section">
              <h1><i class="material-icons">assignment_ind</i> Granby Gateway</h1>
              <p id="authSubtitle">${subtitle}</p>
            </div>
            
            <div id="authError" class="error-banner hidden"></div>

            <div class="form-group" id="formGroup">
              ${isRegistering ? `
                <div class="input-group-row">
                    <div class="input-wrapper plain"><input type="text" id="regFirst" placeholder="First Name" required></div>
                    <div class="input-wrapper plain"><input type="text" id="regMiddle" placeholder="Middle Name (Optional)"></div>
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
              ` : ""}

              ${isForgotFlow ? `
                <div class="input-wrapper plain"><input type="email" id="resetEmail" placeholder="Registered Email" required></div>
                <div class="input-wrapper plain hidden" id="otpSection">
                    <input type="text" id="otpInput" placeholder="Enter 6-digit OTP">
                    <input type="password" id="newPass" placeholder="New Password">
                </div>
              ` : ""}
              
              ${!isForgotFlow ? `
                <div class="input-wrapper plain"><input type="text" id="username" placeholder="Username" required></div>
                <div class="input-wrapper plain password-wrapper">
                    <input type="password" id="password" placeholder="Password" required>
                    <button type="button" class="toggle-password" data-target="password"><i class="material-icons">visibility</i></button>
                </div>
                ${isRegistering ? `
                    <div class="input-wrapper plain password-wrapper">
                        <input type="password" id="confirmPassword" placeholder="Confirm Password" required>
                        <button type="button" class="toggle-password" data-target="confirmPassword"><i class="material-icons">visibility</i></button>
                    </div>
                ` : ""}
              ` : ""}

              <button id="authBtn" class="primary-btn">${authBtnText}</button>
            </div>

            <div class="auth-footer">
              ${!isForgotFlow ? `
                <span>${isRegistering ? "Already have an account?" : "New to Granby Gateway?"}</span>
                <button id="toggleAuth" class="link-btn">${isRegistering ? "Sign In" : "Register Now"}</button>
                <button id="forgotBtn" class="link-btn">Forgot Password?</button>
              ` : `<button id="backToLogin" class="link-btn">Back to Login</button>`}
            </div>
          </div>
        </div>
      </div>
    `;
  };

  render();

  root.onclick = async (e) => {
    if (e.target.id === "toggleAuth") { isRegistering = !isRegistering; render(); }
    else if (e.target.id === "forgotBtn") { isForgotFlow = true; render(); }
    else if (e.target.id === "backToLogin") { isForgotFlow = false; render(); }

    const toggleBtn = e.target.closest(".toggle-password");
    if (toggleBtn) {
      const input = document.getElementById(toggleBtn.getAttribute("data-target"));
      const icon = toggleBtn.querySelector("i");
      input.type = input.type === "password" ? "text" : "password";
      icon.innerText = input.type === "password" ? "visibility" : "visibility_off";
    }

    if (e.target.id === "authBtn") {
      const errorBanner = document.getElementById("authError");
      const showError = (msg) => { errorBanner.innerText = msg; errorBanner.classList.remove("hidden"); };

      if (isForgotFlow) {
        const emailVal = document.getElementById("resetEmail").value.trim();
        if (!generatedOTP) {
          const users = JSON.parse(localStorage.getItem("gh_users") || "[]");
          if (!users.find((u) => u.email === emailVal)) return showError("Email not registered.");
          
          generatedOTP = Math.floor(100000 + Math.random() * 900000).toString();
          try {
            await emailjs.send("service_mtv9cbi", "template_gbmoria", { to_email: emailVal, otp: generatedOTP });
            document.getElementById("otpSection").classList.remove("hidden");
            document.getElementById("resetEmail").disabled = true;
            e.target.innerText = "Verify & Reset";
          } catch (err) { showError("Failed to send."); }
        } else if (document.getElementById("otpInput").value === generatedOTP) {
          alert("Password updated!");
          isForgotFlow = false; render();
        } else {
          showError("Invalid OTP");
        }
      } else if (isRegistering) {
        const first = document.getElementById("regFirst").value.trim();
        const middle = document.getElementById("regMiddle").value.trim();
        const last = document.getElementById("regLast").value.trim();
        const fullName = [first, middle, last].filter((part) => part !== "").join(" ");
        
        onRegister(
          fullName,
          document.getElementById("username").value,
          document.getElementById("password").value,
          document.getElementById("regEmail").value,
          document.getElementById("regYearLevel").value,
          document.getElementById("regCourse").value,
          document.getElementById("regSection").value,
          showError,
          () => { isRegistering = false; render(); }
        );
      } else {
        onLogin(document.getElementById("username").value, document.getElementById("password").value, showError);
      }
    }
  };

  root.onchange = (e) => {
    if (e.target.id === "regYearLevel") {
      const sectionSelect = document.getElementById("regSection");
      sectionSelect.innerHTML = '<option value="" disabled selected>Section</option>';
      ["A", "B", "C"].forEach((s) => {
        const sectionValue = `${e.target.value.charAt(0)}${s}`;
        sectionSelect.innerHTML += `<option value="${sectionValue}">Section ${sectionValue}</option>`;
      });
    }
  };
}