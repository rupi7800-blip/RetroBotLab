'use strict';
// Archivio dati su file JSON con scrittura atomica.
// - data/db.json            : impostazioni, utenti, indice progetti, attività, conoscenza
// - data/projects/<id>.json : file e versioni di ogni progetto
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DATA_DIR } = require('./config');

const DB_FILE = path.join(DATA_DIR, 'db.json');
const PROJ_DIR = path.join(DATA_DIR, 'projects');
fs.mkdirSync(PROJ_DIR, { recursive: true });

const DEFAULT_DB = {
  schema: 1,
  auth: null, // { salt, hash }
  sessions: {},
  settings: {
    uiMode: 'simple',
    explainLevel: 'simple',
    providers: [], // { id, name, kind, baseUrl, model, keyRef, enabled }
    routing: { chat: '', code: '', search: '', debug: '' },
    fallback: true,
    autoUpdate: true,
  },
  secrets: {}, // id -> cifrato (vedi secrets.js)
  projects: [], // indice: metadati
  activity: [],
  knowledge: { lastCheck: null, items: {}, log: [], pageHashes: {} },
  guideProgress: {},
  lessonProgress: {},
};

let cache = null;

function atomicWrite(file, data) {
  const tmp = file + '.' + crypto.randomBytes(4).toString('hex') + '.tmp';
  fs.writeFileSync(tmp, data, { mode: 0o600 });
  fs.renameSync(tmp, file);
}

function load() {
  if (cache) return cache;
  if (fs.existsSync(DB_FILE)) {
    const parsed = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    cache = deepMerge(structuredClone(DEFAULT_DB), parsed);
  } else {
    cache = structuredClone(DEFAULT_DB);
    save();
  }
  return cache;
}

function deepMerge(base, over) {
  for (const [k, v] of Object.entries(over || {})) {
    if (v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) {
      base[k] = deepMerge(base[k], v);
    } else base[k] = v;
  }
  return base;
}

let saveTimer = null;
function save() {
  if (!cache) return;
  atomicWrite(DB_FILE, JSON.stringify(cache, null, 2));
}
function saveSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 50);
}

function db() { return load(); }

function update(fn) {
  const d = load();
  const r = fn(d);
  save();
  return r;
}

function logActivity(type, text, projectId) {
  update((d) => {
    d.activity.unshift({ at: new Date().toISOString(), type, text, projectId: projectId || null });
    d.activity = d.activity.slice(0, 200);
  });
}

// ---------- Progetti ----------
function projectFile(id) {
  if (!/^[a-z0-9-]+$/i.test(id)) throw httpError(400, 'ID progetto non valido');
  return path.join(PROJ_DIR, id + '.json');
}

function readProject(id) {
  const f = projectFile(id);
  if (!fs.existsSync(f)) throw httpError(404, 'Progetto non trovato');
  return JSON.parse(fs.readFileSync(f, 'utf8'));
}

function writeProject(p) {
  p.updatedAt = new Date().toISOString();
  atomicWrite(projectFile(p.id), JSON.stringify(p, null, 2));
  update((d) => {
    const meta = projectMeta(p);
    const i = d.projects.findIndex((x) => x.id === p.id);
    if (i >= 0) d.projects[i] = meta; else d.projects.unshift(meta);
  });
  return p;
}

function deleteProject(id) {
  const f = projectFile(id);
  if (fs.existsSync(f)) fs.unlinkSync(f);
  update((d) => { d.projects = d.projects.filter((x) => x.id !== id); });
}

function projectMeta(p) {
  return {
    id: p.id, name: p.name, description: p.description, language: p.language, library: p.library,
    version: p.version, status: p.status, archived: !!p.archived, template: p.template || null,
    createdAt: p.createdAt, updatedAt: p.updatedAt, fileCount: Object.keys(p.files || {}).length,
    testStatus: p.testStatus || 'non eseguiti', features: p.features || [],
  };
}

function newId() {
  return crypto.randomBytes(6).toString('hex');
}

function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

module.exports = {
  db, update, save, saveSoon, logActivity, readProject, writeProject, deleteProject, projectMeta,
  newId, httpError, DB_FILE, PROJ_DIR, atomicWrite, _reset: () => { cache = null; },
};
