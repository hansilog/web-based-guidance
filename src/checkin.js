// checkin.js
// --- WELLBEING CHECK-IN: short optional questions at booking ---
// A screening aid for counselors to prioritize the queue, not a diagnosis.
import { escapeHtml } from "./syncUtil.js";

export const CHECKIN_QUESTIONS = [
  "Feeling down, sad, or hopeless",
  "Feeling stressed or overwhelmed by school",
  "Trouble sleeping, or sleeping much more than usual",
  "Feeling alone, or that no one understands me",
  "Thoughts that I'd be better off not here, or of hurting myself",
];

// The last question is the safety question
export const SAFETY_INDEX = CHECKIN_QUESTIONS.length - 1;

export const CHECKIN_SCALE = [
  "Not at all",
  "Several days",
  "More than half the days",
  "Nearly every day",
];

const MAX_SCORE = CHECKIN_QUESTIONS.length * (CHECKIN_SCALE.length - 1);

// answers: array of 0–3. Returns { score, level, safetyFlag, flagged }
export function scoreCheckIn(answers) {
  const score = answers.reduce((sum, n) => sum + n, 0);
  const safetyFlag = answers[SAFETY_INDEX] > 0;
  let level = "Low";
  if (score >= 10) level = "High";
  else if (score >= 5) level = "Moderate";
  return {
    score,
    level,
    safetyFlag,
    // Either of these moves the request to the top of the queue
    flagged: safetyFlag || level === "High",
  };
}

export function checkInFormHtml() {
  return `
    <details class="checkin-box" id="checkinBox">
      <summary>
        <i class="material-icons">favorite</i>
        <span>Quick wellbeing check-in <small>(optional, 5 questions)</small></span>
        <i class="material-icons chevron">expand_more</i>
      </summary>
      <p class="checkin-intro">Over the <strong>last two weeks</strong>, how often have you been bothered by the following? This helps your counselor prepare. It is not a test or a diagnosis.</p>
      ${CHECKIN_QUESTIONS.map(
        (q, i) => `
        <fieldset class="checkin-q">
          <legend>${i + 1}. ${escapeHtml(q)}</legend>
          <div class="checkin-options">
            ${CHECKIN_SCALE.map(
              (label, n) => `
              <label class="checkin-option">
                <input type="radio" name="checkin-${i}" value="${n}">
                <span>${label}</span>
              </label>`,
            ).join("")}
          </div>
        </fieldset>`,
      ).join("")}
      <div id="checkinNotice" class="checkin-notice hidden" role="status"></div>
      <button type="button" id="checkinClear" class="checkin-clear">Clear answers</button>
    </details>
  `;
}

// Reads the form. Returns null when skipped, { error } when half-filled.
export function readCheckIn(form) {
  const answers = CHECKIN_QUESTIONS.map((_, i) => {
    const picked = form.querySelector(`input[name="checkin-${i}"]:checked`);
    return picked ? Number(picked.value) : null;
  });
  const answered = answers.filter((a) => a !== null).length;
  if (answered === 0) return null;
  if (answered < answers.length) {
    return {
      error:
        'Please answer all 5 check-in questions, or press "Clear answers" to skip the check-in.',
    };
  }
  return {
    answers,
    ...scoreCheckIn(answers),
    at: new Date().toISOString(),
  };
}

// Small tag for queue rows
export function checkInTag(checkIn) {
  if (!checkIn) return "";
  if (checkIn.safetyFlag) {
    return `<span class="checkin-tag safety" title="The student reported thoughts of self-harm. Reach out today.">Safety flag</span>`;
  }
  return `<span class="checkin-tag ${checkIn.level.toLowerCase()}" title="Wellbeing check-in score ${checkIn.score}/${MAX_SCORE}">Check-in: ${checkIn.level}</span>`;
}

// Full answers for the counselor's dialogs and case file
export function checkInDetailsHtml(checkIn) {
  if (!checkIn) return "";
  return `
    <div class="checkin-details ${checkIn.safetyFlag ? "safety" : ""}">
      <div class="checkin-details-head">
        <strong>Wellbeing check-in</strong>
        ${checkInTag(checkIn)}
        <span class="checkin-score">${checkIn.score}/${MAX_SCORE}</span>
      </div>
      ${
        checkIn.safetyFlag
          ? `<p class="checkin-alert"><i class="material-icons">warning</i> The student reported thoughts of self-harm. Follow your school's safety protocol and reach out today.</p>`
          : ""
      }
      <ul>
        ${CHECKIN_QUESTIONS.map(
          (q, i) =>
            `<li><span>${escapeHtml(q)}</span><strong>${CHECKIN_SCALE[checkIn.answers[i]] ?? "—"}</strong></li>`,
        ).join("")}
      </ul>
    </div>
  `;
}
