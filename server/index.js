'use strict';
// RETRO BOT LAB — server HTTP (nessuna dipendenza esterna).
const http = require('node:http');
const config = require('./config');
const store = require('./store');
const auth = require('./auth');
const secrets = require('./secrets');
const { Router, parseBody, parseCookies, send, serveStatic } = require('./http');
const { generateProject, TEMPLATES, FEATURES, LANGUAGES } = require('./generator');
const { normalizeSpec } = require('./generator/spec');
const { defaultSpec } = require('./generator/catalog');
const { createZip, readZip } = require('./zip');
const { diffLines, diffProjects } = require('./diff');
const analyzer = require('./analyzer');
const sandbox = require('./sandbox');
const mock = require('./mockapi');
const ai = require('./ai');
const telegram = require('./telegram');
const updater = require('./knowledge/updater');
const { search, searchLocal, PROVIDERS } = require('./knowledge/search');
const { SOURCES, LIBRARIES } = require('./knowledge/sources');
const lessons = require('./lessons');
const guide = require('./guide');
const { redact } = require('./redact');

const r = new Router();
const now = () => new Date().toISOString();
const MAX_VERSIONS = 60;

// ======================================================================= AUTH
r.get('/api/auth/status', (req) => ({ configured: auth.isConfigured(), authenticated: auth.validSession(parseCookies(req).rbl_session) }), { public: true });

r.post('/api/auth/setup', (req, res, { body }) => {
  auth.setup(body.password);
  store.logActivity('security', 'Password di accesso impostata');
  return login(req, res, body.password);
}, { public: true });

r.post('/api/auth/login', (req, res, { body }) => login(req, res, body.password), { public: true });

function login(req, res, password) {
  const ip = req.socket.remoteAddress;
  auth.checkRate(ip);
  if (!auth.verify(password)) {
    auth.failAttempt(ip);
    store.logActivity('security', `Tentativo di accesso fallito da ${ip}`);
    throw store.httpError(401, 'Password errata');
  }
  auth.attempts.delete(ip);
  const s = auth.createSession();
  const secure = req.headers['x-forwarded-proto'] === 'https' || !!req.socket.encrypted;
  res.setHeader('Set-Cookie', auth.cookieHeader(s.id, s.expires, secure));
  store.logActivity('security', 'Accesso effettuato');
  return { ok: true };
}

r.post('/api/auth/logout', (req, res) => {
  auth.destroySession(parseCookies(req).rbl_session);
  res.setHeader('Set-Cookie', 'rbl_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
  return { ok: true };
}, { public: true });

r.post('/api/auth/password', (req, res, { body }) => {
  auth.changePassword(body.oldPassword, body.newPassword);
  store.logActivity('security', 'Password modificata (tutte le sessioni sono state chiuse)');
  return login(req, res, body.newPassword);
});

// ======================================================================= DASHBOARD
r.get('/api/dashboard', () => {
  const d = store.db();
  const active = d.projects.filter((p) => !p.archived);
  return {
    counts: { projects: active.length, archived: d.projects.length - active.length, tested: active.filter((p) => p.testStatus === 'superati').length },
    recent: [...active].sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))).slice(0, 6),
    activity: d.activity.slice(0, 15),
    knowledge: { lastCheck: d.knowledge.lastCheck, botApi: d.knowledge.items['bot-api'] || null, running: updater.isRunning(), news: d.knowledge.log.filter((l) => ['nuovo', 'avviso', 'modifica'].includes(l.level)).slice(0, 5) },
    ai: { configured: d.settings.providers.filter((p) => p.enabled !== false).length },
    sandbox: sandbox.capabilities(),
    simulator: { sessions: mock.byId.size },
  };
});

r.get('/api/search', (req, res, { query }) => {
  const q = String(query.get('q') || '').toLowerCase();
  const projects = store.db().projects.filter((p) => `${p.name} ${p.description} ${p.language}`.toLowerCase().includes(q)).slice(0, 10)
    .map((p) => ({ title: `Progetto: ${p.name}`, url: `#/project/${p.id}`, snippet: p.description, source: 'Progetti' }));
  return { results: [...projects, ...searchLocal(q).slice(0, 20)] };
});

// ======================================================================= SETTINGS & AI
r.get('/api/settings', () => {
  const s = store.db().settings;
  return { uiMode: s.uiMode, explainLevel: s.explainLevel, routing: s.routing, fallback: s.fallback, autoUpdate: s.autoUpdate, providers: ai.publicProviders(),
    presets: ai.PRESETS, github: { tokenSet: !!config.GITHUB_TOKEN }, appSecretFromEnv: !!config.APP_SECRET, updateHours: config.KNOWLEDGE_UPDATE_HOURS };
});

r.put('/api/settings', (req, res, { body }) => {
  store.update((d) => {
    const s = d.settings;
    if (['simple', 'advanced'].includes(body.uiMode)) s.uiMode = body.uiMode;
    if (['simple', 'technical'].includes(body.explainLevel)) s.explainLevel = body.explainLevel;
    if (body.routing && typeof body.routing === 'object') for (const k of ['chat', 'code', 'search', 'debug']) if (typeof body.routing[k] === 'string') s.routing[k] = body.routing[k];
    if (typeof body.fallback === 'boolean') s.fallback = body.fallback;
    if (typeof body.autoUpdate === 'boolean') s.autoUpdate = body.autoUpdate;
  });
  return { ok: true };
});

r.post('/api/ai/providers', (req, res, { body }) => {
  const kind = body.kind === 'anthropic' ? 'anthropic' : 'openai';
  const p = { id: store.newId(), name: String(body.name || 'Fornitore').slice(0, 60), kind, baseUrl: String(body.baseUrl || '').trim().slice(0, 300), model: String(body.model || '').trim().slice(0, 100), enabled: true };
  if (p.baseUrl && !/^https?:\/\//.test(p.baseUrl)) throw store.httpError(400, 'Indirizzo base non valido');
  store.update((d) => { d.settings.providers.push(p); for (const k of ['chat', 'code', 'search', 'debug']) if (!d.settings.routing[k]) d.settings.routing[k] = p.id; });
  if (body.key) secrets.setSecret('provider:' + p.id, String(body.key).trim(), `Chiave ${p.name}`);
  store.logActivity('security', `Fornitore AI aggiunto: ${p.name}`);
  return { ok: true, id: p.id };
});

r.put('/api/ai/providers/:id', (req, res, { body, params }) => {
  store.update((d) => {
    const p = d.settings.providers.find((x) => x.id === params.id);
    if (!p) throw store.httpError(404, 'Fornitore non trovato');
    for (const k of ['name', 'baseUrl', 'model']) if (typeof body[k] === 'string') p[k] = body[k].trim().slice(0, 300);
    if (typeof body.enabled === 'boolean') p.enabled = body.enabled;
  });
  if (body.key) secrets.setSecret('provider:' + params.id, String(body.key).trim());
  if (body.removeKey) secrets.deleteSecret('provider:' + params.id);
  return { ok: true };
});

r.del('/api/ai/providers/:id', (req, res, { params }) => {
  store.update((d) => {
    d.settings.providers = d.settings.providers.filter((x) => x.id !== params.id);
    for (const k of Object.keys(d.settings.routing)) if (d.settings.routing[k] === params.id) d.settings.routing[k] = d.settings.providers[0]?.id || '';
  });
  secrets.deleteSecret('provider:' + params.id);
  return { ok: true };
});

r.post('/api/ai/providers/:id/test', async (req, res, { params }) => {
  try { return await ai.testProvider(params.id); } catch (e) { return { ok: false, error: e.message }; }
});

r.post('/api/ai/chat', async (req, res, { body }) => {
  const task = ['chat', 'code', 'debug', 'search'].includes(body.task) ? body.task : 'chat';
  const messages = Array.isArray(body.messages) ? body.messages.filter((m) => m && typeof m.content === 'string').slice(-24) : [];
  if (!messages.length) throw store.httpError(400, 'Messaggio vuoto');
  const project = body.projectId ? store.readProject(body.projectId) : null;
  const out = await ai.run(task, messages, { withWeb: !!body.withWeb, project, includeFiles: Array.isArray(body.includeFiles) ? body.includeFiles : [] });
  out.files = ai.extractFiles(out.text);
  out.fileChecks = [];
  for (const [name, content] of Object.entries(out.files)) {
    const c = await sandbox.syntaxCheck(name, content);
    if (c) out.fileChecks.push(c);
  }
  store.logActivity('ai', `${task === 'code' ? 'Documento tecnico' : task === 'debug' ? 'Analisi AI' : 'Assistente'}: risposta da ${out.provider}`, body.projectId);
  return out;
});

r.post('/api/ai/spec', async (req, res, { body }) => {
  const text = String(body.description || '').trim();
  if (!text) throw store.httpError(400, 'Descrizione mancante');
  const out = await ai.run('spec', [{ role: 'user', content: text.slice(0, 20000) }], { maxTokens: 8000 });
  const raw = ai.extractJson(out.text);
  const { spec, warnings } = normalizeSpec({ ...raw, template: 'custom' });
  return { spec, warnings, provider: out.provider, model: out.model, redactions: out.redactions };
});

// ======================================================================= GENERATOR
r.get('/api/generator/catalog', () => ({ templates: TEMPLATES, features: FEATURES, languages: LANGUAGES, defaults: Object.fromEntries(TEMPLATES.map((t) => [t.id, defaultSpec(t.id)])), versions: updater.knownVersions() }));

r.post('/api/generator/preview', (req, res, { body }) => {
  const g = generateProject(body.spec || {}, updater.knownVersions());
  return { files: g.files, warnings: g.warnings, spec: g.spec, entry: g.entry, notes: updater.knownVersions().notes };
});

// ======================================================================= PROJECTS
function newProject({ name, description, language, library, files, spec, template, features }) {
  const p = {
    id: store.newId(), name: String(name || 'Nuovo progetto').slice(0, 80), description: String(description || '').slice(0, 1000),
    language: language || 'python', library: library || '', version: '1.0.0', status: 'bozza', archived: false, template: template || null,
    spec: spec || null, features: features || [], files: files || {}, versions: [], history: [], notes: '', testStatus: 'non eseguiti', testLog: [],
    createdAt: now(), updatedAt: now(),
  };
  return p;
}

function snapshot(p, label) {
  p.versions.unshift({ id: store.newId(), label: String(label || 'Versione').slice(0, 120), at: now(), files: structuredClone(p.files), version: p.version });
  if (p.versions.length > MAX_VERSIONS) p.versions.length = MAX_VERSIONS;
}
function hist(p, text) { p.history.unshift({ at: now(), text }); p.history = p.history.slice(0, 300); }

function projectOut(p) {
  const { versions, ...rest } = p;
  const v = updater.knownVersions();
  return { ...rest, versions: versions.map(({ files, ...m }) => ({ ...m, fileCount: Object.keys(files).length })), botToken: secrets.secretInfo('bot:' + p.id), knownVersions: v };
}

r.get('/api/projects', () => ({ projects: store.db().projects }));

r.post('/api/projects', (req, res, { body }) => {
  let p;
  if (body.spec) {
    const g = generateProject(body.spec, updater.knownVersions());
    p = newProject({ name: g.spec.name, description: g.spec.description, language: g.spec.language, library: g.library, files: g.files, spec: g.spec, template: g.spec.template, features: g.spec.features });
    hist(p, `Progetto generato dal modello "${g.spec.template}" (${g.spec.language}, ${g.library})`);
    snapshot(p, 'Generazione iniziale');
  } else {
    const files = body.files && typeof body.files === 'object' ? Object.fromEntries(Object.entries(body.files).filter(([k, v]) => typeof v === 'string' && safePath(k))) : {};
    p = newProject({ name: body.name, description: body.description, language: body.language, library: body.library, files });
    hist(p, body.source === 'ai' ? 'Progetto creato dai file proposti dall\'assistente AI' : 'Progetto creato');
    if (Object.keys(files).length) snapshot(p, 'Creazione');
  }
  store.writeProject(p);
  store.logActivity('project', `Creato il progetto "${p.name}"`, p.id);
  return { id: p.id };
});

function safePath(name) {
  return typeof name === 'string' && name.length > 0 && name.length < 200 && !name.startsWith('/') && !name.split('/').includes('..') && !/[\0\\]/.test(name);
}

r.post('/api/projects/import', (req, res, { files: up, body }) => {
  const zip = up.find((f) => /\.zip$/i.test(f.filename));
  if (!zip) throw store.httpError(400, 'Carica un file .zip');
  const entries = readZip(zip.data);
  const files = {};
  const prefix = commonPrefix(entries.map((e) => e.name));
  for (const e of entries) {
    const name = e.name.slice(prefix.length);
    if (!safePath(name) || /(^|\/)(node_modules|\.git|\.venv|__pycache__|dist)\//.test(name) || e.data.length > 1024 * 1024) continue;
    if (isBinary(e.data)) continue;
    files[name] = e.data.toString('utf8');
  }
  const language = files['requirements.txt'] || Object.keys(files).some((n) => n.endsWith('.py')) ? 'python' : Object.keys(files).some((n) => n.endsWith('.ts')) ? 'typescript' : 'javascript';
  const p = newProject({ name: body.name || zip.filename.replace(/\.zip$/i, ''), description: 'Progetto importato da ZIP', language, files });
  hist(p, `Importato da ${zip.filename} (${Object.keys(files).length} file di testo)`);
  snapshot(p, 'Importazione');
  store.writeProject(p);
  store.logActivity('project', `Importato il progetto "${p.name}"`, p.id);
  return { id: p.id, files: Object.keys(files).length };
});

function commonPrefix(names) {
  if (!names.length) return '';
  const first = names[0].split('/');
  if (first.length < 2) return '';
  const dir = first[0] + '/';
  return names.every((n) => n.startsWith(dir)) ? dir : '';
}
function isBinary(buf) { return buf.subarray(0, 8000).includes(0); }

r.get('/api/projects/:id', (req, res, { params }) => projectOut(store.readProject(params.id)));

r.put('/api/projects/:id', (req, res, { params, body }) => {
  const p = store.readProject(params.id);
  for (const k of ['name', 'description', 'notes', 'library', 'language']) if (typeof body[k] === 'string') p[k] = body[k].slice(0, k === 'notes' ? 20000 : 1000);
  if (typeof body.version === 'string' && /^\d+\.\d+\.\d+$/.test(body.version)) p.version = body.version;
  if (['bozza', 'in sviluppo', 'testato', 'pubblicato', 'manutenzione'].includes(body.status)) p.status = body.status;
  if (typeof body.archived === 'boolean') { p.archived = body.archived; hist(p, body.archived ? 'Progetto archiviato' : 'Progetto ripristinato dall\'archivio'); }
  if (['non eseguiti', 'superati', 'falliti', 'parziali'].includes(body.testStatus)) {
    p.testStatus = body.testStatus;
    p.testLog.unshift({ at: now(), status: body.testStatus, note: String(body.testNote || '').slice(0, 2000) });
    p.testLog = p.testLog.slice(0, 100);
  }
  store.writeProject(p);
  return projectOut(p);
});

r.put('/api/projects/:id/files', (req, res, { params, body }) => {
  const p = store.readProject(params.id);
  if (!safePath(body.path)) throw store.httpError(400, 'Percorso file non valido');
  if (typeof body.content !== 'string') throw store.httpError(400, 'Contenuto mancante');
  if (body.content.length > 2 * 1024 * 1024) throw store.httpError(413, 'File troppo grande (max 2 MB)');
  const isNew = p.files[body.path] === undefined;
  p.files[body.path] = body.content;
  if (isNew) hist(p, `Creato il file ${body.path}`);
  store.writeProject(p);
  return { ok: true, savedAt: p.updatedAt };
});

r.post('/api/projects/:id/files/rename', (req, res, { params, body }) => {
  const p = store.readProject(params.id);
  if (p.files[body.from] === undefined || !safePath(body.to)) throw store.httpError(400, 'Rinomina non valida');
  if (p.files[body.to] !== undefined) throw store.httpError(409, 'Esiste già un file con questo nome');
  p.files[body.to] = p.files[body.from];
  delete p.files[body.from];
  hist(p, `Rinominato ${body.from} → ${body.to}`);
  store.writeProject(p);
  return { ok: true };
});

r.del('/api/projects/:id/files', (req, res, { params, query }) => {
  const p = store.readProject(params.id);
  const path = query.get('path');
  if (p.files[path] === undefined) throw store.httpError(404, 'File non trovato');
  snapshot(p, `Prima dell'eliminazione di ${path}`);
  delete p.files[path];
  hist(p, `Eliminato il file ${path} (copia nella cronologia versioni)`);
  store.writeProject(p);
  return { ok: true };
});

r.post('/api/projects/:id/apply', (req, res, { params, body }) => {
  const p = store.readProject(params.id);
  const files = body.files && typeof body.files === 'object' ? body.files : {};
  const valid = Object.entries(files).filter(([k, v]) => safePath(k) && typeof v === 'string');
  if (!valid.length) throw store.httpError(400, 'Nessun file da applicare');
  snapshot(p, `Prima di: ${String(body.label || 'modifica').slice(0, 80)}`);
  for (const [k, v] of valid) p.files[k] = v;
  hist(p, `${body.label || 'Modifica applicata'}: ${valid.map(([k]) => k).join(', ')}`);
  store.writeProject(p);
  store.logActivity('project', `Modifiche applicate a "${p.name}" (${valid.length} file)`, p.id);
  return { ok: true, files: valid.map(([k]) => k) };
});

r.post('/api/projects/:id/regenerate', (req, res, { params, body }) => {
  const p = store.readProject(params.id);
  const g = generateProject({ ...(p.spec || {}), ...(body.spec || {}) }, updater.knownVersions());
  snapshot(p, 'Prima della rigenerazione');
  Object.assign(p.files, g.files); // i file aggiunti dall'utente restano invariati
  p.spec = g.spec;
  p.features = g.spec.features;
  p.language = g.spec.language;
  p.library = g.library;
  p.name = g.spec.name;
  p.description = g.spec.description;
  hist(p, 'Progetto rigenerato dal generatore con la nuova configurazione');
  store.writeProject(p);
  return { ok: true, warnings: g.warnings };
});

r.post('/api/projects/:id/duplicate', (req, res, { params, body }) => {
  const src = store.readProject(params.id);
  const p = newProject({ ...src, name: String(body.name || `${src.name} (copia)`), files: structuredClone(src.files), spec: structuredClone(src.spec) });
  p.notes = src.notes;
  hist(p, `Duplicato da "${src.name}"`);
  snapshot(p, 'Copia iniziale');
  store.writeProject(p);
  store.logActivity('project', `Duplicato "${src.name}" in "${p.name}"`, p.id);
  return { id: p.id };
});

r.del('/api/projects/:id', (req, res, { params }) => {
  const p = store.readProject(params.id);
  store.deleteProject(params.id);
  secrets.deleteSecret('bot:' + params.id);
  sandbox.stop(params.id);
  store.logActivity('project', `Eliminato il progetto "${p.name}"`);
  return { ok: true };
});

r.post('/api/projects/:id/versions', (req, res, { params, body }) => {
  const p = store.readProject(params.id);
  if (body.bump && /^(major|minor|patch)$/.test(body.bump)) {
    const [a, b, c] = p.version.split('.').map(Number);
    p.version = body.bump === 'major' ? `${a + 1}.0.0` : body.bump === 'minor' ? `${a}.${b + 1}.0` : `${a}.${b}.${c + 1}`;
  }
  snapshot(p, body.label || `Versione ${p.version}`);
  hist(p, `Salvata la versione "${body.label || p.version}"`);
  store.writeProject(p);
  return { ok: true, version: p.version };
});

r.post('/api/projects/:id/versions/:vid/restore', (req, res, { params }) => {
  const p = store.readProject(params.id);
  const v = p.versions.find((x) => x.id === params.vid);
  if (!v) throw store.httpError(404, 'Versione non trovata');
  snapshot(p, 'Prima del ripristino');
  p.files = structuredClone(v.files);
  hist(p, `Ripristinata la versione "${v.label}" del ${v.at.slice(0, 16).replace('T', ' ')}`);
  store.writeProject(p);
  return { ok: true };
});

r.get('/api/projects/:id/diff', (req, res, { params, query }) => {
  const p = store.readProject(params.id);
  const pick = (id) => (id === 'current' || !id ? p.files : p.versions.find((x) => x.id === id)?.files);
  const a = pick(query.get('a')), b = pick(query.get('b') || 'current');
  if (!a || !b) throw store.httpError(404, 'Versione non trovata');
  return { files: diffProjects(a, b) };
});

r.get('/api/projects/:id/export.zip', (req, res, { params }) => {
  const p = store.readProject(params.id);
  const folder = slug(p.name);
  const entries = Object.entries(p.files).map(([name, data]) => ({ name: `${folder}/${name}`, data }));
  if (p.notes) entries.push({ name: `${folder}/NOTE.md`, data: `# Note di progetto\n\n${p.notes}\n` });
  const zip = createZip(entries);
  store.logActivity('export', `Esportato lo ZIP di "${p.name}"`, p.id);
  return send(res, 200, zip, { 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="${folder}-${p.version}.zip"`, 'Content-Length': zip.length });
});

r.get('/api/projects/:id/file', (req, res, { params, query }) => {
  const p = store.readProject(params.id);
  const name = query.get('path');
  if (p.files[name] === undefined) throw store.httpError(404, 'File non trovato');
  return send(res, 200, p.files[name], { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Disposition': `attachment; filename="${name.split('/').pop().replace(/"/g, '')}"` });
});

function slug(n) { return String(n).toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'progetto'; }

// ---------- configurazione bot reale (token cifrato) ----------
function botToken(id) {
  const t = secrets.getSecret('bot:' + id);
  if (!t) throw store.httpError(412, 'Token non impostato. Inseriscilo nella sezione "Configura bot".');
  return t;
}

r.put('/api/projects/:id/bot/token', (req, res, { params, body }) => {
  store.readProject(params.id);
  const token = String(body.token || '').trim();
  if (!/^\d+:[A-Za-z0-9_-]{30,}$/.test(token)) throw store.httpError(400, 'Formato del token non valido (atteso 123456789:AA...)');
  secrets.setSecret('bot:' + params.id, token, 'Token bot');
  store.logActivity('security', 'Token del bot salvato in forma cifrata', params.id);
  return secrets.secretInfo('bot:' + params.id);
});
r.del('/api/projects/:id/bot/token', (req, res, { params }) => { secrets.deleteSecret('bot:' + params.id); store.logActivity('security', 'Token del bot rimosso', params.id); return { ok: true }; });
r.post('/api/projects/:id/bot/verify', async (req, res, { params }) => {
  const me = await telegram.api(botToken(params.id), 'getMe');
  return { ok: true, bot: me };
});
r.post('/api/projects/:id/bot/commands', async (req, res, { params }) => {
  const p = store.readProject(params.id);
  let cfg;
  try { cfg = JSON.parse(p.files['config.json'] || '{}'); } catch { throw store.httpError(400, 'config.json non valido'); }
  const commands = (cfg.bot_commands || []).map((c) => ({ command: c.command, description: String(c.description).slice(0, 256) }));
  if (!commands.length) throw store.httpError(400, 'Nessun comando in config.json (bot_commands)');
  await telegram.api(botToken(params.id), 'setMyCommands', { commands });
  hist(p, `Comandi registrati su Telegram: ${commands.map((c) => '/' + c.command).join(' ')}`);
  store.writeProject(p);
  return { ok: true, commands };
});
r.post('/api/projects/:id/bot/description', async (req, res, { params, body }) => {
  const token = botToken(params.id);
  const out = {};
  if (typeof body.description === 'string') { await telegram.api(token, 'setMyDescription', { description: body.description.slice(0, 512) }); out.description = true; }
  if (typeof body.shortDescription === 'string') { await telegram.api(token, 'setMyShortDescription', { short_description: body.shortDescription.slice(0, 120) }); out.shortDescription = true; }
  return { ok: true, ...out };
});
r.get('/api/projects/:id/bot/webhook', async (req, res, { params }) => ({ ok: true, info: await telegram.api(botToken(params.id), 'getWebhookInfo') }));
r.post('/api/projects/:id/bot/webhook/delete', async (req, res, { params }) => ({ ok: true, result: await telegram.api(botToken(params.id), 'deleteWebhook', { drop_pending_updates: false }) }));

// ======================================================================= ANALYZER
r.post('/api/analyze', async (req, res, { body }) => {
  let files = body.files && typeof body.files === 'object' ? body.files : {};
  if (body.projectId) files = { ...store.readProject(body.projectId).files, ...files };
  const out = await analyzer.analyze({ files, logs: String(body.logs || '').slice(0, 500000), description: String(body.description || '').slice(0, 20000) });
  store.logActivity('debug', `Analisi eseguita: ${out.findings.length} segnalazioni`, body.projectId);
  return out;
});

r.post('/api/analyze/upload', (req, res, { files: up }) => {
  const out = {};
  for (const f of up) {
    if (/\.zip$/i.test(f.filename)) {
      const entries = readZip(f.data);
      const prefix = commonPrefix(entries.map((e) => e.name));
      for (const e of entries) {
        const name = e.name.slice(prefix.length);
        if (!safePath(name) || /(^|\/)(node_modules|\.git|\.venv|__pycache__|dist)\//.test(name) || e.data.length > 1024 * 1024 || isBinary(e.data)) continue;
        out[name] = e.data.toString('utf8');
      }
    } else if (!isBinary(f.data) && f.data.length <= 2 * 1024 * 1024) {
      out[f.filename.split(/[\\/]/).pop()] = f.data.toString('utf8');
    }
  }
  return { files: out };
});

// ======================================================================= SIMULATORE & SANDBOX
function sim(id) {
  const s = mock.byId.get(id);
  if (!s) throw store.httpError(404, 'Sessione di simulazione non trovata (le sessioni non sopravvivono al riavvio del server)');
  return s;
}
function apiBase(req) {
  if (config.PUBLIC_URL) return config.PUBLIC_URL.replace(/\/+$/, '') + '/mock';
  const host = config.HOST === '0.0.0.0' || config.HOST === '::' ? '127.0.0.1' : config.HOST;
  return `http://${host}:${config.PORT}/mock`;
}
r.get('/api/sim/sessions', (req) => ({ sessions: [...mock.byId.values()].map(mock.publicSession), apiBase: apiBase(req) }));
r.post('/api/sim/sessions', (req, res, { body }) => ({ session: mock.publicSession(mock.createSession(body || {})), apiBase: apiBase(req) }));
r.del('/api/sim/sessions/:id', (req, res, { params }) => ({ ok: mock.deleteSession(params.id) }));
r.get('/api/sim/:id', (req, res, { params }) => ({ session: mock.publicSession(sim(params.id)), apiBase: apiBase(req) }));
r.put('/api/sim/:id/user', (req, res, { params, body }) => { mock.setUser(sim(params.id), body); return { session: mock.publicSession(sim(params.id)) }; });
r.post('/api/sim/:id/send', (req, res, { params, body }) => ({ message: mock.userSendText(sim(params.id), body) }));
r.post('/api/sim/:id/button', (req, res, { params, body }) => ({ callback: mock.userPressButton(sim(params.id), body) }));
r.post('/api/sim/:id/join', (req, res, { params, body }) => ({ message: mock.userJoinGroup(sim(params.id), body) }));
r.post('/api/sim/:id/upload', (req, res, { params, files, body }) => {
  const f = files[0];
  if (!f) throw store.httpError(400, 'Nessun file');
  if (f.data.length > 20 * 1024 * 1024) throw store.httpError(413, 'Il simulatore accetta file fino a 20 MB');
  return { message: mock.userSendFile(sim(params.id), { filename: f.filename, data: f.data, mime: f.contentType, chatType: body.chatType, asPhoto: body.asPhoto === 'true', caption: body.caption }) };
});
r.get('/api/sim/:id/events', (req, res, { params, query }) => {
  const s = sim(params.id);
  return { events: mock.events(s, Number(query.get('since') || 0)), session: mock.publicSession(s) };
});
r.get('/api/sim/:id/file/:fid', (req, res, { params }) => {
  const f = mock.getFile(sim(params.id), params.fid);
  if (!f) throw store.httpError(404, 'File non trovato');
  return send(res, 200, f.data, { 'Content-Type': 'application/octet-stream', 'Content-Disposition': `attachment; filename="${f.name.replace(/"/g, '')}"` });
});

r.get('/api/sandbox/capabilities', () => sandbox.capabilities());
r.post('/api/sandbox/:pid/start', async (req, res, { params, body }) => {
  const p = store.readProject(params.pid);
  const s = sim(body.sessionId);
  const extraEnv = {};
  if (body.env && typeof body.env === 'object') for (const [k, v] of Object.entries(body.env)) if (typeof v === 'string' && v.length < 2000) extraEnv[k] = v;
  sandbox.start(p, { token: s.token, apiBase: apiBase(req), adminId: body.admin === false ? '' : s.user.id, extraEnv }).catch(() => {});
  store.logActivity('test', `Avviato "${p.name}" nel sandbox collegato al simulatore`, p.id);
  return { ok: true };
});
r.post('/api/sandbox/:pid/stop', (req, res, { params }) => ({ ok: sandbox.stop(params.pid) }));
r.get('/api/sandbox/:pid/status', (req, res, { params, query }) => sandbox.status(params.pid, Number(query.get('since') || 0)));

r.post('/api/syntax', async (req, res, { body }) => {
  const files = body.files && typeof body.files === 'object' ? body.files : {};
  const results = [];
  for (const [name, content] of Object.entries(files)) {
    const c = await sandbox.syntaxCheck(name, String(content));
    if (c) results.push(c);
  }
  return { results };
});

// ======================================================================= KNOWLEDGE
r.get('/api/knowledge', () => {
  const k = store.db().knowledge;
  return {
    lastCheck: k.lastCheck, running: updater.isRunning(), log: k.log.slice(0, 200), botApi: k.items['bot-api'] || null,
    sources: SOURCES.map((s) => ({ ...s, check: k.items['src:' + s.id] || null })),
    libraries: LIBRARIES.map((l) => ({ ...l, check: k.items['lib:' + l.id] || null })),
    providers: PROVIDERS, versions: updater.knownVersions(), githubToken: !!config.GITHUB_TOKEN,
  };
});
r.post('/api/knowledge/update', (req, res, { body }) => {
  const scope = ['all', 'botapi', 'libraries', 'sources'].includes(body.scope) ? body.scope : 'all';
  updater.runUpdate(scope, 'su richiesta dell\'utente').catch(() => {});
  return { ok: true, running: true };
});
r.get('/api/knowledge/search', async (req, res, { query }) => {
  const providers = String(query.get('providers') || 'local,github,stackoverflow').split(',').filter(Boolean);
  return search(query.get('q') || '', { providers, language: query.get('language') || '' });
});

// ======================================================================= LEARN & GUIDE
r.get('/api/lessons', () => ({ levels: lessons.LEVELS, lessons: lessons.LESSONS, progress: store.db().lessonProgress }));
r.put('/api/lessons/progress', (req, res, { body }) => { store.update((d) => { if (body.done) d.lessonProgress[body.id] = now(); else delete d.lessonProgress[body.id]; }); return { ok: true }; });
r.get('/api/guide', () => ({ steps: guide.STEPS, progress: store.db().guideProgress }));
r.put('/api/guide/progress', (req, res, { body }) => { store.update((d) => { if (body.done) d.guideProgress[body.id] = now(); else delete d.guideProgress[body.id]; }); return { ok: true }; });

// ======================================================================= ACTIVITY & BACKUP
r.get('/api/activity', () => ({ activity: store.db().activity }));

r.get('/api/backup.zip', (req, res) => {
  const fs = require('node:fs');
  const path = require('node:path');
  const entries = [{ name: 'db.json', data: fs.readFileSync(store.DB_FILE) }];
  for (const f of fs.readdirSync(store.PROJ_DIR)) if (f.endsWith('.json')) entries.push({ name: `projects/${f}`, data: fs.readFileSync(path.join(store.PROJ_DIR, f)) });
  entries.push({ name: 'LEGGIMI.txt', data: 'Backup RETRO BOT LAB.\nLe credenziali sono cifrate con la chiave master (APP_SECRET o data/.master.key): senza la stessa chiave non sono recuperabili dopo il ripristino.\n' });
  store.logActivity('backup', 'Backup scaricato');
  const zip = createZip(entries);
  return send(res, 200, zip, { 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="retro-bot-lab-backup-${now().slice(0, 10)}.zip"` });
});

r.post('/api/backup/restore', (req, res, { files: up }) => {
  const fs = require('node:fs');
  const path = require('node:path');
  const zip = up.find((f) => /\.zip$/i.test(f.filename));
  if (!zip) throw store.httpError(400, 'Carica il file .zip del backup');
  const entries = readZip(zip.data);
  const dbEntry = entries.find((e) => e.name === 'db.json');
  if (!dbEntry) throw store.httpError(400, 'Il backup non contiene db.json');
  const parsed = JSON.parse(dbEntry.data.toString('utf8'));
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.projects)) throw store.httpError(400, 'db.json non valido');
  // copia di sicurezza dello stato attuale
  const safety = path.join(require('./config').DATA_DIR, `pre-restore-${Date.now()}`);
  fs.mkdirSync(path.join(safety, 'projects'), { recursive: true });
  fs.copyFileSync(store.DB_FILE, path.join(safety, 'db.json'));
  for (const f of fs.readdirSync(store.PROJ_DIR)) fs.copyFileSync(path.join(store.PROJ_DIR, f), path.join(safety, 'projects', f));
  for (const e of entries) {
    const m = e.name.match(/^projects\/([a-z0-9-]+\.json)$/i);
    if (m) store.atomicWrite(path.join(store.PROJ_DIR, m[1]), e.data);
  }
  const keepAuth = store.db().auth;
  store.atomicWrite(store.DB_FILE, JSON.stringify({ ...parsed, auth: keepAuth, sessions: store.db().sessions }, null, 2));
  store._reset();
  store.logActivity('backup', `Backup ripristinato (copia precedente in ${path.basename(safety)})`);
  return { ok: true, projects: store.db().projects.length };
});

// ======================================================================= SERVER
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const pathname = url.pathname;
  try {
    if (pathname.startsWith('/mock/')) { if (await mock.route(req, res, pathname)) return; }
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
    if (!pathname.startsWith('/api/')) return serveStatic(req, res, config.PUBLIC_DIR, pathname);
    const m = r.match(req.method, pathname);
    if (!m) return send(res, 404, { error: 'Endpoint non trovato' });
    if (req.method !== 'GET' && req.headers['x-rbl'] !== '1') return send(res, 403, { error: 'Richiesta non consentita (protezione CSRF)' });
    if (!m.route.opts.public && !auth.validSession(parseCookies(req).rbl_session)) return send(res, 401, { error: 'Accesso richiesto' });
    const parsed = req.method === 'GET' ? { body: {}, files: [] } : await parseBody(req);
    const out = await m.route.handler(req, res, { params: m.params, body: parsed.body || {}, files: parsed.files || [], query: url.searchParams });
    if (!res.headersSent && out !== undefined) send(res, 200, out);
  } catch (e) {
    const status = e.status && e.status >= 400 && e.status < 600 ? e.status : 500;
    if (status === 500) console.error('[errore]', redact(String(e.stack || e)).text);
    if (!res.headersSent) send(res, status, { error: status === 500 ? 'Errore interno: ' + redact(e.message).text : e.message, details: e.details });
  }
});
server.requestTimeout = 0; // le richieste AI e il long polling del simulatore possono durare a lungo
server.headersTimeout = 60000;

if (require.main === module) {
  server.listen(config.PORT, config.HOST, () => {
    console.log(`\n  ▓▓ RETRO BOT LAB ▓▓  http://${config.HOST}:${config.PORT}\n`);
    if (!config.APP_SECRET) console.log('  Nota: APP_SECRET non impostato, la chiave di cifratura è in data/.master.key');
    if (config.HOST === '0.0.0.0') console.log('  Attenzione: server esposto su tutte le interfacce. Usa HTTPS tramite reverse proxy.');
    updater.schedule(config.KNOWLEDGE_UPDATE_HOURS);
    const k = store.db().knowledge;
    const stale = !k.lastCheck || Date.now() - new Date(k.lastCheck).getTime() > config.KNOWLEDGE_UPDATE_HOURS * 3600_000;
    if (config.KNOWLEDGE_UPDATE_HOURS > 0 && store.db().settings.autoUpdate && stale) {
      setTimeout(() => updater.runUpdate('all', 'avvio').catch(() => {}), 3000).unref();
    }
  });
}

module.exports = { server, router: r };
