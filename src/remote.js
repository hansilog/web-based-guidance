// remote.js
// --- SUPABASE BACKEND: keeps store.js synchronous with an in-memory cache ---
//
// How it works:
// 1. After sign-in, loadAll() fetches every table the user may see (Row Level
//    Security decides what that is) into a cache, shaped like the old
//    localStorage collections.
// 2. store.js reads from the cache and writes whole collections back as before.
//    Each write is compared with the cache and only the differences (inserts,
//    updates, deletes) are sent to Supabase in the background.
// 3. Changes made by other people arrive through Supabase Realtime. The table
//    is re-fetched and a "storage" event is fired, so the existing
//    listenForRealTimeUpdates() code redraws the screen.
//
// When SUPABASE_URL / SUPABASE_ANON_KEY are not set at build time, isRemote is
// false and the app keeps using localStorage exactly as before.
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL =
  typeof __SUPABASE_URL__ !== "undefined" ? __SUPABASE_URL__ : "";
const SUPABASE_KEY =
  typeof __SUPABASE_ANON_KEY__ !== "undefined" ? __SUPABASE_ANON_KEY__ : "";

export const isRemote = Boolean(SUPABASE_URL && SUPABASE_KEY);
export const supabase = isRemote
  ? createClient(SUPABASE_URL, SUPABASE_KEY, {
      // Links in emails (reset, confirm) must work on any device; PKCE would
      // only accept them in the browser that asked
      auth: { flowType: "implicit" },
    })
  : null;

// --- 1. COLLECTIONS: app shape <-> table columns ---

// "Any available counselor" is "auto" in the app and NULL in the database
const autoCounselor = {
  to: (v) => (v === "auto" ? null : v),
  from: (v) => (v == null ? "auto" : v),
};

export const COLLECTIONS = {
  gh_users: {
    table: "profiles",
    key: ["id"],
    // Accounts are created by Supabase Auth sign-up, never inserted directly
    noInsert: true,
    fields: [
      ["id", "id"],
      ["user", "username"],
      ["name", "name"],
      ["email", "email"],
      ["role", "role"],
      ["yearLevel", "year_level"],
      ["course", "course"],
      ["section", "section"],
      ["specialty", "specialty"],
      ["notifyEmail", "notify_email"],
      ["active", "active"],
      ["consentAt", "consent_at"],
    ],
  },
  gh_appointments: {
    table: "appointments",
    key: ["id"],
    fields: [
      ["id", "id"],
      ["studentId", "student_id"],
      ["studentName", "student_name"],
      ["studentEmail", "student_email"],
      ["counselorId", "counselor_id"],
      ["counselorName", "counselor_name"],
      ["type", "type"],
      ["mode", "mode"],
      ["walkIn", "walk_in"],
      ["urgent", "urgent"],
      ["date", "date"],
      ["time", "time"],
      ["notes", "notes"],
      ["status", "status"],
      ["counselorNotes", "counselor_notes"],
      ["followUp", "follow_up"],
      ["followUpRemindedAt", "follow_up_reminded_at"],
      ["checkedOnAt", "checked_on_at"],
      ["meetingLink", "meeting_link"],
      ["feedback", "feedback"],
      ["checkIn", "check_in"],
      ["reminders", "reminders"],
      ["rescheduledFrom", "rescheduled_from"],
      ["rescheduleReason", "reschedule_reason"],
      ["decidedAt", "decided_at"],
      ["createdAt", "created_at"],
    ],
    // caseNotes is stored in appointment_private (staff only)
    privateField: "caseNotes",
  },
  gh_counselor_blocks: {
    table: "counselor_blocks",
    key: ["counselorId", "date"],
    fields: [
      ["counselorId", "counselor_id"],
      ["date", "date"],
      ["reason", "reason"],
    ],
  },
  gh_notifications: {
    table: "notifications",
    key: ["id"],
    silent: true,
    fields: [
      ["id", "id"],
      ["userId", "user_id"],
      ["message", "message"],
      ["read", "is_read"],
      ["createdAt", "created_at"],
    ],
  },
  gh_waitlist: {
    table: "waitlist",
    key: ["id"],
    fields: [
      ["id", "id"],
      ["studentId", "student_id"],
      ["date", "date"],
      ["time", "time"],
      ["counselorId", "counselor_id", autoCounselor],
      ["notifiedAt", "notified_at"],
      ["createdAt", "created_at"],
    ],
  },
  gh_concerns: {
    table: "concerns",
    key: ["id"],
    staffOnly: true,
    fields: [
      ["id", "id"],
      ["ref", "ref"],
      ["category", "category"],
      ["description", "description"],
      ["location", "location"],
      ["when", "when_text"],
      ["contact", "contact"],
      ["status", "status"],
      ["response", "response"],
      ["internalNotes", "internal_notes"],
      ["handledBy", "handled_by"],
      ["createdAt", "created_at"],
    ],
  },
  gh_settings: {
    table: "settings",
    key: ["id"],
    // One object in the app, one row (id = 1) in the database
    single: true,
    fields: [
      ["id", "id"],
      ["openHour", "open_hour"],
      ["closeHour", "close_hour"],
      ["lunchHour", "lunch_hour"],
      ["maxPerDay", "max_per_day"],
      ["holidays", "holidays"],
    ],
  },
  gh_global_broadcasts: {
    table: "broadcasts",
    key: ["id"],
    order: { column: "created_at", ascending: false },
    fields: [
      ["id", "id"],
      ["message", "message"],
      ["date", "date"],
    ],
  },
  gh_activity_logs: {
    table: "activity_logs",
    key: ["id"],
    adminOnly: true,
    // The log is never edited or trimmed from the app
    appendOnly: true,
    silent: true,
    fields: [
      ["id", "id"],
      ["timestamp", "timestamp"],
      ["userName", "user_name"],
      ["userRole", "user_role"],
      ["action", "action"],
    ],
  },
  // Every taken slot (no names), so students can see which times are free
  gh_booked_slots: {
    rpc: "get_active_bookings",
    readOnly: true,
    fields: [
      ["id", "id"],
      ["counselorId", "counselor_id"],
      ["date", "date"],
      ["time", "time"],
      ["status", "status"],
    ],
  },
};

// Which table change should refresh which collection(s)
const TABLE_TO_KEYS = {
  appointments: ["gh_appointments", "gh_booked_slots"],
  appointment_private: ["gh_appointments"],
};
Object.entries(COLLECTIONS).forEach(([key, spec]) => {
  if (spec.table && !TABLE_TO_KEYS[spec.table])
    TABLE_TO_KEYS[spec.table] = [key];
});

// --- 2. PURE HELPERS (exported for tests) ---

export const clone = (value) =>
  value === undefined ? undefined : JSON.parse(JSON.stringify(value));

export function toRow(spec, item) {
  const row = {};
  spec.fields.forEach(([appKey, column, transform]) => {
    if (item[appKey] === undefined) return;
    row[column] = transform ? transform.to(item[appKey]) : item[appKey];
  });
  return row;
}

export function fromRow(spec, row) {
  const item = {};
  spec.fields.forEach(([appKey, column, transform]) => {
    if (!(column in row)) return;
    item[appKey] = transform ? transform.from(row[column]) : row[column];
  });
  return item;
}

const keyOf = (spec, item) => spec.key.map((k) => String(item[k])).join("|");

// The WHERE clause that finds this item's row
const matchOf = (spec, item) =>
  toRow(
    { fields: spec.fields.filter(([appKey]) => spec.key.includes(appKey)) },
    item,
  );

// Differences between two versions of a collection, as database operations
export function diffCollection(spec, before, after) {
  const list = (v) => {
    if (spec.single) return v ? [{ id: 1, ...v }] : [];
    return Array.isArray(v) ? v : [];
  };
  const oldMap = new Map(list(before).map((i) => [keyOf(spec, i), i]));
  const newMap = new Map(list(after).map((i) => [keyOf(spec, i), i]));
  const keyColumns = new Set(
    spec.fields.filter(([a]) => spec.key.includes(a)).map(([, c]) => c),
  );
  const ops = [];

  newMap.forEach((item, k) => {
    const old = oldMap.get(k);
    const priv = spec.privateField;
    if (!old) {
      if (spec.single || spec.noInsert) return;
      ops.push({ type: "insert", row: toRow(spec, item), item });
      return;
    }
    if (spec.appendOnly) return;
    const oldRow = toRow(spec, old);
    const newRow = toRow(spec, item);
    const changes = {};
    Object.keys({ ...oldRow, ...newRow }).forEach((col) => {
      if (keyColumns.has(col)) return;
      if (JSON.stringify(oldRow[col]) !== JSON.stringify(newRow[col])) {
        changes[col] = newRow[col] === undefined ? null : newRow[col];
      }
    });
    const privChanged = Boolean(
      priv && (old[priv] || "") !== (item[priv] || ""),
    );
    if (Object.keys(changes).length || privChanged) {
      ops.push({
        type: "update",
        match: matchOf(spec, item),
        changes,
        item,
        privChanged,
      });
    }
  });

  if (!spec.appendOnly && !spec.single) {
    oldMap.forEach((item, k) => {
      if (!newMap.has(k)) {
        ops.push({ type: "delete", match: matchOf(spec, item), item });
      }
    });
  }
  return ops;
}

// Friendly text for a failed save
export function syncErrorMessage(key, error) {
  const code = error?.code;
  if (code === "23505" && key === "gh_appointments") {
    return "That time was just booked by someone else, or you already have a session that day. Please pick another time.";
  }
  if (code === "23505") return "That already exists.";
  if (code === "P0001" && error.message) return error.message;
  if (code === "42501") return "You don't have permission to make that change.";
  if (code === "23514")
    return "Some of the details aren't allowed. Please check and try again.";
  return "Your change couldn't be saved. Check your internet connection and try again.";
}

// --- 3. THE SYNC ENGINE ---

export function createSync(client, { onError, onChange } = {}) {
  const cache = new Map();
  const queues = new Map(); // table -> promise chain
  const pending = new Map(); // key -> number of writes in flight
  const refetchWhenIdle = new Set();
  let role = null;

  const notify = (key) => onChange && onChange(key);

  async function selectAll(table, order) {
    const rows = [];
    const size = 1000;
    for (let from = 0; ; from += size) {
      let query = client.from(table).select("*");
      if (order)
        query = query.order(order.column, { ascending: order.ascending });
      // eslint-disable-next-line no-await-in-loop
      const { data, error } = await query.range(from, from + size - 1);
      if (error) throw error;
      rows.push(...data);
      if (data.length < size) break;
    }
    return rows;
  }

  async function fetchKey(key) {
    const spec = COLLECTIONS[key];
    if (!spec) return;
    if ((pending.get(key) || 0) > 0) {
      // A save is in flight; fetch once it lands so it isn't sent twice
      refetchWhenIdle.add(key);
      return;
    }
    let rows;
    if (spec.rpc) {
      const { data, error } = await client.rpc(spec.rpc);
      if (error) throw error;
      rows = data || [];
    } else if (spec.adminOnly) {
      // Newest 1000 entries, oldest first like the old log
      const { data, error } = await client
        .from(spec.table)
        .select("*")
        .order("timestamp", { ascending: false })
        .limit(1000);
      if (error) throw error;
      rows = (data || []).reverse();
    } else {
      rows = await selectAll(spec.table, spec.order);
    }
    let items = rows.map((r) => fromRow(spec, r));

    if (spec.privateField && isStaffRole(role)) {
      const notes = await selectAll("appointment_private");
      const byId = new Map(notes.map((n) => [n.appointment_id, n.case_notes]));
      items = items.map((i) =>
        byId.has(i.id) ? { ...i, [spec.privateField]: byId.get(i.id) } : i,
      );
    }

    if (spec.single) {
      const { id, ...rest } = items[0] || {};
      cache.set(key, items[0] ? rest : undefined);
    } else {
      cache.set(key, items);
    }
  }

  async function runOp(key, spec, op) {
    const table = client.from(spec.table);
    let result;
    if (op.type === "insert") {
      result = await table.insert(op.row);
    } else if (op.type === "update") {
      result = Object.keys(op.changes).length
        ? await table.update(op.changes).match(op.match)
        : { error: null };
    } else {
      result = await table.delete().match(op.match);
    }
    if (result.error) throw result.error;

    const priv = spec.privateField;
    const hasPriv =
      priv &&
      isStaffRole(role) &&
      ((op.type === "insert" && op.item[priv]) || op.privChanged);
    if (hasPriv) {
      const { error } = await client.from("appointment_private").upsert({
        appointment_id: op.item.id,
        case_notes: op.item[priv] || "",
      });
      if (error) throw error;
    }
  }

  function enqueue(key, spec, ops) {
    pending.set(key, (pending.get(key) || 0) + 1);
    const prev = queues.get(spec.table) || Promise.resolve();
    const next = prev
      // One operation at a time, in order
      .then(() =>
        ops.reduce(
          (chain, op) => chain.then(() => runOp(key, spec, op)),
          Promise.resolve(),
        ),
      )
      .catch(async (error) => {
        // eslint-disable-next-line no-console
        console.warn(`Sync failed for ${spec.table}:`, error);
        if (!spec.silent && onError) onError(syncErrorMessage(key, error));
        refetchWhenIdle.add(key);
      })
      .finally(async () => {
        pending.set(key, pending.get(key) - 1);
        if (pending.get(key) === 0 && refetchWhenIdle.has(key)) {
          refetchWhenIdle.delete(key);
          try {
            const before = JSON.stringify(cache.get(key));
            await fetchKey(key);
            if (JSON.stringify(cache.get(key)) !== before) notify(key);
          } catch {
            // Offline: the next realtime event or focus will retry
          }
        }
      });
    queues.set(spec.table, next);
    return next;
  }

  return {
    has: (key) => key in COLLECTIONS,
    read: (key) => clone(cache.get(key)),
    write(key, value) {
      const spec = COLLECTIONS[key];
      if (!spec || spec.readOnly) return null;
      const before = cache.get(key);
      const after = clone(value);
      cache.set(key, after);
      const ops = diffCollection(spec, before, after);
      return ops.length ? enqueue(key, spec, ops) : null;
    },
    async load(profileRole) {
      role = profileRole;
      const keys = Object.keys(COLLECTIONS).filter((key) => {
        const spec = COLLECTIONS[key];
        if (spec.adminOnly) return role === "admin";
        if (spec.staffOnly) return isStaffRole(role);
        return true;
      });
      await Promise.all(keys.map(fetchKey));
      return keys;
    },
    // Re-fetch; redraw screens only when the data really changed, so a
    // refresh never swaps out the button someone is clicking
    async refresh(key) {
      const before = JSON.stringify(cache.get(key));
      await fetchKey(key);
      if (JSON.stringify(cache.get(key)) !== before) notify(key);
    },
    keysForTable: (table) => TABLE_TO_KEYS[table] || [],
    // Wait for every queued save (used by tests and before sign-out)
    flush: () => Promise.all([...queues.values()]),
    _cache: cache,
  };
}

function isStaffRole(role) {
  return role === "guidance" || role === "admin";
}

// --- 4. THE LIVE INSTANCE ---

let syncErrorHandler = (message) => window.alert(message);
export function setSyncErrorHandler(fn) {
  syncErrorHandler = fn;
}

// Redraw screens the same way the localStorage version did across tabs
function announce(key) {
  const shownAs = key === "gh_booked_slots" ? "gh_appointments" : key;
  try {
    window.dispatchEvent(new StorageEvent("storage", { key: shownAs }));
  } catch {
    // Very old browsers: the next action redraws instead
  }
}

const sync = isRemote
  ? createSync(supabase, {
      onError: (m) => syncErrorHandler(m),
      onChange: announce,
    })
  : null;

export const remoteHas = (key) => Boolean(sync && sync.has(key));
export const remoteRead = (key) => sync.read(key);
export const remoteWrite = (key, value) => sync.write(key, value);
export const refreshCollection = (key) => sync && sync.refresh(key);
export const flushRemote = () => (sync ? sync.flush() : Promise.resolve());

let channel = null;
let pollTimer = null;

function scheduleRefresh() {
  const timers = new Map();
  return (key) => {
    clearTimeout(timers.get(key));
    timers.set(
      key,
      setTimeout(() => {
        sync.refresh(key).catch(() => {});
      }, 300),
    );
  };
}

export async function loadAll(profile) {
  const keys = await sync.load(profile.role);
  const refreshSoon = scheduleRefresh();

  if (channel) supabase.removeChannel(channel);
  channel = supabase.channel("granby-db");
  const tables = new Set(keys.map((k) => COLLECTIONS[k].table).filter(Boolean));
  if (isStaffRole(profile.role)) tables.add("appointment_private");
  tables.forEach((table) => {
    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table },
      () => sync.keysForTable(table).forEach(refreshSoon),
    );
  });
  channel.subscribe();

  // Other students' bookings aren't visible to Realtime: poll the slot list,
  // and catch up on everything when the tab comes back into view
  clearInterval(pollTimer);
  pollTimer = setInterval(() => refreshSoon("gh_booked_slots"), 30000);
  // Catch up when the tab comes back, at most every 30 seconds
  let lastFocusRefresh = Date.now();
  window.addEventListener("focus", () => {
    if (Date.now() - lastFocusRefresh < 30000) return;
    lastFocusRefresh = Date.now();
    keys.forEach(refreshSoon);
  });
}

// --- 5. ACCOUNTS (Supabase Auth) ---

const OFFLINE = "Can't reach the server. Check your internet connection.";

async function loadProfile() {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { profile: null };
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("auth_id", user.id)
    .maybeSingle();
  if (error) return { error: OFFLINE };
  if (!data || data.active === false) {
    await supabase.auth.signOut();
    return {
      error: data
        ? "This account has been deactivated. Please contact the guidance office."
        : "This account no longer exists. Please contact the guidance office.",
    };
  }
  return { profile: fromRow(COLLECTIONS.gh_users, data) };
}

export async function restoreSession() {
  const { data } = await supabase.auth.getSession();
  if (!data.session) return null;
  const { profile } = await loadProfile();
  return profile || null;
}

export async function remoteSignIn(identifier, password) {
  const { data: email, error } = await supabase.rpc("email_for_login", {
    p_identifier: identifier,
  });
  if (error) return { error: OFFLINE };
  if (!email) return { error: "Invalid username/email or password." };

  const { error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (signInError) {
    if (/confirm/i.test(signInError.message)) {
      return {
        error:
          "Please confirm your email first. Check your inbox for the link.",
      };
    }
    if (signInError.status === 429) {
      return { error: "Too many attempts. Please wait a few minutes." };
    }
    return { error: "Invalid username/email or password." };
  }
  return loadProfile();
}

export async function remoteSignUp(details) {
  const { data: free, error: lookupError } = await supabase.rpc(
    "username_available",
    { p_username: details.username },
  );
  if (lookupError) return { error: OFFLINE };
  if (!free) return { error: "Username or Email already exists!" };

  const { data, error } = await supabase.auth.signUp({
    email: details.email,
    password: details.password,
    options: {
      data: {
        name: details.name,
        username: details.username,
        yearLevel: details.yearLevel,
        course: details.course,
        section: details.section,
        consentAt: new Date().toISOString(),
      },
      emailRedirectTo: window.location.origin + window.location.pathname,
    },
  });
  if (error) {
    return {
      error: /registered|exists/i.test(error.message)
        ? "Username or Email already exists!"
        : error.message,
    };
  }
  // Supabase hides whether an email is taken by returning a user with no identities
  if (data.user && data.user.identities?.length === 0) {
    return { error: "Username or Email already exists!" };
  }
  // Keep the old flow: register, then sign in
  if (data.session) await supabase.auth.signOut();
  return { needsConfirmation: !data.session };
}

export async function remoteSignOut() {
  await flushRemote().catch(() => {});
  if (channel) supabase.removeChannel(channel);
  await supabase.auth.signOut();
}

// --- Password reset by email link ---
// Free Supabase projects can't edit email templates without their own SMTP
// sender, and the default reset email contains a link. The link brings the
// user back here signed in for recovery; the app then asks for a new password.

const appUrl = () => window.location.origin + window.location.pathname;

// Seen before supabase-js tidies the URL: did we arrive from a reset link?
let recoveryFromLink =
  isRemote &&
  typeof window !== "undefined" &&
  /type=recovery/.test(window.location.hash + window.location.search);

if (isRemote) {
  supabase.auth.onAuthStateChange((event) => {
    if (event === "PASSWORD_RECOVERY") recoveryFromLink = true;
  });
}

// Resolves once supabase-js has read any link in the URL
export async function isPasswordRecovery() {
  await supabase.auth.getSession();
  return recoveryFromLink;
}

export async function sendResetLink(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: appUrl(),
  });
  if (error?.status === 429) {
    return "Too many emails were sent recently. Please wait a while and try again.";
  }
  return error ? OFFLINE : null;
}

export async function setNewPassword(newPassword) {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) return error.message;
  recoveryFromLink = false;
  await supabase.auth.signOut();
  // Drop the token from the address bar
  window.history.replaceState(null, "", appUrl());
  return null;
}

// Signed-in password change: Supabase emails a code to confirm it's really you
export async function startPasswordChange() {
  const { error } = await supabase.auth.reauthenticate();
  return error ? error.message : null;
}

export async function finishPasswordChange(code, newPassword) {
  const { error } = await supabase.auth.updateUser({
    password: newPassword,
    nonce: code,
  });
  return error
    ? "Invalid or expired code, or the password was rejected."
    : null;
}

// Admin: create a counselor account without signing the admin out
export async function createCounselor({ name, email, password, specialty }) {
  const temp = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storageKey: "granby-staff-signup",
    },
  });
  const { data, error } = await temp.auth.signUp({
    email,
    password,
    options: { data: { name, username: email.split("@")[0] } },
  });
  if (error) return { error: error.message };
  if (!data.user || data.user.identities?.length === 0) {
    return { error: "This email is already registered." };
  }
  // Only an admin may set the role, so this runs on the admin's own session
  const { data: rows, error: roleError } = await supabase
    .from("profiles")
    .update({ role: "guidance", specialty, name })
    .eq("auth_id", data.user.id)
    .select();
  if (roleError || !rows?.length) {
    return {
      error:
        "The account was created, but setting the counselor role failed. Try again from Manage Staff.",
    };
  }
  await sync.refresh("gh_users");
  return { needsConfirmation: !data.session };
}

// Admin: let someone reset their own password (admins can't see or set it)
export async function sendResetEmail(email) {
  return sendResetLink(email);
}

// Public status check for an anonymous concern
export async function lookupConcernRemote(ref) {
  const { data, error } = await supabase.rpc("concern_status", {
    p_ref: ref,
  });
  if (error) throw new Error(OFFLINE);
  const row = data && data[0];
  return row
    ? {
        ref: row.ref,
        status: row.status,
        response: row.response,
        createdAt: row.created_at,
      }
    : null;
}
