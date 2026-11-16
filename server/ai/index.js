'use strict';
// Motore AI: instradamento per compito, fallback tra fornitori, rimozione delle credenziali, contesto tecnico verificato.
const store = require('../store');
const secrets = require('../secrets');
const { redact } = require('../redact');
const { PRESETS, call } = require('./providers');
const PROMPTS = require('./prompts');
const { searchLocal, search } = require('../knowledge/search');
const { knownVersions } = require('../knowledge/updater');
const { LIBRARIES } = require('../knowledge/sources');

const TASK_PROMPT = { chat: PROMPTS.ASSISTANT, code: PROMPTS.COMMANDS, debug: PROMPTS.DEBUG, search: PROMPTS.ASSISTANT, spec: PROMPTS.SPEC };

function providers() { return store.db().settings.providers || []; }

function publicProviders() {
  return providers().map((p) => ({ ...p, key: secrets.secretInfo('provider:' + p.id) }));
}

/** Ordine di tentativo: fornitore assegnato al compito, poi (se abilitato il fallback) gli altri attivi. */
function candidates(task) {
  const st = store.db().settings;
  const enabled = providers().filter((p) => p.enabled !== false);
  const routeTask = task === 'spec' ? 'code' : task;
  const preferred = enabled.find((p) => p.id === st.routing?.[routeTask]) || enabled[0];
  if (!preferred) return [];
  return st.fallback ? [preferred, ...enabled.filter((p) => p !== preferred)] : [preferred];
}

function contextBlock(query, extra = {}) {
  const k = store.db().knowledge;
  const v = knownVersions();
  const items = k.items || {};
  const lines = ['CONTESTO TECNICO FORNITO DALL\'APPLICAZIONE (dati con data di verifica):'];
  const api = items['bot-api'];
  lines.push(api?.version
    ? `- Telegram Bot API: ultima versione rilevata ${api.version}${api.published ? ` (pubblicata il ${api.published})` : ''}, verificata il ${String(api.verifiedAt || '').slice(0, 10)} da https://core.telegram.org/bots/api-changelog`
    : '- Telegram Bot API: versione non ancora verificata dall\'aggiornamento automatico (indicala come [DA VERIFICARE]).');
  for (const l of LIBRARIES) {
    const it = items['lib:' + l.id];
    if (it?.version) lines.push(`- ${l.name} (${l.lang}): ${it.version}, licenza ${it.license || l.license}, stato ${it.maintenance || 'n/d'}, verificato il ${String(it.verifiedAt || it.lastAttempt || '').slice(0, 10)}`);
  }
  lines.push(`- Codice generato dal Generatore collaudato con: aiogram ${v.tested.aiogram}, grammY ${v.tested.grammy}.`);
  const local = searchLocal(query).filter((r) => r.source === 'Errori noti' || r.source === 'Catalogo fonti').slice(0, 6);
  if (local.length) {
    lines.push('Risorse pertinenti dall\'indice locale:');
    for (const r of local) lines.push(`- ${r.title}: ${r.snippet} (${r.url})`);
  }
  if (extra.web?.length) {
    lines.push('Risultati recuperati online (titolo — fonte — link — ultimo aggiornamento — licenza). Citali se li usi; non sono stati testati:');
    for (const r of extra.web.slice(0, 12)) lines.push(`- ${r.title} — ${r.source} — ${r.url} — ${String(r.updated || 'n/d').slice(0, 10)} — ${r.license || 'n/d'}${r.maintenance ? ' — ' + r.maintenance : ''}`);
  }
  if (extra.project) {
    lines.push(`Progetto attivo: "${extra.project.name}" (${extra.project.language}, ${extra.project.library}). File: ${Object.keys(extra.project.files || {}).join(', ')}`);
  }
  return lines.join('\n');
}

/**
 * Esegue una richiesta AI.
 * @param {string} task chat | code | debug | search | spec
 * @param {{role:string, content:string}[]} messages
 */
async function run(task, messages, { withWeb = false, project = null, includeFiles = [], maxTokens } = {}) {
  const list = candidates(task);
  if (!list.length) {
    const e = new Error('Nessun fornitore AI configurato. Vai in Impostazioni → Intelligenza artificiale e aggiungi un fornitore (es. Anthropic, OpenAI o Ollama locale).');
    e.status = 412;
    throw e;
  }
  const lastUser = [...messages].reverse().find((m) => m.role === 'user')?.content || '';
  let web = [];
  const webErrors = [];
  if (withWeb) {
    const r = await search(lastUser.slice(0, 160), { providers: ['github', 'stackoverflow'] });
    web = r.results;
    webErrors.push(...r.errors);
  }
  const redactions = new Set();
  const clean = messages.slice(-24).map((m) => {
    const r = redact(String(m.content || ''));
    r.found.forEach((x) => redactions.add(x));
    return { role: m.role === 'assistant' ? 'assistant' : 'user', content: r.text.slice(0, 120000) };
  });
  if (project && includeFiles.length) {
    const blocks = includeFiles.filter((f) => project.files[f] !== undefined).map((f) => {
      const r = redact(project.files[f]);
      r.found.forEach((x) => redactions.add(x));
      return `### File: ${f}\n\`\`\`\n${r.text.slice(0, 60000)}\n\`\`\``;
    });
    if (blocks.length && clean.length) clean[clean.length - 1].content += `\n\nFile del progetto inclusi come riferimento:\n${blocks.join('\n\n')}`;
  }
  // l'API richiede che il primo messaggio sia dell'utente
  while (clean.length && clean[0].role !== 'user') clean.shift();
  const system = `${TASK_PROMPT[task] || PROMPTS.ASSISTANT}\n\n${task === 'spec' ? '' : contextBlock(lastUser, { web, project })}`;
  const errors = [];
  for (const p of list) {
    const key = secrets.getSecret('provider:' + p.id);
    const preset = PRESETS.find((x) => x.baseUrl === p.baseUrl);
    if (!key && (p.kind === 'anthropic' || preset?.needsKey !== false) && !/localhost|127\.0\.0\.1/.test(p.baseUrl || '')) {
      errors.push({ provider: p.name, error: 'chiave API non impostata' });
      continue;
    }
    try {
      const out = await call(p, key, { system, messages: clean, maxTokens });
      return {
        text: out.text, provider: p.name, providerId: p.id, model: out.model, usage: out.usage, truncated: out.truncated,
        redactions: [...redactions], fallbackUsed: p !== list[0], errors, web: web.slice(0, 12), webErrors,
      };
    } catch (e) {
      errors.push({ provider: p.name, error: e.message });
    }
  }
  const e = new Error('Nessun fornitore AI ha risposto: ' + errors.map((x) => `${x.provider}: ${x.error}`).join(' | '));
  e.status = 502;
  e.details = errors;
  throw e;
}

async function testProvider(id) {
  const p = providers().find((x) => x.id === id);
  if (!p) throw Object.assign(new Error('Fornitore non trovato'), { status: 404 });
  const key = secrets.getSecret('provider:' + p.id);
  const t0 = Date.now();
  const out = await call(p, key, { system: 'Rispondi esattamente con: OK', messages: [{ role: 'user', content: 'Test di connessione' }], maxTokens: 50, timeoutMs: 60000 });
  return { ok: true, model: out.model, reply: out.text.slice(0, 100), ms: Date.now() - t0 };
}

/** Estrae i file dai blocchi "### File: percorso" + codice delimitato. */
function extractFiles(markdown) {
  const files = {};
  const re = /#{2,4}\s*File:\s*`?([^\n`]+?)`?\s*\n+```[^\n]*\n([\s\S]*?)\n```/g;
  let m;
  while ((m = re.exec(markdown))) {
    const name = m[1].trim().replace(/^\.?\//, '');
    if (!name || name.includes('..') || name.startsWith('/')) continue;
    files[name] = m[2] + '\n';
  }
  return files;
}

function extractJson(text) {
  const t = String(text).trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start < 0 || end < start) throw Object.assign(new Error('La risposta AI non contiene una specifica JSON valida'), { status: 502 });
  return JSON.parse(t.slice(start, end + 1));
}

module.exports = { run, testProvider, publicProviders, extractFiles, extractJson, PRESETS };
