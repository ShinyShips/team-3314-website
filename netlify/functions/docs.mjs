/* Team 3314 — password-gated documents API (see docs/adr/0002).
   The private Drive folder is NOT shared publicly; a Google service account
   is the only outside identity with access. This function checks the team
   password, then lists the folder and proxies file downloads, so nothing in
   the browser ever holds a Drive link an outsider could use.

   Endpoints (all on /api/docs):
     POST {password}  → sets a session cookie, returns the listing
     POST {lock:true} → clears the cookie
     GET              → listing (cookie required)
     GET ?file=<id>   → file contents (cookie required); native Google
                        Docs/Sheets/Slides are exported as PDF

   Environment (set in the Netlify UI → Site settings → Environment):
     DOCS_PASSWORD           the team password
     DOCS_FOLDER_ID          the private Drive folder's ID
     GOOGLE_SERVICE_ACCOUNT  the service account's JSON key, pasted whole
   Setup steps live in README.md. Runs on Node builtins only — no deps. */

import { createSign, createHmac, createHash, timingSafeEqual } from 'node:crypto';

export const config = { path: '/api/docs' };

// Overridable so scripts/docs-dev.mjs can point at a mock Google locally.
const TOKEN_URL = process.env.GOOGLE_TOKEN_URL || 'https://oauth2.googleapis.com/token';
const DRIVE_URL = process.env.DRIVE_API_URL || 'https://www.googleapis.com/drive/v3';

const COOKIE = 'ti_docs';
const SESSION_HOURS = 12;

// Native Google types the proxy can export as PDF. Anything else under
// vnd.google-apps (forms, sites, shortcuts) can't be served to someone
// without Drive access, so it's left out of the listing entirely.
const EXPORTABLE = [
  'application/vnd.google-apps.document',
  'application/vnd.google-apps.spreadsheet',
  'application/vnd.google-apps.presentation',
  'application/vnd.google-apps.drawing'
];
const FOLDER_MIME = 'application/vnd.google-apps.folder';

export default async function handler(req) {
  const env = process.env;
  if (!env.DOCS_PASSWORD || !env.DOCS_FOLDER_ID || !env.GOOGLE_SERVICE_ACCOUNT) {
    return json({ error: 'not configured' }, 503);
  }

  try {
    if (req.method === 'POST') return await handlePost(req);
    if (req.method === 'GET') return await handleGet(req);
    return json({ error: 'method not allowed' }, 405);
  } catch (err) {
    console.error('docs function error:', err);
    return json({ error: 'server error' }, 500);
  }
}

async function handlePost(req) {
  const body = await req.json().catch(() => ({}));

  if (body.lock) {
    return json(null, 204, { 'set-cookie': cookie(req, '', true) });
  }

  if (!passwordOk(body.password)) {
    // Small fixed delay keeps casual brute-forcing slow without state.
    await new Promise((r) => setTimeout(r, 300));
    return json({ error: 'wrong password' }, 401);
  }

  const listing = await buildListing();
  return json(listing, 200, { 'set-cookie': cookie(req, makeToken()) });
}

async function handleGet(req) {
  const token = (req.headers.get('cookie') || '')
    .split(/;\s*/)
    .map((c) => c.split('='))
    .find(([k]) => k === COOKIE)?.[1];
  if (!tokenOk(token)) return json({ error: 'locked' }, 401);

  const fileId = new URL(req.url).searchParams.get('file');
  if (fileId) return serveFile(fileId);
  return json(await buildListing());
}

/* ---------- password & session tokens ----------
   The session secret is derived from the password + folder ID, so rotating
   the password (a Netlify env change) also invalidates every open session.
   Tokens are stateless: "<expiry>.<hmac(expiry)>" in an HttpOnly cookie. */

function sha256(s) { return createHash('sha256').update(String(s)).digest(); }

function passwordOk(given) {
  return typeof given === 'string' &&
    timingSafeEqual(sha256(given), sha256(process.env.DOCS_PASSWORD));
}

function secret() {
  return sha256(process.env.DOCS_PASSWORD + '|' + process.env.DOCS_FOLDER_ID);
}

function sign(exp) {
  return createHmac('sha256', secret()).update(String(exp)).digest('base64url');
}

function makeToken() {
  const exp = Date.now() + SESSION_HOURS * 3600 * 1000;
  return exp + '.' + sign(exp);
}

function tokenOk(token) {
  const [exp, sig] = String(token || '').split('.');
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  const expect = sign(exp);
  return sig.length === expect.length &&
    timingSafeEqual(Buffer.from(sig), Buffer.from(expect));
}

function cookie(req, value, clear) {
  // `Secure` breaks plain-http localhost testing, so drop it only there.
  const local = new URL(req.url).hostname === 'localhost';
  return COOKIE + '=' + value + '; Path=/api/docs; HttpOnly; SameSite=Strict' +
    (local ? '' : '; Secure') + (clear ? '; Max-Age=0' : '');
}

/* ---------- Google auth (service account → access token) ---------- */

let cachedToken = null; // survives warm invocations

async function accessToken() {
  if (cachedToken && cachedToken.exp > Date.now() + 60000) return cachedToken.value;

  const sa = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const input = b64({ alg: 'RS256', typ: 'JWT' }) + '.' + b64({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/drive.readonly',
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600
  });
  const jwt = input + '.' +
    createSign('RSA-SHA256').update(input).sign(sa.private_key, 'base64url');

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt
    })
  });
  if (!res.ok) throw new Error('token exchange failed: ' + res.status);
  const data = await res.json();
  cachedToken = { value: data.access_token, exp: Date.now() + data.expires_in * 1000 };
  return cachedToken.value;
}

async function drive(path, params) {
  const url = new URL(DRIVE_URL + path);
  // The folder lives in a Shared Drive; without these flags the API
  // pretends it doesn't exist.
  url.searchParams.set('supportsAllDrives', 'true');
  for (const [k, v] of Object.entries(params || {})) url.searchParams.set(k, v);
  return fetch(url, { headers: { authorization: 'Bearer ' + await accessToken() } });
}

async function driveJson(path, params) {
  const res = await drive(path, params);
  if (!res.ok) throw new Error('drive API ' + res.status + ' for ' + path);
  return res.json();
}

/* ---------- listing ---------- */

async function listFolder(id) {
  const data = await driveJson('/files', {
    q: `'${id}' in parents and trashed = false`,
    fields: 'files(id,name,mimeType,modifiedTime)',
    orderBy: 'name',
    pageSize: '100',
    includeItemsFromAllDrives: 'true'
  });
  return data.files || [];
}

function servable(f) {
  return !f.mimeType.startsWith('application/vnd.google-apps.') ||
    EXPORTABLE.includes(f.mimeType);
}

async function buildListing() {
  const items = await listFolder(process.env.DOCS_FOLDER_ID);
  const folders = items.filter((f) => f.mimeType === FOLDER_MIME);
  const rootFiles = items.filter((f) => f.mimeType !== FOLDER_MIME && servable(f));
  const sections = await Promise.all(folders.map(async (f) => ({
    name: f.name,
    files: (await listFolder(f.id)).filter((k) => k.mimeType !== FOLDER_MIME && servable(k))
  })));
  return { sections, rootFiles };
}

/* ---------- file proxy ---------- */

async function serveFile(id) {
  const meta = await driveJson('/files/' + encodeURIComponent(id), {
    fields: 'id,name,mimeType,parents'
  });

  // Only serve files that actually live in the private folder (directly or
  // one subfolder deep — matching what the listing shows). Without this,
  // a session cookie could fetch anything the service account can read.
  if (!(await inPrivateFolder(meta))) return json({ error: 'not found' }, 404);
  if (!servable(meta)) return json({ error: 'unsupported file type' }, 415);

  const native = meta.mimeType.startsWith('application/vnd.google-apps.');
  const upstream = native
    ? await drive('/files/' + encodeURIComponent(id) + '/export',
        { mimeType: 'application/pdf' })
    : await drive('/files/' + encodeURIComponent(id), { alt: 'media' });
  if (!upstream.ok) throw new Error('drive fetch ' + upstream.status);

  const name = meta.name.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, "'");
  return new Response(upstream.body, {
    status: 200,
    headers: {
      'content-type': native ? 'application/pdf' : meta.mimeType,
      'content-disposition': `inline; filename="${name}${native ? '.pdf' : ''}"`,
      'cache-control': 'private, no-store'
    }
  });
}

async function inPrivateFolder(meta) {
  const root = process.env.DOCS_FOLDER_ID;
  const parents = meta.parents || [];
  if (parents.includes(root)) return true;
  for (const p of parents) {
    const pm = await driveJson('/files/' + encodeURIComponent(p), { fields: 'id,parents' })
      .catch(() => null);
    if (pm && (pm.parents || []).includes(root)) return true;
  }
  return false;
}

/* ---------- misc ---------- */

function json(data, status = 200, headers = {}) {
  return new Response(data === null ? null : JSON.stringify(data), {
    status,
    headers: {
      ...(data === null ? {} : { 'content-type': 'application/json' }),
      'cache-control': 'no-store',
      ...headers
    }
  });
}
