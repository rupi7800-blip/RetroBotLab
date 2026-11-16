'use strict';
// Cassaforte delle credenziali: AES-256-GCM.
// La chiave master proviene da APP_SECRET (consigliato) oppure da data/.master.key (permessi 600).
// I valori in chiaro non vengono mai restituiti al frontend né scritti nei log.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { APP_SECRET, DATA_DIR } = require('./config');
const store = require('./store');

let KEY = null;
function key() {
  if (KEY) return KEY;
  if (APP_SECRET) {
    KEY = crypto.scryptSync(APP_SECRET, 'retro-bot-lab:vault', 32);
  } else {
    const f = path.join(DATA_DIR, '.master.key');
    if (!fs.existsSync(f)) fs.writeFileSync(f, crypto.randomBytes(32).toString('hex'), { mode: 0o600 });
    KEY = Buffer.from(fs.readFileSync(f, 'utf8').trim(), 'hex');
  }
  return KEY;
}

function encrypt(plain) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([c.update(String(plain), 'utf8'), c.final()]);
  return { v: 1, iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64'), data: enc.toString('base64') };
}

function decrypt(box) {
  const d = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(box.iv, 'base64'));
  d.setAuthTag(Buffer.from(box.tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(box.data, 'base64')), d.final()]).toString('utf8');
}

function setSecret(id, value, label) {
  store.update((db) => { db.secrets[id] = { ...encrypt(value), label: label || id, updatedAt: new Date().toISOString(), hint: mask(value) }; });
}
function getSecret(id) {
  const box = store.db().secrets[id];
  if (!box) return null;
  try { return decrypt(box); } catch { return null; }
}
function hasSecret(id) { return !!store.db().secrets[id]; }
function deleteSecret(id) { store.update((db) => { delete db.secrets[id]; }); }
function mask(v) {
  const s = String(v);
  if (s.length <= 8) return '••••';
  return s.slice(0, 3) + '••••' + s.slice(-3);
}
function secretInfo(id) {
  const b = store.db().secrets[id];
  return b ? { set: true, hint: b.hint, updatedAt: b.updatedAt } : { set: false };
}

module.exports = { setSecret, getSecret, hasSecret, deleteSecret, secretInfo, encrypt, decrypt, mask };
