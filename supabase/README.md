# Connecting Granby Gateway to Supabase

The app runs on the browser's localStorage until you give it a Supabase project.
These steps take about 15 minutes. Dashboard menu names may differ slightly from
what's written here.

## 1. Create the project

1. Sign up at [supabase.com](https://supabase.com) and click **New project**.
2. Pick a name (e.g. `granby-gateway`), a strong database password (save it), and the
   region closest to you (Singapore for the Philippines).

## 2. Create the tables

1. Open **SQL Editor → New query**.
2. Paste all of [`schema.sql`](schema.sql) and click **Run**. It should finish with "Success".
3. For reminders: open **Database → Extensions**, enable **pg_cron**, then run `schema.sql`
   again (it's safe to re-run). This schedules reminders every 5 minutes.

## 3. Set up sign-in emails

In **Authentication**:

1. **URL Configuration**: set **Site URL** to where the app runs (`http://localhost:8080` while
   testing) and add your deployed address (e.g. `https://<user>.github.io/<repo>/**`) to
   **Redirect URLs**. Confirmation and password-reset links only open allowed addresses.
2. **Sign In / Providers → Email**: minimum password length 8 (the app requires 8).
3. **Recommended: SMTP settings.** Supabase's built-in sender is for testing: on the free plan
   it sends only about **2 emails per hour** for the whole project (sign-up confirmations and
   reset links count together). Add your own sender (for example a Gmail account with an app
   password) before inviting real users.

Password resets use Supabase's default email, which contains a link. The link opens the app
on a "Choose a new password" screen, on any device. (Free projects can't edit email templates
without their own SMTP sender, so the app doesn't rely on custom templates.)

"Confirm email" is on by default: new students click a link in their email before they
can sign in. Leave it on.

## 4. Connect the app

1. Open **Project Settings → API** and copy the **Project URL** and the **anon / publishable** key.
   (Never use the `service_role` / secret key in the app.)
2. In the project folder, copy `.env.example` to `.env` and fill in:

   ```
   SUPABASE_URL=https://xxxx.supabase.co
   SUPABASE_ANON_KEY=eyJ...
   ```

3. Restart `npm start`. The app now reads and writes Supabase.

The anon key is meant to be public; Row Level Security in `schema.sql` is what keeps data
private. For `npm run deploy`, build on a computer that has the `.env` file.

## 5. Create the first admin

1. In the app, register a normal account with the email you want as admin, and confirm it.
2. In **SQL Editor**, run (with your email):

   ```sql
   update public.profiles set role = 'admin' where email = 'you@example.com';
   ```

3. Sign in. Add counselors from **Manage Staff**. Each one gets a confirmation email
   and must click it before signing in.

## What changes with Supabase

|                                           | localStorage                             | Supabase                                                       |
| ----------------------------------------- | ---------------------------------------- | -------------------------------------------------------------- |
| Data                                      | Only in one browser                      | Shared by everyone, live                                       |
| Passwords                                 | Hashed in the browser                    | Supabase Auth (bcrypt), rate-limited                           |
| Password reset                            | EmailJS code                             | Supabase email link                                            |
| Admin "Reset password"                    | Shows a temporary password               | Emails the student a reset link                                |
| Double-booking                            | Checked in the browser                   | Blocked by the database                                        |
| Booking rules (hours, holidays, days off) | Browser only                             | Also enforced by the database                                  |
| Privacy                                   | Anyone with DevTools can read everything | Students only get their own records; case notes are staff-only |
| Reminders                                 | While the app is open                    | Every 5 minutes on the server (pg_cron), in-app notifications  |
| Waitlist and concern alerts               | In the browser                           | Database triggers                                              |

Things that work differently:

- **Day-before reminder emails** aren't sent in Supabase mode yet; reminders arrive as
  in-app notifications. Booking and status emails still go through EmailJS.
- **Sign-in emails can't be edited** in the app (student settings and the admin's counselor
  form). Change them in the dashboard under Authentication → Users and in the profiles table.
- **Deleting a counselor** removes their profile. Their sign-in can't be used anymore,
  and the Auth user can be deleted from the dashboard.
- The free plan **pauses a project after about a week without activity**. Open the
  dashboard the day before a demo to make sure it's running.

## Tests

`schema.sql` and the sync code in `src/remote.js` were tested against real PostgreSQL
(PGlite) with stand-ins for Supabase's `auth` schema: constraints, triggers, Row Level
Security for every role, reminders, and the app's cache sync. Supabase Auth itself
(sign-up, sign-in, reset emails) was not tested and needs a real project.
