/* =========================================================
   FD13 Apparatus Check, shared state Worker (fd13-apparatus)
   North Country EMS Cloudflare account. D1 database: fd13-apparatus-db.
   Version 1.3.1 (2026-11-19). The check day rolls over at 07:30 Pacific (was midnight).
   Version 1.3 (2026-11-18). Finished checks are saved here (POST /check) and open problems are kept
     here (from checks, plus POST /problem when someone marks one fixed). New read routes for the NCEMS Hub,
     FD13 side only: GET /fire/today and GET /fire/problems. CLIENT_ID can now hold more than one app.
     Shared progress can carry the check's item count (total) so the Hub can show percent done.
   Version 1.2 (2026-11-18). Adds check photos (/photos, /photo/...) stored in R2, same pattern as ncems-checks.
   Version 1.1 (2026-11-18). Adds shared check progress (/progress) and extraAps in /state.

   Routes
     GET  /health            version and service name (public)
     GET  /state             saved layout (public read, so volunteers see it too)
     PUT  /state             save layout (admins only). Writes a change log entry.
     GET  /log               last 100 change log entries, no bodies (admins only)
     POST /revert            restore the state from a log entry (admins only). Body: {id}
     GET  /progress?day=YYYY-MM-DD   shared check progress for one day (public read)
     PUT  /progress          merge one check or vehicle copy. Body: {key, doc:{ans, claim}}. Public, so volunteers can write.
     DELETE /progress?key=   remove one shared copy (after a check is submitted)
     POST /photos?unit=&label=  store one photo in R2 (public, volunteers). Body: the image bytes, Content-Type image/jpeg, png, heic, heif, webp or gif. Returns {ok, key, url}.
     GET  /photo/<key>       serve one stored photo (public read; keys are random)
     POST /check             save one finished check (public, volunteers). Body: {id, day, ts, apId, apName, chk, chkName, by, total, fails:[{zone, item, fix, note, photo}]}
                             Unable to fix opens (or updates) a problem for that unit and item. Fixed on the spot closes it.
     POST /problem           mark a problem from the checker's list (public, volunteers). Body: {apId, label, action: fixed|closed|reopen|broken, by, note}
     GET  /fire/today        FD13 rigs today for the NCEMS Hub: last check, percent, open problems (any signed in NCEMS account)
     GET  /fire/problems     open FD13 problems for the NCEMS Hub (any signed in NCEMS account)

   Auth
     Browser sends the Microsoft ID token as "Authorization: Bearer <token>".
     The token must be signed by the tenant, issued for one of the apps in CLIENT_ID, and not expired.
     The email in the token (preferred_username) must be in ADMINS to write.

   Variables (Settings > Variables and Secrets)
     TENANT_ID   153dc089-095e-4a20-8d10-39321a0aca09
     CLIENT_ID   06fbbe41-0b42-4b07-a071-cb4ffa5092c9,54eb93f5-05e0-42ca-a49d-f4df05c3331c
                 (FD13 Apparatus Check, then the NCEMS Hub. Comma separated. CG Staff f758d1fe... goes here later.)
     ADMINS      d.boyce@northcountryems.org,m.wagner@northcountryems.org,c.andrus@northcountryems.org
     ORIGINS     https://apparatus.fd13.org,https://emaildougb.github.io,https://hub.northcountryems.org
     Admin writes (PUT /state, /log, /revert) still need the FD13 Apparatus Check app (the first CLIENT_ID).
   Binding
     DB          D1 database fd13-apparatus-db
     PHOTOS      R2 bucket fd13-check-photos
   ========================================================= */

const VERSION = '1.3.1';
const SERVICE = 'fd13-apparatus';
const MAX_BODY = 2 * 1024 * 1024;   // 2 MB
const LOG_KEEP = 500;               // keep the newest 500 log entries
const MAX_PHOTO = 15 * 1024 * 1024; // 15 MB, same limit as ncems-checks
const PHOTO_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/heic': 'heic', 'image/heif': 'heif', 'image/webp': 'webp', 'image/gif': 'gif' };
const PHOTO_KEY_RE = /^\d{4}-\d{2}\/[A-Za-z0-9-]{1,12}\/[\w.-]{1,120}\.(jpg|png|heic|heif|webp|gif)$/;

let schemaReady = false;
let jwksCache = { at: 0, keys: null, tenant: '' };

/* ---------- small helpers ---------- */

function json(body, status = 200, cors = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...cors }
  });
}

function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

function corsFor(request, env) {
  const origin = request.headers.get('origin') || '';
  const allowed = (env.ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!origin || !allowed.includes(origin)) return {};
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET,PUT,POST,DELETE,OPTIONS',
    'access-control-allow-headers': 'authorization,content-type',
    'access-control-max-age': '600',
    'vary': 'origin'
  };
}

function cleanPhotoPart(v, max) {
  return String(v || '').replace(/[^A-Za-z0-9-]/g, '').slice(0, max) || 'x';
}

function randomPhotoId() {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 12);
}

function adminList(env) {
  return (env.ADMINS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
}

async function readJSON(request) {
  const len = Number(request.headers.get('content-length') || 0);
  if (len > MAX_BODY) throw httpError(413, 'Body too large');
  const text = await request.text();
  if (text.length > MAX_BODY) throw httpError(413, 'Body too large');
  try { return JSON.parse(text); } catch (e) { throw httpError(400, 'Body is not valid JSON'); }
}

/* ---------- Microsoft ID token check ---------- */

function b64urlToBytes(str) {
  const pad = str.length % 4 === 0 ? '' : '='.repeat(4 - (str.length % 4));
  const bin = atob(str.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function b64urlToJSON(str) {
  return JSON.parse(new TextDecoder().decode(b64urlToBytes(str)));
}

async function getSigningKeys(env) {
  const now = Date.now();
  if (jwksCache.keys && jwksCache.tenant === env.TENANT_ID && now - jwksCache.at < 3600 * 1000) {
    return jwksCache.keys;
  }
  const res = await fetch(`https://login.microsoftonline.com/${env.TENANT_ID}/discovery/v2.0/keys`);
  if (!res.ok) throw httpError(503, 'Could not load Microsoft signing keys');
  const body = await res.json();
  jwksCache = { at: now, keys: body.keys || [], tenant: env.TENANT_ID };
  return jwksCache.keys;
}

async function verifyIdToken(token, env) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) throw httpError(401, 'Sign in again (bad token)');
  const [h, p, s] = parts;
  let header, payload;
  try { header = b64urlToJSON(h); payload = b64urlToJSON(p); } catch (e) { throw httpError(401, 'Sign in again (bad token)'); }
  if (header.alg !== 'RS256' || !header.kid) throw httpError(401, 'Sign in again (unsupported token)');

  const iss = `https://login.microsoftonline.com/${env.TENANT_ID}/v2.0`;
  if (payload.iss !== iss) throw httpError(401, 'Sign in again (wrong issuer)');
  if (payload.tid && payload.tid !== env.TENANT_ID) throw httpError(401, 'Sign in again (wrong tenant)');
  if (!clientList(env).includes(payload.aud)) throw httpError(401, 'Sign in again (wrong audience)');
  const nowSec = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== 'number' || payload.exp < nowSec - 60) throw httpError(401, 'Sign in again (expired)');

  const keys = await getSigningKeys(env);
  const jwk = keys.find(k => k.kid === header.kid);
  if (!jwk) throw httpError(401, 'Sign in again (unknown signing key)');
  const key = await crypto.subtle.importKey(
    'jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']
  );
  const ok = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5', key, b64urlToBytes(s), new TextEncoder().encode(h + '.' + p)
  );
  if (!ok) throw httpError(401, 'Sign in again (bad signature)');

  const email = String(payload.preferred_username || payload.email || payload.upn || '').toLowerCase();
  if (!email) throw httpError(401, 'Sign in again (no email on token)');
  return { email, name: payload.name || email, aud: payload.aud };
}

function clientList(env) {
  return String(env.CLIENT_ID || '').split(',').map(s => s.trim()).filter(Boolean);
}

async function currentUser(request, env, verify) {
  const auth = request.headers.get('authorization') || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  return verify(m[1], env);
}

async function requireAdmin(request, env, verify) {
  const user = await currentUser(request, env, verify);
  if (!user) throw httpError(401, 'Sign in with Microsoft to make changes');
  if (!adminList(env).includes(user.email)) throw httpError(403, 'This account is not an admin');
  // 1.3: admin writes only from the FD13 Apparatus Check app itself, never from the Hub's sign in
  if (user.aud && user.aud !== clientList(env)[0]) throw httpError(403, 'Make changes in FD13 Apparatus Check');
  return user;
}

// 1.3: any signed in NCEMS account (FD13 Apparatus Check or the Hub). Used by the Hub's read routes.
async function requireSignedIn(request, env, verify) {
  const user = await currentUser(request, env, verify);
  if (!user) throw httpError(401, 'Sign in with Microsoft');
  return user;
}

/* ---------- D1 schema and state ---------- */

async function ensureSchema(db) {
  if (schemaReady) return;
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS kv (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      updated_by TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS change_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      at TEXT NOT NULL,
      who TEXT NOT NULL,
      action TEXT NOT NULL,
      summary TEXT NOT NULL,
      before_json TEXT
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS checks (
      id TEXT PRIMARY KEY,
      day TEXT NOT NULL,
      ts INTEGER NOT NULL,
      ap_id TEXT NOT NULL,
      chk TEXT NOT NULL,
      by_name TEXT NOT NULL,
      body TEXT NOT NULL
    )`),
    db.prepare(`CREATE INDEX IF NOT EXISTS checks_day ON checks (day, ap_id)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS problems (
      key TEXT PRIMARY KEY,
      ap_id TEXT NOT NULL,
      ap_name TEXT NOT NULL,
      label TEXT NOT NULL,
      zone TEXT NOT NULL,
      chk TEXT NOT NULL,
      note TEXT NOT NULL,
      photo TEXT NOT NULL,
      by_name TEXT NOT NULL,
      opened_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      status TEXT NOT NULL,
      closed_by TEXT,
      closed_at INTEGER
    )`)
  ]);
  schemaReady = true;
}

const STATE_FIELDS = ['stOrder', 'chkOrder', 'apEdits', 'zones', 'extraAps'];

function validateState(s) {
  if (!s || typeof s !== 'object' || Array.isArray(s)) throw httpError(400, 'State must be an object');
  const out = {};
  if (s.stOrder !== undefined) {
    if (!s.stOrder || typeof s.stOrder !== 'object' || Array.isArray(s.stOrder)) throw httpError(400, 'stOrder must be an object');
    for (const [k, v] of Object.entries(s.stOrder)) {
      if (!Array.isArray(v) || v.some(x => typeof x !== 'string')) throw httpError(400, `stOrder.${k} must be a list of ids`);
    }
    out.stOrder = s.stOrder;
  }
  if (s.chkOrder !== undefined) {
    if (!Array.isArray(s.chkOrder) || s.chkOrder.some(x => typeof x !== 'string')) throw httpError(400, 'chkOrder must be a list of ids');
    out.chkOrder = s.chkOrder;
  }
  if (s.apEdits !== undefined) {
    if (!s.apEdits || typeof s.apEdits !== 'object' || Array.isArray(s.apEdits)) throw httpError(400, 'apEdits must be an object');
    out.apEdits = s.apEdits;
  }
  if (s.zones !== undefined) {
    if (!s.zones || typeof s.zones !== 'object' || Array.isArray(s.zones)) throw httpError(400, 'zones must be an object');
    for (const [k, v] of Object.entries(s.zones)) {
      if (!Array.isArray(v)) throw httpError(400, `zones.${k} must be a list`);
    }
    out.zones = s.zones;
  }
  if (s.extraAps !== undefined) {
    if (!Array.isArray(s.extraAps)) throw httpError(400, 'extraAps must be a list');
    for (const u of s.extraAps) {
      if (!u || typeof u !== 'object' || typeof u.id !== 'string' || typeof u.name !== 'string' || typeof u.st !== 'string') {
        throw httpError(400, 'Each added unit needs id, name and st');
      }
    }
    out.extraAps = s.extraAps;
  }
  return out;
}

async function loadState(db) {
  const row = await db.prepare(`SELECT value, updated_at, updated_by FROM kv WHERE key = 'state'`).first();
  if (!row) return null;
  return { state: JSON.parse(row.value), updatedAt: row.updated_at, updatedBy: row.updated_by };
}

function summarize(prev, next) {
  const changed = [];
  for (const k of STATE_FIELDS) {
    if (next[k] === undefined) continue;
    const a = JSON.stringify(prev ? prev[k] : undefined);
    const b = JSON.stringify(next[k]);
    if (a !== b) changed.push(k);
  }
  if (changed.length === 0) return 'No changes';
  return 'Changed: ' + changed.join(', ');
}

async function writeState(db, nextState, who, action, summary, beforeJSON) {
  const now = new Date().toISOString();
  const value = JSON.stringify(nextState);
  await db.batch([
    db.prepare(`INSERT INTO kv (key, value, updated_at, updated_by) VALUES ('state', ?, ?, ?)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by`)
      .bind(value, now, who),
    db.prepare(`INSERT INTO change_log (at, who, action, summary, before_json) VALUES (?, ?, ?, ?, ?)`)
      .bind(now, who, action, summary, beforeJSON),
    db.prepare(`DELETE FROM change_log WHERE id <= (SELECT COALESCE(MAX(id), 0) - ? FROM change_log)`)
      .bind(LOG_KEEP)
  ]);
  return now;
}

/* ---------- shared check progress ----------
   One row per check and one per unit's vehicle values, per day.
   key looks like p:2026-11-18|eng51|preshift (or |vehicle).
   Each answer carries a ts. The newer answer wins for each item. */

const PROGRESS_RE = /^p:\d{4}-\d{2}-\d{2}\|[a-z0-9]{1,20}\|[a-z0-9]{1,20}$/;
const CLAIM_MS = 20 * 60 * 1000;   // a claim is live for 20 minutes after its last change
const KEEP_DAYS = 3;               // older shared copies are removed on the next write

function cleanEntry(e) {
  if (!e || typeof e !== 'object' || Array.isArray(e)) return null;
  return {
    v: e.v === null || e.v === undefined ? null : String(e.v).slice(0, 200),
    fix: e.fix === 'fixed' || e.fix === 'unable' ? e.fix : null,
    note: typeof e.note === 'string' ? e.note.slice(0, 2000) : '',
    ts: Number.isFinite(e.ts) ? e.ts : 0,
    by: typeof e.by === 'string' ? e.by.slice(0, 80) : ''
  };
}

function cleanAns(ans) {
  const out = {};
  if (!ans || typeof ans !== 'object' || Array.isArray(ans)) return out;
  let n = 0;
  for (const [k, e] of Object.entries(ans)) {
    if (k.length > 120) continue;
    const c = cleanEntry(e);
    if (!c) continue;
    out[k] = c;
    if (++n >= 400) break;
  }
  return out;
}

function mergeAns(prev, incoming) {
  const out = { ...prev };
  for (const [k, e] of Object.entries(incoming)) {
    if (!out[k] || e.ts > out[k].ts) out[k] = e;
  }
  return out;
}

function cleanClaim(c) {
  if (!c || typeof c !== 'object' || typeof c.by !== 'string' || !c.by.trim()) return null;
  return { by: c.by.slice(0, 80) };
}

function daysAgoISO(days, now = Date.now()) {
  return new Date(now - days * 86400000).toISOString().slice(0, 10);
}

// Merge one shared copy. Returns the merged doc. The claim stays with whoever has it, unless it has expired.
async function putProgress(db, key, incoming, now = Date.now()) {
  const row = await db.prepare(`SELECT value FROM kv WHERE key = ?`).bind(key).first();
  const prev = row ? JSON.parse(row.value) : { ans: {}, claim: null };
  let claim = prev.claim || null;
  const inClaim = cleanClaim(incoming.claim);
  if (inClaim && (!claim || claim.by === inClaim.by || now - claim.ts > CLAIM_MS)) {
    claim = { by: inClaim.by, ts: now };
  }
  const doc = { ans: mergeAns(prev.ans || {}, cleanAns(incoming.ans)), claim, ts: now };
  // 1.3: the check's item count, so the Hub can show percent done. Older checkers leave it out.
  const total = Number(incoming.total);
  if (Number.isInteger(total) && total > 0 && total <= 400) doc.total = total;
  else if (prev.total) doc.total = prev.total;
  await db.prepare(`INSERT INTO kv (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?)
                    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by`)
    .bind(key, JSON.stringify(doc), new Date(now).toISOString(), inClaim ? inClaim.by : 'crew')
    .run();
  return doc;
}

async function pruneProgress(db, now = Date.now()) {
  await db.prepare(`DELETE FROM kv WHERE key LIKE 'p:%' AND substr(key, 3, 10) < ?`)
    .bind(daysAgoISO(KEEP_DAYS, now)).run();
}

async function getProgressDay(db, day) {
  const rows = await db.prepare(`SELECT key, value FROM kv WHERE key >= ? AND key < ? ORDER BY key`)
    .bind('p:' + day + '|', 'p:' + day + '}').all();
  const docs = {};
  for (const r of rows.results || []) docs[r.key] = JSON.parse(r.value);
  return docs;
}

/* ---------- finished checks and problems (1.3) ---------- */

/* The FD13 units built into FD13 Apparatus Check (APP_LIST in its index.html). Keep this list matched to it.
   Units added in the app (extraAps), renames (apEdits) and the order on each station (stOrder) come from /state. */
const BASE_RIGS = [
  { id: 'eng51', name: 'Engine 51', st: 's131' },
  { id: 'eng52', name: 'Engine 52', st: 's131' },
  { id: 'sq51', name: 'Squad 51', st: 's131' },
  { id: 'wt51', name: 'Water Tender 51', st: 's131' },
  { id: 'wt52', name: 'Water Tender 52', st: 's131' },
  { id: 'eng50', name: 'Engine 50', st: 's132' },
  { id: 'brush51', name: 'Brush 51', st: 's132' }
];
const STATION_NAMES = { s131: 'Station 131 (51)', s132: 'Station 132 (50)' };
const ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const CHECK_KEEP_DAYS = 400;

const str = (v, max) => (typeof v === 'string' ? v : v == null ? '' : String(v)).slice(0, max);

// 1.3.1: the check day rolls over at 07:30 Pacific (same as NCEMS). Before 07:30 the day is still yesterday.
function pacificDay(now = Date.now()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now - 7.5 * 3600 * 1000));
}

function cleanPhotoUrl(v) {
  const u = str(v, 400);
  return /^https:\/\/[\w.-]+\/photo\/[\w./-]+$/.test(u) ? u : '';
}

function cleanCheck(b) {
  if (!b || typeof b !== 'object' || Array.isArray(b)) throw httpError(400, 'Check must be an object');
  const id = str(b.id, 40), apId = str(b.apId, 40), chk = str(b.chk, 40), day = str(b.day, 10);
  if (!ID_RE.test(id)) throw httpError(400, 'Bad check id');
  if (!ID_RE.test(apId)) throw httpError(400, 'Bad unit id');
  if (!ID_RE.test(chk)) throw httpError(400, 'Bad checklist id');
  if (!DAY_RE.test(day)) throw httpError(400, 'Give the day as YYYY-MM-DD');
  const by = str(b.by, 80).trim();
  if (!by) throw httpError(400, 'Who did the check?');
  const ts = Number.isFinite(b.ts) ? Math.round(b.ts) : Date.now();
  const total = Number.isInteger(b.total) && b.total >= 0 && b.total <= 400 ? b.total : null;
  const fails = (Array.isArray(b.fails) ? b.fails : []).slice(0, 200).map(f => ({
    zone: str(f && f.zone, 120), item: str(f && f.item, 160),
    fix: f && (f.fix === 'fixed' || f.fix === 'unable') ? f.fix : null,
    note: str(f && f.note, 2000), photo: cleanPhotoUrl(f && f.photo)
  })).filter(f => f.item);
  return { id, day, ts, apId, apName: str(b.apName, 80) || apId, chk, chkName: str(b.chkName, 80) || chk, by, total, fails };
}

const probKey = (apId, label) => apId + '|' + label;

async function saveCheck(db, c, now = Date.now()) {
  const had = await db.prepare(`SELECT id FROM checks WHERE id = ?`).bind(c.id).first();
  if (had) return { ok: true, duplicate: true };   // the phone sent it twice (retry after a bad signal)
  const stmts = [
    db.prepare(`INSERT INTO checks (id, day, ts, ap_id, chk, by_name, body) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .bind(c.id, c.day, c.ts, c.apId, c.chk, c.by, JSON.stringify(c)),
    db.prepare(`DELETE FROM checks WHERE day < ?`).bind(new Date(now - CHECK_KEEP_DAYS * 86400000).toISOString().slice(0, 10))
  ];
  for (const f of c.fails) {
    const key = probKey(c.apId, f.item);
    if (f.fix === 'unable') {
      // Opens the problem, or updates it if it is already open. A closed one opens again with a new date.
      stmts.push(db.prepare(`INSERT INTO problems (key, ap_id, ap_name, label, zone, chk, note, photo, by_name, opened_at, updated_at, status, closed_by, closed_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', NULL, NULL)
          ON CONFLICT(key) DO UPDATE SET ap_name = excluded.ap_name, zone = excluded.zone, chk = excluded.chk, note = excluded.note,
            photo = CASE WHEN excluded.photo <> '' THEN excluded.photo ELSE problems.photo END,
            by_name = excluded.by_name, updated_at = excluded.updated_at,
            opened_at = CASE WHEN problems.status = 'open' THEN problems.opened_at ELSE excluded.opened_at END,
            status = 'open', closed_by = NULL, closed_at = NULL`)
        .bind(key, c.apId, c.apName, f.item, f.zone, c.chk, f.note, f.photo, c.by, c.ts, c.ts));
    } else if (f.fix === 'fixed') {
      stmts.push(db.prepare(`UPDATE problems SET status = 'fixed', closed_by = ?, closed_at = ?, updated_at = ? WHERE key = ? AND status = 'open'`)
        .bind(c.by, c.ts, c.ts, key));
    }
  }
  await db.batch(stmts);
  return { ok: true };
}

async function markProblem(db, b, now = Date.now()) {
  if (!b || typeof b !== 'object') throw httpError(400, 'Body must be an object');
  const apId = str(b.apId, 40), label = str(b.label, 160), by = str(b.by, 80).trim() || 'crew';
  const action = str(b.action, 10);
  if (!ID_RE.test(apId) || !label) throw httpError(400, 'Give the unit and item');
  const key = probKey(apId, label);
  if (action === 'fixed' || action === 'closed') {
    await db.prepare(`UPDATE problems SET status = ?, closed_by = ?, closed_at = ?, updated_at = ? WHERE key = ? AND status = 'open'`)
      .bind(action, by, now, now, key).run();
  } else if (action === 'reopen') {
    await db.prepare(`UPDATE problems SET status = 'open', closed_by = NULL, closed_at = NULL, updated_at = ? WHERE key = ?`)
      .bind(now, key).run();
  } else if (action === 'broken') {
    await db.prepare(`UPDATE problems SET by_name = ?, updated_at = ?, note = CASE WHEN ? <> '' THEN ? ELSE note END WHERE key = ? AND status = 'open'`)
      .bind(by, now, str(b.note, 2000), str(b.note, 2000), key).run();
  } else throw httpError(400, 'Action must be fixed, closed, reopen or broken');
  return { ok: true };
}

function rigList(state) {
  const st = state || {};
  const edits = st.apEdits || {};
  const all = [...BASE_RIGS, ...(Array.isArray(st.extraAps) ? st.extraAps : [])];
  const byId = {};
  all.forEach(a => { byId[a.id] = { ...a, ...(edits[a.id] || {}) }; });
  const out = [];
  if (st.stOrder && typeof st.stOrder === 'object') {
    Object.keys(st.stOrder).forEach(stId => (st.stOrder[stId] || []).forEach(id => {
      if (byId[id] && !out.some(x => x.id === id)) out.push({ ...byId[id], st: stId });
    }));
  }
  if (!out.length) BASE_RIGS.forEach(a => out.push({ ...byId[a.id] }));
  return out.map(a => ({ id: a.id, name: str(a.name, 80), station: STATION_NAMES[a.st] || str(a.st, 40) }));
}

function rowToProblem(r) {
  return { apId: r.ap_id, apName: r.ap_name, item: r.label, zone: r.zone, chk: r.chk, note: r.note, photo: r.photo, by: r.by_name, openedAt: r.opened_at, updatedAt: r.updated_at };
}

async function fireToday(db, day, now = Date.now()) {
  const saved = await loadState(db);
  const rigs = rigList(saved ? saved.state : null);
  const checks = (await db.prepare(`SELECT body FROM checks WHERE day = ? ORDER BY ts DESC`).bind(day).all()).results || [];
  const lastEver = (await db.prepare(`SELECT ap_id, MAX(ts) AS ts, body FROM checks GROUP BY ap_id`).all()).results || [];
  const probs = (await db.prepare(`SELECT * FROM problems WHERE status = 'open'`).all()).results || [];
  const progress = await getProgressDay(db, day);
  const out = rigs.map(r => {
    const today = checks.map(x => JSON.parse(x.body)).filter(c => c.apId === r.id);
    const last = today[0] || null;
    const ever = lastEver.find(x => x.ap_id === r.id);
    const lastAny = last || (ever ? JSON.parse(ever.body) : null);
    // In progress: the shared copies for this unit today (not the vehicle values)
    let pct = last ? 100 : 0, holder = '';
    if (!last) {
      Object.keys(progress).forEach(k => {
        const parts = k.replace(/^p:/, '').split('|');
        if (parts[1] !== r.id || parts[2] === 'vehicle') return;
        const d = progress[k], n = Object.keys(d.ans || {}).length;
        const p = d.total ? Math.min(99, Math.round(n / d.total * 100)) : (n ? 1 : 0);
        if (p > pct) { pct = p; holder = d.claim && d.claim.by ? d.claim.by : ''; }
      });
    }
    const open = probs.filter(p => p.ap_id === r.id);
    return {
      id: r.id, name: r.name, station: r.station,
      checked: !!last, pct, inProgressBy: holder,
      checksToday: today.map(c => ({ chk: c.chkName, by: c.by, at: c.ts, abnormal: c.fails.length })),
      last: lastAny ? { chk: lastAny.chkName, by: lastAny.by, at: lastAny.ts, day: lastAny.day } : null,
      openProblems: open.length
    };
  });
  return {
    day, at: now,
    checkedToday: out.filter(r => r.checked).length, rigCount: out.length,
    openProblems: probs.length, rigs: out
  };
}

async function fireProblems(db) {
  const rows = (await db.prepare(`SELECT * FROM problems WHERE status = 'open' ORDER BY opened_at DESC LIMIT 200`).all()).results || [];
  return { problems: rows.map(rowToProblem) };
}

/* ---------- routes ---------- */

async function handle(request, env, verify = verifyIdToken) {
  const cors = corsFor(request, env);
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const method = request.method;

  if (method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

  try {
    if (path === '/health' && method === 'GET') {
      return json({ ok: true, service: SERVICE, version: VERSION }, 200, cors);
    }

    if (path === '/photos' && method === 'POST') {
      if (!env.PHOTOS) throw httpError(500, 'Photo binding PHOTOS is missing');
      const type = (request.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
      if (!PHOTO_TYPES[type]) throw httpError(415, 'Send a photo (jpeg, png, heic, webp)');
      const len = Number(request.headers.get('content-length') || 0);
      if (len > MAX_PHOTO) throw httpError(413, 'Photo is over 15 MB');
      const buf = await request.arrayBuffer();
      if (!buf.byteLength) throw httpError(400, 'Empty photo');
      if (buf.byteLength > MAX_PHOTO) throw httpError(413, 'Photo is over 15 MB');
      const unit = cleanPhotoPart(url.searchParams.get('unit') || 'unit', 12);
      const label = cleanPhotoPart(url.searchParams.get('label') || 'photo', 40);
      const d = new Date();
      const iso = d.toISOString();
      const key = `${iso.slice(0, 7)}/${unit}/${iso.slice(0, 10)}-${label}-${randomPhotoId()}.${PHOTO_TYPES[type]}`;
      await env.PHOTOS.put(key, buf, {
        httpMetadata: { contentType: type, cacheControl: 'public, max-age=31536000, immutable' },
        customMetadata: { unit, label }
      });
      return json({ ok: true, key, url: `${url.origin}/photo/${key}` }, 200, cors);
    }

    if (path.startsWith('/photo/') && method === 'GET') {
      if (!env.PHOTOS) throw httpError(500, 'Photo binding PHOTOS is missing');
      const key = decodeURIComponent(path.slice('/photo/'.length));
      if (!PHOTO_KEY_RE.test(key)) throw httpError(400, 'Bad photo key');
      const obj = await env.PHOTOS.get(key);
      if (!obj) throw httpError(404, 'Photo not found');
      const headers = new Headers();
      obj.writeHttpMetadata(headers);
      headers.set('etag', obj.httpEtag);
      headers.set('cache-control', 'public, max-age=31536000, immutable');
      return new Response(obj.body, { status: 200, headers });
    }

    if (!env.DB) throw httpError(500, 'Database binding DB is missing');
    await ensureSchema(env.DB);

    if (path === '/state' && method === 'GET') {
      const saved = await loadState(env.DB);
      if (!saved) return json({ state: null }, 200, cors);
      return json(saved, 200, cors);
    }

    if (path === '/state' && method === 'PUT') {
      const user = await requireAdmin(request, env, verify);
      const body = await readJSON(request);
      const next = validateState(body);
      const prev = await loadState(env.DB);
      const merged = { ...(prev ? prev.state : {}), ...next };
      const summary = summarize(prev ? prev.state : null, next);
      const at = await writeState(
        env.DB, merged, user.email, 'save', summary,
        prev ? JSON.stringify(prev.state) : null
      );
      return json({ ok: true, updatedAt: at, updatedBy: user.email, summary }, 200, cors);
    }

    if (path === '/log' && method === 'GET') {
      await requireAdmin(request, env, verify);
      const rows = await env.DB.prepare(
        `SELECT id, at, who, action, summary, before_json IS NOT NULL AS can_revert
         FROM change_log ORDER BY id DESC LIMIT 100`
      ).all();
      return json({ entries: rows.results || [] }, 200, cors);
    }

    if (path === '/revert' && method === 'POST') {
      const user = await requireAdmin(request, env, verify);
      const body = await readJSON(request);
      const id = Number(body.id);
      if (!Number.isInteger(id) || id < 1) throw httpError(400, 'Give the log entry id to revert to');
      const entry = await env.DB.prepare(
        `SELECT id, before_json FROM change_log WHERE id = ?`
      ).bind(id).first();
      if (!entry) throw httpError(404, 'Log entry not found');
      if (!entry.before_json) throw httpError(400, 'That entry has nothing to restore');
      const restored = JSON.parse(entry.before_json);
      const prev = await loadState(env.DB);
      const summary = `Reverted entry ${id}. ` + summarize(prev ? prev.state : null, restored);
      const at = await writeState(
        env.DB, restored, user.email, 'revert', summary,
        prev ? JSON.stringify(prev.state) : null
      );
      return json({ ok: true, updatedAt: at, updatedBy: user.email, summary }, 200, cors);
    }

    if (path === '/check' && method === 'POST') {
      const c = cleanCheck(await readJSON(request));
      return json(await saveCheck(env.DB, c), 200, cors);
    }

    if (path === '/problem' && method === 'POST') {
      return json(await markProblem(env.DB, await readJSON(request)), 200, cors);
    }

    if (path === '/fire/today' && method === 'GET') {
      await requireSignedIn(request, env, verify);
      const day = url.searchParams.get('day') || pacificDay();
      if (!DAY_RE.test(day)) throw httpError(400, 'Give the day as YYYY-MM-DD');
      return json(await fireToday(env.DB, day), 200, cors);
    }

    if (path === '/fire/problems' && method === 'GET') {
      await requireSignedIn(request, env, verify);
      return json(await fireProblems(env.DB), 200, cors);
    }

    if (path === '/progress' && method === 'GET') {
      const day = url.searchParams.get('day') || '';
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw httpError(400, 'Give the day as YYYY-MM-DD');
      return json({ day, docs: await getProgressDay(env.DB, day) }, 200, cors);
    }

    if (path === '/progress' && method === 'PUT') {
      const body = await readJSON(request);
      const key = String(body.key || '');
      if (!PROGRESS_RE.test(key)) throw httpError(400, 'Bad progress key');
      await pruneProgress(env.DB);
      const doc = await putProgress(env.DB, key, body.doc || {});
      return json({ ok: true, doc }, 200, cors);
    }

    if (path === '/progress' && method === 'DELETE') {
      const key = url.searchParams.get('key') || '';
      if (!PROGRESS_RE.test(key)) throw httpError(400, 'Bad progress key');
      await env.DB.prepare(`DELETE FROM kv WHERE key = ?`).bind(key).run();
      return json({ ok: true }, 200, cors);
    }

    throw httpError(404, 'Not found');
  } catch (err) {
    const status = err.status || 500;
    const message = status === 500 ? 'Server error' : err.message;
    if (status === 500) console.error(err && err.stack ? err.stack : err);
    return json({ ok: false, error: message }, status, cors);
  }
}

export default {
  fetch: (request, env) => handle(request, env, verifyIdToken)
};

// For tests only
export { handle, verifyIdToken, cleanCheck, saveCheck, markProblem, fireToday, fireProblems, rigList, pacificDay, cleanPhotoPart, PHOTO_KEY_RE, validateState, summarize, putProgress, getProgressDay, pruneProgress, cleanAns, mergeAns, PROGRESS_RE };
