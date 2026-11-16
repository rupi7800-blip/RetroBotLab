'use strict';
// Router HTTP minimale + utilità (body JSON, cookie, multipart, file statici).
const fs = require('node:fs');
const path = require('node:path');

class Router {
  constructor() { this.routes = []; }
  add(method, pattern, handler, opts = {}) {
    const keys = [];
    const re = new RegExp('^' + pattern.replace(/\//g, '\\/').replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
    this.routes.push({ method, re, keys, handler, opts });
  }
  get(p, h, o) { this.add('GET', p, h, o); }
  post(p, h, o) { this.add('POST', p, h, o); }
  put(p, h, o) { this.add('PUT', p, h, o); }
  del(p, h, o) { this.add('DELETE', p, h, o); }
  match(method, pathname) {
    for (const r of this.routes) {
      if (r.method !== method) continue;
      const m = pathname.match(r.re);
      if (m) {
        const params = {};
        r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
        return { route: r, params };
      }
    }
    return null;
  }
}

function readBody(req, limit = 25 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(Object.assign(new Error('Richiesta troppo grande'), { status: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function parseBody(req) {
  const ct = (req.headers['content-type'] || '').toLowerCase();
  const raw = await readBody(req);
  if (!raw.length) return { body: {}, raw, files: [] };
  if (ct.includes('application/json')) {
    try { return { body: JSON.parse(raw.toString('utf8')), raw, files: [] }; } catch { throw Object.assign(new Error('JSON non valido'), { status: 400 }); }
  }
  if (ct.includes('application/x-www-form-urlencoded')) {
    return { body: Object.fromEntries(new URLSearchParams(raw.toString('utf8'))), raw, files: [] };
  }
  if (ct.includes('multipart/form-data')) {
    const m = ct.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
    const boundary = m ? (m[1] || m[2]) : null;
    if (!boundary) throw Object.assign(new Error('Boundary multipart mancante'), { status: 400 });
    // il boundary nel content-type potrebbe essere stato abbassato di caso: rileggiamo dall'header originale
    const orig = (req.headers['content-type'].match(/boundary=(?:"([^"]+)"|([^;]+))/i) || [])[1] || (req.headers['content-type'].match(/boundary=(?:"([^"]+)"|([^;]+))/i) || [])[2];
    return parseMultipart(raw, orig || boundary);
  }
  return { body: {}, raw, files: [] };
}

function parseMultipart(buf, boundary) {
  const body = {};
  const files = [];
  const delim = Buffer.from('--' + boundary);
  let pos = buf.indexOf(delim);
  while (pos !== -1) {
    pos += delim.length;
    if (buf[pos] === 45 && buf[pos + 1] === 45) break; // "--" finale
    if (buf[pos] === 13) pos += 2;
    const headEnd = buf.indexOf('\r\n\r\n', pos);
    if (headEnd === -1) break;
    const headers = buf.slice(pos, headEnd).toString('utf8');
    const next = buf.indexOf(delim, headEnd + 4);
    if (next === -1) break;
    const content = buf.slice(headEnd + 4, next - 2);
    const nm = headers.match(/[;\s]name=(?:"([^"]*)"|([^;\r\n]*))/i);
    const fm = headers.match(/filename=(?:"([^"]*)"|([^;\r\n]*))/i);
    const name = nm ? (nm[1] ?? nm[2]).trim() : undefined;
    const filename = fm ? (fm[1] ?? fm[2]).trim() : undefined;
    const ctype = (headers.match(/content-type:\s*([^\r\n]+)/i) || [])[1];
    if (filename !== undefined) files.push({ field: name, filename, contentType: ctype || 'application/octet-stream', data: content });
    else if (name) body[name] = content.toString('utf8');
    pos = next;
  }
  return { body, raw: buf, files };
}

function parseCookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function send(res, status, data, headers = {}) {
  if (res.headersSent) return;
  if (Buffer.isBuffer(data) || typeof data === 'string') {
    res.writeHead(status, headers);
    res.end(data);
    return;
  }
  const json = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(json);
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.webmanifest': 'application/manifest+json',
};

function serveStatic(req, res, root, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === '/' || rel === '') rel = '/index.html';
  const file = path.normalize(path.join(root, rel));
  if (!file.startsWith(root)) return send(res, 403, 'Forbidden');
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) {
      // fallback SPA
      const index = path.join(root, 'index.html');
      return fs.readFile(index, (e2, data) => e2 ? send(res, 404, 'Not found') : send(res, 200, data, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-cache' }));
    }
    const ext = path.extname(file);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'Content-Length': st.size });
    fs.createReadStream(file).pipe(res);
  });
}

module.exports = { Router, parseBody, parseCookies, send, serveStatic, readBody, parseMultipart };
