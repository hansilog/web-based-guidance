// End-to-end test of src/remote.js's sync engine against supabase/schema.sql.
// A tiny stand-in for supabase-js turns its query builder calls into SQL and
// runs them in PGlite as a given user, so RLS and triggers are real.
// Run with: npm test
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const remote = await import(
  pathToFileURL(path.join(root, "src/remote.js")).href
);
const { createSync, COLLECTIONS } = remote;

const db = new PGlite();
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
await db.exec(fs.readFileSync(path.join(root, "supabase/schema.sql"), "utf8"));

// --- run SQL as a user, one at a time (role switching isn't concurrent-safe) ---
let lock = Promise.resolve();
function as(authId, sql, params = []) {
  const run = async () => {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [
      authId || "",
    ]);
    await db.exec(`set role ${authId ? "authenticated" : "anon"}`);
    try {
      return await db.query(sql, params);
    } finally {
      await db.exec("reset role");
    }
  };
  const result = lock.then(run, run);
  lock = result.catch(() => {});
  return result;
}

const wrap = async (fn) => {
  try {
    return { data: await fn(), error: null };
  } catch (e) {
    return { data: null, error: { code: e.code, message: e.message } };
  }
};
const param = (v) =>
  v !== null && typeof v === "object" ? JSON.stringify(v) : v;

// --- minimal supabase-js look-alike ---
function fakeClient(authId) {
  const log = [];
  class Query {
    constructor(table) {
      this.table = table;
    }
    select() {
      this.op = "select";
      return this;
    }
    order(column, { ascending }) {
      this.orderBy = `order by ${column} ${ascending ? "asc" : "desc"}`;
      return this;
    }
    range(from, to) {
      return wrap(async () => {
        const { rows } = await as(
          authId,
          `select to_jsonb(t) as r from public.${this.table} t ${this.orderBy || ""} limit ${to - from + 1} offset ${from}`,
        );
        return rows.map((x) => x.r);
      });
    }
    limit(n) {
      return this.range(0, n - 1);
    }
    insert(row) {
      log.push(["insert", this.table, row]);
      const cols = Object.keys(row);
      return wrap(() =>
        as(
          authId,
          `insert into public.${this.table} (${cols.map((c) => `"${c}"`).join(", ")}) values (${cols.map((_, i) => `$${i + 1}`).join(", ")})`,
          cols.map((c) => param(row[c])),
        ),
      );
    }
    upsert(row) {
      log.push(["upsert", this.table, row]);
      const cols = Object.keys(row);
      const key = cols[0];
      return wrap(() =>
        as(
          authId,
          `insert into public.${this.table} (${cols.join(", ")}) values (${cols.map((_, i) => `$${i + 1}`).join(", ")})
           on conflict (${key}) do update set ${cols
             .slice(1)
             .map((c) => `${c} = excluded.${c}`)
             .join(", ")}`,
          cols.map((c) => param(row[c])),
        ),
      );
    }
    update(changes) {
      this.op = "update";
      this.changes = changes;
      return this;
    }
    delete() {
      this.op = "delete";
      return this;
    }
    match(m) {
      log.push([this.op, this.table, this.changes || null, m]);
      const mk = Object.keys(m);
      if (this.op === "update") {
        const ck = Object.keys(this.changes);
        return wrap(() =>
          as(
            authId,
            `update public.${this.table} set ${ck.map((c, i) => `"${c}" = $${i + 1}`).join(", ")}
             where ${mk.map((c, i) => `"${c}" = $${ck.length + i + 1}`).join(" and ")}`,
            [...ck.map((c) => param(this.changes[c])), ...mk.map((c) => m[c])],
          ),
        );
      }
      return wrap(() =>
        as(
          authId,
          `delete from public.${this.table} where ${mk.map((c, i) => `"${c}" = $${i + 1}`).join(" and ")}`,
          mk.map((c) => m[c]),
        ),
      );
    }
  }
  return {
    log,
    from: (table) => new Query(table),
    rpc: (name) =>
      wrap(async () => {
        const { rows } = await as(
          authId,
          `select to_jsonb(f) as r from public.${name}() f`,
        );
        return rows.map((x) => x.r);
      }),
  };
}

// --- people ---
async function signUp(email, meta = {}) {
  const id = randomUUID();
  await db.query("insert into auth.users values ($1, $2, $3)", [
    id,
    email,
    JSON.stringify(meta),
  ]);
  const { rows } = await db.query(
    "select id from public.profiles where auth_id = $1",
    [id],
  );
  return { authId: id, id: Number(rows[0].id) };
}
const stu = await signUp("s1@x.com", { username: "s1", name: "Stu One" });
const stu2 = await signUp("s2@x.com", { username: "s2", name: "Stu Two" });
const coun = await signUp("c1@x.com", { username: "c1", name: "Ms. C" });
const adm = await signUp("a@x.com", { username: "adm", name: "Admin" });
await db.query("update public.profiles set role = 'guidance' where id = $1", [
  coun.id,
]);
await db.query("update public.profiles set role = 'admin' where id = $1", [
  adm.id,
]);

function weekday(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const day = weekday(3);

let passed = 0;
async function test(name, fn) {
  await fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

function session(user, role) {
  const errors = [];
  const changes = [];
  const client = fakeClient(user?.authId);
  const sync = createSync(client, {
    onError: (m) => errors.push(m),
    onChange: (k) => changes.push(k),
  });
  return { sync, client, errors, changes, load: () => sync.load(role) };
}

const S1 = session(stu, "student");
const S2 = session(stu2, "student");
const C = session(coun, "guidance");
const A = session(adm, "admin");
await Promise.all([S1.load(), S2.load(), C.load(), A.load()]);

await test("load: each role gets what RLS allows, in the app's shape", async () => {
  const users = S1.sync.read("gh_users");
  assert.deepEqual(users.map((u) => u.name).sort(), ["Ms. C", "Stu One"]);
  assert.equal(users.find((u) => u.name === "Stu One").user, "s1");
  assert.equal(C.sync.read("gh_users").length, 4);
  assert.deepEqual(S1.sync.read("gh_settings"), {
    openHour: 8,
    closeHour: 17,
    lunchHour: 12,
    holidays: [],
  });
  assert.equal(
    S1.sync.read("gh_concerns"),
    undefined,
    "students never load concerns",
  );
  assert.equal(A.sync.read("gh_activity_logs").length, 0);
});

await test("booking through the cache creates the row; server fills in names", async () => {
  const apps = S1.sync.read("gh_appointments") || [];
  S1.sync.write("gh_appointments", [
    ...apps,
    {
      id: 500,
      studentId: stu.id,
      counselorId: coun.id,
      counselorName: "x",
      type: "Academic Guidance",
      mode: "In-person",
      urgent: false,
      date: day,
      time: "10:00",
      notes: "help",
      status: "pending",
      counselorNotes: "",
      checkIn: { score: 3, level: "Low", answers: [1, 1, 1, 0, 0] },
      reminders: {},
    },
  ]);
  await S1.sync.flush();
  assert.deepEqual(S1.errors, []);
  const { rows } = await db.query(
    "select student_name, counselor_name, check_in from public.appointments where id = 500",
  );
  assert.equal(rows[0].student_name, "Stu One");
  assert.equal(rows[0].counselor_name, "Ms. C");
  assert.equal(rows[0].check_in.level, "Low");
});

await test("other students see the slot as taken (nameless list), not the appointment", async () => {
  await S2.sync.refresh("gh_booked_slots");
  await S2.sync.refresh("gh_appointments");
  assert.equal(S2.sync.read("gh_appointments").length, 0);
  const slots = S2.sync.read("gh_booked_slots");
  assert.equal(slots.length, 1);
  assert.deepEqual(Object.keys(slots[0]).sort(), [
    "counselorId",
    "date",
    "id",
    "status",
    "time",
  ]);
  assert.equal(slots[0].date, day, "dates come back as YYYY-MM-DD strings");
});

await test("double booking is refused with a friendly message and the cache recovers", async () => {
  S2.sync.write("gh_appointments", [
    {
      id: 501,
      studentId: stu2.id,
      counselorId: coun.id,
      type: "Other",
      date: day,
      time: "10:00",
      status: "pending",
    },
  ]);
  await S2.sync.flush();
  await new Promise((r) => setTimeout(r, 20));
  assert.match(S2.errors[0], /just booked by someone else/);
  assert.equal(
    S2.sync.read("gh_appointments").length,
    0,
    "phantom booking removed",
  );
  assert.ok(S2.changes.includes("gh_appointments"), "screen told to redraw");
});

await test("updates send only the changed columns", async () => {
  await C.sync.refresh("gh_appointments");
  const apps = C.sync.read("gh_appointments");
  C.client.log.length = 0;
  C.sync.write(
    "gh_appointments",
    apps.map((a) =>
      a.id === 500
        ? {
            ...a,
            status: "approved",
            counselorNotes: "Bring ID",
            decidedAt: new Date().toISOString(),
          }
        : a,
    ),
  );
  await C.sync.flush();
  const [op] = C.client.log;
  assert.equal(op[0], "update");
  assert.deepEqual(Object.keys(op[2]).sort(), [
    "counselor_notes",
    "decided_at",
    "status",
  ]);
  assert.deepEqual(op[3], { id: 500 });
});

await test("case notes go to the private table and never reach the student", async () => {
  const apps = C.sync.read("gh_appointments");
  C.sync.write(
    "gh_appointments",
    apps.map((a) => (a.id === 500 ? { ...a, caseNotes: "very private" } : a)),
  );
  await C.sync.flush();
  const { rows } = await db.query(
    "select case_notes from public.appointment_private where appointment_id = 500",
  );
  assert.equal(rows[0].case_notes, "very private");
  await C.sync.refresh("gh_appointments");
  assert.equal(C.sync.read("gh_appointments")[0].caseNotes, "very private");
  await S1.sync.refresh("gh_appointments");
  assert.equal(S1.sync.read("gh_appointments")[0].caseNotes, undefined);
});

await test("a student trying to approve themselves is rejected and rolled back", async () => {
  await S1.sync.refresh("gh_appointments");
  const apps = S1.sync.read("gh_appointments");
  S1.sync.write(
    "gh_appointments",
    apps.map((a) => ({ ...a, status: "completed" })),
  );
  await S1.sync.flush();
  await new Promise((r) => setTimeout(r, 20));
  assert.match(S1.errors.at(-1), /permission/);
  assert.equal(S1.sync.read("gh_appointments")[0].status, "approved");
});

await test("waitlist: 'auto' round-trips as NULL; cancelling alerts the waiting student", async () => {
  S2.sync.write("gh_waitlist", [
    {
      id: 900,
      studentId: stu2.id,
      date: day,
      time: "10:00",
      counselorId: "auto",
      notifiedAt: null,
    },
  ]);
  await S2.sync.flush();
  const { rows } = await db.query(
    "select counselor_id from public.waitlist where id = 900",
  );
  assert.equal(rows[0].counselor_id, null);
  await S2.sync.refresh("gh_waitlist");
  assert.equal(S2.sync.read("gh_waitlist")[0].counselorId, "auto");

  const apps = S1.sync.read("gh_appointments");
  S1.sync.write(
    "gh_appointments",
    apps.map((a) => ({ ...a, status: "cancelled" })),
  );
  await S1.sync.flush();
  await S2.sync.refresh("gh_notifications");
  assert.ok(
    S2.sync
      .read("gh_notifications")
      .some((n) => /spot opened up/.test(n.message)),
  );
});

await test("notifications: mark read and clear go through; students can't message students", async () => {
  const mine = S2.sync.read("gh_notifications");
  S2.sync.write(
    "gh_notifications",
    mine.map((n) => ({ ...n, read: true })),
  );
  await S2.sync.flush();
  const r = await db.query(
    "select bool_and(is_read) as all_read from public.notifications where user_id = $1",
    [stu2.id],
  );
  assert.equal(r.rows[0].all_read, true);
  // Silent table: a refused insert doesn't pop up an error
  const before = S1.errors.length;
  S1.sync.write("gh_notifications", [
    { id: 77, userId: stu2.id, message: "spam", read: false },
  ]);
  await S1.sync.flush();
  assert.equal(S1.errors.length, before);
  S2.sync.write("gh_notifications", []);
  await S2.sync.flush();
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from public.notifications where user_id = $1",
        [stu2.id],
      )
    ).rows[0].n,
    0,
  );
});

await test("days off: composite key insert and delete", async () => {
  C.sync.write("gh_counselor_blocks", [
    { counselorId: coun.id, date: weekday(10), reason: "Day off" },
  ]);
  await C.sync.flush();
  assert.equal(
    (await db.query("select count(*)::int n from public.counselor_blocks"))
      .rows[0].n,
    1,
  );
  C.sync.write("gh_counselor_blocks", []);
  await C.sync.flush();
  assert.equal(
    (await db.query("select count(*)::int n from public.counselor_blocks"))
      .rows[0].n,
    0,
  );
  assert.deepEqual(C.errors, []);
});

await test("settings: single row; admin saves, student is refused", async () => {
  A.sync.write("gh_settings", {
    openHour: 9,
    closeHour: 16,
    lunchHour: null,
    holidays: [{ date: weekday(20), name: "Fiesta" }],
  });
  await A.sync.flush();
  const { rows } = await db.query(
    "select open_hour, close_hour, lunch_hour, holidays from public.settings",
  );
  assert.deepEqual(
    [rows[0].open_hour, rows[0].close_hour, rows[0].lunch_hour],
    [9, 16, null],
  );
  assert.equal(rows[0].holidays[0].name, "Fiesta");
  await S1.sync.refresh("gh_settings");
  assert.equal(S1.sync.read("gh_settings").openHour, 9);
  A.sync.write("gh_settings", {
    openHour: 8,
    closeHour: 17,
    lunchHour: 12,
    holidays: [],
  });
  await A.sync.flush();
});

await test("activity log: append-only, stamped with the real user", async () => {
  const logs = A.sync.read("gh_activity_logs");
  A.sync.write("gh_activity_logs", [
    ...logs,
    {
      id: 1,
      timestamp: new Date().toISOString(),
      userName: "x",
      userRole: "y",
      action: "Posted",
    },
  ]);
  S1.sync.write("gh_activity_logs", [
    {
      id: 2,
      timestamp: new Date().toISOString(),
      userName: "Admin",
      userRole: "admin",
      action: "Booked",
    },
  ]);
  await Promise.all([A.sync.flush(), S1.sync.flush()]);
  await A.sync.refresh("gh_activity_logs");
  const after = A.sync.read("gh_activity_logs");
  assert.deepEqual(
    after.map((l) => [l.userName, l.action]),
    [
      ["Admin", "Posted"],
      ["Stu One", "Booked"],
    ],
  );
  // Trimming in the app never deletes from the database
  A.sync.write("gh_activity_logs", after.slice(-1));
  await A.sync.flush();
  assert.equal(
    (await db.query("select count(*)::int n from public.activity_logs")).rows[0]
      .n,
    2,
  );
});

await test("broadcasts: newest first; only admin can post", async () => {
  A.sync.write("gh_global_broadcasts", [
    { id: 11, message: "First", date: "Nov 1" },
  ]);
  await A.sync.flush();
  await new Promise((r) => setTimeout(r, 5));
  A.sync.write("gh_global_broadcasts", [
    { id: 12, message: "Second", date: "Nov 2" },
    ...A.sync.read("gh_global_broadcasts"),
  ]);
  await A.sync.flush();
  await S1.sync.refresh("gh_global_broadcasts");
  assert.deepEqual(
    S1.sync.read("gh_global_broadcasts").map((b) => b.message),
    ["Second", "First"],
  );
  S1.sync.write("gh_global_broadcasts", [
    { id: 13, message: "Hack", date: "" },
  ]);
  await S1.sync.flush();
  await new Promise((r) => setTimeout(r, 20));
  assert.match(S1.errors.at(-1), /permission|saved/);
});

await test("anonymous concern: insert works without reading anything back", async () => {
  const anon = session(null, null);
  anon.sync.write("gh_concerns", [
    {
      id: 31,
      ref: "GC-QWERTY",
      category: "Bullying",
      description: "Someone keeps taking my lunch money",
      location: "",
      when: "",
      contact: "",
    },
  ]);
  await anon.sync.flush();
  assert.deepEqual(anon.errors, []);
  await C.sync.refresh("gh_concerns");
  const [c] = C.sync.read("gh_concerns");
  assert.equal(c.ref, "GC-QWERTY");
  C.sync.write("gh_concerns", [
    { ...c, status: "resolved", response: "Handled", handledBy: "Ms. C" },
  ]);
  await C.sync.flush();
  assert.equal(
    (await db.query("select status from public.concerns")).rows[0].status,
    "resolved",
  );
});

await test("profiles: admin deactivates a student; student edits own course but not role", async () => {
  const users = A.sync.read("gh_users");
  A.sync.write(
    "gh_users",
    users.map((u) => (u.id === stu2.id ? { ...u, active: false } : u)),
  );
  await A.sync.flush();
  assert.equal(
    (
      await db.query("select active from public.profiles where id = $1", [
        stu2.id,
      ])
    ).rows[0].active,
    false,
  );

  const mine = S1.sync.read("gh_users");
  S1.sync.write(
    "gh_users",
    mine.map((u) => (u.id === stu.id ? { ...u, course: "BSCS" } : u)),
  );
  await S1.sync.flush();
  assert.equal(
    (
      await db.query("select course from public.profiles where id = $1", [
        stu.id,
      ])
    ).rows[0].course,
    "BSCS",
  );
  S1.sync.write(
    "gh_users",
    S1.sync
      .read("gh_users")
      .map((u) => (u.id === stu.id ? { ...u, role: "admin" } : u)),
  );
  await S1.sync.flush();
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(
    (await db.query("select role from public.profiles where id = $1", [stu.id]))
      .rows[0].role,
    "student",
  );
  assert.equal(
    S1.sync.read("gh_users").find((u) => u.id === stu.id).role,
    "student",
    "cache rolled back",
  );
});

await test("every collection maps to a real table/function in the schema", async () => {
  for (const [key, spec] of Object.entries(COLLECTIONS)) {
    if (spec.rpc) continue;
    const cols = (
      await db.query(
        "select column_name from information_schema.columns where table_schema = 'public' and table_name = $1",
        [spec.table],
      )
    ).rows.map((r) => r.column_name);
    for (const [, col] of spec.fields)
      assert.ok(cols.includes(col), `${key}: ${spec.table}.${col} missing`);
  }
});

console.log(`\n${passed} sync checks passed`);
