Granby Gateway is a capstone for our school
our title is web based guidance management and scheduling system.

## Features

**Students**
- Book one-hour sessions within office hours (default Mon–Fri, 8 AM–5 PM, lunch 12–1; set by the admin) from open time slots; taken times and counselor days off are blocked
- Pick a counselor or "Any Available" (assigned to the free counselor with the lightest load)
- Reschedule or cancel pending/upcoming sessions, rate completed sessions (1–5 stars)
- Notification bell for approvals, rejections, completed sessions, and follow-up recommendations
- Printable appointment slip for approved upcoming sessions (leaves out the counseling type and notes)
- Appointment history, Google Calendar sync, Granby AI campus chat
- Waitlist for taken times: notified when a spot opens, with "Book now" on the Dashboard
- Optional 5-question wellbeing check-in at booking; worrying answers mark the request urgent and show crisis hotlines
- Reminders a day before and an hour before approved sessions (notification, plus email the day before)

**Guidance counselors**
- Overview: pending, urgent, today's and needs-closing counts that filter the queue when clicked
- Today's schedule and a follow-up tracker with one-click reminders to students
- Log walk-in sessions for students who came in without booking, saved to their case file
- Appointment queue with status filter; approve (with time change) or reject with a reason
- Close sessions as Completed (private case notes, follow-up recommendation) or No-show
- Student case file with full timeline and AI case summary
- Week calendar with days off (removing a day off notifies waitlisted students)
- Wellbeing check-in tags in the queue (Low / Moderate / High / Safety flag); safety-flagged requests sort first
- Anonymous concerns inbox: set status, reply to the reporter, keep internal notes
- Notification bell, activity log, notification email and password settings

**Admin**
- Manage counselors (moving active appointments back to the shared queue on delete)
- Manage students: search, deactivate/activate, reset password
- Reports: request types, statuses, year level, course, satisfaction ratings; CSV export and printable report
- Global announcements, full activity log
- Office hours (opening, closing, lunch) and office-wide holidays/closures
- Counselor performance: completed sessions, last 7 days, active load, no-show rate, rating, response time

**Public (no account)**
- Anonymous concern box on the landing page with a reference code to check for a reply

**Security basics** — data privacy consent at registration, hashed passwords, session re-checked against the user list on every load,
deactivated accounts blocked, 15-minute idle logout, user input escaped before display,
5-minute login lockout after 5 wrong passwords, password rules (8+ characters with a letter and a number),
password-reset codes that expire after 10 minutes and allow 5 tries, case-insensitive usernames/emails.

## Project structure

```
src/
├── index.js         # Entry point + router (seeds data, migrates old data, session checks, idle logout)
├── index.html       # HTML template
├── landing.js       # Landing page
├── auth.js          # Login / register / forgot-password (EmailJS OTP)
├── store.js         # Data layer (the only file that touches shared storage): users, appointments,
│                    #   office settings, availability, waitlist, concerns, notifications, logs, broadcasts
├── reminders.js     # Day-before / hour-before session reminders
├── checkin.js       # Wellbeing check-in questions, scoring, and counselor views
├── ui.js            # Shared dialog + notification bell
├── student.js       # Student portal (dashboard, booking, reschedule, rating, history, settings, AI chat)
├── guidance.js      # Counselor portal logic
├── guidanceView.js  # Counselor portal HTML templates
├── calendarView.js  # Counselor week calendar + days off
├── admin.js         # Admin portal (staff, students, reports, broadcasts, logs)
├── ai.js            # Gemini chat assistant + case summaries
├── calendar.js      # Google Calendar sync
├── syncUtil.js      # Shared helpers: hashing, HTML escaping, cross-tab sync, announcement banner
└── styles/          # CSS per portal; styles.css + features.css hold the shared feature styles
```

All data is stored in the browser (`localStorage` / `sessionStorage`); there is no backend.
This means data is per-browser, and a technical user could still edit it with DevTools.
Moving to a real backend (e.g. Firebase) is the next step for production use.
All shared data (users, appointments, days off, notifications, waitlist, concerns, office settings,
broadcasts, activity log, login attempts) is read and written only through `store.js`, so that is the
one file to swap for database calls. Only per-browser state stays outside it: the login session,
the Google Calendar token, the Gemini key and the concern-form spam guard.
Until then, reminders and waitlist alerts only go out while the app is open in a browser;
with a backend they should move to a scheduled server job.

Check-in answers stay out of the AI case summary, the CSV export, emails and the printed slip.

## Demo accounts

| Role | Username | Password |
| --- | --- | --- |
| Student | `student` | `123` |
| Student | `johndoe` | `pass123` |
| Counselor | `guidance` | `123` |
| Counselor | `guidance2` | `123` |
| Admin | `admin` | `admin123` |

## Scripts

- `npm start` — dev server
- `npm run build` — production build to `dist/`
- `npm run lint` / `npm run format`
