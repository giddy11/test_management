// scripts/seedNovatechDemo.js
// Fills the NovaTech demo organisation (admin@novatech.com) with ~6 months of
// realistic activity so every screen has something to show: projects, suites,
// test cases, runs and results, bugs, feature requests, support tickets (direct
// and through client-company IT support), live chats, IT requests with
// approvals and escalations, SLA rules, notifications and the audit log.
//
// Dates are relative to the moment it runs. Before a demo, run --refresh to
// slide everything forward so the newest activity is from just now. Only what
// this script made is ever touched — the org's own users, catalog and earlier
// requests are kept. The audit log is append-only (a trigger refuses deletes),
// so audit entries a seed wrote stay even after --reset or --force.
//
//   npm run seed:demo                     seed (refuses if demo data is already there)
//   npm run seed:demo -- --refresh        move all demo dates forward to today
//   npm run seed:demo -- --stuck-it=20    add 20 overdue / waiting IT requests
//   npm run seed:demo -- --force          throw the demo data away and seed again
//   npm run seed:demo -- --reset          only remove the demo data
//   npm run seed:demo -- --no-firestore   skip comment threads / chat messages
//   npm run seed:demo -- --dry-run        do everything, then roll back
//
// Uses the DB_* and FIREBASE_* settings from server/.env.
require("dotenv").config();
const crypto = require("crypto");
const { Client } = require("pg");
const C = require("./demo/novatechContent");

const ADMIN_EMAIL = "admin@novatech.com";
const MARK = "novatech-demo"; // tags every row/doc this script creates
const ARGS = process.argv.slice(2);
const RESET_ONLY = ARGS.includes("--reset");
const USE_FIRESTORE = !ARGS.includes("--no-firestore");
const DRY_RUN = ARGS.includes("--dry-run");
const FORCE = ARGS.includes("--force");
const REFRESH = ARGS.includes("--refresh");
const STUCK_IT = Number((ARGS.find((a) => a.startsWith("--stuck-it=")) || "").split("=")[1]) || 0;
let auditCutoff = -Infinity; // see main()
const HISTORY_DAYS = 180;

const NOW = Date.now() + (process.argv.includes("--dry-run") ? Number(process.env.DEMO_PRETEND_DAYS_LATER || 0) : 0) * 86_400_000;
const MIN = 60_000;
const H = 60 * MIN;
const D = 24 * H;

// ── Randomness (seeded, so the same wording comes out each run) ──────────────
let rngState = 20261022;
function rng() {
  rngState |= 0;
  rngState = (rngState + 0x6d2b79f5) | 0;
  let t = Math.imul(rngState ^ (rngState >>> 15), 1 | rngState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const between = (a, b) => a + rng() * (b - a);
const int = (a, b) => Math.floor(between(a, b + 1));
const chance = (p) => rng() < p;
const pick = (arr) => arr[Math.floor(rng() * arr.length)];
function weighted(pairs) {
  const total = pairs.reduce((s, [, w]) => s + w, 0);
  let r = rng() * total;
  for (const [v, w] of pairs) if ((r -= w) <= 0) return v;
  return pairs[pairs.length - 1][0];
}
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const sample = (arr, n) => shuffle(arr).slice(0, Math.max(0, Math.min(n, arr.length)));
const uuid = () => crypto.randomUUID();

// ── Time helpers ──────────────────────────────────────────────────────────────
// More activity recently than months ago (density grows linearly to today).
function recentBiased(fromMs, toMs = NOW) {
  return fromMs + Math.sqrt(rng()) * (toMs - fromMs);
}
// Nudges a moment into Lagos working hours (UTC+1), mostly on weekdays.
function workTime(ms) {
  const d = new Date(ms);
  const dow = d.getUTCDay();
  if ((dow === 0 || dow === 6) && chance(0.85)) d.setUTCDate(d.getUTCDate() + (dow === 6 ? -1 : 1));
  d.setUTCHours(int(7, 16), int(0, 59), int(0, 59), 0);
  let t = d.getTime();
  if (t > NOW) t = NOW - between(5, 180) * MIN;
  return t;
}
const date = (ms) => (ms == null ? null : new Date(ms));
const dayStr = (ms) => new Date(ms).toISOString().slice(0, 10);

// ── DB helpers ────────────────────────────────────────────────────────────────
let db;
async function q(sql, params = []) {
  return (await db.query(sql, params)).rows;
}
// Multi-row insert, chunked to stay under Postgres' parameter limit. jsonb
// values must already be JSON strings; JS arrays map to Postgres arrays.
async function insert(table, rows, returning) {
  if (!rows.length) return [];
  const cols = Object.keys(rows[0]);
  const per = Math.max(1, Math.floor(30000 / cols.length));
  const out = [];
  for (let i = 0; i < rows.length; i += per) {
    const part = rows.slice(i, i + per);
    const params = [];
    const values = part
      .map((r) => "(" + cols.map((c) => (params.push(r[c] === undefined ? null : r[c]), "$" + params.length)).join(",") + ")")
      .join(",");
    const sql = `INSERT INTO "${table}" (${cols.map((c) => `"${c}"`).join(",")}) VALUES ${values}${
      returning ? ` RETURNING ${returning}` : ""
    }`;
    out.push(...(await q(sql, params)));
  }
  return out;
}
const J = (v) => JSON.stringify(v);

// ── Firestore ─────────────────────────────────────────────────────────────────
let firestore = null;
let Timestamp = null;
function initFirestore() {
  if (!USE_FIRESTORE) return;
  if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    console.warn("[demo] FIREBASE_SERVICE_ACCOUNT_JSON not set — skipping comment threads and chat messages.");
    return;
  }
  const { initializeApp, cert, getApps } = require("firebase-admin/app");
  const fs = require("firebase-admin/firestore");
  if (!getApps().length) {
    initializeApp({
      credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)),
      projectId: process.env.FIREBASE_PROJECT_ID || undefined,
    });
  }
  firestore = fs.getFirestore();
  Timestamp = fs.Timestamp;
}
const FS_COLLECTIONS = ["bugComments", "featureRequestComments", "feedbackComments", "liveChatMessages"];
const fsDocs = []; // { collection, id, data }
function fsAdd(collection, data, id = null) {
  const docId = id ?? (firestore ? firestore.collection(collection).doc().id : uuid());
  fsDocs.push({ collection, id: docId, data: { ...data, demoSeed: MARK } });
  return docId;
}
const ts = (ms) => (Timestamp ? Timestamp.fromMillis(ms) : new Date(ms));

async function firestoreWipe() {
  if (!firestore) return 0;
  let n = 0;
  for (const col of FS_COLLECTIONS) {
    for (;;) {
      const snap = await firestore.collection(col).where("demoSeed", "==", MARK).limit(400).get();
      if (snap.empty) break;
      const batch = firestore.batch();
      snap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
      n += snap.size;
    }
  }
  return n;
}
async function firestoreWrite() {
  if (!firestore) return 0;
  for (let i = 0; i < fsDocs.length; i += 400) {
    const batch = firestore.batch();
    for (const d of fsDocs.slice(i, i + 400)) batch.set(firestore.collection(d.collection).doc(d.id), d.data);
    await batch.commit();
  }
  return fsDocs.length;
}

// ── Reset ─────────────────────────────────────────────────────────────────────
async function wipe(org) {
  const projectNames = C.PROJECTS.map((p) => p.name);
  const projects = await q(`SELECT id FROM projects WHERE organization_id = $1 AND name = ANY($2)`, [org, projectNames]);
  const pids = projects.map((p) => p.id);
  if (pids.length) {
    // Runs first: their results hold a NO ACTION reference to test cases.
    await q(`DELETE FROM test_runs WHERE project_id = ANY($1)`, [pids]);
    await q(`DELETE FROM projects WHERE id = ANY($1)`, [pids]); // cascades to the rest
  }
  await q(`DELETE FROM users WHERE role = 'it_support' AND email LIKE ANY($1)`, [SUPPORTER_EMAILS]);
  await q(`DELETE FROM service_requests WHERE organization_id = $1 AND item_snapshot->>'seed' = $2`, [org, MARK]);
  await q(`DELETE FROM notifications WHERE data->>'seed' = $1`, [MARK]);
  // activity_logs is append-only (a trigger refuses deletes), so earlier audit
  // entries stay. A re-seed only adds entries newer than the last ones written.
  return pids.length;
}
const SUPPORTER_EMAILS = C.CLIENT_COMPANIES.map((c) => "%@" + c.domain);
const demoProjectIds = async (org) =>
  (await q(`SELECT id FROM projects WHERE organization_id = $1 AND name = ANY($2)`, [org, C.PROJECTS.map((p) => p.name)])).map((r) => r.id);

// The live app escalates overdue IT requests as time passes. Once a refresh
// has moved a request's due date forward again, any level it reached in the
// meantime no longer applies: drop it, so the app escalates afresh when the
// request really is overdue.
async function resetEscalations(org) {
  const [desk] = await q(`SELECT escalation FROM service_desk_settings WHERE organization_id = $1`, [org]);
  const l2 = desk?.escalation?.level2Pct ?? 50;
  const l3 = desk?.escalation?.level3Pct ?? 100;
  const open = await q(
    `SELECT id, status, current_step, approval_due_at, approval_target_hours, approval_escalation_level,
            fulfilment_due_at, fulfilment_target_hours, fulfilment_escalation_level
       FROM service_requests
      WHERE organization_id = $1 AND item_snapshot->>'seed' = $2
        AND status IN ('pending_approval', 'submitted', 'approved', 'in_progress')`,
    [org, MARK]
  );
  const levelNow = (due, targetH) => {
    if (!due) return 0;
    const late = NOW - new Date(due).getTime();
    if (late < 0) return 0;
    const t = (targetH || 48) * H;
    return late >= (t * l3) / 100 ? 3 : late >= (t * l2) / 100 ? 2 : 1;
  };
  let reset = 0;
  for (const r of open) {
    const approval = r.status === "pending_approval";
    const level = approval ? levelNow(r.approval_due_at, r.approval_target_hours) : levelNow(r.fulfilment_due_at, r.fulfilment_target_hours);
    const stored = approval ? r.approval_escalation_level : r.fulfilment_escalation_level;
    if (stored <= level) continue;
    await q(
      `DELETE FROM service_request_escalations WHERE request_id = $1 AND phase = $2 AND step_order = $3 AND level > $4`,
      [r.id, approval ? "approval" : "fulfilment", approval ? r.current_step || 1 : 0, level]
    );
    await q(`UPDATE service_requests SET ${approval ? "approval" : "fulfilment"}_escalation_level = $2 WHERE id = $1`, [r.id, level]);
    reset++;
  }
  if (reset) console.log(`[demo] Reset escalation levels on ${reset} IT requests that are no longer overdue.`);
}

// ── Refresh: slide every demo timestamp forward so the newest is "just now" ──
// Keeps the same records (and so every audit-log link) and only moves time.
// Due dates and deadlines move too, so nothing becomes more or less overdue.
async function refresh(org) {
  const pids = await demoProjectIds(org);
  if (!pids.length) throw new Error("There is no demo data to refresh — run the seed first.");
  const [{ latest }] = await q(
    `SELECT GREATEST(
       (SELECT max(created_at) FROM notifications WHERE data->>'seed' = $2),
       (SELECT max(h.created_at) FROM service_request_status_history h JOIN service_requests r ON r.id = h.request_id
         WHERE r.organization_id = $1 AND r.item_snapshot->>'seed' = $2),
       (SELECT max(h.entered_at) FROM bug_status_history h JOIN bugs b ON b.id = h.bug_id WHERE b.project_id = ANY($3)),
       (SELECT max(h.entered_at) FROM feedback_status_history h JOIN feedback f ON f.id = h.feedback_id WHERE f.project_id = ANY($3)),
       (SELECT max(res.executed_at) FROM test_run_results res JOIN test_runs r ON r.id = res.run_id WHERE r.project_id = ANY($3))
     ) AS latest`,
    [org, MARK, pids]
  );
  const shiftMs = NOW - new Date(latest).getTime() - 15 * MIN;
  if (shiftMs < H) {
    console.log("[demo] Demo data is already current — nothing to refresh.");
    return;
  }
  const seconds = Math.round(shiftMs / 1000);
  console.log(`[demo] Moving demo data forward by ${(shiftMs / D).toFixed(1)} days.`);

  const inProjects = (col) => [`${col} = ANY($1)`, [pids]];
  const sub = (col, sql) => [`${col} IN (${sql})`, [pids]];
  const requests = `SELECT id FROM service_requests WHERE organization_id = $1 AND item_snapshot->>'seed' = $2`;
  const scopes = {
    projects: inProjects("id"),
    test_suites: inProjects("project_id"),
    test_runs: inProjects("project_id"),
    bugs: inProjects("project_id"),
    feature_requests: inProjects("project_id"),
    feedback: inProjects("project_id"),
    client_companies: inProjects("project_id"),
    live_chat_settings: inProjects("project_id"),
    live_chat_visitors: inProjects("project_id"),
    live_chat_conversations: inProjects("project_id"),
    ticket_links: inProjects("project_id"),
    test_cases: sub("suite_id", `SELECT id FROM test_suites WHERE project_id = ANY($1)`),
    test_case_notes: sub("test_case_id", `SELECT tc.id FROM test_cases tc JOIN test_suites s ON s.id = tc.suite_id WHERE s.project_id = ANY($1)`),
    test_run_results: sub("run_id", `SELECT id FROM test_runs WHERE project_id = ANY($1)`),
    bug_status_history: sub("bug_id", `SELECT id FROM bugs WHERE project_id = ANY($1)`),
    feature_request_status_history: sub("feature_request_id", `SELECT id FROM feature_requests WHERE project_id = ANY($1)`),
    feature_request_votes: sub("feature_request_id", `SELECT id FROM feature_requests WHERE project_id = ANY($1)`),
    feedback_status_history: sub("feedback_id", `SELECT id FROM feedback WHERE project_id = ANY($1)`),
    feedback_support_status_history: sub("feedback_id", `SELECT id FROM feedback WHERE project_id = ANY($1)`),
    service_requests: [`organization_id = $1 AND item_snapshot->>'seed' = $2`, [org, MARK]],
    service_request_approvals: [`request_id IN (${requests})`, [org, MARK]],
    service_request_status_history: [`request_id IN (${requests})`, [org, MARK]],
    service_request_comments: [`request_id IN (${requests})`, [org, MARK]],
    service_request_escalations: [`request_id IN (${requests})`, [org, MARK]],
    notifications: [`data->>'seed' = $1`, [MARK]],
    users: [`organization_id = $1 AND last_seen_at IS NOT NULL`, [org]],
  };
  const cols = await q(
    `SELECT table_name, column_name, data_type FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = ANY($1) AND data_type IN ('timestamp with time zone', 'date')`,
    [Object.keys(scopes)]
  );
  await db.query("BEGIN");
  try {
    for (const [table, [where, params]] of Object.entries(scopes)) {
      // On users only the "last seen" moves; account ages stay as they are.
      const mine = cols.filter((c) => c.table_name === table && (table !== "users" || c.column_name === "last_seen_at"));
      if (!mine.length) continue;
      const iv = `$${params.length + 1}::interval`;
      const sets = mine.map(({ column_name: c, data_type: t }) => {
        if (t === "date") return `"${c}" = ("${c}" + ${iv})::date`;
        // Targets may sit in the future; anything that "happened" never may.
        if (/_due_at$/.test(c)) return `"${c}" = "${c}" + ${iv}`;
        return `"${c}" = LEAST("${c}" + ${iv}, now())`;
      });
      await q(`UPDATE "${table}" SET ${sets.join(", ")} WHERE ${where}`, [...params, `${seconds} seconds`]);
    }
    await resetEscalations(org);
    await db.query(DRY_RUN ? "ROLLBACK" : "COMMIT");
  } catch (e) {
    await db.query("ROLLBACK");
    throw e;
  }

  if (firestore && !DRY_RUN) {
    let n = 0;
    for (const col of FS_COLLECTIONS) {
      const snap = await firestore.collection(col).where("demoSeed", "==", MARK).get();
      for (let i = 0; i < snap.docs.length; i += 400) {
        const batch = firestore.batch();
        for (const d of snap.docs.slice(i, i + 400)) {
          const patch = {};
          for (const f of ["createdAt", "editedAt"]) {
            const v = d.get(f);
            if (v && v.toMillis) patch[f] = ts(Math.min(NOW, v.toMillis() + shiftMs));
          }
          if (Object.keys(patch).length) batch.update(d.ref, patch);
        }
        await batch.commit();
      }
      n += snap.size;
    }
    console.log(`[demo] Moved ${n} Firestore comments and chat messages.`);
  }
}

// ═════════════════════════════════════════════════════════════════════════════
async function main() {
  db = new Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false,
  });
  await db.connect();
  initFirestore();

  const [adminRow] = await q(`SELECT * FROM users WHERE email = $1`, [ADMIN_EMAIL]);
  if (!adminRow) throw new Error(`${ADMIN_EMAIL} not found in ${process.env.DB_HOST}`);
  const ORG = adminRow.organization_id;

  console.log(`[demo] Organisation ${ORG} on ${process.env.DB_HOST}${DRY_RUN ? " (dry run — nothing is saved)" : ""}`);

  if (REFRESH) return refresh(ORG);

  if (STUCK_IT) {
    await db.query("BEGIN");
    try {
      await topUpStuckRequests(ORG, adminRow, STUCK_IT);
      await db.query(DRY_RUN ? "ROLLBACK" : "COMMIT");
    } catch (e) {
      await db.query("ROLLBACK");
      throw e;
    }
    return;
  }

  const existing = (await demoProjectIds(ORG)).length;
  if (existing && !RESET_ONLY && !FORCE) {
    console.log(
      "[demo] Demo data is already there. To bring its dates up to today, run with --refresh.\n" +
        "       To throw it away and seed again, run with --force (earlier audit-log entries stay —\n" +
        "       the audit log is append-only — and only newer entries are added)."
    );
    return;
  }

  // Audit entries from an earlier seed can't be removed; only add newer ones.
  const [{ latest }] = await q(
    `SELECT max(created_at) AS latest FROM activity_logs WHERE organization_id = $1 AND metadata->>'seed' = $2`,
    [ORG, MARK]
  );
  auditCutoff = latest ? new Date(latest).getTime() : -Infinity;

  // One transaction: if seeding fails, the previous demo data is left as it was.
  await db.query("BEGIN");
  try {
    const removed = await wipe(ORG);
    console.log(`[demo] Removing previous demo data (${removed} projects).`);
    if (!RESET_ONLY) await seed(ORG, adminRow);
    await db.query(DRY_RUN ? "ROLLBACK" : "COMMIT");
  } catch (e) {
    await db.query("ROLLBACK");
    throw e;
  }
  if (DRY_RUN) {
    console.log(`[demo] Dry run: would write ${fsDocs.length} Firestore docs.`);
    return;
  }
  const fsRemoved = await firestoreWipe();
  const written = await firestoreWrite();
  console.log(`[demo] Firestore: removed ${fsRemoved}, wrote ${written} comments and chat messages.`);
}

// ═════════════════════════════════════════════════════════════════════════════
// The NovaTech people the demo is built around.
async function loadTeam(ORG, adminRow) {
  const users = await q(
    `SELECT id, first_name, last_name, email, role, manager_id, created_at FROM users
      WHERE organization_id = $1 AND deleted_at IS NULL AND client_company_id IS NULL`,
    [ORG]
  );
  const person = (u) => ({ ...u, name: `${u.first_name} ${u.last_name}`, key: u.email.split("@")[0] });
  const people = users.map(person);
  const byKey = Object.fromEntries(people.map((p) => [p.key, p]));
  const byId = Object.fromEntries(people.map((p) => [p.id, p]));
  const admin = byId[adminRow.id];
  const need = (k) => {
    if (!byKey[k]) throw new Error(`Expected user ${k}@novatech.com`);
    return byKey[k];
  };

  const IT_AGENTS = ["aisha.bello", "olumide.adeyemi", "zainab.musa", "ifeanyi.okeke"].map(need);
  const FINANCE = need("emeka.obi");
  const CHAIR_APPROVERS = ["biodun.bamidele", "bolanle.ogunleye"].map(need);
  const leads = Object.fromEntries(C.PROJECTS.map((p) => [p.key, need(p.lead)]));
  return { people, byKey, byId, admin, IT_AGENTS, FINANCE, CHAIR_APPROVERS, leads };
}

// Collects audit entries and notifications; written in one go at the end.
function makeRecorders(ORG) {
  const activity = [];
  const notifications = [];
  const log = (actor, at, action, summary, entityType, entityId, metadata = {}, severity = "info") =>
    activity.push({
      id: uuid(),
      organization_id: ORG,
      actor_id: actor ? actor.id : null,
      action,
      entity_type: entityType,
      entity_id: entityId,
      summary,
      metadata: J({ ...metadata, seed: MARK }),
      created_at: date(at),
      client_company_id: null,
      severity,
      actor_name: actor ? actor.name : "Automatic escalation",
      actor_role: actor ? actor.role : null,
    });
  const notify = (userId, type, title, body, data, at, readChance = 0.7) => {
    const recent = NOW - at < 2 * D;
    const read = !recent && chance(readChance);
    notifications.push({
      id: uuid(),
      user_id: userId,
      type,
      title: title.slice(0, 255),
      body,
      data: J({ ...data, seed: MARK }),
      read_at: read ? date(Math.min(NOW, at + between(5, 600) * MIN)) : null,
      created_at: date(at),
    });
  };
  // SR numbers exist only after the requests are inserted.
  const fillRefs = (refOf) => {
    for (const n of notifications) {
      const id = JSON.parse(n.data).serviceRequestId;
      if (id && refOf[id]) n.title = n.title.replace("{REF}", refOf[id]);
    }
    for (const a of activity) {
      if (a.entity_type === "service_request" && refOf[a.entity_id]) a.summary = a.summary.replace("{REF}", refOf[a.entity_id]);
    }
  };
  const flush = async (count) => {
    await insert("notifications", notifications);
    // Entries older than what an earlier seed already wrote would duplicate it.
    const fresh = activity.filter((a) => a.created_at.getTime() > auditCutoff);
    await insert("activity_logs", fresh);
    count("notifications", notifications.length);
    count("audit log entries", fresh.length);
  };
  return { activity, notifications, log, notify, fillRefs, flush };
}

const printStats = (stats) => {
  console.log("[demo] Seeded:");
  for (const [k, v] of Object.entries(stats)) console.log(`         ${String(v).padStart(6)}  ${k}`);
};

// Adds IT requests that are stuck — overdue for approval, unassigned, stalled,
// or waiting on the requester — to an organisation that already has demo data.
async function topUpStuckRequests(ORG, adminRow, n) {
  const stats = {};
  const count = (k, v = 1) => (stats[k] = (stats[k] || 0) + v);
  const t = await loadTeam(ORG, adminRow);
  const rec = makeRecorders(ORG);
  const [desk] = await q(`SELECT * FROM service_desk_settings WHERE organization_id = $1`, [ORG]);
  if (!desk || !desk.enabled) throw new Error("IT requests are switched off for this organisation.");
  const refOf = await seedItRequests({ ORG, ...t, desk, log: rec.log, notify: rec.notify, count, START: NOW - 30 * D, total: n, forceStuck: true });
  rec.fillRefs(refOf);
  await rec.flush(count);
  printStats(stats);
}

async function seed(ORG, adminRow) {
  const stats = {};
  const count = (k, n = 1) => (stats[k] = (stats[k] || 0) + n);
  const START = NOW - HISTORY_DAYS * D;
  const { people, byId, admin, IT_AGENTS, FINANCE, CHAIR_APPROVERS, leads } = await loadTeam(ORG, adminRow);
  const reserved = new Set([admin.id, FINANCE.id, ...IT_AGENTS.map((u) => u.id), ...CHAIR_APPROVERS.map((u) => u.id), ...Object.values(leads).map((u) => u.id)]);
  const qaPool = shuffle(people.filter((p) => !reserved.has(p.id))).slice(0, 26);
  const qaEngineers = qaPool.slice(0, 13);
  const testers = qaPool.slice(13);

  // Accounts look like they've been around since before the history starts.
  const ancient = NOW - (HISTORY_DAYS + 40) * D;
  await q(`UPDATE users SET created_at = $2 WHERE id = $1 AND created_at > $2`, [admin.id, date(ancient - 20 * D)]);
  for (const p of people) {
    if (p.id === admin.id) continue;
    await q(`UPDATE users SET created_at = $2 WHERE id = $1 AND created_at > $2`, [p.id, date(ancient + between(0, 35) * D)]);
    if (chance(0.75)) await q(`UPDATE users SET last_seen_at = $2 WHERE id = $1`, [p.id, date(NOW - between(0.05, 4) * D)]);
  }
  await q(`UPDATE users SET last_seen_at = $2 WHERE id = $1`, [admin.id, date(NOW - 20 * MIN)]);

  // Access roles (added alongside "employee", never replacing anything).
  const roleRows = await q(`SELECT id, key FROM roles WHERE organization_id = $1`, [ORG]);
  const roleId = Object.fromEntries(roleRows.map((r) => [r.key, r.id]));
  const grant = async (u, key) => {
    if (!roleId[key]) return;
    const r = await q(
      `INSERT INTO user_roles (user_id, role_id, granted_by, granted_at)
       SELECT $1, $2, $3, $4 WHERE NOT EXISTS (SELECT 1 FROM user_roles WHERE user_id = $1 AND role_id = $2)
       RETURNING user_id`,
      [u.id, roleId[key], admin.id, date(ancient + 40 * D)]
    );
    if (r.length) count("role grants");
  };
  for (const u of Object.values(leads)) await grant(u, "test_lead");
  for (const u of qaEngineers) await grant(u, "qa_engineer");
  for (const u of testers) await grant(u, "tester");
  for (const u of IT_AGENTS) await grant(u, "it_agent");

  const rec = makeRecorders(ORG);
  const { log, notify } = rec;

  // ── SLA rules (only if the org hasn't set its own) ──────────────────────────
  const T = {
    ticket: {
      critical: { firstResponseHours: 1, resolutionHours: 24 },
      high: { firstResponseHours: 4, resolutionHours: 48 },
      medium: { firstResponseHours: 8, resolutionHours: 96 },
      low: { firstResponseHours: 24, resolutionHours: 168 },
      default: { firstResponseHours: 8, resolutionHours: 120 },
    },
    bug: {
      critical: { firstResponseHours: 2, resolutionHours: 24 },
      high: { firstResponseHours: 8, resolutionHours: 72 },
      medium: { firstResponseHours: 24, resolutionHours: 168 },
      low: { firstResponseHours: 48, resolutionHours: 336 },
      default: { firstResponseHours: 24, resolutionHours: 168 },
    },
    featureRequest: { firstResponseHours: 48, resolutionHours: 1440 },
  };
  const slaExisting = await q(`SELECT targets, bug_targets, feature_request_target FROM sla_settings WHERE organization_id = $1`, [ORG]);
  if (!slaExisting.length) {
    await insert("sla_settings", [
      {
        organization_id: ORG,
        targets: J(T.ticket),
        paused_statuses: [],
        updated_by_id: admin.id,
        updated_at: date(START + 5 * D),
        bug_targets: J(T.bug),
        feature_request_target: J(T.featureRequest),
      },
    ]);
    log(admin, START + 5 * D, "sla.settings_updated", "Updated the organisation's SLA rules", "sla_settings", ORG, { targets: T.ticket });
    count("SLA rules configured");
  } else {
    const s = slaExisting[0];
    T.ticket = { ...T.ticket, ...(s.targets || {}) };
    T.bug = { ...T.ticket, ...(s.bug_targets || {}) };
    T.featureRequest = s.feature_request_target || T.ticket.default;
  }
  // Share of targets missed: the project's base rate, improving over the period.
  const breachP = (project, at) => project.breach * (1.25 - 0.7 * ((at - START) / (NOW - START)));
  const slaDelays = (target, p) => {
    const fr = chance(p) ? target.firstResponseHours * between(1.15, 4) : target.firstResponseHours * between(0.04, 0.85);
    const res = chance(p) ? target.resolutionHours * between(1.1, 2.6) : target.resolutionHours * between(0.12, 0.9);
    return { fr: fr * H, res: Math.max(res * H, fr * H + 0.75 * H) };
  };

  // ── Projects & members ──────────────────────────────────────────────────────
  const P = []; // runtime project objects
  const qaQueue = shuffle(qaPool);
  for (const [i, def] of C.PROJECTS.entries()) {
    const created = START - int(5, 25) * D;
    const project = {
      def,
      key: def.key,
      name: def.name,
      description: def.description,
      surface: def.surface,
      feedback: def.feedback,
      liveChat: def.liveChat,
      whatsapp: def.whatsapp,
      breach: def.breach,
      id: uuid(),
      createdAt: workTime(created),
      lead: leads[def.key],
      members: [],
      suiteList: [],
      caseList: [],
      failResults: [],
      bugList: [],
      frList: [],
      ticketList: [],
      companies: [],
    };
    // 4-5 people whose main project this is, plus a few who split their time.
    const core = qaQueue.slice(i * 4, i * 4 + 4);
    const extra = sample(qaPool.filter((u) => !core.includes(u)), int(2, 4));
    project.members = [...core, ...extra];
    P.push(project);
  }
  const projectRows = P.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    owner_id: admin.id,
    created_at: date(p.createdAt),
    organization_id: ORG,
    feedback_token: p.feedback ? uuid() : null,
    live_chat_token: p.liveChat ? uuid() : null,
    feedback_enabled: !!p.feedback,
    live_chat_enabled: !!p.liveChat,
    support_whatsapp_number: p.whatsapp,
  }));
  await insert("projects", projectRows);
  const memberRows = [];
  for (const p of P) {
    memberRows.push({ project_id: p.id, user_id: p.lead.id, role: "team_lead" });
    for (const m of p.members) memberRows.push({ project_id: p.id, user_id: m.id, role: "member" });
    log(admin, p.createdAt, "project.created", `Created project "${p.name}"`, "project", p.id, { projectId: p.id });
    for (const m of [p.lead, ...p.members]) {
      notify(m.id, "project_member_added", `Added to project: ${p.name}`, `${admin.name} added you as a ${m === p.lead ? "Team lead" : "Member"}`, { projectId: p.id, role: m === p.lead ? "team_lead" : "member" }, p.createdAt + between(1, 60) * MIN, 1);
    }
  }
  await insert("project_members", memberRows);
  count("projects", P.length);
  count("project members", memberRows.length);
  const team = (p) => [p.lead, ...p.members];

  // ── Suites & test cases ─────────────────────────────────────────────────────
  const suiteRows = [];
  const caseRows = [];
  const assigneeRows = [];
  const noteRows = [];
  const TAGS = { mobile: ["mobile", "android", "ios"], web: ["web", "ui", "cross-browser"], api: ["api", "backend", "contract"] };
  const stepsFor = (p, suite, title) => {
    if (p.surface === "mobile")
      return ["Install the latest NovaPay build on a test device", "Sign in with a tier-2 QA test account", `Open ${suite}`, title, "Check the on-screen result and any push notification"];
    if (p.surface === "api")
      return ["Get an access token using the QA client credentials", `Prepare the request for ${suite}`, title, "Validate the status code, headers and response schema"];
    return [`Open ${p.name} on staging in Chrome`, "Sign in with the QA test user", `Go to ${suite}`, title, "Check the page and any emails that were sent"];
  };
  for (const p of P) {
    let s = 0;
    for (const [suiteName, cases] of Object.entries(p.def.suites)) {
      const suite = { id: uuid(), name: suiteName, project: p, createdAt: workTime(p.createdAt + (s++ * 3 + between(0, 8)) * D), cases: [] };
      p.suiteList.push(suite);
      suiteRows.push({
        id: suite.id,
        name: suiteName,
        description: `${suiteName} coverage for ${p.name}.`,
        project_id: p.id,
        created_at: date(suite.createdAt),
      });
      log(p.lead, suite.createdAt, "suite.created", `Created test suite "${suiteName}" in project "${p.name}"`, "suite", suite.id, { projectId: p.id });
      cases.forEach((line, idx) => {
        const [title, expected] = line.split(" :: ");
        // Most cases written up front; a few added later as the product grew.
        const late = chance(0.18);
        const createdAt = workTime(late ? recentBiased(suite.createdAt + 20 * D) : suite.createdAt + between(0, 12) * D);
        const status = NOW - createdAt < 10 * D && chance(0.5) ? "Draft" : chance(0.05) ? "Deprecated" : "Active";
        const assignees = sample(p.members, chance(0.25) ? 2 : 1);
        const priority = weighted([["Low", 15], ["Medium", 45], ["High", 30], ["Critical", 10]]);
        const tc = { id: uuid(), title, suite, project: p, createdAt, status, assignees, priority };
        suite.cases.push(tc);
        p.caseList.push(tc);
        caseRows.push({
          id: tc.id,
          title,
          description: `Verify: ${title.charAt(0).toLowerCase() + title.slice(1)}.`,
          steps: stepsFor(p, suiteName, title),
          expected_result: expected,
          priority,
          status,
          suite_id: suite.id,
          assigned_to_id: assignees[0].id,
          tags: sample([...TAGS[p.surface], "regression", "smoke", "negative", "e2e", "security"], int(1, 3)),
          created_by_id: chance(0.6) ? p.lead.id : pick(p.members).id,
          created_at: date(createdAt),
          deadline: chance(0.3) ? dayStr(createdAt + between(7, 40) * D) : null,
          external_id: `${p.key.toUpperCase()}-${String(suiteRows.length).padStart(2, "0")}${String(idx + 1).padStart(3, "0")}`,
        });
        for (const a of assignees) assigneeRows.push({ test_case_id: tc.id, user_id: a.id });
        if (NOW - createdAt < 30 * D) {
          notify(assignees[0].id, "test_assigned", `Assigned: ${title}`, `${p.lead.name} assigned you to this test case`, { caseId: tc.id, suiteId: suite.id, projectId: p.id }, createdAt + 10 * MIN);
        }
        if (chance(0.12)) {
          noteRows.push({
            id: uuid(),
            test_case_id: tc.id,
            body: pick([
              "Test data: use account 0123456789 on staging.",
              "Flaky on the shared device farm — rerun before raising a bug.",
              "Updated expected result after the product decision in sprint review.",
              "Blocked until the sandbox biller is available again.",
              "Covers the scenario from the customer incident last month.",
            ]),
            author_id: pick(team(p)).id,
            created_at: date(createdAt + between(1, 30) * D > NOW ? NOW - H : createdAt + between(1, 30) * D),
          });
        }
      });
      log(p.lead, suite.createdAt + 2 * H, "test_case.assigned", `Assigned ${p.members.length} testers to ${suite.cases.length} test cases in suite "${suiteName}"`, "suite", suite.id, { projectId: p.id, suiteId: suite.id });
    }
  }
  await insert("test_suites", suiteRows);
  await insert("test_cases", caseRows);
  await insert("test_case_assignees", assigneeRows);
  await insert("test_case_notes", noteRows);
  count("test suites", suiteRows.length);
  count("test cases", caseRows.length);

  // ── Test runs & results ─────────────────────────────────────────────────────
  const runRows = [];
  const resultRows = [];
  const ACTUAL_FAIL = [
    "Spinner never stops; request times out after 30s.",
    "Error 500 returned instead of the validation message.",
    "Balance shown is the old value until pull-to-refresh.",
    "Button does nothing on first tap.",
    "Wrong amount shown on the confirmation screen.",
    "Email not received after 10 minutes.",
    "Layout breaks — text overlaps the button.",
  ];
  let sprint = 30;
  for (const p of P) {
    for (const suite of p.suiteList) {
      let t = suite.createdAt + between(8, 16) * D;
      let n = 0;
      while (t < NOW - 0.5 * D) {
        n += 1;
        const runAt = workTime(t);
        const progress = (runAt - START) / (NOW - START);
        const isLatest = runAt > NOW - 6 * D;
        const name = weighted([
          [`Sprint ${sprint + Math.floor((runAt - START) / (14 * D))} regression — ${suite.name}`, 5],
          [`Release ${p.key === "pay" ? "4." : "2."}${8 + Math.floor(progress * 6)} smoke — ${suite.name}`, 3],
          [`${suite.name} — hotfix verification`, 1],
          [`UAT cycle ${n} — ${suite.name}`, 1],
        ]);
        const runner = chance(0.6) ? p.lead : pick(p.members);
        const run = { id: uuid(), name, createdAt: runAt, status: isLatest && chance(0.7) ? "in_progress" : "completed" };
        runRows.push({ id: run.id, name, project_id: p.id, suite_id: suite.id, status: run.status, created_by_id: runner.id, created_at: date(runAt) });
        const included = suite.cases.filter((c) => c.createdAt < runAt && c.status !== "Draft" && (c.status !== "Deprecated" || chance(0.3)));
        const passRate = Math.min(0.97, 0.7 + 0.22 * progress - (p.breach - 0.12) * 0.6 + between(-0.06, 0.06));
        let pass = 0;
        let fail = 0;
        let lastExec = runAt;
        for (const c of included) {
          const pending = run.status === "in_progress" && chance(0.45);
          const status = pending
            ? null
            : weighted([["pass", passRate], ["fail", (1 - passRate) * 0.55], ["blocked", (1 - passRate) * 0.25], ["skipped", (1 - passRate) * 0.2]]);
          const execAt = pending ? null : Math.min(NOW - 5 * MIN, runAt + between(0.2, run.status === "in_progress" ? 3 : 4) * D * rng());
          const executor = pending ? null : chance(0.85) ? c.assignees[0] : pick(team(p));
          const row = {
            id: uuid(),
            run_id: run.id,
            test_case_id: c.id,
            status,
            actual_result: status === "fail" ? pick(ACTUAL_FAIL) : status === "pass" ? "As expected." : null,
            notes: status === "blocked" ? pick(["Staging down during the run.", "Waiting for test data.", "Depends on a failing upstream case."]) : status === "skipped" ? "Out of scope for this cycle." : null,
            executed_by_id: executor ? executor.id : null,
            executed_at: date(execAt),
          };
          resultRows.push(row);
          if (status === "pass") pass++;
          if (status === "fail") {
            fail++;
            p.failResults.push({ runId: run.id, caseId: c.id, at: execAt });
          }
          if (execAt) lastExec = Math.max(lastExec, execAt);
        }
        log(runner, runAt, "run.created", `Started test run "${name}" on suite "${suite.name}" in project "${p.name}"`, "test_run", run.id, { projectId: p.id });
        if (run.status === "completed") {
          log(runner, lastExec + 10 * MIN, "run.completed", `Completed test run "${name}" on suite "${suite.name}"`, "test_run", run.id, { projectId: p.id, pass, fail });
          if (NOW - lastExec < 25 * D) {
            notify(admin.id, "run_completed", `Run completed: ${name}`, `${runner.name} marked this run completed`, { runId: run.id, projectId: p.id }, lastExec + 10 * MIN);
            if (runner !== p.lead) notify(p.lead.id, "run_completed", `Run completed: ${name}`, `${runner.name} marked this run completed`, { runId: run.id, projectId: p.id }, lastExec + 10 * MIN);
          }
        }
        if (included.length) {
          log(runner, lastExec, "result.bulk_recorded", `Set ${included.length} results in "${name}" (${pass} passed, ${fail} failed)`, "test_run", run.id, { projectId: p.id, runId: run.id });
        }
        t += between(9, 20) * D;
      }
    }
  }
  await insert("test_runs", runRows);
  await insert("test_run_results", resultRows);
  count("test runs", runRows.length);
  count("test results", resultRows.length);

  // ── Bugs ────────────────────────────────────────────────────────────────────
  const BUG_SUFFIX = {
    mobile: ["", " on Android 12", " on iOS 17", " after upgrading to 4.12", " on slow 3G networks", " for tier 1 accounts", " in dark mode"],
    web: ["", " on Safari", " on Firefox", " for users with long names", " near session expiry", " on mobile viewport", " after changing language"],
    api: ["", " under load", " for partner clients", " in the sandbox", " with unicode payloads", " on v1 endpoints", " after token refresh"],
  };
  const BUG_COUNT = { pay: 80, portal: 52, api: 58, merchant: 64, hr: 30, loans: 54 };
  const bugRows = [];
  const bugHistory = [];
  const PRIO_SEV = { Low: "low", Medium: "medium", High: "high", Urgent: "critical" };
  const nudge = (val, list) => (chance(0.2) ? list[Math.max(0, Math.min(list.length - 1, list.indexOf(val) + (chance(0.5) ? 1 : -1)))] : val);
  const PLATFORM = /Android|iOS|Safari|Firefox|mobile/;
  for (const p of P) {
    const used = new Set();
    const titles = [];
    for (const suffix of BUG_SUFFIX[p.surface]) {
      for (const b of p.def.bugs) {
        if (suffix && PLATFORM.test(b[0]) && PLATFORM.test(suffix)) continue;
        titles.push([b[0] + suffix, b[1], b[2], suffix === "", b[0]]);
      }
    }
    const ordered = [...titles.filter((t) => t[3]), ...shuffle(titles.filter((t) => !t[3]))];
    const n = BUG_COUNT[p.key];
    for (let i = 0; i < n; i++) {
      let [title, severity, priority, , base] = ordered[i % ordered.length];
      if (used.has(title)) title += ` (${i})`;
      used.add(title);
      severity = nudge(severity, ["Trivial", "Minor", "Major", "Critical"]);
      priority = nudge(priority, ["Low", "Medium", "High", "Urgent"]);
      const created = workTime(recentBiased(p.createdAt + 15 * D));
      const target = T.bug[PRIO_SEV[priority]] || T.bug.default;
      const { fr, res } = slaDelays(target, breachP(p, created));
      const reporter = chance(0.8) ? pick(p.members) : p.lead;
      const assignee = pick(team(p).filter((u) => u !== reporter));
      const events = [{ t: created, s: "Open" }];
      const backlog = chance(0.08);
      events.push({ t: created + fr, s: "In Progress" });
      let fixed = created + res;
      if (!backlog) {
        events.push({ t: fixed, s: "Fixed" });
        if (chance(0.08)) {
          const reopen = fixed + between(0.5, 3) * D;
          events.push({ t: reopen, s: "Reopened" });
          events.push({ t: reopen + between(2, 24) * H, s: "In Progress" });
          fixed = reopen + between(1, 4) * D;
          events.push({ t: fixed, s: "Fixed" });
        }
        const verified = fixed + between(2, 48) * H;
        events.push({ t: verified, s: "Verified" });
        if (chance(0.85)) events.push({ t: verified + between(6, 120) * H, s: "Closed" });
      }
      const past = events.filter((e) => e.t <= NOW);
      const status = past[past.length - 1].s;
      const resolved = ["Fixed", "Verified", "Closed"].includes(status);
      const lastFixed = [...past].reverse().find((e) => e.s === "Fixed");
      const link = chance(0.35) ? p.failResults.filter((r) => r.at && r.at < created).sort((a, b) => b.at - a.at)[int(0, 4)] : null;
      const bug = { id: uuid(), title, base, project: p, created, status, reporter, assignee: past.length > 1 || chance(0.6) ? assignee : null, events: past };
      p.bugList.push(bug);
      bugRows.push({
        id: bug.id,
        project_id: p.id,
        title,
        description: `${pick(C.BUG_DESCRIPTIONS)} ${title}.`,
        steps_to_reproduce: ["Sign in with the QA test account", `Go to the affected area (${pick(Object.keys(p.def.suites))})`, "Repeat the action described in the title", "Observe the result"],
        expected_behavior: "The action completes correctly with no errors.",
        actual_behavior: title + ".",
        environment: pick(C.ENVIRONMENTS[p.surface]),
        test_case_id: link ? link.caseId : null,
        test_run_id: link ? link.runId : null,
        reported_by_id: reporter.id,
        assigned_to_id: bug.assignee ? bug.assignee.id : null,
        resolved_at: resolved && lastFixed ? date(lastFixed.t) : null,
        closed_at: status === "Closed" ? date(past[past.length - 1].t) : null,
        status_updated_at: past.length > 1 ? date(past[past.length - 1].t) : null,
        created_at: date(created),
        severity,
        priority,
        status,
        first_response_at: past.length > 1 ? date(past[1].t) : null,
        comment_count: 0,
      });
      // Who made each move: the reporter opens and signs off (Verified/Closed); everything else is the assignee's.
      const moverOf = (e, i) => (i === 0 || e.s === "Verified" || e.s === "Closed" ? reporter : bug.assignee || assignee);
      past.forEach((e, i) => bugHistory.push({ id: uuid(), bug_id: bug.id, status: e.s, entered_at: date(e.t), actor_id: moverOf(e, i).id }));
      log(reporter, created, "bug.created", `Reported bug "${title}" in project "${p.name}"`, "bug", bug.id, { projectId: p.id }, priority === "Urgent" ? "warning" : "info");
      past.slice(1).forEach((e, i) => {
        log(moverOf(e, i + 1), e.t, "bug.updated", `Updated bug "${title}" in project "${p.name}"`, "bug", bug.id, { projectId: p.id, status: e.s });
      });
      if (NOW - created < 30 * D) {
        notify(admin.id, "bug_reported", `New bug: ${title}`, `${reporter.name} reported a new bug`, { bugId: bug.id, projectId: p.id }, created + 2 * MIN);
        if (bug.assignee) notify(bug.assignee.id, "bug_assigned", `Bug assigned: ${title}`, `You've been assigned to fix "${title}"`, { bugId: bug.id, projectId: p.id }, created + between(5, 120) * MIN);
        const last = past[past.length - 1];
        if (past.length > 1) notify(reporter.id, "bug_status_changed", `Bug status changed: ${title}`, `"${title}" is now ${last.s}`, { bugId: bug.id, projectId: p.id, status: last.s }, last.t);
      }
    }
  }
  const bugNums = await insert("bugs", bugRows, "id, bug_number");
  const bugNumber = Object.fromEntries(bugNums.map((r) => [r.id, r.bug_number]));
  await insert("bug_status_history", bugHistory);
  count("bugs", bugRows.length);

  // ── Feature requests ────────────────────────────────────────────────────────
  const frRows = [];
  const frHistory = [];
  const voteRows = [];
  for (const p of P) {
    for (const [title, category] of p.def.features) {
      const created = workTime(recentBiased(p.createdAt + 5 * D));
      const age = NOW - created;
      const submitter = chance(0.6) ? pick(team(p)) : pick(people.filter((u) => u.id !== admin.id));
      const { fr } = slaDelays(T.featureRequest, breachP(p, created));
      const outcome =
        age < 7 * D
          ? weighted([["new", 5], ["under_review", 3]])
          : weighted([["done", 34], ["rejected", 14], ["planned", 20], ["in_progress", 12], ["under_review", 15], ["new", 5]]);
      const ev = [{ t: created, s: "new" }];
      if (outcome !== "new") {
        const review = created + fr;
        ev.push({ t: review, s: "under_review" });
        if (outcome === "rejected") ev.push({ t: review + between(1, 15) * D, s: "rejected" });
        else if (outcome !== "under_review") {
          const planned = review + between(2, 12) * D;
          ev.push({ t: planned, s: "planned" });
          if (outcome === "in_progress" || outcome === "done") {
            const ip = planned + between(3, 18) * D;
            ev.push({ t: ip, s: "in_progress" });
            if (outcome === "done") ev.push({ t: ip + between(5, 22) * D, s: "done" });
          }
        }
      }
      const past = ev.filter((e) => e.t <= NOW);
      const status = past[past.length - 1].s;
      const terminal = status === "done" || status === "rejected";
      const voters = sample(people, Math.min(people.length, Math.floor(Math.pow(rng(), 1.6) * 28) + (status === "done" ? 6 : 0)));
      const frObj = { id: uuid(), title, project: p, status, created };
      p.frList.push(frObj);
      frRows.push({
        id: frObj.id,
        title,
        description: `${pick(C.FEATURE_DESCRIPTIONS)}\n\nCategory: ${category}.`,
        category,
        submitted_by_id: submitter.id,
        project_id: p.id,
        upvote_count: voters.length,
        admin_response: status !== "new" ? C.FEATURE_RESPONSES[status] || C.FEATURE_RESPONSES.under_review : null,
        status_updated_at: past.length > 1 ? date(past[past.length - 1].t) : null,
        created_at: date(created),
        status,
        comment_count: 0,
        reference_links: null,
        module: null,
        first_response_at: past.length > 1 ? date(past[1].t) : null,
        resolved_at: terminal ? date(past[past.length - 1].t) : null,
        closed_at: terminal ? date(past[past.length - 1].t) : null,
        assigned_to_id: ["planned", "in_progress", "done"].includes(status) ? pick(team(p)).id : null,
      });
      past.forEach((e, i) => frHistory.push({ id: uuid(), feature_request_id: frObj.id, status: e.s, entered_at: date(e.t), actor_id: (i === 0 ? submitter : p.lead).id }));
      for (const v of voters) voteRows.push({ id: uuid(), feature_request_id: frObj.id, user_id: v.id, created_at: date(Math.min(NOW - MIN, created + between(0, 40) * D)) });
      log(submitter, created, "feature_request.created", `Submitted feature request "${title}" in project "${p.name}"`, "feature_request", frObj.id, { projectId: p.id });
      for (const e of past.slice(1)) log(p.lead, e.t, "feature_request.status_updated", `Updated feature request "${title}" to ${e.s} in project "${p.name}"`, "feature_request", frObj.id, { projectId: p.id });
      if (NOW - created < 45 * D) notify(admin.id, "feature_request_new", `New feature request: ${title}`, `${submitter.name} submitted a new feature request`, { requestId: frObj.id, projectId: p.id }, created + MIN);
      if (past.length > 1 && NOW - past[past.length - 1].t < 30 * D) {
        notify(submitter.id, "feature_request_status_changed", `Your feature request status changed: ${title}`, `"${title}" is now ${status.replace(/_/g, " ")}`, { requestId: frObj.id, projectId: p.id, status }, past[past.length - 1].t);
      }
    }
  }
  await insert("feature_requests", frRows);
  await insert("feature_request_status_history", frHistory);
  await insert("feature_request_votes", voteRows);
  count("feature requests", frRows.length);
  count("feature request votes", voteRows.length);

  // ── Client companies & their IT supporters ──────────────────────────────────
  const [{ password: sharedPassword }] = await q(`SELECT password FROM users WHERE id = $1`, [admin.id]);
  const companyRows = [];
  const supporterRows = [];
  for (const def of C.CLIENT_COMPANIES) {
    const p = P.find((x) => x.key === def.project);
    const company = { id: uuid(), name: def.name, project: p, supporters: [] };
    p.companies.push(company);
    companyRows.push({
      id: company.id,
      project_id: p.id,
      name: def.name,
      contact_email: `it@${def.domain}`,
      feedback_token: uuid(),
      created_at: date(p.createdAt + between(10, 30) * D),
      auto_assign_enabled: chance(0.5),
      feedback_enabled: true,
    });
    def.supporters.forEach(([first, last, isLead], i) => {
      const u = {
        id: uuid(),
        first_name: first,
        last_name: last,
        company_name: def.name,
        email: `${first}.${last}@${def.domain}`.toLowerCase(),
        is_email_verified: true,
        password: sharedPassword,
        role: "it_support",
        provider: "local",
        created_at: date(p.createdAt + between(12, 35) * D),
        organization_id: ORG,
        onboarding_completed: true,
        last_seen_at: date(NOW - between(0.1, 3) * D),
        client_company_id: company.id,
        // Supporters without a lead role have no access at all, so each one is
        // a lead; the first is the company's primary contact.
        is_support_lead: true,
        is_primary_support_lead: i === 0,
        notification_preferences: J({}),
      };
      supporterRows.push(u);
      company.supporters.push({ id: u.id, name: `${first} ${last}`, role: "it_support" });
    });
  }
  await insert("client_companies", companyRows);
  await insert("users", supporterRows);
  const supportLead = roleId.support_lead;
  if (supportLead) {
    await insert("user_roles", supporterRows.map((u) => ({ user_id: u.id, role_id: supportLead, granted_by: admin.id, granted_at: u.created_at })));
  }
  count("client companies", companyRows.length);
  count("IT supporter accounts", supporterRows.length);

  // ── Support tickets (feedback) ──────────────────────────────────────────────
  const TICKET_COUNT = { pay: 140, portal: 72, api: 56, merchant: 115, hr: 18, loans: 84 };
  const customers = Array.from({ length: 160 }, () => {
    const first = pick(C.CUSTOMER_FIRST);
    const last = pick(C.CUSTOMER_LAST);
    return { name: `${first} ${last}`, email: `${first}.${last}${int(1, 99)}@${pick(C.EXAMPLE_DOMAINS)}`.toLowerCase(), phone: `+23480${int(10000000, 99999999)}` };
  });
  const fbRows = [];
  const fbHistory = [];
  const fbSupportHistory = [];
  const fbAssignees = [];
  for (const p of P) {
    const def = p.def;
    const pool = Object.entries(def.tickets).flatMap(([type, titles]) =>
      // Earlier titles in each list are the common complaints, so they recur.
      titles.map((title, i) => [[type, title], Math.max(1, (titles.length - i) * (type === "bug" ? 3 : type === "complaint" ? 2 : 1.2))])
    );
    for (let i = 0; i < TICKET_COUNT[p.key]; i++) {
      const [type, title] = weighted(pool);
      const created = workTime(recentBiased(p.createdAt + 12 * D));
      const cust = pick(customers);
      const company = p.companies.length && chance(0.45) ? pick(p.companies) : null;
      const channel = p.whatsapp && chance(0.22) ? "whatsapp" : "web_form";
      const tk = {
        id: uuid(), title, type, project: p, created, company, customer: cust, staffComments: 0,
        status: "logged", supportStatus: null, severity: null, supporter: null, assignees: [], firstResponse: null, resolvedAt: null, closedAt: null,
      };
      const row = {
        id: tk.id,
        project_id: p.id,
        type,
        title,
        description: pick(C.TICKET_BODIES[type]),
        submitter_name: cust.name,
        submitter_email: cust.email,
        status: "logged",
        admin_response: null,
        status_updated_at: null,
        created_at: date(created),
        suite_name: chance(0.5) ? pick(Object.keys(def.suites)) : null,
        reopen_reason: null,
        submitter_phone: channel === "whatsapp" || chance(0.3) ? cust.phone : null,
        client_company_id: company ? company.id : null,
        support_status: null,
        support_response: null,
        support_resolved_at: null,
        escalated_at: null,
        escalated_by_id: null,
        severity: null,
        submitter_notified_at: null,
        assigned_supporter_id: null,
        comment_count: 0,
        rating: null,
        first_response_at: null,
        resolved_at: null,
        closed_at: null,
        channel,
      };
      const p0 = breachP(p, created);
      // Product-team lifecycle from a given start; returns its events.
      const productFlow = (from, target, frAlreadyAt) => {
        const { fr, res } = slaDelays(target, p0);
        const ev = [];
        const ack = frAlreadyAt ? from + between(0.2, 6) * H : created + fr;
        ev.push({ t: Math.max(ack, from + 5 * MIN), s: "acknowledged" });
        const asg = ev[0].t + between(0.2, 5) * H;
        ev.push({ t: asg, s: "assigned" });
        ev.push({ t: asg + between(1, 18) * H, s: "investigating" });
        if (!chance(0.05)) {
          const resolvedAt = Math.max(created + res, ev[2].t + between(1, 12) * H);
          ev.push({ t: resolvedAt, s: "resolved" });
          if (chance(0.8)) ev.push({ t: resolvedAt + between(20, 110) * H, s: "closed" });
        }
        return ev;
      };
      const assignStaff = (at) => {
        tk.assignees = sample(team(p), chance(0.3) ? 2 : 1);
        for (const a of tk.assignees) fbAssignees.push({ feedback_id: tk.id, user_id: a.id });
        if (NOW - at < 20 * D) for (const a of tk.assignees) notify(a.id, "feedback_assigned", `Ticket assigned: ${title}`, `You were assigned a ${type.replace("_", " ")} on ${p.name}`, { feedbackId: tk.id, projectId: p.id }, at);
      };

      if (!company) {
        const ev = productFlow(created, T.ticket.default, false).filter((e) => e.t <= NOW);
        fbHistory.push({ id: uuid(), feedback_id: tk.id, status: "logged", entered_at: date(created) });
        for (const e of ev) fbHistory.push({ id: uuid(), feedback_id: tk.id, status: e.s, entered_at: date(e.t) });
        if (ev.length) {
          tk.status = ev[ev.length - 1].s;
          tk.firstResponse = ev[0].t;
          row.status_updated_at = date(ev[ev.length - 1].t);
          if (ev.length >= 2) assignStaff(ev[1].t);
        }
      } else {
        // IT support at the client company handles it first.
        const sup = pick(company.supporters);
        tk.supporter = sup;
        const { fr, res } = slaDelays(T.ticket.default, p0);
        const sev = [{ t: created, s: "logged" }, { t: created + fr, s: "acknowledged" }];
        sev.push({ t: sev[1].t + between(0.5, 8) * H, s: "investigating" });
        const escalate = chance(0.42);
        let product = [];
        if (escalate) {
          const escAt = sev[2].t + between(2, 30) * H;
          sev.push({ t: escAt, s: "escalated" });
          tk.severity = weighted([["critical", 10], ["high", 30], ["medium", 40], ["low", 20]]);
          product = productFlow(escAt, T.ticket[tk.severity], true);
        } else if (!chance(0.06)) {
          sev.push({ t: Math.max(created + res, sev[2].t + between(1, 10) * H), s: "resolved" });
        }
        const sevPast = sev.filter((e) => e.t <= NOW);
        for (const e of sevPast) fbSupportHistory.push({ id: uuid(), feedback_id: tk.id, status: e.s, entered_at: date(e.t) });
        tk.supportStatus = sevPast[sevPast.length - 1].s;
        row.support_status = tk.supportStatus;
        if (sevPast.length > 1) {
          tk.firstResponse = sevPast[1].t;
          row.assigned_supporter_id = sup.id;
        }
        if (tk.supportStatus === "resolved") {
          row.support_resolved_at = date(sevPast[sevPast.length - 1].t);
          row.support_response = "Fixed on our side — the customer's account settings have been corrected.";
          tk.resolvedAt = sevPast[sevPast.length - 1].t;
        }
        if (tk.supportStatus === "escalated") {
          const escAt = sevPast[sevPast.length - 1].t;
          row.escalated_at = date(escAt);
          row.escalated_by_id = sup.id;
          row.severity = tk.severity;
          fbHistory.push({ id: uuid(), feedback_id: tk.id, status: "logged", entered_at: date(escAt) });
          const ev = product.filter((e) => e.t <= NOW);
          for (const e of ev) fbHistory.push({ id: uuid(), feedback_id: tk.id, status: e.s, entered_at: date(e.t) });
          if (ev.length) {
            tk.status = ev[ev.length - 1].s;
            row.status_updated_at = date(ev[ev.length - 1].t);
            if (ev.length >= 2) assignStaff(ev[1].t);
          }
          log({ id: sup.id, name: sup.name, role: "it_support" }, escAt, "feedback.escalated", `IT support at "${company.name}" escalated "${title}" on "${p.name}"`, "feedback", tk.id, { projectId: p.id, severity: tk.severity }, tk.severity === "critical" ? "warning" : "info");
          if (NOW - escAt < 30 * D) {
            notify(admin.id, "feedback_new", `Feedback escalated (${tk.severity}): ${title}`, `${sup.name} (IT support at ${company.name}) escalated this ${type.replace("_", " ")} on ${p.name}`, { feedbackId: tk.id, projectId: p.id }, escAt);
          }
        }
      }
      row.status = tk.status;
      if (tk.status === "resolved" || tk.status === "closed") {
        const h = fbHistory.filter((x) => x.feedback_id === tk.id);
        tk.resolvedAt = h.find((x) => x.status === "resolved").entered_at.getTime();
        row.admin_response = type === "feature_request" ? "Thanks — this is now on our roadmap." : pick(["This has been fixed in the latest release.", "Refund processed — please check your account.", "We've corrected the issue on your account."]);
        if (tk.status === "closed") {
          tk.closedAt = h.find((x) => x.status === "closed").entered_at.getTime();
          if (company) row.submitter_notified_at = date(tk.closedAt + between(1, 20) * H > NOW ? NOW : tk.closedAt + between(1, 20) * H);
        }
      }
      if (tk.resolvedAt && chance(0.55)) {
        const late = tk.resolvedAt - created > (tk.severity ? T.ticket[tk.severity] : T.ticket.default).resolutionHours * H;
        row.rating = late ? weighted([[1, 25], [2, 30], [3, 25], [4, 15], [5, 5]]) : weighted([[5, 48], [4, 32], [3, 12], [2, 5], [1, 3]]);
      }
      row.first_response_at = date(tk.firstResponse);
      row.resolved_at = date(tk.resolvedAt);
      row.closed_at = date(tk.closedAt);
      p.ticketList.push(tk);
      fbRows.push(row);
      if (!company && NOW - created < 30 * D) {
        notify(admin.id, "feedback_new", `New external ${type.replace("_", " ")}: ${title}`, `${cust.name} submitted feedback on ${p.name} via the public form`, { feedbackId: tk.id, projectId: p.id }, created + MIN);
      }
      if (row.status_updated_at) log(tk.assignees[0] || p.lead, row.status_updated_at.getTime(), "feedback.updated", `Updated feedback "${title}" to ${tk.status} in project "${p.name}"`, "feedback", tk.id, { projectId: p.id });
    }
  }
  await insert("feedback", fbRows);
  await insert("feedback_status_history", fbHistory);
  await insert("feedback_support_status_history", fbSupportHistory);
  await insert("feedback_assignees", fbAssignees);
  count("support tickets", fbRows.length);

  // ── Ticket links (duplicates & related) ─────────────────────────────────────
  const linkRows = [];
  for (const p of P) {
    // A few bugs reported twice: the later one is marked a duplicate.
    const byBase = {};
    for (const b of p.bugList) (byBase[b.base] ||= []).push(b);
    for (const group of Object.values(byBase)) {
      if (group.length < 2 || !chance(0.5)) continue;
      const [original, ...dupes] = group.sort((a, b) => a.created - b.created);
      for (const d of dupes.slice(0, 2)) linkRows.push({ id: uuid(), project_id: p.id, source_type: "bug", source_id: d.id, target_type: "bug", target_id: original.id, link_type: "duplicate", created_by_id: p.lead.id, created_at: date(d.created + 3 * H > NOW ? NOW : d.created + 3 * H) });
    }
    // Customer tickets tied to the bug they uncovered.
    for (const tk of sample(p.ticketList.filter((t) => t.type === "bug"), 10)) {
      const bug = pick(p.bugList);
      linkRows.push({ id: uuid(), project_id: p.id, source_type: "feedback", source_id: tk.id, target_type: "bug", target_id: bug.id, link_type: "related", created_by_id: p.lead.id, created_at: date(Math.max(tk.created, bug.created) + H > NOW ? NOW : Math.max(tk.created, bug.created) + H) });
    }
    for (const tk of sample(p.ticketList.filter((t) => t.type === "feature_request"), 4)) {
      if (!p.frList.length) break;
      const fr = pick(p.frList);
      linkRows.push({ id: uuid(), project_id: p.id, source_type: "feedback", source_id: tk.id, target_type: "feature_request", target_id: fr.id, link_type: "related", created_by_id: p.lead.id, created_at: date(Math.min(NOW, Math.max(tk.created, fr.created) + H)) });
    }
  }
  await insert("ticket_links", linkRows);
  count("ticket links", linkRows.length);

  // ── Conversation threads (Firestore) ────────────────────────────────────────
  const commentCounts = { bugs: {}, feature_requests: {}, feedback: {} };
  const thread = (collection, idField, entityId, start, end, authors, lines, max) => {
    const n = int(1, max);
    const span = Math.max(30 * MIN, Math.min(end, NOW) - start);
    let root = null;
    for (let i = 0; i < n; i++) {
      const at = start + (span * (i + rng())) / (n + 0.5);
      if (at > NOW) break;
      const a = pick(authors);
      const body = pick(lines).replace("{n}", int(1200, 2400)).replace("{b}", `4.${int(10, 14)}.${int(0, 5)}`);
      const id = fsAdd(collection, {
        [idField]: entityId,
        parentId: root && chance(0.3) ? root : null,
        authorId: a.id,
        authorName: a.name,
        body,
        editedAt: null,
        reactions: chance(0.25) ? { [pick(authors).id]: "like" } : {},
        mentions: [],
        createdAt: ts(at),
        deletedAt: null,
      });
      if (!root) root = id;
    }
    return n;
  };
  for (const p of P) {
    for (const b of p.bugList) {
      if (!chance(0.62)) continue;
      const end = b.events[b.events.length - 1].t + 2 * H;
      commentCounts.bugs[b.id] = thread("bugComments", "bugId", b.id, b.created + 20 * MIN, end, [b.reporter, b.assignee || p.lead, p.lead], C.BUG_THREAD, 6);
    }
    for (const fr of p.frList) {
      if (!chance(0.55)) continue;
      commentCounts.feature_requests[fr.id] = thread("featureRequestComments", "featureRequestId", fr.id, fr.created + H, NOW, team(p), C.FEATURE_THREAD, 5);
    }
    for (const tk of p.ticketList) {
      if (!chance(0.7)) continue;
      const staff = tk.assignees.length ? tk.assignees : [p.lead];
      const n = int(1, 5);
      let at = tk.created + between(0.3, 6) * H;
      let c = 0;
      for (let i = 0; i < n && at < NOW; i++) {
        const fromCustomer = i % 2 === 1;
        const supporterTurn = !fromCustomer && tk.supporter && (tk.supportStatus !== "escalated" || i === 0);
        const a = fromCustomer ? null : supporterTurn ? tk.supporter : pick(staff);
        fsAdd("feedbackComments", {
          feedbackId: tk.id,
          parentId: null,
          authorType: fromCustomer ? "submitter" : "staff",
          authorId: a ? a.id : null,
          authorName: a ? a.name : tk.customer.name,
          authorRole: a ? (supporterTurn ? "it_support" : a.role) : null,
          body: fromCustomer ? pick(C.TICKET_CUSTOMER_REPLIES) : pick(C.TICKET_STAFF_REPLIES),
          attachments: [],
          mentions: [],
          createdAt: ts(at),
        });
        c++;
        at += between(0.5, 30) * H;
      }
      commentCounts.feedback[tk.id] = c;
    }
  }
  if (firestore) {
    for (const [table, counts] of Object.entries(commentCounts)) {
      const ids = Object.keys(counts);
      if (!ids.length) continue;
      await q(
        `UPDATE ${table} t SET comment_count = v.n FROM (SELECT unnest($1::uuid[]) id, unnest($2::int[]) n) v WHERE t.id = v.id`,
        [ids, ids.map((id) => counts[id])]
      );
    }
  }

  // ── Live chat ───────────────────────────────────────────────────────────────
  const lcSettings = [];
  const visitors = [];
  const convs = [];
  for (const p of P.filter((x) => x.liveChat)) {
    lcSettings.push({
      project_id: p.id,
      display_name: `${p.name} Support`,
      logo_url: null,
      greeting_message: "Hi there 👋 How can we help you today?",
      offline_message: "We're offline right now — leave a message and we'll email you back.",
      brand_color: pick(["#4f46e5", "#0ea5e9", "#16a34a", "#db2777"]),
      updated_by: admin.id,
      updated_at: date(p.createdAt + 20 * D),
      require_account: false,
    });
    for (let i = 0; i < int(12, 18); i++) {
      const cust = pick(customers);
      const firstSeen = workTime(recentBiased(NOW - 60 * D));
      const v = { id: uuid(), project_id: p.id, name: cust.name, email: cust.email, current_url: `https://${p.key}.novatech.example/${pick(["pricing", "help", "account", "transfers", "loans", ""])}`, referrer: pick(["https://www.google.com/", null, "https://twitter.com/"]), first_seen_at: date(firstSeen), last_seen_at: date(Math.min(NOW, firstSeen + between(0.1, 8) * D)), phone: chance(0.4) ? cust.phone : null, account_id: null };
      visitors.push(v);
      const script = pick(C.LIVE_CHAT_SCRIPTS);
      const age = NOW - firstSeen;
      const status = age < 1 * D ? weighted([["new", 3], ["in_progress", 4]]) : age < 4 * D ? weighted([["in_progress", 2], ["resolved", 4]]) : weighted([["resolved", 3], ["closed", 6]]);
      const agent = pick(team(p));
      const lines = status === "new" ? script.filter(([r]) => r !== "agent").slice(0, 2) : script;
      let at = firstSeen + MIN;
      const convId = uuid();
      let last = null;
      for (const [role, body] of lines) {
        if (at > NOW) break;
        fsAdd("liveChatMessages", {
          conversationId: convId,
          authorId: role === "agent" ? agent.id : null,
          authorName: role === "agent" ? agent.name : role === "visitor" ? cust.name : "Assistant",
          authorRole: role,
          body,
          attachments: [],
          createdAt: ts(at),
          deletedAt: null,
        });
        last = { at, body, role };
        at += between(0.5, 6) * MIN;
      }
      convs.push({
        id: convId,
        project_id: p.id,
        visitor_id: v.id,
        status,
        assigned_agent_id: status === "new" ? null : agent.id,
        last_message_at: date(last ? last.at : firstSeen),
        last_message_preview: last ? last.body.slice(0, 120) : null,
        last_sender_role: last ? last.role : null,
        visitor_unread: 0,
        agent_unread: status === "new" ? lines.length : 0,
        created_at: date(firstSeen),
        closed_at: status === "closed" ? date(Math.min(NOW, at + between(1, 24) * H)) : null,
      });
      if (status === "new") notify(p.lead.id, "live_chat_message", `New chat from ${cust.name}`, lines[0][1], { conversationId: convId, projectId: p.id }, firstSeen + MIN);
    }
  }
  await insert("live_chat_settings", lcSettings);
  await insert("live_chat_visitors", visitors);
  await insert("live_chat_conversations", convs);
  count("live chat conversations", convs.length);

  // ── IT requests ─────────────────────────────────────────────────────────────
  const [desk] = await q(`SELECT * FROM service_desk_settings WHERE organization_id = $1`, [ORG]);
  if (!desk || !desk.enabled) {
    console.warn("[demo] IT requests are switched off for this organisation — skipping them.");
  } else {
    rec.fillRefs(await seedItRequests({ ORG, admin, people, byId, IT_AGENTS, FINANCE, CHAIR_APPROVERS, desk, log, notify, count, START }));
  }

  // ── Notifications & audit log ───────────────────────────────────────────────
  await rec.flush(count);
  printStats(stats);
}

// ═════════════════════════════════════════════════════════════════════════════
async function seedItRequests(ctx) {
  const { ORG, admin, people, byId, IT_AGENTS, FINANCE, CHAIR_APPROVERS, desk, log, notify, count, START } = ctx;
  const I = C.IT;
  const items = await q(
    `SELECT i.*, c.key AS category_key, c.name AS category_name, p.name AS policy_name, p.steps AS policy_steps
       FROM service_catalog_items i
       JOIN service_catalog_categories c ON c.id = i.category_id
       LEFT JOIN service_approval_policies p ON p.id = i.approval_policy_id
      WHERE i.organization_id = $1 AND i.is_active`,
    [ORG]
  );
  const [financeGroup] = await q(`SELECT id, max_risk_level FROM service_approver_groups WHERE organization_id = $1 ORDER BY created_at LIMIT 1`, [ORG]);
  const levels = {
    approvalHours: desk.approval_hours || 48,
    fulfilment: desk.fulfilment_hours || { critical: 8, high: 24, medium: 72, low: 120 },
    level2Pct: (desk.escalation && desk.escalation.level2Pct) || 50,
    level3Pct: (desk.escalation && desk.escalation.level3Pct) || 100,
  };
  const managerOf = (u) => (u.manager_id ? byId[u.manager_id] : null);
  const agentWeights = IT_AGENTS.map((a, i) => [a, i === 0 ? 4 : 2]);

  // How often each catalog item is asked for, by name (unknown items get 2).
  const WEIGHT = {
    "Software licence or access": 18, "New starter accounts": 7, "Access to a business application": 13, "Cloud resource": 6,
    "Something else": 17, "Password reset or account unlock": 15, Mouse: 4, "Request hardware": 13, "Access card": 5, Chair: 2,
  };
  const pool = items.map((it) => [it, WEIGHT[it.name] ?? 2]);

  const reqRows = [];
  const approvalRows = [];
  const historyRows = [];
  const commentRows = [];
  const escalationRows = [];
  const TOTAL = ctx.total || 380;

  const formFor = (item) => {
    const v = {};
    let title = item.name;
    let description = null;
    let requestedForName = null;
    const k = item.category_key;
    if (item.name === "Software licence or access") {
      const sw = pick(I.software);
      Object.assign(v, { software: sw, access_level: chance(0.85) ? "Standard user" : "Administrator" });
      title = `${sw} licence`;
      description = `I need ${sw} for ${pick(["a client project", "my daily work", "the new reporting process", "design reviews"])}.`;
    } else if (item.name === "New starter accounts") {
      const [job, dept] = pick(I.jobs);
      requestedForName = pick(I.newStarters);
      Object.assign(v, { job_title: job, department: dept, systems: sample(["Email", "VPN", "HR system", "Finance system", "CRM", "Shared drives"], int(2, 5)) });
      title = `New starter: ${requestedForName} — ${job}`;
      description = `${requestedForName} joins the ${dept} team.`;
    } else if (item.name === "Access to a business application") {
      const [app, role] = pick(I.apps);
      Object.assign(v, { application: app, role });
      title = `Access to ${app}`;
      description = `Need ${role.toLowerCase()} access to ${app}.`;
    } else if (item.name === "Cloud resource") {
      const [provider, resource, environment, cost] = pick(I.cloud);
      Object.assign(v, { provider, resource, environment, monthly_cost: cost });
      title = resource;
      description = `${provider} ${environment.toLowerCase()} resource. Estimated $${cost}/month.`;
    } else if (item.name === "Password reset or account unlock") {
      const sys = pick(["Email / Microsoft 365", "Laptop sign-in", "VPN", "Business application"]);
      Object.assign(v, { system: sys, locked_out: chance(0.6) });
      title = v.locked_out ? `Locked out of ${sys}` : `Password reset — ${sys}`;
      description = "I can't sign in after changing my password.";
    } else if (item.name === "Mouse") {
      Object.assign(v, { why_do_you_need_an_externa_mouse: pick(["Trackpad is hard to use for spreadsheets", "Current mouse stopped working"]), have_you_been_given_a_mouse_before: pick(["No", "Yes, two years ago"]) });
      title = "External mouse";
    } else if (item.name === "Request hardware") {
      const [type, details] = pick(I.hardware);
      Object.assign(v, { item_type: type, replacement: chance(0.35), details });
      title = `${type} request`;
    } else if (item.name === "Access card") {
      const req = pick(["New card", "Replacement (lost or damaged)", "Access to another area"]);
      Object.assign(v, { card_request: req, area: pick(I.areas) });
      title = `Access card — ${req.split(" (")[0].toLowerCase()}`;
    } else if (item.name === "Chair") {
      title = "Ergonomic chair";
      description = "Back pain from the current chair; requesting an ergonomic one.";
    } else if (k === "it_solution" || !item.form_schema?.length) {
      const [t, d] = pick(I.other);
      title = t;
      description = d;
    }
    if ((item.form_schema || []).some((f) => f.key === "needed_by")) v.needed_by = null; // filled once dates are known
    if ((item.form_schema || []).some((f) => f.key === "start_date")) v.start_date = null;
    return { values: v, title, description, requestedForName };
  };

  // Approval route → list of steps, each a list of approver user objects.
  const routeFor = (item, requester, requestedFor) => {
    if (item.approval_mode === "none") return [];
    const excluded = new Set([requester.id, requestedFor && requestedFor.id].filter(Boolean));
    if (item.approval_mode === "approvers") {
      const named = (item.approver_ids || []).map((id) => byId[id]).filter((u) => u && !excluded.has(u.id));
      return [{ name: "Approval", mode: "any", approvers: named.length ? named.map((u) => ({ user: u, fallback: false })) : [{ user: admin, fallback: true }] }];
    }
    return (item.policy_steps || []).map((s) => {
      const approvers = [];
      for (const rule of s.approvers) {
        if (rule.type === "line_manager") {
          const m = managerOf(requestedFor || requester);
          if (m && !excluded.has(m.id)) approvers.push({ user: m, fallback: false });
        } else if (rule.type === "user") {
          const u = byId[rule.userId];
          if (u && !excluded.has(u.id)) approvers.push({ user: u, fallback: false });
        } else if (rule.type === "group") {
          approvers.push({ user: FINANCE, fallback: false, groupId: rule.groupId, authority: financeGroup ? financeGroup.max_risk_level : "medium" });
        }
      }
      if (!approvers.length) approvers.push({ user: admin, fallback: true });
      return { name: s.name, mode: s.mode, approvers };
    });
  };

  const levelAt = (now, due, targetH) => {
    const late = now - due;
    if (late < 0) return 0;
    if (late >= (targetH * H * levels.level3Pct) / 100) return 3;
    if (late >= (targetH * H * levels.level2Pct) / 100) return 2;
    return 1;
  };
  const thresholds = (due, targetH) => [due, due + (targetH * H * levels.level2Pct) / 100, due + (targetH * H * levels.level3Pct) / 100];

  // Simulates one request from t0 and reads off its state at NOW.
  // Runs on the request's own random stream, so moving t0 keeps the same story.
  const simulate = (spec, t0) => {
    const saved = rngState;
    rngState = spec.rseed;
    try {
      return simulateInner(spec, t0);
    } finally {
      rngState = saved;
    }
  };
  const simulateInner = (spec, t0) => {
    const { item, requester, priority, route, plan } = spec;
    const ev = []; // { t, from, to, actor, note }
    const approvals = [];
    const submitAt = t0 + plan.submitDelay;
    const startStatus = route.length ? "pending_approval" : "submitted";
    if (plan.withDraft) ev.push({ t: t0, from: null, to: "draft", actor: requester });
    ev.push({ t: submitAt, from: plan.withDraft ? "draft" : null, to: startStatus, actor: requester });

    const approvalTarget = item.approval_hours || levels.approvalHours;
    let readyAt = route.length ? null : submitAt;
    let stepStart = submitAt;
    let rejectedAt = null;
    let approvalEnd = null;
    const stepDue = [];
    route.forEach((step, si) => {
      const order = si + 1;
      const reached = !rejectedAt; // a step after a rejection never opens
      stepDue[si] = stepStart + approvalTarget * H;
      const sequential = step.mode === "order";
      let ruleStart = stepStart;
      step.approvers.forEach((a, ri) => {
        const row = { id: uuid(), stepOrder: order, stepName: step.name, stepMode: step.mode, ruleIndex: ri, approver: a, createdAt: submitAt, opensAt: reached ? (sequential ? ruleStart : stepStart) : Infinity, decision: null, decidedAt: null, comment: null };
        approvals.push(row);
        if (rejectedAt || readyAt) return;
        if (!sequential && ri > 0) return; // "any": the first approver decides
        const late = chance(plan.approvalBreach);
        const delay = late ? approvalTarget * between(1.05, 2.4) : approvalTarget * between(0.03, 0.8) / (sequential ? step.approvers.length : 1);
        // A stuck approval is never decided (it sits in the approver's inbox).
        const stuckHere = plan.stuck === "approval" && order === Math.min(plan.stuckStep, route.length);
        const at = stuckHere ? Infinity : ruleStart + delay * H;
        if (!stuckHere && plan.rejectAt === order && (!sequential || ri === step.approvers.length - 1 || chance(0.4))) {
          row.decision = "rejected";
          row.decidedAt = at;
          row.comment = pick(I.rejectReasons);
          rejectedAt = at;
        } else {
          row.decision = "approved";
          row.decidedAt = at;
          row.comment = chance(0.3) ? pick(["Approved.", "Fine by me.", "Approved — within budget.", "OK, go ahead."]) : null;
        }
        ruleStart = at;
      });
      if (!reached) return;
      if (rejectedAt) {
        const by = approvals.find((r) => r.decision === "rejected");
        ev.push({ t: rejectedAt, from: "pending_approval", to: "rejected", actor: by.approver.user, note: by.comment });
        approvalEnd = rejectedAt;
        return;
      }
      const decided = approvals.filter((r) => r.stepOrder === order && r.decision === "approved");
      const doneAt = Math.max(...decided.map((r) => r.decidedAt));
      const last = si === route.length - 1;
      const by = decided[decided.length - 1].approver.user;
      if (last) {
        ev.push({ t: doneAt, from: "pending_approval", to: "approved", actor: by });
        readyAt = doneAt;
        approvalEnd = doneAt;
      } else {
        ev.push({ t: doneAt, from: "pending_approval", to: "pending_approval", actor: by, note: `${step.name} approved${decided[decided.length - 1].comment ? `: ${decided[decided.length - 1].comment}` : ""}. Now with ${route[si + 1].name}.` });
        stepStart = doneAt;
      }
    });

    // Cancelled by the requester before IT started.
    let cancelAt = null;
    if (plan.cancel) {
      cancelAt = submitAt + between(0.5, 30) * H;
      const before = [...ev].filter((e) => e.t <= cancelAt).pop();
      if (rejectedAt && rejectedAt < cancelAt) cancelAt = null;
      else {
        ev.splice(0, ev.length, ...ev.filter((e) => e.t < cancelAt));
        ev.push({ t: cancelAt, from: before.to, to: "cancelled", actor: requester, note: pick(I.cancelReasons) });
        readyAt = readyAt && readyAt < cancelAt ? readyAt : null;
        // Decisions that would have come after the withdrawal never happened.
        for (const r of approvals) {
          if (r.decidedAt && r.decidedAt >= cancelAt) Object.assign(r, { decision: null, decidedAt: null, comment: null });
          if (r.opensAt >= cancelAt) r.opensAt = Infinity;
        }
      }
    }

    const fulfilTarget = item.fulfilment_hours || levels.fulfilment[priority] || 72;
    let fulfilDue = null;
    let assignee = null;
    let startedAt = null;
    let fulfilledAt = null;
    let info = null;
    if (readyAt && !cancelAt) {
      fulfilDue = readyAt + fulfilTarget * H;
      assignee = weighted(agentWeights);
      const late = chance(plan.fulfilBreach);
      const total = late ? fulfilTarget * between(1.05, 2.3) * H : fulfilTarget * between(0.08, 0.85) * H;
      // Stuck requests never finish: nobody picks them up ("queue"), work
      // stalls ("work"), or the requester never answers IT's question ("info").
      startedAt = plan.stuck === "queue" ? Infinity : readyAt + Math.min(total * between(0.05, 0.5), between(0.2, 10) * H);
      ev.push({ t: startedAt, from: route.length ? "approved" : "submitted", to: "in_progress", actor: assignee });
      fulfilledAt = plan.stuck ? Infinity : readyAt + total;
      if (plan.info || plan.stuck === "info") {
        const ask = startedAt + Math.min(readyAt + total - startedAt, 12 * H) * between(0.1, 0.5);
        const pause = plan.stuck === "info" ? Infinity : between(1, 30) * H;
        info = { ask, answer: ask + pause, by: assignee };
        ev.push({ t: ask, from: "in_progress", to: "info_requested", actor: assignee, note: "Asked the requester for more details." });
        ev.push({ t: ask + pause, from: "info_requested", to: "in_progress", actor: requester, note: "Requester answered." });
        fulfilledAt += pause;
      }
      if (plan.agentCancel && !plan.stuck) {
        ev.push({ t: fulfilledAt, from: "in_progress", to: "cancelled", actor: assignee, note: "Declined: covered by an existing request." });
        cancelAt = fulfilledAt;
        fulfilledAt = null;
      } else {
        ev.push({ t: fulfilledAt, from: "in_progress", to: "fulfilled", actor: assignee, note: pick(I.resolutionNotes) });
      }
    }

    const past = ev.filter((e) => e.t <= NOW).sort((a, b) => a.t - b.t);
    const status = past[past.length - 1].to;
    const at = (x) => (x != null && x <= NOW ? x : null);
    // Time spent waiting on the requester is added back to the due time once answered.
    const infoAnswered = info && info.answer <= NOW;
    const due = fulfilDue && at(readyAt) ? fulfilDue + (infoAnswered ? info.answer - info.ask : 0) : null;

    // Which approval step is live at NOW (if still pending).
    let currentStep = null;
    if (status === "pending_approval") {
      const open = approvals.find((r) => !(r.decidedAt && r.decidedAt <= NOW) && r.opensAt <= NOW);
      currentStep = open ? open.stepOrder : 1;
    }
    const liveStepStart = currentStep ? Math.max(submitAt, ...approvals.filter((r) => r.stepOrder < currentStep && r.decidedAt).map((r) => r.decidedAt)) : null;
    const approvalDue = currentStep ? liveStepStart + approvalTarget * H : stepDue.length ? stepDue[stepDue.length - 1] : null;

    return { ev: past, status, approvals, submitAt, readyAt: at(readyAt), approvalTarget, approvalDue, stepDue, currentStep, approvalEnd: at(approvalEnd), cancelAt: at(cancelAt), startedAt: at(startedAt), fulfilledAt: at(fulfilledAt), assignee: at(startedAt) ? assignee : null, fulfilTarget, due, info, infoAnswered, rejectedAt: at(rejectedAt) };
  };

  for (let i = 0; i < TOTAL; i++) {
    const item = weighted(pool);
    const needsManager = item.approval_mode !== "none";
    const blocked = new Set([admin.id]);
    if (item.name === "Request hardware") blocked.add(FINANCE.id);
    if (item.name === "Chair") CHAIR_APPROVERS.forEach((u) => blocked.add(u.id));
    const candidates = people.filter((u) => !blocked.has(u.id) && (!needsManager || u.manager_id));
    const requester = pick(candidates);
    let requestedFor = null;
    if (item.name !== "New starter accounts" && chance(0.08)) {
      const other = pick(candidates.filter((u) => u.id !== requester.id && managerOf(u)?.id !== requester.id));
      if (other) requestedFor = other;
    }
    const form = formFor(item);
    const priority = item.name === "Password reset or account unlock" ? weighted([["high", 5], ["medium", 3], ["critical", 1]]) : weighted([["low", 30], ["medium", 45], ["high", 18], ["critical", 7]]);
    const route = routeFor(item, requester, requestedFor);
    const slow = { "Cloud resource": 0.35, "Request hardware": 0.3, "New starter accounts": 0.28, Chair: 0.6 }[item.name] ?? 0.16;
    const spec = {
      item,
      requester,
      requestedFor,
      priority,
      route,
      rseed: int(1, 2_000_000_000),
      plan: {
        submitDelay: between(1, 25) * MIN,
        withDraft: chance(0.6),
        approvalBreach: item.name === "Chair" ? 0.55 : 0.14,
        fulfilBreach: slow,
        rejectAt: route.length && chance(0.09) ? int(1, route.length) : null,
        cancel: false,
        agentCancel: chance(0.015),
        info: chance(0.12),
        // ~1 in 11 requests is stuck somewhere, so queues and overdue lists have content.
        stuck: ctx.forceStuck || chance(0.09) ? weighted([["approval", 3], ["queue", 2], ["work", 3], ["info", 2]]) : null,
        stuckStep: int(1, 2),
      },
    };
    spec.plan.cancel = !spec.plan.stuck && chance(0.05);

    // Open requests already past due are placed far enough back that every
    // escalation level has already fired — the live sweeper then has nothing
    // left to send for them.
    // A stuck one starts recently; the loop below then moves it back only as far
    // as needed, so it reads as "overdue for a few days", not for months.
    let t0 = spec.plan.stuck ? workTime(NOW - between(0.3, 3) * D) : workTime(recentBiased(START + 20 * D));
    let s = simulate(spec, t0);
    for (let tries = 0; tries < 5; tries++) {
      const phase = s.status === "pending_approval" ? "approval" : ["submitted", "approved", "in_progress"].includes(s.status) ? "fulfilment" : null;
      const due = phase === "approval" ? s.approvalDue : phase === "fulfilment" ? s.due : null;
      const target = phase === "approval" ? s.approvalTarget : s.fulfilTarget;
      if (!phase || !due || (due > NOW && !spec.plan.stuck) || levelAt(NOW, due, target) >= 3) break;
      t0 -= due + (target * H * levels.level3Pct) / 100 + between(1, 30) * H - NOW;
      s = simulate(spec, t0);
    }

    const id = uuid();
    const snapshot = {
      name: item.name, itemId: item.id, version: item.version, riskLevel: item.risk_level, endpointId: null,
      formSchema: item.form_schema, categoryKey: item.category_key, approvalMode: item.approval_mode, categoryName: item.category_name,
      isPrivileged: false, approvalHours: item.approval_hours, fulfilmentType: "manual", fulfilmentHours: item.fulfilment_hours,
      approvalPolicyName: item.policy_name || null, requiresIdentityCheck: item.requires_identity_check, seed: MARK,
    };
    if ("needed_by" in form.values) form.values.needed_by = chance(0.6) ? dayStr(s.submitAt + between(2, 14) * D) : null;
    if ("start_date" in form.values) form.values.start_date = dayStr(s.submitAt + between(5, 25) * D);
    for (const k of Object.keys(form.values)) if (form.values[k] === null) delete form.values[k];

    const last = s.ev[s.ev.length - 1];
    const idCheck = item.requires_identity_check && s.startedAt;
    const approvalLevel = s.status === "pending_approval" ? levelAt(NOW, s.approvalDue, s.approvalTarget) : 0;
    const fulfilEnd = s.fulfilledAt || s.cancelAt || NOW;
    const fulfilLevel = s.due ? levelAt(fulfilEnd, s.due, s.fulfilTarget) : 0;
    const row = {
      id,
      organization_id: ORG,
      catalog_item_id: item.id,
      item_snapshot: J(snapshot),
      requester_id: requester.id,
      requested_for_id: requestedFor ? requestedFor.id : null,
      requested_for_name: form.requestedForName,
      requested_for_email: null,
      title: form.title,
      description: form.description,
      business_justification: item.approval_mode !== "none" ? pick(["Needed to deliver the Q4 roadmap.", "Replaces end-of-life equipment.", "Required for my new responsibilities.", "Client commitment due this month.", "Agreed with my manager in our 1:1."]) : null,
      priority,
      form_values: J(form.values),
      status: s.status,
      assignee_id: s.assignee ? s.assignee.id : null,
      resolution_note: s.status === "fulfilled" ? last.note : null,
      submitted_at: date(s.submitAt),
      approved_at: date(s.ev.find((e) => e.to === "approved")?.t ?? null),
      started_at: date(s.startedAt),
      fulfilled_at: date(s.fulfilledAt),
      cancelled_at: date(s.cancelAt),
      status_updated_at: date(last.t),
      created_at: date(s.ev[0].t),
      updated_at: date(last.t),
      risk_level: item.risk_level,
      current_step: s.currentStep,
      approval_due_at: spec.route.length ? date(s.approvalDue) : null,
      approval_target_hours: spec.route.length ? s.approvalTarget : null,
      approval_escalation_level: approvalLevel,
      fulfilment_due_at: date(s.due),
      fulfilment_target_hours: s.due ? s.fulfilTarget : null,
      fulfilment_escalation_level: fulfilLevel,
      info_requested_at: s.status === "info_requested" ? date(s.info.ask) : null,
      info_requested_from: s.status === "info_requested" ? "in_progress" : null,
      info_requested_by_id: s.status === "info_requested" ? s.info.by.id : null,
      identity_verified_at: idCheck ? date(s.startedAt - between(2, 20) * MIN) : null,
      identity_verified_by_id: idCheck ? s.assignee.id : null,
      identity_method: idCheck ? pick(["Call-back to their known phone number", "Confirmed by their line manager", "Video call with photo ID", "In person with photo ID"]) : null,
      identity_note: null,
      ai_triage: null,
    };
    reqRows.push(row);

    // Approval rows as they stand now.
    for (const a of s.approvals) {
      const decided = a.decidedAt && a.decidedAt <= NOW;
      let decision = "waiting";
      if (decided) decision = a.decision;
      else if (s.status === "pending_approval" && a.stepOrder === s.currentStep && a.opensAt <= NOW) decision = "pending";
      else if (s.status !== "pending_approval" && !decided) decision = "skipped";
      approvalRows.push({
        id: a.id,
        request_id: id,
        step_order: a.stepOrder,
        approver_id: a.approver.user.id,
        decision,
        comment: decided ? a.comment : null,
        decided_at: decided ? date(a.decidedAt) : null,
        created_at: date(a.createdAt),
        step_name: a.stepName,
        step_mode: a.stepMode,
        rule_index: a.ruleIndex,
        group_id: a.approver.groupId || null,
        is_fallback: !!a.approver.fallback,
        on_behalf_of_id: null,
        decided_by_id: decided ? a.approver.user.id : null,
        authority_level: decided && a.approver.groupId ? a.approver.authority : null,
      });
      if (decision === "pending" && a.approver.user.id === admin.id) {
        notify(admin.id, "service_request_approval", `Approval needed: {REF} ${form.title}`, `${requester.name} asked for "${item.name}" (${form.title}). You can approve it, reject it, or ask a question.`, { serviceRequestId: id }, Math.max(a.opensAt, s.submitAt), 0);
      }
    }

    for (const e of s.ev) {
      historyRows.push({ id: uuid(), request_id: id, from_status: e.from, to_status: e.to, actor_id: e.actor ? e.actor.id : null, note: e.note || null, created_at: date(e.t) });
    }

    // Escalations already sent (approval steps, then fulfilment).
    const escalate = (phase, stepOrder, due, targetH, end, holders) => {
      thresholds(due, targetH).forEach((t, li) => {
        if (t > end || t > NOW) return;
        const level = li + 1;
        const notified = [...new Set([...holders.map((u) => u.id), ...(level >= 2 ? [admin.id] : [])])];
        escalationRows.push({ id: uuid(), request_id: id, phase, step_order: stepOrder, level, notified_user_ids: notified, created_at: date(t) });
        log(null, t, "service_request.escalated", `Escalated IT request {REF}: ${phase} overdue (level ${level})`, "service_request", id, { phase, step: stepOrder, level }, level >= 3 ? "warning" : "info");
        if (NOW - t < 21 * D) {
          for (const uid of notified) notify(uid, "service_request_escalated", `${level >= 3 ? "Critical — " : ""}Overdue ${phase}: {REF} ${form.title}`, phase === "approval" ? `"${form.title}" from ${requester.name} is waiting too long for approval.` : `"${form.title}" from ${requester.name} is past its fulfilment target.`, { serviceRequestId: id }, t);
        }
      });
    };
    spec.route.forEach((step, si) => {
      const order = si + 1;
      const rows = s.approvals.filter((a) => a.stepOrder === order);
      const opened = Math.min(...rows.map((r) => r.opensAt));
      if (opened > NOW) return;
      const decidedAt = rows.map((r) => r.decidedAt).filter((t) => t && t <= NOW);
      const live = s.status === "pending_approval" && order === s.currentStep;
      const end = live ? NOW : decidedAt.length ? Math.max(...decidedAt) : s.cancelAt && opened < s.cancelAt ? s.cancelAt : null;
      if (end == null) return;
      escalate("approval", order, opened + s.approvalTarget * H, s.approvalTarget, end, rows.map((r) => r.approver.user));
    });
    if (s.due) escalate("fulfilment", 0, s.due, s.fulfilTarget, fulfilEnd, s.assignee ? [s.assignee] : IT_AGENTS);

    // Conversation on the request.
    if (chance(0.45) && s.ev.length > 1) {
      const span = Math.max(H, (s.fulfilledAt || s.cancelAt || NOW) - s.submitAt);
      const agent = s.assignee || pick(IT_AGENTS);
      const turns = int(1, 4);
      let root = null;
      for (let k = 0; k < turns; k++) {
        const at = s.submitAt + (span * (k + 0.5)) / (turns + 0.5);
        if (at > NOW) break;
        const internal = k > 0 && chance(0.25);
        const fromRequester = !internal && k % 2 === 1;
        const author = fromRequester ? requester : agent;
        const mention = !fromRequester && !internal && chance(0.3) ? [{ id: requester.id, name: requester.name }] : [];
        const cid = uuid();
        commentRows.push({
          id: cid,
          request_id: id,
          author_id: author.id,
          body: (mention.length ? `@${requester.name} ` : "") + (internal ? pick(I.internalNotes).replace("{n}", int(1000, 9999)) : fromRequester ? pick(I.requesterReplies) : pick(I.agentComments)),
          is_internal: internal,
          created_at: date(at),
          parent_id: fromRequester && root && chance(0.5) ? root : null,
          mentions: J(mention),
          edited_at: null,
          deleted_at: null,
          deleted_by_id: null,
        });
        if (!root && !internal) root = cid;
      }
    }

    // Requester- and IT-facing notifications, and the audit trail.
    log(requester, s.submitAt, "service_request.submitted", `Submitted IT request {REF} "${form.title}"`, "service_request", id, { item: item.name, priority });
    for (const e of s.ev) {
      if (e.to === "approved" || e.to === "rejected") log(e.actor, e.t, `service_request.${e.to}`, `${e.to === "approved" ? "Approved" : "Rejected"} IT request {REF} "${form.title}"`, "service_request", id, { riskLevel: item.risk_level });
      if (e.to === "in_progress" && e.from !== "info_requested") log(e.actor, e.t, "service_request.started", `Started work on IT request {REF}`, "service_request", id, {});
      if (e.to === "fulfilled") log(e.actor, e.t, "service_request.fulfilled", `Fulfilled IT request {REF} "${form.title}"`, "service_request", id, {});
      if (e.to === "cancelled") log(e.actor, e.t, "service_request.cancelled", `Cancelled IT request {REF} "${form.title}"`, "service_request", id, { reason: e.note });
      if (e.to === "info_requested") log(e.actor, e.t, "service_request.info_requested", `Asked for more information on IT request {REF}`, "service_request", id, {});
    }
    if (idCheck) log(s.assignee, s.startedAt - 5 * MIN, "service_request.identity_verified", `Verified the requester's identity on IT request {REF}`, "service_request", id, {});
    if (NOW - s.submitAt < 25 * D) {
      if (s.readyAt) for (const a of IT_AGENTS) notify(a.id, "service_request_queued", `New IT request: {REF} ${form.title}`, `${requester.name} needs "${item.name}" (${form.title}). Priority: ${priority}.`, { serviceRequestId: id }, s.readyAt);
      if (["fulfilled", "rejected", "approved", "info_requested"].includes(s.status)) {
        const words = { fulfilled: "Done", rejected: "Rejected", approved: "Approved", info_requested: "Question about" }[s.status];
        notify(requester.id, "service_request_update", `${words}: {REF} ${form.title}`, s.status === "fulfilled" ? `IT finished "${form.title}". ${last.note || ""}` : s.status === "info_requested" ? `IT needs more information about "${form.title}".` : `"${form.title}" was ${s.status}.`, { serviceRequestId: id }, last.t);
      }
    }
  }

  const nums = await insert("service_requests", reqRows, "id, request_number");
  await insert("service_request_approvals", approvalRows);
  await insert("service_request_status_history", historyRows);
  await insert("service_request_comments", commentRows);
  await insert("service_request_escalations", escalationRows);
  count("IT requests", reqRows.length);
  count("IT approvals", approvalRows.length);
  count("IT escalations", escalationRows.length);
  count("IT request comments", commentRows.length);
  // SR numbers only exist once inserted; the caller fills them into the
  // {REF} placeholders of the audit log and notifications.
  return Object.fromEntries(nums.map((r) => [r.id, `SR-${String(r.request_number).padStart(6, "0")}`]));
}

main()
  .then(() => db.end())
  .then(() => console.log("[demo] Done."))
  .catch(async (err) => {
    console.error("[demo] Failed:", err.stack || err.message);
    try {
      await db.end();
    } catch {}
    process.exit(1);
  });
