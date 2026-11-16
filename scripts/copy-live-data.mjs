// Copies the live demo data (signed in as the demo accounts) into the app's
// localStorage format for the offline build (webpack.offline.js).
// Usage: npm run copy-live-data
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const [dirArg = ".", outFile = "offline/seed.json"] = process.argv.slice(2);
const projectDir = path.resolve(dirArg);
const req = createRequire(path.join(projectDir, "package.json"));
const { createClient } = await import(
  pathToFileURL(req.resolve("@supabase/supabase-js")).href
);
const { createSync } = await import(
  pathToFileURL(path.join(projectDir, "src/remote.js")).href
);

const env = Object.fromEntries(
  fs
    .readFileSync(path.join(projectDir, ".env"), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("="))
    .map((l) => [
      l.slice(0, l.indexOf("=")).trim(),
      l
        .slice(l.indexOf("=") + 1)
        .trim()
        .replace(/^["']|["']$/g, ""),
    ]),
);

async function dumpAs(login, password) {
  const client = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: email, error: e1 } = await client.rpc("email_for_login", {
    p_identifier: login,
  });
  if (e1) throw e1;
  const { error: e2 } = await client.auth.signInWithPassword({
    email,
    password,
  });
  if (e2) throw e2;
  const { data: profile } = await client
    .from("profiles")
    .select("role")
    .eq("username", login)
    .single();
  const sync = createSync(client);
  const keys = await sync.load(profile.role);
  const out = {};
  keys.forEach((k) => {
    out[k] = sync.read(k);
  });
  await client.auth.signOut();
  return out;
}

const admin = await dumpAs("admin123", "admin123");
const counselor = await dumpAs("counselor1", "counselor1");
const student = await dumpAs("student1", "student1");

// Notifications: each account only sees its own, so merge them
const notes = new Map();
[admin, counselor, student].forEach((d) =>
  (d.gh_notifications || []).forEach((n) => notes.set(n.id, n)),
);
const data = { ...admin, gh_notifications: [...notes.values()] };
// Case notes are visible to staff: the counselor's copy has them
data.gh_appointments =
  counselor.gh_appointments.length >= admin.gh_appointments.length
    ? counselor.gh_appointments
    : admin.gh_appointments;
delete data.gh_booked_slots; // server-only helper list

fs.mkdirSync(path.dirname(path.resolve(outFile)), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify(data));
console.log(
  Object.entries(data)
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.length : "object"}`)
    .join("\n"),
);
