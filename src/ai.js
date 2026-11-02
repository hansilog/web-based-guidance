import { GoogleGenAI } from "@google/genai";

/**
 * GRANBY GATEWAY - CENTRAL AI MODULE
 * Powered by Google Gemini 3.8 Flash
 */

/**
 * Helper function to dynamically initialize the Google Gen AI Client
 * Prevents key leaks on public hosting domains like GitHub Pages.
 */
function getGenAIClient() {
  // 1. When running `npm start`, webpack.dev.js injects the key from .env
  // eslint-disable-next-line no-undef
  let apiKey = typeof __GEMINI_API_KEY__ !== "undefined" ? __GEMINI_API_KEY__ : "";

  // 2. Fallback: a key typed into the prompt earlier this browser session
  if (!apiKey) apiKey = sessionStorage.getItem("gh_gemini_key");

  // 3. Emergency Prompter: If no key is found anywhere, securely prompt the user once
  if (!apiKey) {
    apiKey = prompt(
      "🤖 [Granby Gateway AI Activation]\n\nPlease enter a valid Gemini API Key to initialize the campus chat assistant. This key is stored safely inside your current browser session tab only:",
    );
    if (apiKey && apiKey.trim()) {
      sessionStorage.setItem("gh_gemini_key", apiKey.trim());
    } else {
      alert(
        "❌ Invalid or missing API key. The AI module will remain offline.",
      );
      return null;
    }
  }

  // Return a fresh client instance built using the secure key token
  return new GoogleGenAI({ apiKey });
}

const MODEL = "gemini-3.8-flash";
const RETRYABLE = [429, 500, 503];

function errorStatus(error) {
  return Number(error?.status || error?.code || error?.error?.code) || 0;
}

/**
 * generateContent with a couple of retries for busy/rate-limited responses,
 * which the free tier returns often when messages are sent close together.
 */
async function generateWithRetry(aiClient, request, retries = 2) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await aiClient.models.generateContent({ model: MODEL, ...request });
    } catch (error) {
      if (attempt >= retries || !RETRYABLE.includes(errorStatus(error))) {
        throw error;
      }
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
  }
}

// A short, specific explanation instead of one generic "offline" line
function friendlyError(error) {
  const status = errorStatus(error);
  if (status === 429) {
    return "⏳ Too many questions at once. Please wait a few seconds and try again.";
  }
  if (status === 503 || status === 500) {
    return "⏳ The AI service is busy right now. Please try again in a moment.";
  }
  if (status === 400 || status === 401 || status === 403) {
    return "⚠️ The AI key is invalid or not allowed. Please ask the admin to check the Gemini API key.";
  }
  if (status === 404) {
    return "⚠️ The AI model is unavailable. Please ask the admin to update the Gemini model name.";
  }
  return "⚠️ The AI helper is temporarily offline. Please look at standard guidelines or proceed with scheduling a slot with your counselor.";
}

/**
 * FEATURE 1: Pre-Booking Smart FAQ & Chatbot Assistant (For Students)
 */
export async function getPreBookingAdvice(
  studentNote,
  selectedCategory,
  onProgressUpdate,
) {
  if (!studentNote || studentNote.trim().length < 2) return null;

  // Initialize the client securely at runtime
  const aiClient = getGenAIClient();
  if (!aiClient) {
    return "⚠️ AI module activation cancelled. Please provide an API key to enable the chatbot assistant.";
  }

  try {
    if (onProgressUpdate) onProgressUpdate("Consulting Granby Database...");

    const systemInstruction = `
      You are the Granby Gateway Smart AI Portal Assistant. You are a friendly, highly intelligent campus guide with deep knowledge of campus regulations and the physical layout of the school.
  
  Here is your official Granby Campus Knowledge Base:
  
  CAMPUS MAP & LOCATIONS:
  - Building A: Houses the Information Technology (IT) Department.
  - Building A (1st Floor): Location of the Cashier and the Registrar.
  - Building A (3rd Floor): Location of the Student Business Organization (SBO) room / IT Office.
  - Building B: Dedicated entirely to the Tourism Department.
  - Building C: Houses the Education (Educ) Department and the Elementary School section.
  - Building D: Houses the Criminology (Crim) Department.
  
  ADMINISTRATIVE & REGISTRATION RULES:
  - Official Transcript of Records (TOR) or certificate document processing requires 3 to 5 business working days.
  - Course shifting/switching profiles are only permitted during the first 2 weeks of the academic semester.
  - Dropping a subject requires an authorized signature from the department Dean before submission to Registrar.
  
  RESPONSE INSTRUCTIONS:
  1. If the student greets you (e.g., "hi", "hello"), greet them back warmly and ask how you can help them navigate campus operations today.
  2. Use the data above to answer campus direction queries naturally. (e.g., If they ask where to pay tuition, direct them to the Cashier on the 1st floor of Building A).
  3. If they ask a general question outside of these specific rules/locations, answer it to the best of your ability using your general knowledge, but keep it brief and conversational.
  4. Highlight key rooms, departments, and buildings using bold text (e.g., **Building A**, **Registrar**) so it's easy for students to scan.
  5. Keep your total response friendly, accurate, and limited to a maximum of 3 sentences.
    `;

    const response = await generateWithRetry(aiClient, {
      contents: `Context: ${selectedCategory}. Question: ${studentNote}`,
      config: {
        systemInstruction,
        temperature: 0.6,
      },
    });

    // Blocked or empty answers come back without text
    return (
      response.text ||
      "🤔 I can't answer that one. Try asking about campus offices, documents, or counseling."
    );
  } catch (error) {
    console.error("❌ Gemini API Chat Error:", error);
    return friendlyError(error);
  }
}

/**
 * FEATURE 2: Counselor Case History Summarizer Engine (For Guidance Counselors)
 */
export async function generateStudentSummary(
  studentName,
  appointmentHistory = [],
) {
  if (appointmentHistory.length === 0) {
    return "💡 This student has no past session records on file. The upcoming appointment will be their initial intake consultation.";
  }

  // Initialize the client securely at runtime
  const aiClient = getGenAIClient();
  if (!aiClient) {
    return "⚠️ Summary engine offline. Valid API credentials are required.";
  }

  try {
    const historyLogs = appointmentHistory
      .map(
        (app) =>
          `- Date: ${app.date}, Type: ${app.type}, Status: ${app.status}, Student Notes: "${app.notes || "None"}", Counselor Notes: "${app.counselorNotes || "None"}", Private Case Notes: "${app.caseNotes || "None"}"${app.followUp ? ", Follow-up recommended" : ""}`,
      )
      .join("\n");

    const prompt = `
      You are an expert academic guidance counselor assistant. Analyze the following local historical appointment logs for student "${studentName}":
      
      ${historyLogs}
      
      Provide a concise, objective 3-bullet-point summary for the counselor's prep view. Do not include introductory text, conversational fluff, or conclusions. Start immediately with the bullets.
      - Bullet 1 (Theme): The primary recurring issue or underlying concern (e.g., Academic Stress, Career Transition, Personal Adjustments).
      - Bullet 2 (Trajectory): The student's trend or situational trajectory based on past notes.
      - Bullet 3 (Actionable Tip): One suggested proactive talking point or recommendation for the counselor's upcoming face-to-face dialogue.
    `;

    const response = await generateWithRetry(aiClient, { contents: prompt });

    return (
      response.text ||
      "⚠️ Unable to summarize this history right now. Please read the session entries below."
    );
  } catch (error) {
    console.error("❌ Gemini API Summary Error:", error);
    return "⚠️ Unable to summarize this history right now. Please read the session entries below.";
  }
}
