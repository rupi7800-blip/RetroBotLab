'use strict';
// Autenticazione locale: password con scrypt, sessioni con cookie HttpOnly + SameSite=Strict.
const crypto = require('node:crypto');
const store = require('./store');
const { SESSION_HOURS } = require('./config');

function hashPassword(pw, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(pw, salt, 64).toString('hex');
  return { salt, hash };
}

function isConfigured() { return !!store.db().auth; }

function setup(password) {
  if (isConfigured()) throw store.httpError(409, 'Password già impostata');
  validatePassword(password);
  store.update((d) => { d.auth = hashPassword(password); });
}

function validatePassword(pw) {
  if (typeof pw !== 'string' || pw.length < 8) throw store.httpError(400, 'La password deve avere almeno 8 caratteri');
}

function verify(password) {
  const a = store.db().auth;
  if (!a) return false;
  const h = crypto.scryptSync(String(password || ''), a.salt, 64);
  return crypto.timingSafeEqual(h, Buffer.from(a.hash, 'hex'));
}

function changePassword(oldPw, newPw) {
  if (!verify(oldPw)) throw store.httpError(403, 'Password attuale errata');
  validatePassword(newPw);
  store.update((d) => { d.auth = hashPassword(newPw); d.sessions = {}; });
}

// Limitazione tentativi di accesso (per IP)
const attempts = new Map();
function checkRate(ip) {
  const now = Date.now();
  const a = attempts.get(ip) || { n: 0, until: 0, first: now };
  if (a.until > now) throw store.httpError(429, `Troppi tentativi. Riprova tra ${Math.ceil((a.until - now) / 1000)} secondi.`);
  return a;
}
function failAttempt(ip) {
  const a = attempts.get(ip) || { n: 0, until: 0 };
  a.n += 1;
  if (a.n >= 5) { a.until = Date.now() + 60_000 * Math.min(15, a.n - 4); }
  attempts.set(ip, a);
}

function createSession() {
  const id = crypto.randomBytes(32).toString('hex');
  const expires = Date.now() + SESSION_HOURS * 3600_000;
  store.update((d) => {
    for (const [k, v] of Object.entries(d.sessions)) if (v.expires < Date.now()) delete d.sessions[k];
    d.sessions[hashId(id)] = { expires };
  });
  return { id, expires };
}
function hashId(id) { return crypto.createHash('sha256').update(id).digest('hex'); }

function validSession(id) {
  if (!id) return false;
  const s = store.db().sessions[hashId(id)];
  return !!s && s.expires > Date.now();
}
function destroySession(id) {
  if (!id) return;
  store.update((d) => { delete d.sessions[hashId(id)]; });
}

function cookieHeader(id, expires, secure) {
  const parts = [`rbl_session=${id}`, 'HttpOnly', 'SameSite=Strict', 'Path=/', `Expires=${new Date(expires).toUTCString()}`];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

module.exports = { isConfigured, setup, verify, changePassword, createSession, validSession, destroySession, cookieHeader, checkRate, failAttempt, attempts };
