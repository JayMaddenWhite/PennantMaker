// Pennant Maker server: serves the app and proxies logo/data lookups so images from
// ESPN / TheSportsDB / Wikimedia / Logopedia / pasted links can be exported (no CORS issues).
// Nothing fetched through the proxy is written to disk.
//
// Safe to run on a public domain:
//  - data (JSON/HTML) is only fetched from a short list of known lookup services;
//  - any other site may only return images, up to MAX_BYTES;
//  - private / local network addresses are refused (no reaching into the host's network);
//  - only this app's own pages may use the proxy (browser Sec-Fetch-Site check);
//  - each visitor is rate-limited.
// Environment: PORT (default 5178), HOST (default 127.0.0.1; use 0.0.0.0 on a server).
const http = require('http');
const fs = require('fs');
const path = require('path');
const dns = require('dns').promises;
const net = require('net');

const ROOT = path.join(__dirname, 'app');
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.csv': 'text/csv', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json',
};
// Lookup services the app reads data from (any content type allowed).
const DATA_HOSTS = new Set([
  'site.api.espn.com', 'sports.core.api.espn.com', 'www.thesportsdb.com',
  'commons.wikimedia.org', 'logos.fandom.com',
]);
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_REDIRECTS = 4;
const RATE = { windowMs: 60_000, max: Number(process.env.PROXY_RATE_PER_MIN) || 240 };

// ---------- safety helpers ----------
function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v = ip.toLowerCase();
  if (v.startsWith('::ffff:')) return isPrivateIp(v.slice(7));
  return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80');
}
async function assertPublic(u) {
  if (!/^https?:$/.test(u.protocol)) throw Object.assign(new Error('only http(s) links'), { code: 400 });
  if (u.port && !['80', '443'].includes(u.port)) throw Object.assign(new Error('port not allowed'), { code: 400 });
  const host = u.hostname.replace(/^\[|\]$/g, '');
  const addrs = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true });
  if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) throw Object.assign(new Error('address not allowed'), { code: 403 });
}
const hits = new Map();
function rateLimited(req) {
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '?';
  const now = Date.now(), h = hits.get(ip) || { start: now, n: 0 };
  if (now - h.start > RATE.windowMs) { h.start = now; h.n = 0; }
  h.n++; hits.set(ip, h);
  if (hits.size > 5000) for (const [k, v] of hits) if (now - v.start > RATE.windowMs) hits.delete(k);
  return h.n > RATE.max;
}

async function proxy(req, res, target) {
  const fail = (code, msg) => { res.writeHead(code, { 'Content-Type': 'text/plain' }); res.end(msg); };
  // only this app's own pages (browsers send Sec-Fetch-Site; the desktop app is same-origin too)
  const site = req.headers['sec-fetch-site'];
  if (site && site !== 'same-origin' && site !== 'none') return fail(403, 'proxy is only for this app');
  if (rateLimited(req)) return fail(429, 'too many requests, slow down');
  let u;
  try { u = new URL(target); } catch { return fail(400, 'bad url'); }
  try {
    // follow redirects by hand so every hop is checked
    let r;
    for (let hop = 0; ; hop++) {
      await assertPublic(u);
      r = await fetch(u, { headers: { 'User-Agent': 'PennantMaker/1.0' }, redirect: 'manual', signal: AbortSignal.timeout(15000) });
      if (r.status >= 300 && r.status < 400 && r.headers.get('location')) {
        if (hop >= MAX_REDIRECTS) return fail(508, 'too many redirects');
        u = new URL(r.headers.get('location'), u); continue;
      }
      break;
    }
    const type = r.headers.get('content-type') || 'application/octet-stream';
    if (!DATA_HOSTS.has(u.hostname) && !/^image\//i.test(type)) return fail(415, 'that link is not an image');
    const len = Number(r.headers.get('content-length') || 0);
    if (len > MAX_BYTES) return fail(413, 'file too large');
    const chunks = []; let size = 0;
    for await (const c of r.body) { size += c.length; if (size > MAX_BYTES) return fail(413, 'file too large'); chunks.push(c); }
    res.writeHead(r.status, { 'Content-Type': type, 'Cache-Control': 'private, max-age=600', 'X-Content-Type-Options': 'nosniff' });
    res.end(Buffer.concat(chunks));
  } catch (e) {
    fail(e.code && Number.isInteger(e.code) ? e.code : 502, 'fetch failed: ' + e.message);
  }
}

function start(port = 5178, host = '127.0.0.1') {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/proxy') return proxy(req, res, url.searchParams.get('url') || '');
    if (url.pathname === '/healthz') { res.writeHead(200, { 'Content-Type': 'text/plain' }); return res.end('ok'); }
    let p;
    try { p = decodeURIComponent(url.pathname); } catch { res.writeHead(400); return res.end(); }
    if (p === '/') p = '/index.html';
    const file = path.normalize(path.join(ROOT, p));
    if (!file.startsWith(ROOT + path.sep) || path.basename(file).startsWith('_')) { res.writeHead(404); return res.end('not found'); }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); return res.end('not found'); }
      const ext = path.extname(file);
      res.writeHead(200, {
        'Content-Type': TYPES[ext] || 'application/octet-stream',
        'Cache-Control': ['.html', '.js', '.css', '.webmanifest'].includes(ext) ? 'no-cache' : 'public, max-age=3600', // code always fresh after a deploy
        'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin',
      });
      res.end(data);
    });
  });
  return new Promise((resolve) => server.listen(port, host, () => resolve(server)));
}

module.exports = { start };

if (require.main === module) {
  const port = Number(process.env.PORT) || 5178;
  const host = process.env.HOST || '127.0.0.1';
  start(port, host).then(() => console.log(`Pennant Maker running at http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`));
}
