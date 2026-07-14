#!/usr/bin/env node
/* Local test server for the protected-documents function
   (netlify/functions/docs.mjs), since `astro dev` can't run Netlify
   functions. Serves http://localhost:8888 — /api/docs* runs the real
   function, everything else proxies to the Astro dev server on :4321
   (start `npm run dev` first; HMR websockets don't proxy, so refresh
   manually).

   Two modes:
     node scripts/docs-dev.mjs --mock
       No credentials needed: fakes Google's token + Drive APIs in-process.
       Password is "mockpass", with a couple of fake documents.
     node scripts/docs-dev.mjs
       Real thing. Reads DOCS_PASSWORD, DOCS_FOLDER_ID and
       GOOGLE_SERVICE_ACCOUNT from a .env file in the repo root
       (KEY=VALUE lines; .env is gitignored) or the environment. */

import http from 'node:http';
import { readFileSync } from 'node:fs';
import { generateKeyPairSync } from 'node:crypto';

const PORT = 8888;
const MOCK_PORT = 8977;
const ASTRO = 'http://localhost:4321';

/* ----- env: .env file, then --mock overrides ----- */

try {
  for (const line of readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
  }
} catch { /* no .env — fine */ }

if (process.argv.includes('--mock')) startMockGoogle();

// Import AFTER env is settled — the function reads its URLs at load time.
const { default: docsFn } = await import('../netlify/functions/docs.mjs');

/* ----- main server ----- */

const collect = (req) => new Promise((resolve, reject) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => resolve(Buffer.concat(chunks)));
  req.on('error', reject);
});

// fetch() has already decompressed/reframed the body, so these upstream
// headers would corrupt the re-served response.
const STRIP = ['content-encoding', 'content-length', 'transfer-encoding'];

http.createServer(async (req, res) => {
  try {
    if (req.url.startsWith('/api/docs')) {
      const body = ['GET', 'HEAD'].includes(req.method) ? undefined : await collect(req);
      const out = await docsFn(new Request(`http://localhost:${PORT}${req.url}`, {
        method: req.method, headers: req.headers, body
      }));
      const headers = {};
      out.headers.forEach((v, k) => { if (!STRIP.includes(k)) headers[k] = v; });
      res.writeHead(out.status, headers);
      res.end(Buffer.from(await out.arrayBuffer()));
      return;
    }
    const up = await fetch(ASTRO + req.url, { headers: { accept: req.headers.accept || '*/*' } });
    const headers = {};
    up.headers.forEach((v, k) => { if (!STRIP.includes(k)) headers[k] = v; });
    res.writeHead(up.status, headers);
    res.end(Buffer.from(await up.arrayBuffer()));
  } catch (err) {
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('docs-dev error (is `npm run dev` running on :4321?): ' + err.message);
  }
}).listen(PORT, () => {
  console.log(`docs-dev on http://localhost:${PORT}/team-info/` +
    (process.argv.includes('--mock') ? '  (mock mode — password "mockpass")' : ''));
});

/* ----- mock Google (token + Drive), --mock mode only ----- */

function startMockGoogle() {
  const FOLDER = 'mock-root';
  const meta = {
    'sub-handbooks': { id: 'sub-handbooks', name: 'Handbooks', mimeType: 'application/vnd.google-apps.folder', parents: [FOLDER] },
    'f-notes': { id: 'f-notes', name: 'meeting-notes.txt', mimeType: 'text/plain', modifiedTime: '2026-07-01T12:00:00Z', parents: [FOLDER] },
    'f-handbook': { id: 'f-handbook', name: 'Team Handbook', mimeType: 'application/vnd.google-apps.document', modifiedTime: '2026-06-15T12:00:00Z', parents: ['sub-handbooks'] },
    'f-form': { id: 'f-form', name: 'Should Be Hidden (form)', mimeType: 'application/vnd.google-apps.form', modifiedTime: '2026-06-15T12:00:00Z', parents: ['sub-handbooks'] },
    'f-outside': { id: 'f-outside', name: 'outside-private-folder.txt', mimeType: 'text/plain', modifiedTime: '2026-06-15T12:00:00Z', parents: ['somewhere-else'] }
  };

  http.createServer((req, res) => {
    const url = new URL(req.url, `http://localhost:${MOCK_PORT}`);
    const send = (code, data, type = 'application/json') => {
      res.writeHead(code, { 'content-type': type });
      res.end(typeof data === 'string' ? data : JSON.stringify(data));
    };

    if (url.pathname === '/token') return send(200, { access_token: 'mock-token', expires_in: 3600 });

    if (url.pathname === '/drive/files') {
      const parent = (url.searchParams.get('q') || '').match(/'([^']+)' in parents/)?.[1];
      return send(200, { files: Object.values(meta).filter((f) => f.parents.includes(parent)) });
    }
    const m = url.pathname.match(/^\/drive\/files\/([^/]+)(\/export)?$/);
    if (m && meta[m[1]]) {
      if (m[2]) return send(200, '%PDF-1.4 mock export of ' + meta[m[1]].name, 'application/pdf');
      if (url.searchParams.get('alt') === 'media') return send(200, 'mock contents of ' + meta[m[1]].name, 'text/plain');
      return send(200, meta[m[1]]);
    }
    send(404, { error: 'not found' });
  }).listen(MOCK_PORT);

  const { privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' }
  });
  process.env.GOOGLE_TOKEN_URL = `http://localhost:${MOCK_PORT}/token`;
  process.env.DRIVE_API_URL = `http://localhost:${MOCK_PORT}/drive`;
  process.env.DOCS_PASSWORD = 'mockpass';
  process.env.DOCS_FOLDER_ID = FOLDER;
  process.env.GOOGLE_SERVICE_ACCOUNT = JSON.stringify({ client_email: 'mock@sa.test', private_key: privateKey });
}
