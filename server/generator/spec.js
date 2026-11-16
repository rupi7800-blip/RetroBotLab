'use strict';
// Normalizzazione e validazione della specifica del bot + costruzione di config.json.
const { FEATURES, defaultSpec } = require('./catalog');

const RESERVED = new Set(['start', 'help', 'stop', 'id', 'menu', 'stats', 'broadcast', 'iscriviti', 'disiscriviti', 'prenota',
  'prenotazioni', 'annulla', 'aggiungi', 'attivita', 'fatto', 'elimina', 'file', 'ban', 'modulo', 'esporta', 'reset', 'catalogo',
  'carrello', 'api']);

const str = (v, max = 4000, def = '') => (typeof v === 'string' ? v : def).slice(0, max);
const isTime = (t) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t);

function normalizeSpec(input = {}) {
  const base = defaultSpec(input.template || 'custom', input.language || 'python');
  const s = { ...base, ...input };
  const warnings = [];
  s.name = str(s.name, 80, 'Il mio bot').trim() || 'Il mio bot';
  s.description = str(s.description, 500);
  s.language = ['python', 'javascript', 'typescript'].includes(s.language) ? s.language : 'python';
  s.mode = s.mode === 'webhook' ? 'webhook' : 'polling';
  s.features = [...new Set((Array.isArray(s.features) ? s.features : []).filter((f) => FEATURES[f]))];
  s.welcome = str(s.welcome, 3000, base.welcome) || base.welcome;
  s.fallback = str(s.fallback, 3000);

  const seen = new Set();
  s.commands = (Array.isArray(s.commands) ? s.commands : []).map((c) => ({
    command: str(c.command, 32).toLowerCase().replace(/^\//, '').replace(/[^a-z0-9_]/g, ''),
    description: str(c.description, 200).trim() || 'Comando',
    reply: str(c.reply, 4000).trim(),
  })).filter((c) => {
    if (!c.command || !c.reply) return false;
    if (RESERVED.has(c.command)) { warnings.push(`Il comando /${c.command} è riservato e viene ignorato.`); return false; }
    if (seen.has(c.command)) return false;
    seen.add(c.command);
    return true;
  });
  s.autoreplies = (Array.isArray(s.autoreplies) ? s.autoreplies : []).map((r) => ({
    keywords: (Array.isArray(r.keywords) ? r.keywords : String(r.keywords || '').split(','))
      .map((k) => String(k).trim().toLowerCase()).filter(Boolean).slice(0, 30),
    reply: str(r.reply, 4000).trim(),
  })).filter((r) => r.keywords.length && r.reply);
  s.menu = (Array.isArray(s.menu) ? s.menu : []).map((m) => ({ label: str(m.label, 60).trim(), reply: str(m.reply, 4000).trim() }))
    .filter((m) => m.label && m.reply).slice(0, 20);
  s.notify = { time: isTime(s.notify?.time) ? s.notify.time : '09:00', text: str(s.notify?.text, 3000, base.notify.text) || base.notify.text };
  s.booking = {
    minDaysAhead: Math.max(0, Math.min(365, parseInt(s.booking?.minDaysAhead ?? 0, 10) || 0)),
    openFrom: isTime(s.booking?.openFrom) ? s.booking.openFrom : '09:00',
    openTo: isTime(s.booking?.openTo) ? s.booking.openTo : '18:00',
  };
  if (s.booking.openFrom > s.booking.openTo) { warnings.push('Orario prenotazioni invertito: corretto automaticamente.'); [s.booking.openFrom, s.booking.openTo] = [s.booking.openTo, s.booking.openFrom]; }
  s.group = {
    welcome: str(s.group?.welcome, 2000, base.group.welcome) || base.group.welcome,
    bannedWords: (Array.isArray(s.group?.bannedWords) ? s.group.bannedWords : String(s.group?.bannedWords || '').split(','))
      .map((w) => String(w).trim().toLowerCase()).filter(Boolean).slice(0, 200),
  };
  s.form = {
    title: str(s.form?.title, 200, base.form.title) || base.form.title,
    questions: (Array.isArray(s.form?.questions) ? s.form.questions : []).map((q) => str(q, 500).trim()).filter(Boolean).slice(0, 30),
  };
  if (s.features.includes('form') && !s.form.questions.length) s.form.questions = base.form.questions;
  s.ai = {
    systemPrompt: str(s.ai?.systemPrompt, 4000, base.ai.systemPrompt) || base.ai.systemPrompt,
    model: str(s.ai?.model, 100, base.ai.model).trim() || base.ai.model,
    historyLength: Math.max(0, Math.min(30, parseInt(s.ai?.historyLength ?? 6, 10) || 0)),
  };
  s.shop = {
    currency: str(s.shop?.currency, 8, 'EUR').trim() || 'EUR',
    products: (Array.isArray(s.shop?.products) ? s.shop.products : []).map((p) => ({ name: str(p.name, 80).trim(), price: Math.round(Math.max(0, Number(p.price) || 0) * 100) / 100 }))
      .filter((p) => p.name).slice(0, 60),
  };
  if (s.features.includes('shop') && !s.shop.products.length) s.shop.products = base.shop.products;
  s.api = { description: str(s.api?.description, 200, base.api.description) };
  if (s.features.includes('menu') && !s.menu.length) { s.menu = base.menu; }
  return { spec: s, warnings };
}

const has = (s, f) => s.features.includes(f);

/** Comandi pubblici e da amministratore, nell'ordine in cui compaiono in /help e setMyCommands. */
function commandList(s) {
  const pub = [
    { command: 'start', description: 'Avvia il bot' },
    { command: 'help', description: 'Elenco dei comandi' },
  ];
  const adm = [];
  if (has(s, 'menu')) pub.push({ command: 'menu', description: 'Mostra il menu' });
  if (has(s, 'commands')) for (const c of s.commands) pub.push({ command: c.command, description: c.description });
  if (has(s, 'notify')) pub.push({ command: 'iscriviti', description: 'Ricevi le notifiche' }, { command: 'disiscriviti', description: 'Smetti di ricevere notifiche' });
  if (has(s, 'booking')) pub.push({ command: 'prenota', description: 'Nuova prenotazione' }, { command: 'prenotazioni', description: 'Le tue prenotazioni' }, { command: 'annulla', description: 'Annulla una prenotazione: /annulla <numero>' });
  if (has(s, 'tasks')) pub.push({ command: 'aggiungi', description: 'Aggiungi attività: /aggiungi <testo>' }, { command: 'attivita', description: 'Elenco attività' }, { command: 'fatto', description: 'Segna completata: /fatto <numero>' }, { command: 'elimina', description: 'Elimina attività: /elimina <numero>' });
  if (has(s, 'files')) pub.push({ command: 'file', description: 'I tuoi file salvati' });
  if (has(s, 'form')) pub.push({ command: 'modulo', description: s.form.title.slice(0, 200) });
  if (has(s, 'ai')) pub.push({ command: 'reset', description: 'Azzera la conversazione con l\'AI' });
  if (has(s, 'shop')) pub.push({ command: 'catalogo', description: 'Catalogo prodotti' }, { command: 'carrello', description: 'Il tuo carrello' });
  if (has(s, 'api')) pub.push({ command: 'api', description: s.api.description.slice(0, 200) || 'Interroga il servizio esterno' });
  if (has(s, 'booking') || has(s, 'form')) pub.push({ command: 'stop', description: 'Interrompi la procedura in corso' });
  pub.push({ command: 'id', description: 'Mostra il tuo ID Telegram' });
  if (has(s, 'admin')) adm.push({ command: 'stats', description: 'Statistiche' }, { command: 'broadcast', description: 'Messaggio a tutti: /broadcast <testo>' });
  if (has(s, 'group')) adm.push({ command: 'ban', description: 'Rispondi a un messaggio con /ban per bannare l\'autore' });
  if (has(s, 'form')) adm.push({ command: 'esporta', description: 'Esporta le risposte in CSV' });
  return { pub, adm };
}

function buildConfigJson(s) {
  const { pub, adm } = commandList(s);
  const cfg = {
    name: s.name,
    welcome: s.welcome,
    fallback: s.fallback,
    bot_commands: pub,
    admin_commands: adm,
  };
  if (has(s, 'commands')) cfg.commands = s.commands;
  if (has(s, 'autoreply')) cfg.autoreplies = s.autoreplies;
  if (has(s, 'menu')) cfg.menu = s.menu;
  if (has(s, 'notify')) cfg.notify = s.notify;
  if (has(s, 'booking')) cfg.booking = { min_days_ahead: s.booking.minDaysAhead, open_from: s.booking.openFrom, open_to: s.booking.openTo };
  if (has(s, 'group')) cfg.group = { welcome: s.group.welcome, banned_words: s.group.bannedWords };
  if (has(s, 'form')) cfg.form = s.form;
  if (has(s, 'ai')) cfg.ai = { system_prompt: s.ai.systemPrompt, model: s.ai.model, history_length: s.ai.historyLength };
  if (has(s, 'shop')) cfg.shop = s.shop;
  return JSON.stringify(cfg, null, 2) + '\n';
}

module.exports = { normalizeSpec, buildConfigJson, commandList, has, RESERVED };
