import { gapi } from 'gapi-script';

/**
 * GRANBY GATEWAY - GOOGLE CALENDAR SYNC ENGINE
 * Handles Implicit OAuth2 Token Flow & Calendar Core API Operations
 */

// CONFIGURATION CONSTANTS
// Replace this placeholder string with the client ID from your Google Cloud Console
const CLIENT_ID = "842259520040-fvotbl74ulldonh855onveca5ta7hm9p.apps.googleusercontent.com";
const SCOPES = "https://www.googleapis.com/auth/calendar";

let tokenClient = null;
let accessToken = null;

/**
 * 1. Initialize Google Identity Services & GAPI Client
 * Call this function once during your application boot or layout mounting phase.
 * @param {function} onStatusUpdate - Callback passing a boolean tracking if user authentication is valid
 */
export function initGoogleAuth(onStatusUpdate) {
  // A. Build and inject the secure Google Sign-In script layout into the DOM head
  const script = document.createElement("script");
  script.src = "https://accounts.google.com/gsi/client";
  script.async = true;
  script.defer = true;
  
  script.onload = () => {
    if (!window.google || !window.google.accounts) {
      console.error("❌ Google Identity Services SDK loaded but could not initialize.");
      return;
    }

    // B. Instantiate the token client popup mechanism
    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPES,
      callback: (tokenResponse) => {
        if (tokenResponse.error) {
          console.error("❌ Google Authorization Exception:", tokenResponse.error);
          if (onStatusUpdate) onStatusUpdate(false);
          return;
        }
        
        // Save the active authentication string token parameter state
        accessToken = tokenResponse.access_token;
        localStorage.setItem("gh_gcal_token", accessToken);
        
        if (onStatusUpdate) onStatusUpdate(true);
      },
    });

    // C. Spin up the legacy GAPI core layer to ensure network requests format properly
    gapi.load('client', async () => {
      try {
        await gapi.client.init({
          clientId: CLIENT_ID,
          scope: SCOPES,
        });
        console.log("⚡ GAPI Client Core successfully mounted.");
      } catch (err) {
        console.error("❌ Failed initializing internal GAPI Client:", err);
      }
    });
  };
  
  document.head.appendChild(script);
}

/**
 * 2. Launch the Google Sign-In Consent Window Interface
 * Can be mounted directly to an HTML "Connect Google Calendar" button event click.
 */
export function handleSignIn() {
  if (!tokenClient) {
    console.warn("⚠️ Token client lost or not initialized. Attempting re-initialization...");
    // Force rebuild token client if it went missing during a server blink
    if (window.google && window.google.accounts) {
      tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: (tokenResponse) => {
          accessToken = tokenResponse.access_token;
          localStorage.setItem("gh_gcal_token", accessToken);
        },
      });
      tokenClient.requestAccessToken({ prompt: 'consent' });
    } else {
      console.error("❌ Google Identity script is completely missing from the DOM layout.");
    }
    return;
  }
  
  tokenClient.requestAccessToken({ prompt: 'consent' });
}
/**
 * 3. Log out / Clear Google Account Sync Status
 */
export function handleSignOut() {
  accessToken = null;
  localStorage.removeItem("gh_gcal_token");
  console.log("🔒 Disconnected from Google Services.");
}

/**
 * 4. Write an Event Directly to the User's Primary Google Calendar
 * @param {Object} details - { summary, description, startTime, endTime }
 * @returns {Promise<Object|null>} The parsed Google Calendar response object or null if failed
 */
export async function createCalendarEvent(details) {
  // Check memory state first, fall back to local database storage configurations
  const token = accessToken || localStorage.getItem("gh_gcal_token");
  
  if (!token) {
    alert("Please sign into your Google Account first to synchronize this appointment!");
    handleSignIn();
    return null;
  }

  // Construct the standardized payload requirements required by Google V3 APIs
  const eventPayload = {
    summary: details.summary,
    description: details.description,
    start: {
      dateTime: new Date(details.startTime).toISOString(),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
    end: {
      dateTime: new Date(details.endTime).toISOString(),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
    reminders: {
      useDefault: true
    }
  };

  try {
    const response = await fetch(
      "https://www.googleapis.com/calendar/v3/calendars/primary/events",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(eventPayload),
      }
    );

    // If token expired (401 Unauthorized), clean local caches and re-trigger authentication window
    if (response.status === 401) {
      console.warn("⚠️ Google Access Token has expired. Renewing access token session variables...");
      handleSignOut();
      handleSignIn();
      return null;
    }

    if (!response.ok) {
  const errorText = await response.text();
  console.error("🔴 GOOGLE CALENDAR DETAILED ERROR LOG:", errorText); // <-- ADD THIS LINE
  throw new Error(`Google API responding exception flag: ${errorText}`);
}

    const createdEvent = await response.json();
    console.log("🎉 Appointment successfully synchronized! Live URL Link:", createdEvent.htmlLink);
    return createdEvent;

  } catch (error) {
    console.error("❌ Fatal tracking crash writing to Google Calendar:", error);
    alert("An error occurred while pushing this scheduling data directly to Google Services.");
    return null;
  }
}