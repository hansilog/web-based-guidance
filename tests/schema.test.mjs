// Runs supabase/schema.sql in PGlite (real Postgres in WASM) with stand-ins for
// Supabase's auth schema and roles, then checks constraints, triggers and RLS.
// Run with: npm test
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

const schemaPath = fileURLToPath(
  new URL("../supabase/schema.sql", import.meta.url),
);

const db = new PGlite();
let passed = 0;

// --- Supabase stand-ins ---
await db.exec(`
  create role anon nologin;
  create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
`);
await db.exec(fs.readFileSync(schemaPath, "utf8"));
console.log("ok - schema.sql ran without errors");
passed += 1;

// Re-running must also work (the guide says it is safe)
await db.exec(fs.readFileSync(schemaPath, "utf8"));
console.log("ok - schema.sql is safe to re-run");
passed += 1;

// --- helpers ---
async function signUp(email, meta = {}) {
  const id = randomUUID();
  await db.query(
    "insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)",
    [id, email, JSON.stringify(meta)],
  );
  const { rows } = await db.query(
    "select id from public.profiles where auth_id = $1",
    [id],
  );
  return { authId: id, id: Number(rows[0].id) };
}

// Run SQL as a signed-in user (or anon when authId is null)
async function as(authId, sql, params = []) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [
    authId || "",
  ]);
  await db.exec(`set role ${authId ? "authenticated" : "anon"}`);
  try {
    return await db.query(sql, params);
  } finally {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub', '', false)");
  }
}

async function rejects(promise, pattern) {
  await assert.rejects(promise, (err) => {
    if (pattern && !pattern.test(err.message)) {
      throw new Error(`expected ${pattern}, got: ${err.message}`);
    }
    return true;
  });
}

async function test(name, fn) {
  await fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

const sql = (s, p) => db.query(s, p);

// Next weekday at least `days` ahead (Manila time is close enough for tests)
function weekday(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return localDate(d);
}

function localDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// --- users ---
const stu = await signUp("student@x.com", {
  username: "stud",
  name: "Stu Dent",
  course: "BSIT",
  consentAt: "x",
  role: "admin",
});
const stu2 = await signUp("other@x.com", {
  username: "other",
  name: "Other Kid",
});
const coun = await signUp("coun@x.com", { username: "coun", name: "Ms. C" });
const coun2 = await signUp("coun2@x.com", { username: "coun2", name: "Mr. D" });
const adm = await signUp("admin@x.com", { username: "admin", name: "Admin" });
await sql("update public.profiles set role = 'guidance' where id in ($1, $2)", [
  coun.id,
  coun2.id,
]);
await sql("update public.profiles set role = 'admin' where id = $1", [adm.id]);

const day = weekday(3);
const day2 = weekday(4);

await test("sign-up makes a student profile even if metadata asks for admin", async () => {
  const { rows } = await sql(
    "select role, name, course, consent_at from public.profiles where id = $1",
    [stu.id],
  );
  assert.equal(rows[0].role, "student");
  assert.equal(rows[0].name, "Stu Dent");
  assert.equal(rows[0].course, "BSIT");
  assert.ok(rows[0].consent_at);
});

await test("duplicate usernames are rejected (any letter case)", async () => {
  await rejects(signUp("dupe@x.com", { username: "STUD" }), /duplicate key/);
});

await test("login helpers: email_for_login and username_available work for anon", async () => {
  const r1 = await as(null, "select public.email_for_login('Stud') as e");
  assert.equal(r1.rows[0].e, "student@x.com");
  const r2 = await as(
    null,
    "select public.email_for_login('Student@X.com') as e",
  );
  assert.equal(r2.rows[0].e, "student@x.com");
  const r3 = await as(
    null,
    "select public.username_available('stud') as a, public.username_available('newname') as b",
  );
  assert.deepEqual([r3.rows[0].a, r3.rows[0].b], [false, true]);
});

await test("profiles: students see themselves and counselors only", async () => {
  const { rows } = await as(
    stu.authId,
    "select id from public.profiles order by id",
  );
  const ids = rows.map((r) => Number(r.id)).sort();
  assert.deepEqual(ids, [stu.id, coun.id, coun2.id].sort());
});

await test("profiles: staff see everyone", async () => {
  const { rows } = await as(
    coun.authId,
    "select count(*)::int as n from public.profiles",
  );
  assert.equal(rows[0].n, 5);
});

await test("profiles: a student can edit their course but not their role", async () => {
  await as(
    stu.authId,
    "update public.profiles set course = 'BSCS' where id = $1",
    [stu.id],
  );
  const { rows } = await sql(
    "select course from public.profiles where id = $1",
    [stu.id],
  );
  assert.equal(rows[0].course, "BSCS");
  await rejects(
    as(stu.authId, "update public.profiles set role = 'admin' where id = $1", [
      stu.id,
    ]),
    /administrator/,
  );
  // Can't touch someone else's row at all (0 rows, no error)
  await as(
    stu.authId,
    "update public.profiles set name = 'hacked' where id = $1",
    [stu2.id],
  );
  const other = await sql("select name from public.profiles where id = $1", [
    stu2.id,
  ]);
  assert.equal(other.rows[0].name, "Other Kid");
});

await test("profiles: admin can deactivate a student", async () => {
  await as(
    adm.authId,
    "update public.profiles set active = false where id = $1",
    [stu2.id],
  );
  const { rows } = await sql(
    "select active from public.profiles where id = $1",
    [stu2.id],
  );
  assert.equal(rows[0].active, false);
  // A deactivated account has no access
  const r = await as(
    stu2.authId,
    "select count(*)::int as n from public.appointments",
  );
  assert.equal(r.rows[0].n, 0);
  await sql("update public.profiles set active = true where id = $1", [
    stu2.id,
  ]);
});

const book = (who, id, studentId, extra = "") =>
  as(
    who,
    `insert into public.appointments (id, student_id, counselor_id, type, mode, date, time, notes, status${extra ? ", " + extra.split("=")[0] : ""})
     values ($1, $2, $3, 'Academic Guidance', 'In-person', $4, '10:00', 'help', 'pending'${extra ? ", " + extra.split("=")[1] : ""})`,
    [id, studentId, coun.id, day],
  );

await test("booking: a student books for themselves; names are filled in by the server", async () => {
  await book(stu.authId, 1001, stu.id);
  const { rows } = await sql(
    "select student_name, counselor_name, status from public.appointments where id = 1001",
  );
  assert.equal(rows[0].student_name, "Stu Dent");
  assert.equal(rows[0].counselor_name, "Ms. C");
  assert.equal(rows[0].status, "pending");
});

await test("booking: a student can't book for someone else", async () => {
  await rejects(book(stu.authId, 1002, stu2.id), /yourself|row-level security/);
});

await test("booking: the same counselor slot can't be taken twice", async () => {
  await rejects(
    book(stu2.authId, 1003, stu2.id),
    /duplicate key|appointments_slot_taken/,
  );
});

await test("booking: one active booking per student per day", async () => {
  await rejects(
    as(
      stu.authId,
      `insert into public.appointments (id, student_id, counselor_id, type, date, time)
                    values (1004, $1, $2, 'Other', $3, '11:00')`,
      [stu.id, coun2.id, day],
    ),
    /duplicate key|appointments_one_per_day/,
  );
});

await test("booking: server rejects weekends, past dates, lunch hour and days off", async () => {
  const sat = (() => {
    const d = new Date();
    d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7 || 7));
    return localDate(d);
  })();
  const tryBook = (date, time, counselor = coun2.id) =>
    as(
      stu2.authId,
      `insert into public.appointments (id, student_id, counselor_id, type, date, time)
                     values (public.new_id(), $1, $2, 'Other', $3, $4)`,
      [stu2.id, counselor, date, time],
    );
  await rejects(tryBook(sat, "10:00"), /weekends/);
  await rejects(tryBook("2020-01-06", "10:00"), /passed/);
  await rejects(tryBook(day2, "12:00"), /outside office hours/);
  await rejects(tryBook(day2, "03:00"), /outside office hours/);
  await sql(
    "insert into public.counselor_blocks (counselor_id, date) values ($1, $2)",
    [coun2.id, day2],
  );
  await rejects(tryBook(day2, "10:00"), /not available on this day/);
  await sql(
    "delete from public.counselor_blocks where counselor_id = $1 and date = $2",
    [coun2.id, day2],
  );
  await sql(`update public.settings set holidays = $1::jsonb`, [
    JSON.stringify([{ date: day2, name: "Fiesta" }]),
  ]);
  await rejects(tryBook(day2, "10:00"), /closed on this day/);
  await sql(`update public.settings set holidays = '[]'::jsonb`);
});

await test("booking: a student can't sneak in an approved status or counselor notes", async () => {
  await as(
    stu2.authId,
    `insert into public.appointments (id, student_id, counselor_id, type, date, time, status, counselor_notes, follow_up)
                         values (1005, $1, $2, 'Other', $3, '13:00', 'approved', 'fake', true)`,
    [stu2.id, coun.id, day],
  );
  const { rows } = await sql(
    "select status, counselor_notes, follow_up from public.appointments where id = 1005",
  );
  assert.deepEqual(
    [rows[0].status, rows[0].counselor_notes, rows[0].follow_up],
    ["pending", "", false],
  );
});

await test("appointments: students see only their own; staff see all", async () => {
  const s = await as(stu.authId, "select id from public.appointments");
  assert.deepEqual(
    s.rows.map((r) => Number(r.id)),
    [1001],
  );
  const c = await as(
    coun.authId,
    "select count(*)::int as n from public.appointments",
  );
  assert.equal(c.rows[0].n, 2);
});

await test("get_active_bookings shows taken slots without names", async () => {
  const { rows, fields } = await as(
    stu2.authId,
    "select * from public.get_active_bookings()",
  );
  assert.equal(rows.length, 2);
  assert.ok(!fields.some((f) => f.name.includes("name")));
  const anon = await as(
    null,
    "select count(*)::int as n from public.get_active_bookings()",
  ).catch((e) => e);
  assert.ok(anon instanceof Error, "anon can't call it");
});

await test("student updates: approve yourself is blocked; cancel is allowed", async () => {
  await rejects(
    as(
      stu.authId,
      "update public.appointments set status = 'approved' where id = 1001",
    ),
    /status change/,
  );
  await rejects(
    as(
      stu.authId,
      "update public.appointments set counselor_notes = 'x' where id = 1001",
    ),
    /counselor notes/,
  );
  await rejects(
    as(
      stu.authId,
      "update public.appointments set urgent = true where id = 1001",
    ),
    /cannot change/,
  );
});

await test("counselor approves; case notes are hidden from the student", async () => {
  await as(
    coun.authId,
    "update public.appointments set status = 'approved', decided_at = now() where id = 1001",
  );
  await as(
    coun.authId,
    "insert into public.appointment_private (appointment_id, case_notes) values (1001, 'secret')",
  );
  const s = await as(stu.authId, "select * from public.appointment_private");
  assert.equal(s.rows.length, 0);
  const c = await as(
    coun.authId,
    "select case_notes from public.appointment_private",
  );
  assert.equal(c.rows[0].case_notes, "secret");
});

await test("waitlist: cancelling frees the slot and notifies waiting students", async () => {
  await as(
    stu2.authId,
    "insert into public.waitlist (student_id, date, time, counselor_id) values ($1, $2, '10:00', $3)",
    [stu2.id, day, coun.id],
  );
  // Waiting for "any counselor" works too
  await as(
    stu2.authId,
    "insert into public.waitlist (student_id, date, time) values ($1, $2, '10:00')",
    [stu2.id, day],
  );
  await as(
    stu.authId,
    "update public.appointments set status = 'cancelled' where id = 1001",
  );
  const { rows } = await as(
    stu2.authId,
    "select message from public.notifications where message like 'A spot opened up%'",
  );
  assert.equal(rows.length, 2);
  const w = await as(
    stu2.authId,
    "select count(*)::int as n from public.waitlist where notified_at is not null",
  );
  assert.equal(w.rows[0].n, 2);
});

await test("waitlist: booking that day clears the student's entries", async () => {
  // stu2 already has 1005 on this day, so book another student instead: clear via update path
  await sql("delete from public.waitlist");
  await as(
    stu.authId,
    "insert into public.waitlist (student_id, date, time, counselor_id) values ($1, $2, '14:00', $3)",
    [stu.id, day2, coun.id],
  );
  await as(
    stu.authId,
    `insert into public.appointments (id, student_id, counselor_id, type, date, time)
                        values (1006, $1, $2, 'Other', $3, '15:00')`,
    [stu.id, coun.id, day2],
  );
  const { rows } = await sql(
    "select count(*)::int as n from public.waitlist where student_id = $1",
    [stu.id],
  );
  assert.equal(rows[0].n, 0);
});

await test("waitlist: students can't see each other's entries", async () => {
  await as(
    stu2.authId,
    "insert into public.waitlist (student_id, date, time, counselor_id) values ($1, $2, '09:00', $3)",
    [stu2.id, day2, coun.id],
  );
  const { rows } = await as(stu.authId, "select * from public.waitlist");
  assert.equal(rows.length, 0);
});

await test("reschedule: allowed back to pending at a valid time; slot is released", async () => {
  await sql("delete from public.notifications");
  await as(
    stu2.authId,
    "insert into public.waitlist (student_id, date, time, counselor_id) values ($1, $2, '15:00', $3)",
    [stu2.id, day2, coun.id],
  );
  await as(
    stu.authId,
    `update public.appointments set time = '16:00', status = 'pending',
                        rescheduled_from = '{"date":"x","time":"15:00"}', counselor_notes = '' where id = 1006`,
  );
  const { rows } = await sql(
    "select time, status from public.appointments where id = 1006",
  );
  assert.deepEqual([rows[0].time, rows[0].status], ["16:00", "pending"]);
  const n = await sql(
    "select count(*)::int as n from public.notifications where user_id = $1",
    [stu2.id],
  );
  assert.equal(n.rows[0].n, 1);
  await rejects(
    as(
      stu.authId,
      "update public.appointments set time = '12:00', status = 'pending' where id = 1006",
    ),
    /outside office hours/,
  );
});

await test("removing a day off notifies the waitlist for that day", async () => {
  await sql("delete from public.notifications");
  await sql("delete from public.waitlist");
  await as(
    coun2.authId,
    "insert into public.counselor_blocks (counselor_id, date) values ($1, $2)",
    [coun2.id, day2],
  );
  await as(
    stu2.authId,
    "insert into public.waitlist (student_id, date, time, counselor_id) values ($1, $2, '11:00', $3)",
    [stu2.id, day2, coun2.id],
  );
  // Students can't remove someone's day off
  await as(
    stu.authId,
    "delete from public.counselor_blocks where counselor_id = $1",
    [coun2.id],
  );
  assert.equal(
    (await sql("select count(*)::int as n from public.counselor_blocks"))
      .rows[0].n,
    1,
  );
  await as(
    coun2.authId,
    "delete from public.counselor_blocks where counselor_id = $1 and date = $2",
    [coun2.id, day2],
  );
  const n = await sql(
    "select count(*)::int as n from public.notifications where user_id = $1",
    [stu2.id],
  );
  assert.equal(n.rows[0].n, 1);
});

await test("rating: only completed sessions, once", async () => {
  await rejects(
    as(
      stu.authId,
      `update public.appointments set feedback = '{"rating":5}' where id = 1006`,
    ),
    /completed/,
  );
  await as(
    coun.authId,
    "update public.appointments set status = 'completed' where id = 1006",
  );
  await as(
    stu.authId,
    `update public.appointments set feedback = '{"rating":5}' where id = 1006`,
  );
  await rejects(
    as(
      stu.authId,
      `update public.appointments set feedback = '{"rating":1}' where id = 1006`,
    ),
    /once/,
  );
});

await test("notifications: own only; students may notify staff but not other students", async () => {
  await as(
    stu.authId,
    "insert into public.notifications (user_id, message) values ($1, 'to counselor')",
    [coun.id],
  );
  await rejects(
    as(
      stu.authId,
      "insert into public.notifications (user_id, message) values ($1, 'spam')",
      [stu2.id],
    ),
    /row-level security/,
  );
  const { rows } = await as(
    stu.authId,
    "select * from public.notifications where user_id <> $1",
    [stu.id],
  );
  assert.equal(rows.length, 0);
  await as(
    coun.authId,
    "insert into public.notifications (user_id, message) values ($1, 'approved')",
    [stu.id],
  );
});

await test("concerns: anon submits with forced defaults; only staff can read; status lookup by code", async () => {
  await as(
    null,
    `insert into public.concerns (ref, category, description, status, response)
                  values ('GC-ABC234', 'Bullying', 'Someone keeps pushing me in the hallway', 'resolved', 'fake')`,
  );
  const { rows } = await sql(
    "select status, response from public.concerns where ref = 'GC-ABC234'",
  );
  assert.deepEqual([rows[0].status, rows[0].response], ["new", ""]);
  await rejects(as(null, "select * from public.concerns"), /permission denied/);
  assert.equal(
    (await as(stu.authId, "select * from public.concerns")).rows.length,
    0,
  );
  assert.equal(
    (await as(coun.authId, "select * from public.concerns")).rows.length,
    1,
  );
  const s = await as(null, "select * from public.concern_status('gc-abc234')");
  assert.equal(s.rows[0].status, "new");
  assert.equal(Object.keys(s.rows[0]).includes("description"), false);
  const n = await sql(
    "select count(*)::int as n from public.notifications where message like 'New anonymous concern%'",
  );
  assert.equal(n.rows[0].n, 2, "both counselors alerted");
  await rejects(
    as(
      null,
      `insert into public.concerns (ref, category, description) values ('GC-SHORT1', 'Other', 'too short')`,
    ),
    /check constraint/,
  );
});

await test("settings, broadcasts and logs: admin-only writes, logs stamped with real name", async () => {
  await rejects(
    as(stu.authId, "update public.settings set open_hour = 6"),
    /./,
  ).catch(() => {});
  const s = await sql("select open_hour from public.settings");
  assert.equal(s.rows[0].open_hour, 8);
  await as(adm.authId, "update public.settings set open_hour = 9");
  assert.equal(
    (await sql("select open_hour from public.settings")).rows[0].open_hour,
    9,
  );
  await sql("update public.settings set open_hour = 8");
  await rejects(
    as(stu.authId, "insert into public.broadcasts (message) values ('hi')"),
    /row-level security/,
  );
  await as(adm.authId, "insert into public.broadcasts (message) values ('hi')");
  await as(
    stu.authId,
    "insert into public.activity_logs (user_name, user_role, action) values ('Admin', 'admin', 'faked')",
  );
  const l = await sql(
    "select user_name, user_role from public.activity_logs where action = 'faked'",
  );
  assert.deepEqual(
    [l.rows[0].user_name, l.rows[0].user_role],
    ["Stu Dent", "student"],
  );
  assert.equal(
    (await as(stu.authId, "select * from public.activity_logs")).rows.length,
    0,
  );
  assert.equal(
    (await as(adm.authId, "select * from public.activity_logs")).rows.length,
    1,
  );
});

await test("reminders: day-before, then hour-before, never twice", async () => {
  await sql("delete from public.notifications");
  // Build a slot ~23h and ~30min from now in Manila time, bypassing booking rules as the server would
  const at = async (msAhead, id) => {
    const { rows } = await sql(
      `select to_char((now() + $1 * interval '1 millisecond') at time zone 'Asia/Manila', 'YYYY-MM-DD') as d,
              to_char((now() + $1 * interval '1 millisecond') at time zone 'Asia/Manila', 'HH24:MI') as t`,
      [msAhead],
    );
    await sql(
      `insert into public.appointments (id, student_id, counselor_id, type, date, time, status, walk_in)
               values ($1, $2, $3, 'Other', $4, $5, 'approved', false)`,
      [id, stu2.id, coun2.id, rows[0].d, rows[0].t],
    );
  };
  await at(23 * 3600e3, 2001);
  await at(30 * 60e3, 2002);
  const first = await sql("select public.send_due_reminders() as n");
  assert.equal(first.rows[0].n, 2);
  const again = await sql("select public.send_due_reminders() as n");
  assert.equal(again.rows[0].n, 0);
  const msgs = (
    await sql(
      "select user_id, message from public.notifications order by message",
    )
  ).rows;
  assert.equal(msgs.filter((m) => m.message.startsWith("Reminder:")).length, 1);
  assert.equal(
    msgs.filter((m) => m.message.startsWith("Starting soon")).length,
    1,
  );
  assert.equal(
    msgs.filter((m) => m.message.startsWith("Coming up")).length,
    1,
    "counselor told too",
  );
  await rejects(
    as(stu.authId, "select public.send_due_reminders()"),
    /permission denied/,
  );
});

await test("meeting links: https only, set by staff, students can't change them", async () => {
  await as(
    coun.authId,
    "update public.appointments set meeting_link = 'https://meet.google.com/abc-defg-hij' where id = 2001",
  );
  await rejects(
    as(
      coun.authId,
      "update public.appointments set meeting_link = 'javascript:alert(1)' where id = 2001",
    ),
    /appointments_meeting_link_https|check constraint/,
  );
  await rejects(
    as(
      coun.authId,
      "update public.appointments set meeting_link = 'http://meet.google.com/x' where id = 2001",
    ),
    /appointments_meeting_link_https|check constraint/,
  );
  await rejects(
    as(
      stu2.authId,
      "update public.appointments set meeting_link = 'https://evil.example' where id = 2001",
    ),
    /cannot change/,
  );
  const { rows } = await sql(
    "select meeting_link from public.appointments where id = 2001",
  );
  assert.equal(rows[0].meeting_link, "https://meet.google.com/abc-defg-hij");
});

await test("limits: 3 upcoming bookings and 5 waitlist entries per student", async () => {
  const s = await signUp("limits@x.com", {
    username: "limits",
    name: "Lim Its",
  });
  const book = (offset, id) =>
    as(
      s.authId,
      `insert into public.appointments (id, student_id, counselor_id, type, date, time)
                  values ($1, $2, $3, 'Other', $4, '09:00')`,
      [id, s.id, coun.id, weekday(offset)],
    );
  // 3 days apart (and after day2) so weekend roll-over never lands two on one date
  await book(7, 3001);
  await book(10, 3002);
  await book(13, 3003);
  await rejects(book(16, 3004), /3 upcoming sessions/);
  // Cancelling one frees a place
  await as(
    s.authId,
    "update public.appointments set status = 'cancelled' where id = 3003",
  );
  await book(16, 3004);

  const wait = (offset, time) =>
    as(
      s.authId,
      "insert into public.waitlist (student_id, date, time, counselor_id) values ($1, $2, $3, $4)",
      [s.id, weekday(offset), time, coun.id],
    );
  for (const t of ["08:00", "10:00", "11:00", "13:00", "14:00"])
    await wait(9, t);
  await rejects(wait(9, "15:00"), /up to 5 times/);
  await rejects(wait(-30, "10:00"), /already passed/);
});

await test("unanswered requests expire after their time and the student is told", async () => {
  await sql("delete from public.notifications");
  // A pending request whose time has already passed (inserted as the server would)
  const { rows } = await sql(
    `select to_char((now() - interval '2 hours') at time zone 'Asia/Manila', 'YYYY-MM-DD') as d,
            to_char((now() - interval '2 hours') at time zone 'Asia/Manila', 'HH24:MI') as t`,
  );
  await sql(
    `insert into public.appointments (id, student_id, counselor_id, type, date, time, status)
             values (4001, $1, $2, 'Academic Guidance', $3, $4, 'pending')`,
    [stu.id, coun.id, rows[0].d, rows[0].t],
  );
  const n = (await sql("select public.expire_stale_requests() as n")).rows[0].n;
  assert.ok(n >= 1);
  const a = (
    await sql(
      "select status, counselor_notes from public.appointments where id = 4001",
    )
  ).rows[0];
  assert.equal(a.status, "rejected");
  assert.match(a.counselor_notes, /expired/);
  const note = await sql(
    "select message from public.notifications where user_id = $1",
    [stu.id],
  );
  assert.ok(
    note.rows.some((r) =>
      /expired before a counselor could answer/.test(r.message),
    ),
  );
  // Future pending requests are untouched
  const future = await sql(
    "select count(*)::int as n from public.appointments where status = 'pending' and id = 3001",
  );
  assert.equal(future.rows[0].n, 1);
  await rejects(
    as(stu.authId, "select public.expire_stale_requests()"),
    /permission denied/,
  );
});

await test("deleting a counselor keeps appointments (unassigned)", async () => {
  await as(adm.authId, "delete from public.profiles where id = $1", [coun2.id]);
  const { rows } = await sql(
    "select counselor_id from public.appointments where id = 2001",
  );
  assert.equal(rows[0].counselor_id, null);
});

console.log(`\n${passed} checks passed`);
