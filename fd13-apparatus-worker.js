/* =========================================================
   FD13 Apparatus Check, shared state Worker (fd13-apparatus)
   North Country EMS Cloudflare account. D1 database: fd13-apparatus-db.
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

   Auth
     Browser sends the Microsoft ID token as "Authorization: Bearer <token>".
     The token must be signed by the tenant, issued for CLIENT_ID, and not expired.
     The email in the token (preferred_username) must be in ADMINS to write.

   Variables (Settings > Variables and Secrets)
     TENANT_ID   153dc089-095e-4a20-8d10-39321a0aca09
     CLIENT_ID   06fbbe41-0b42-4b07-a071-cb4ffa5092c9
     ADMINS      d.boyce@northcountryems.org,m.wagner@northcountryems.org,c.andrus@northcountryems.org
     ORIGINS     https://apparatus.fd13.org,https://emaildougb.github.io
   Binding
     DB          D1 database fd13-apparatus-db
   ========================================================= */

const VERSION = '1.1';
const SERVICE = 'fd13-apparatus';
const MAX_BODY = 2 * 1024 * 1024;   // 2 MB
const LOG_KEEP = 500;               // keep the newest 500 log entries

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
  if (payload.aud !== env.CLIENT_ID) throw httpError(401, 'Sign in again (wrong audience)');
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
  return { email, name: payload.name || email };
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
export { handle, verifyIdToken, validateState, summarize, putProgress, getProgressDay, pruneProgress, cleanAns, mergeAns, PROGRESS_RE };
