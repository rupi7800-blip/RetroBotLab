'use strict';
// Simulatore della Telegram Bot API.
// Il bot dell'utente si collega a http://HOST:PORT/mock invece che ad api.telegram.org
// (aiogram: TelegramAPIServer.from_base, grammY: client.apiRoot). Nessun dato viene inviato a Telegram.
const crypto = require('node:crypto');
const { parseBody, send } = require('./http');

const sessions = new Map(); // token -> session
const byId = new Map(); // id -> session
const MAX_EVENTS = 2000;

function randomToken(botId) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let s = 'SIM';
  const b = crypto.randomBytes(32);
  for (const x of b) s += alphabet[x % alphabet.length];
  return `${botId}:${s}`;
}

function createSession({ botName = 'Bot di prova', botUsername = 'retro_test_bot', userId = 100001, userName = 'Mario', webhookDelivery = true } = {}) {
  const botId = 7000000000 + Math.floor(Math.random() * 99999999);
  const token = randomToken(botId);
  const id = crypto.randomBytes(6).toString('hex');
  const s = {
    id, token, createdAt: Date.now(), lastSeen: null,
    bot: { id: botId, is_bot: true, first_name: String(botName).slice(0, 64), username: String(botUsername).replace(/[^A-Za-z0-9_]/g, '').slice(0, 32) || 'retro_test_bot', can_join_groups: true, can_read_all_group_messages: false, supports_inline_queries: false },
    user: { id: Number(userId) || 100001, is_bot: false, first_name: String(userName).slice(0, 64) || 'Mario', username: 'utente_simulato', language_code: 'it' },
    group: { id: -1001234567890, type: 'supergroup', title: 'Gruppo di prova' },
    updates: [], nextUpdateId: 1, nextMessageId: 1, waiters: [],
    events: [], seq: 0, files: new Map(), nextFile: 1, messages: new Map(),
    commands: [], webhook: { url: '', secret: '', allowed_updates: [], lastError: null }, webhookDelivery,
    stats: { apiCalls: 0, errors: 0 },
  };
  sessions.set(token, s);
  byId.set(id, s);
  addEvent(s, { kind: 'system', text: 'Sessione creata. Configura il bot con TELEGRAM_API_BASE e il token di prova.' });
  return s;
}

function deleteSession(id) {
  const s = byId.get(id);
  if (!s) return false;
  for (const w of s.waiters) w.resolve([]);
  sessions.delete(s.token);
  byId.delete(id);
  return true;
}

function publicSession(s) {
  return {
    id: s.id, token: s.token, bot: s.bot, user: s.user, group: s.group, createdAt: s.createdAt, lastSeen: s.lastSeen,
    pending: s.updates.length, commands: s.commands, webhook: { url: s.webhook.url, lastError: s.webhook.lastError }, stats: s.stats,
    connected: !!s.lastSeen && Date.now() - s.lastSeen < 65000,
  };
}

function addEvent(s, ev) {
  ev.seq = ++s.seq;
  ev.at = new Date().toISOString();
  s.events.push(ev);
  if (s.events.length > MAX_EVENTS) s.events.splice(0, s.events.length - MAX_EVENTS);
  return ev;
}

function chatFor(s, type) {
  if (type === 'group') return { ...s.group };
  return { id: s.user.id, type: 'private', first_name: s.user.first_name, username: s.user.username };
}

function commandEntities(text) {
  const m = /^\/[A-Za-z0-9_]+(@[A-Za-z0-9_]+)?/.exec(text);
  return m ? [{ type: 'bot_command', offset: 0, length: m[0].length }] : undefined;
}

function pushUpdate(s, update) {
  update.update_id = s.nextUpdateId++;
  s.updates.push(update);
  if (s.webhook.url && s.webhookDelivery) deliverWebhook(s, update);
  const waiters = s.waiters.splice(0);
  for (const w of waiters) w.flush();
  return update;
}

async function deliverWebhook(s, update) {
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (s.webhook.secret) headers['X-Telegram-Bot-Api-Secret-Token'] = s.webhook.secret;
    const r = await fetch(s.webhook.url, { method: 'POST', headers, body: JSON.stringify(update), signal: AbortSignal.timeout(10000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    s.updates = s.updates.filter((u) => u !== update);
    s.webhook.lastError = null;
  } catch (e) {
    s.webhook.lastError = String(e.message || e);
    addEvent(s, { kind: 'error', text: `Consegna webhook fallita: ${s.webhook.lastError}` });
  }
}

// ---------- azioni dall'interfaccia (utente simulato) ----------
function userSendText(s, { text, chatType = 'private', replyTo } = {}) {
  const t = String(text || '').slice(0, 4096);
  if (!t) throw Object.assign(new Error('Testo vuoto'), { status: 400 });
  const msg = {
    message_id: s.nextMessageId++, from: { ...s.user }, chat: chatFor(s, chatType), date: Math.floor(Date.now() / 1000), text: t,
  };
  const ents = commandEntities(t);
  if (ents) msg.entities = ents;
  if (replyTo && s.messages.get(Number(replyTo))) msg.reply_to_message = s.messages.get(Number(replyTo));
  s.messages.set(msg.message_id, msg);
  addEvent(s, { kind: 'in', chatType, message: msg });
  pushUpdate(s, { message: msg });
  return msg;
}

function userSendFile(s, { filename, data, mime, chatType = 'private', asPhoto = false, caption }) {
  const f = storeFile(s, data, filename, mime);
  const msg = { message_id: s.nextMessageId++, from: { ...s.user }, chat: chatFor(s, chatType), date: Math.floor(Date.now() / 1000) };
  if (asPhoto) msg.photo = [{ file_id: f.file_id, file_unique_id: f.file_unique_id, width: 800, height: 600, file_size: f.size }];
  else msg.document = { file_id: f.file_id, file_unique_id: f.file_unique_id, file_name: filename, mime_type: mime || 'application/octet-stream', file_size: f.size };
  if (caption) msg.caption = String(caption).slice(0, 1024);
  s.messages.set(msg.message_id, msg);
  addEvent(s, { kind: 'in', chatType, message: msg, fileName: filename });
  pushUpdate(s, { message: msg });
  return msg;
}

function userJoinGroup(s, { name = 'Nuovo utente' } = {}) {
  const member = { id: 200000 + Math.floor(Math.random() * 99999), is_bot: false, first_name: String(name).slice(0, 64) };
  const msg = { message_id: s.nextMessageId++, from: member, chat: chatFor(s, 'group'), date: Math.floor(Date.now() / 1000), new_chat_members: [member] };
  addEvent(s, { kind: 'in', chatType: 'group', message: msg, system: `${member.first_name} è entrato nel gruppo` });
  pushUpdate(s, { message: msg });
  return msg;
}

function userPressButton(s, { messageId, data }) {
  const m = s.messages.get(Number(messageId));
  if (!m) throw Object.assign(new Error('Messaggio non trovato'), { status: 404 });
  const cq = { id: crypto.randomBytes(8).toString('hex'), from: { ...s.user }, message: m, chat_instance: String(s.id), data: String(data).slice(0, 64) };
  addEvent(s, { kind: 'in', chatType: m.chat.type === 'private' ? 'private' : 'group', callback: { data: cq.data, messageId: m.message_id } });
  pushUpdate(s, { callback_query: cq });
  return cq;
}

function setUser(s, { userId, userName }) {
  if (userId) s.user.id = Number(userId);
  if (userName) s.user.first_name = String(userName).slice(0, 64);
}

function storeFile(s, data, filename, mime) {
  const n = s.nextFile++;
  const ext = (String(filename || '').match(/\.[A-Za-z0-9]{1,8}$/) || [''])[0];
  const f = {
    file_id: `SIMFILE${n}_${crypto.randomBytes(6).toString('hex')}`, file_unique_id: `U${n}${crypto.randomBytes(3).toString('hex')}`,
    data: Buffer.from(data || ''), name: filename || `file_${n}${ext}`, mime: mime || 'application/octet-stream',
    file_path: `documents/file_${n}${ext}`,
  };
  f.size = f.data.length;
  s.files.set(f.file_id, f);
  return f;
}

// ---------- endpoint Bot API ----------
const ok = (result) => ({ ok: true, result });
const err = (code, description, parameters) => ({ ok: false, error_code: code, description, ...(parameters ? { parameters } : {}) });

const JSON_FIELDS = ['reply_markup', 'commands', 'allowed_updates', 'entities', 'reply_parameters', 'link_preview_options', 'caption_entities', 'scope', 'media', 'permissions'];

function normalizeParams(p) {
  const out = { ...p };
  for (const k of JSON_FIELDS) {
    if (typeof out[k] === 'string') { try { out[k] = JSON.parse(out[k]); } catch { /* lasciato com'è */ } }
  }
  return out;
}

function knownChat(s, chatId) {
  const id = Number(chatId);
  if (id === s.user.id) return chatFor(s, 'private');
  if (id === s.group.id) return chatFor(s, 'group');
  if (typeof chatId === 'string' && chatId.startsWith('@')) return null;
  return null;
}

function botMessage(s, chat, extra) {
  const msg = { message_id: s.nextMessageId++, from: { ...s.bot }, chat, date: Math.floor(Date.now() / 1000), ...extra };
  s.messages.set(msg.message_id, msg);
  return msg;
}

async function handleApi(s, method, p, files) {
  const m = method.toLowerCase();
  switch (m) {
    case 'getme': return ok(s.bot);
    case 'logout': case 'close': return ok(true);
    case 'getupdates': {
      if (s.webhook.url) return err(409, "Conflict: can't use getUpdates method while webhook is active; use deleteWebhook to delete the webhook first");
      const offset = Number(p.offset || 0);
      const limit = Math.min(100, Math.max(1, Number(p.limit || 100)));
      const timeout = Math.min(50, Math.max(0, Number(p.timeout || 0)));
      if (offset) s.updates = s.updates.filter((u) => u.update_id >= offset);
      const take = () => s.updates.slice(0, limit);
      if (s.updates.length || !timeout) return ok(take());
      return new Promise((resolve) => {
        const w = {
          flush: () => { clearTimeout(w.timer); resolve(ok(take())); },
          resolve: (r) => { clearTimeout(w.timer); resolve(ok(r)); },
        };
        w.timer = setTimeout(() => { s.waiters = s.waiters.filter((x) => x !== w); resolve(ok([])); }, timeout * 1000);
        s.waiters.push(w);
      });
    }
    case 'setwebhook': {
      const url = String(p.url || '');
      if (url && !/^https?:\/\//.test(url)) return err(400, 'Bad Request: bad webhook: An HTTPS URL must be provided for webhook');
      if (p.secret_token && !/^[A-Za-z0-9_-]{1,256}$/.test(p.secret_token)) return err(400, 'Bad Request: secret token contains unallowed characters');
      s.webhook = { url, secret: p.secret_token || '', allowed_updates: p.allowed_updates || [], lastError: null };
      addEvent(s, { kind: 'system', text: url ? `Webhook impostato: ${url}${url.startsWith('http://') ? ' (HTTP accettato solo dal simulatore; Telegram richiede HTTPS)' : ''}` : 'Webhook rimosso' });
      return ok(true);
    }
    case 'deletewebhook':
      if (s.webhook.url) addEvent(s, { kind: 'system', text: 'Webhook eliminato (passaggio al polling)' });
      s.webhook = { url: '', secret: '', allowed_updates: [], lastError: null };
      if (String(p.drop_pending_updates) === 'true') s.updates = [];
      return ok(true);
    case 'getwebhookinfo':
      return ok({ url: s.webhook.url, has_custom_certificate: false, pending_update_count: s.updates.length, ...(s.webhook.lastError ? { last_error_message: s.webhook.lastError, last_error_date: Math.floor(Date.now() / 1000) } : {}) });
    case 'setmycommands': {
      const cmds = Array.isArray(p.commands) ? p.commands : [];
      for (const c of cmds) {
        if (!/^[a-z0-9_]{1,32}$/.test(c.command || '')) return err(400, 'Bad Request: BOT_COMMAND_INVALID');
        if (!c.description || c.description.length > 256) return err(400, 'Bad Request: command description is empty or too long');
      }
      s.commands = cmds;
      addEvent(s, { kind: 'system', text: `Comandi registrati: ${cmds.map((c) => '/' + c.command).join(' ')}` });
      return ok(true);
    }
    case 'getmycommands': return ok(s.commands);
    case 'deletemycommands': s.commands = []; return ok(true);
    case 'setmydescription': case 'setmyshortdescription': case 'setmyname': case 'setchatmenubutton': case 'setmydefaultadministratorrights':
      return ok(true);
    case 'sendchataction':
      if (!knownChat(s, p.chat_id)) return err(400, 'Bad Request: chat not found');
      addEvent(s, { kind: 'action', chatType: knownChat(s, p.chat_id).type === 'private' ? 'private' : 'group', action: p.action });
      return ok(true);
    case 'sendmessage': {
      const chat = knownChat(s, p.chat_id);
      if (!chat) return err(400, 'Bad Request: chat not found');
      const text = String(p.text ?? '');
      if (!text.trim()) return err(400, 'Bad Request: message text is empty');
      if (text.length > 4096) return err(400, 'Bad Request: message is too long');
      if (p.parse_mode && /html/i.test(p.parse_mode)) {
        const bad = checkHtml(text);
        if (bad) return err(400, `Bad Request: can't parse entities: ${bad}`);
      }
      const markup = p.reply_markup;
      const msg = botMessage(s, chat, { text, ...(markup && markup.inline_keyboard ? { reply_markup: markup } : {}) });
      addEvent(s, { kind: 'out', chatType: chat.type === 'private' ? 'private' : 'group', message: msg, parseMode: p.parse_mode || null, keyboard: markup || null });
      return ok(msg);
    }
    case 'editmessagetext': case 'editmessagereplymarkup': {
      const msg = s.messages.get(Number(p.message_id));
      if (!msg) return err(400, 'Bad Request: message to edit not found');
      if (m === 'editmessagetext') {
        if (msg.text === p.text && JSON.stringify(msg.reply_markup || null) === JSON.stringify(p.reply_markup || null)) return err(400, 'Bad Request: message is not modified: specified new message content and reply markup are exactly the same as a current content and reply markup of the message');
        msg.text = String(p.text ?? '');
      }
      if (p.reply_markup) msg.reply_markup = p.reply_markup; else if (m === 'editmessagereplymarkup') delete msg.reply_markup;
      addEvent(s, { kind: 'edit', message: { ...msg } });
      return ok(msg);
    }
    case 'answercallbackquery':
      if (p.text) addEvent(s, { kind: 'toast', text: String(p.text), alert: String(p.show_alert) === 'true' });
      return ok(true);
    case 'deletemessage': {
      const msg = s.messages.get(Number(p.message_id));
      if (!msg) return err(400, 'Bad Request: message to delete not found');
      s.messages.delete(Number(p.message_id));
      addEvent(s, { kind: 'delete', messageId: Number(p.message_id) });
      return ok(true);
    }
    case 'banchatmember': case 'unbanchatmember': case 'restrictchatmember':
      if (Number(p.chat_id) !== s.group.id) return err(400, 'Bad Request: chat not found');
      addEvent(s, { kind: 'system', text: `${method}: utente ${p.user_id}` });
      return ok(true);
    case 'getchat': {
      const chat = knownChat(s, p.chat_id);
      return chat ? ok(chat) : err(400, 'Bad Request: chat not found');
    }
    case 'getchatmember':
      return ok({ status: Number(p.user_id) === s.bot.id ? 'administrator' : 'member', user: Number(p.user_id) === s.user.id ? s.user : { id: Number(p.user_id), is_bot: false, first_name: 'Utente' } });
    case 'getfile': {
      const f = s.files.get(String(p.file_id));
      if (!f) return err(400, 'Bad Request: invalid file_id');
      return ok({ file_id: f.file_id, file_unique_id: f.file_unique_id, file_size: f.size, file_path: f.file_path });
    }
    case 'senddocument': case 'sendphoto': case 'sendaudio': case 'sendvideo': case 'sendvoice': {
      const chat = knownChat(s, p.chat_id);
      if (!chat) return err(400, 'Bad Request: chat not found');
      const field = m.replace('send', '');
      const up = files.find((f) => f.field === field) || files.find((f) => `attach://${f.field}` === p[field]);
      let f;
      if (up) f = storeFile(s, up.data, up.filename, up.contentType);
      else if (typeof p[field] === 'string' && s.files.get(p[field])) f = s.files.get(p[field]);
      else if (typeof p[field] === 'string' && /^https?:\/\//.test(p[field])) f = storeFile(s, Buffer.from(`URL: ${p[field]}`), p[field].split('/').pop() || 'remoto', 'text/plain');
      else return err(400, `Bad Request: there is no ${field} in the request`);
      const extra = field === 'photo'
        ? { photo: [{ file_id: f.file_id, file_unique_id: f.file_unique_id, width: 800, height: 600, file_size: f.size }] }
        : { [field === 'document' ? 'document' : field]: { file_id: f.file_id, file_unique_id: f.file_unique_id, file_name: f.name, mime_type: f.mime, file_size: f.size } };
      if (p.caption) extra.caption = String(p.caption);
      const msg = botMessage(s, chat, extra);
      addEvent(s, { kind: 'out', chatType: chat.type === 'private' ? 'private' : 'group', message: msg, file: { id: f.file_id, name: f.name, size: f.size, path: f.file_path } });
      return ok(msg);
    }
    default:
      return err(404, 'Not Found: method not found in the simulator (metodo non simulato)');
  }
}

function checkHtml(text) {
  const allowed = new Set(['b', 'strong', 'i', 'em', 'u', 'ins', 's', 'strike', 'del', 'a', 'code', 'pre', 'span', 'tg-spoiler', 'blockquote', 'tg-emoji']);
  const stack = [];
  const re = /<\/?([a-zA-Z-]+)[^>]*>|<|&(?!(amp|lt|gt|quot|#\d+|#x[0-9a-f]+);)/gi;
  let m;
  while ((m = re.exec(text))) {
    if (!m[1]) return m[0] === '<' ? `Unsupported start tag at byte offset ${m.index}` : null;
    const tag = m[1].toLowerCase();
    if (!allowed.has(tag)) return `Unsupported start tag "${tag}" at byte offset ${m.index}`;
    if (m[0].startsWith('</')) { if (stack.pop() !== tag) return `Unexpected end tag at byte offset ${m.index}`; } else stack.push(tag);
  }
  return stack.length ? `Can't find end tag corresponding to start tag "${stack[stack.length - 1]}"` : null;
}

/** Gestisce /mock/bot<token>/<method> e /mock/file/bot<token>/<path>. Restituisce true se ha gestito la richiesta. */
async function route(req, res, pathname) {
  let m = pathname.match(/^\/mock\/file\/bot([^/]+)\/(.+)$/);
  if (m) {
    const s = sessions.get(decodeURIComponent(m[1]));
    if (!s) { send(res, 401, err(401, 'Unauthorized')); return true; }
    const f = [...s.files.values()].find((x) => x.file_path === decodeURIComponent(m[2]));
    if (!f) { send(res, 404, err(404, 'Not Found')); return true; }
    send(res, 200, f.data, { 'Content-Type': f.mime, 'Content-Length': f.data.length });
    return true;
  }
  m = pathname.match(/^\/mock\/bot([^/]+)\/([A-Za-z]+)$/);
  if (!m) return false;
  const s = sessions.get(decodeURIComponent(m[1]));
  if (!s) { send(res, 401, err(401, 'Unauthorized')); return true; }
  s.lastSeen = Date.now();
  s.stats.apiCalls++;
  let params = {};
  let files = [];
  try {
    const parsed = await parseBody(req);
    params = parsed.body || {};
    files = parsed.files || [];
  } catch (e) {
    send(res, 400, err(400, 'Bad Request: ' + e.message));
    return true;
  }
  const url = new URL(req.url, 'http://x');
  for (const [k, v] of url.searchParams) if (params[k] === undefined) params[k] = v;
  params = normalizeParams(params);
  const method = m[2];
  const result = await handleApi(s, method, params, files);
  if (method.toLowerCase() !== 'getupdates' || (result.result && result.result.length)) {
    addEvent(s, { kind: 'api', method, ok: result.ok, error: result.ok ? null : result.description, params: summarizeParams(params, files) });
  }
  if (!result.ok) s.stats.errors++;
  send(res, result.ok ? 200 : result.error_code, result);
  return true;
}

function summarizeParams(p, files) {
  const out = {};
  for (const [k, v] of Object.entries(p)) {
    if (typeof v === 'string' && v.length > 120) out[k] = v.slice(0, 120) + '…';
    else out[k] = v;
  }
  if (files.length) out._files = files.map((f) => `${f.field}: ${f.filename} (${f.data.length} B)`);
  return out;
}

function events(s, since = 0) {
  return s.events.filter((e) => e.seq > since);
}

function getFile(s, fileId) {
  return s.files.get(fileId);
}

// pulizia sessioni inattive da oltre 24 ore
setInterval(() => {
  const limit = Date.now() - 24 * 3600_000;
  for (const s of byId.values()) if (Math.max(s.createdAt, s.lastSeen || 0) < limit) deleteSession(s.id);
}, 3600_000).unref();

module.exports = {
  createSession, deleteSession, publicSession, route, byId, events, userSendText, userSendFile, userJoinGroup, userPressButton,
  setUser, getFile, checkHtml,
};
