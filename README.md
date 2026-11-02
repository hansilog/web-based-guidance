Granby Gateway is a capstone for our school
our title is web based guidance management and scheduling system.

## Features

**Students**
- Book one-hour sessions (Mon–Fri, 8 AM–5 PM, lunch 12–1) from open time slots; taken times and counselor days off are blocked
- Pick a counselor or "Any Available" (assigned to the free counselor with the lightest load)
- Reschedule or cancel pending/upcoming sessions, rate completed sessions (1–5 stars)
- Notification bell for approvals, rejections, completed sessions, and follow-up recommendations
- Printable appointment slip for approved upcoming sessions (leaves out the counseling type and notes)
- Appointment history, Google Calendar sync, Granby AI campus chat

**Guidance counselors**
- Overview: pending, urgent, today's and needs-closing counts that filter the queue when clicked
- Today's schedule and a follow-up tracker with one-click reminders to students
- Appointment queue with status filter; approve (with time change) or reject with a reason
- Close sessions as Completed (private case notes, follow-up recommendation) or No-show
- Student case file with full timeline and AI case summary
- Week calendar with days off
- Notification bell, activity log, notification email and password settings

**Admin**
- Manage counselors (moving active appointments back to the shared queue on delete)
- Manage students: search, deactivate/activate, reset password
- Reports: request types, statuses, year level, course, satisfaction ratings; CSV export and printable report
- Global announcements, full activity log

**Security basics** — hashed passwords, session re-checked against the user list on every load,
deactivated accounts blocked, 15-minute idle logout, user input escaped before display.

## Project structure

```
src/
├── index.js         # Entry point + router (seeds data, migrates old data, session checks, idle logout)
├── index.html       # HTML template
├── landing.js       # Landing page
├── auth.js          # Login / register / forgot-password (EmailJS OTP)
├── store.js         # Data layer: storage access, time slots, availability, auto-assign, notifications
├── ui.js            # Shared dialog + notification bell
├── student.js       # Student portal (dashboard, booking, reschedule, rating, history, settings, AI chat)
├── guidance.js      # Counselor portal logic
├── guidanceView.js  # Counselor portal HTML templates
├── calendarView.js  # Counselor week calendar + days off
├── admin.js         # Admin portal (staff, students, reports, broadcasts, logs)
├── ai.js            # Gemini chat assistant + case summaries
├── calendar.js      # Google Calendar sync
├── syncUtil.js      # Shared helpers: hashing, HTML escaping, cross-tab sync, activity log, banner
└── styles/          # CSS per portal; styles.css holds the shared feature styles
```

All data is stored in the browser (`localStorage` / `sessionStorage`); there is no backend.
This means data is per-browser, and a technical user could still edit it with DevTools.
Moving to a real backend (e.g. Firebase) is the next step for production use.

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
