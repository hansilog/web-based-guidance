import { GoogleGenAI } from '@google/genai';

/**
 * GRANBY GATEWAY - CENTRAL AI MODULE
 * Powered by Google Gemini 2.5 Flash
 */

// Initialize the Google Gen AI client with your API key
// For local testing, paste your API key here. For production deployment, 
// this should be moved behind an environment variable or a serverless function.
const ai = new GoogleGenAI({ apiKey: "AIzaSyCoZVDeXUJDyGe6eeId5zR95g7Pr8cfq0s" });

/**
 * FEATURE 1: Pre-Booking Smart FAQ & Chatbot Assistant (For Students)
 * Converses naturally with students and cross-references their inputs with campus policies.
 * * @param {string} studentNote - The message typed by the student
 * @param {string} selectedCategory - The dashboard view context or selected counseling category
 * @param {function} onProgressUpdate - Optional callback to pass loading text back to the UI
 * @returns {Promise<string>} The markdown-formatted AI response
 */
export async function getPreBookingAdvice(studentNote, selectedCategory, onProgressUpdate) {
  if (!studentNote || studentNote.trim().length < 2) return null;

  try {
    // Notify the UI that the API request is initiating
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

    // Execute content generation via Google's optimized flash model
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Context: ${selectedCategory}. Question: ${studentNote}`,
      config: {
        systemInstruction,
        temperature: 0.6, // Balanced for precise guidelines with a natural tone
      }
    });

    return response.text;

  } catch (error) {
    console.error("❌ Gemini API Chat Error:", error);
    return "⚠️ The AI helper is temporarily offline. Please look at standard guidelines or proceed with scheduling a slot with your counselor.";
  }
}

/**
 * FEATURE 2: Counselor Case History Summarizer Engine (For Guidance Counselors)
 * Analyzes a student's past session records and generates an actionable profile summary.
 * * @param {string} studentName - The full name of the student being reviewed
 * @param {Array} appointmentHistory - Array of past appointment objects fetched from localStorage
 * @returns {Promise<string>} A 3-bullet markdown summary
 */
export async function generateStudentSummary(studentName, appointmentHistory = []) {
  if (appointmentHistory.length === 0) {
    return "💡 <em>This student has no past session records on file. The upcoming appointment will be their initial intake consultation.</em>";
  }

  try {
    // Compile array of logs into a single structured text block for the LLM to analyze
    const historyLogs = appointmentHistory
      .map(app => `- Date: ${app.date}, Type: ${app.type}, Status: ${app.status}, Student Notes: "${app.notes || 'None'}"`)
      .join("\n");

    const prompt = `
      You are an expert academic guidance counselor assistant. Analyze the following local historical appointment logs for student "${studentName}":
      
      ${historyLogs}
      
      Provide a concise, objective 3-bullet-point summary for the counselor's prep view. Do not include introductory text, conversational fluff, or conclusions. Start immediately with the bullets.
      - Bullet 1 (Theme): The primary recurring issue or underlying concern (e.g., Academic Stress, Career Transition, Personal Adjustments).
      - Bullet 2 (Trajectory): The student's trend or situational trajectory based on past notes.
      - Bullet 3 (Actionable Tip): One suggested proactive talking point or recommendation for the counselor's upcoming face-to-face dialogue.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

    return response.text;

  } catch (error) {
    console.error("❌ Gemini API Summary Error:", error);
    return "⚠️ <em>Unable to parse historical ledger trends automatically at this time. Please read raw history entries manually below.</em>";
  }
}