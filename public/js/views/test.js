import { h, clear, GET, POST, PUT, DEL, api, run, toast, toastErr, copyText, storage, fmtDate, confirmBox } from '../ui.js';
import { viewHead } from '../app.js';

export async function render(main, params) {
  const projects = (await GET('/api/projects')).projects.filter((p) => !p.archived);
  const caps = await GET('/api/sandbox/capabilities');
  let projectId = params[0] || storage.get('testProject', '');
  let sessions = (await GET('/api/sim/sessions'));
  let apiBase = sessions.apiBase;
  let sid = storage.get('simSession', '');
  if (!sessions.sessions.find((s) => s.id === sid)) sid = sessions.sessions[0]?.id || '';
  let chatType = 'private';
  let since = 0, runSince = 0;
  let timer = null;
  const bubbles = new Map();

  main.append(viewHead('Test & Simulatore', 'Prova il bot senza pubblicarlo: il simulatore riproduce la Telegram Bot API in locale. Puoi eseguire un progetto nel sandbox con un clic oppure collegare un bot avviato sul tuo computer.'));

  const left = h('div');
  const phoneBody = h('div.ph-body', { 'aria-live': 'polite' });
  const status = h('span.mono.dim', { style: { fontSize: '12px' } });
  const tabP = h('button.btn.small', { onclick: () => setChat('private') }, 'Chat privata');
  const tabG = h('button.btn.small', { onclick: () => setChat('group') }, 'Gruppo');
  const msgIn = h('input', { type: 'text', placeholder: 'Scrivi un messaggio o un /comando…', 'aria-label': 'Messaggio simulato' });
  msgIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendMsg(); });
  const fileIn = h('input', { type: 'file', class: 'hidden' });
  fileIn.addEventListener('change', uploadFile);
  const phone = h('div.phone',
    h('div.ph-head', h('div', h('strong.mono#sim-title', 'Simulatore'), h('br'), status), h('div.row', tabP, tabG)),
    phoneBody,
    h('div.ph-foot', msgIn, h('button.btn.primary', { onclick: sendMsg }, 'Invia'),
      h('button.btn.small', { onclick: () => fileIn.click(), title: 'Invia un documento' }, '📎 File'),
      h('button.btn.small.adv', { onclick: joinGroup, title: 'Simula l\'ingresso di un nuovo membro nel gruppo' }, '+ Membro'), fileIn));
  const apiLog = h('div.log', { style: { maxHeight: '300px' } });
  const runLog = h('div.log', { style: { maxHeight: '300px' } });
  const right = h('div.phone-col',
    phone,
    h('div.panel.adv', { style: { marginTop: '14px' } }, h('div.panel-title', 'Registro chiamate Bot API', h('button.btn.small', { onclick: () => clear(apiLog) }, 'Pulisci')), apiLog));
  main.append(h('div.grid.cols-2.test-grid', left, right));
  async function quickSession() {
    const r = await POST('/api/sim/sessions', {});
    sid = r.session.id; storage.set('simSession', sid); resetFeed(); await drawLeft(); toast('Sessione creata');
  }

  function setChat(t) {
    chatType = t;
    tabP.classList.toggle('primary', t === 'private'); tabG.classList.toggle('primary', t === 'group');
    phoneBody.querySelectorAll('[data-chat]').forEach((b) => b.classList.toggle('hidden', b.dataset.chat !== t));
    phoneBody.scrollTop = phoneBody.scrollHeight;
  }

  // ---------------- pannello sinistro ----------------
  async function drawLeft() {
    sessions = await GET('/api/sim/sessions');
    apiBase = sessions.apiBase;
    const s = sessions.sessions.find((x) => x.id === sid);
    const sessSel = h('select', sessions.sessions.length ? sessions.sessions.map((x) => h('option', { value: x.id, selected: x.id === sid }, `${x.bot.first_name} (@${x.bot.username}) · ${fmtDate(x.createdAt)}`)) : h('option', { value: '' }, 'Nessuna sessione'));
    sessSel.addEventListener('change', () => { sid = sessSel.value; storage.set('simSession', sid); resetFeed(); drawLeft(); });
    const newBtn = h('button.btn.primary', { onclick: () => run(newBtn, quickSession) }, '+ Nuova sessione');
    const blocks = [h('div.panel', h('div.panel-title', 'Sessione di simulazione'), h('div.row', sessSel, newBtn),
      s ? h('button.btn.small.danger', { style: { marginTop: '8px' }, onclick: async () => { if (await confirmBox('Chiudere la sessione?', 'Messaggi e file simulati verranno eliminati.', 'Chiudi', true)) { await DEL('/api/sim/sessions/' + sid); sid = ''; resetFeed(); drawLeft(); } } }, 'Chiudi sessione') : null)];
    if (s) {
      const uid = h('input', { type: 'number', value: s.user.id, style: { maxWidth: '140px' } });
      const uname = h('input', { type: 'text', value: s.user.first_name, style: { maxWidth: '160px' } });
      blocks.push(h('div.panel', h('div.panel-title', 'Esegui un progetto nel sandbox'),
        caps.enabled ? null : h('div.panel.warn', 'Esecuzione disattivata sul server (SANDBOX_EXEC=off). Usa il collegamento manuale qui sotto.'),
        h('div.field', h('label', 'Progetto'), (() => {
          const ps = h('select', h('option', { value: '' }, 'Scegli un progetto…'), projects.map((p) => h('option', { value: p.id, selected: p.id === projectId }, `${p.name} (${p.language})`)));
          ps.addEventListener('change', () => { projectId = ps.value; storage.set('testProject', projectId); runSince = 0; clear(runLog); pollRun(); });
          return ps;
        })()),
        h('div.row', h('button.btn.primary', { disabled: !caps.enabled, onclick: (e) => run(e.currentTarget, async () => {
          if (!projectId) return toast('Scegli un progetto', 'warn');
          clear(runLog); runSince = 0;
          await POST(`/api/sandbox/${projectId}/start`, { sessionId: sid });
          toast('Avvio in corso: la prima volta vengono installate le dipendenze (può richiedere qualche minuto)');
        }) }, '▶ Avvia nel sandbox'), h('button.btn.danger', { onclick: async () => { if (projectId) { await POST(`/api/sandbox/${projectId}/stop`); toast('Arresto richiesto'); } } }, '■ Ferma'),
        h('span.mono.dim#run-status', '')),
        h('p.dim', { style: { fontSize: '0.82rem' } }, `L'utente simulato (ID ${s.user.id}) viene impostato come amministratore (ADMIN_IDS). Isolamento: processo separato, cartella temporanea, variabili d'ambiente ripulite${caps.prlimit ? ', limiti di memoria e CPU' : ''}${caps.namespaces ? ', cartelle dell\'applicazione invisibili al bot' : ''}, durata massima ${caps.maxSeconds}s. La rete non è isolata: il bot può contattare servizi esterni.`),
        h('div.panel-title', { style: { marginTop: '10px' } }, 'Output del bot'), runLog,
        projectId ? h('div.row', { style: { marginTop: '8px' } }, h('a.btn.small', { href: `#/project/${projectId}/tests` }, 'Registra l\'esito dei test →')) : null));
      blocks.push(h('div.panel', h('div.panel-title', 'Collega un bot avviato sul tuo computer'),
        h('p', 'Nel file .env del bot imposta:'),
        h('pre.log', `BOT_TOKEN=${s.token}\nTELEGRAM_API_BASE=${apiBase}\nADMIN_IDS=${s.user.id}`),
        h('div.row', h('button.btn.small', { onclick: () => copyText(`BOT_TOKEN=${s.token}\nTELEGRAM_API_BASE=${apiBase}\nADMIN_IDS=${s.user.id}\n`, 'Configurazione') }, '⧉ Copia configurazione')),
        h('p.dim', { style: { fontSize: '0.82rem', marginTop: '8px' } }, 'I progetti del generatore supportano TELEGRAM_API_BASE. Per altri bot: aiogram → TelegramAPIServer.from_base(url); grammY → new Bot(token, { client: { apiRoot: url } }); python-telegram-bot → base_url=url + "/bot". Il token di prova funziona solo nel simulatore.')),
      h('div.panel.adv', h('div.panel-title', 'Utente simulato'), h('div.row', h('span', 'ID'), uid, h('span', 'Nome'), uname,
        h('button.btn.small', { onclick: async () => { await PUT(`/api/sim/${sid}/user`, { userId: Number(uid.value), userName: uname.value }); toast('Utente aggiornato'); } }, 'Applica')),
      h('p.dim', { style: { fontSize: '0.82rem' } }, 'Cambia ID per provare il bot come utente non amministratore.')));
    } else {
      blocks.push(h('div.empty', 'Crea una sessione per iniziare.'));
    }
    clear(left, ...blocks);
    updateStatus(s);
  }

  function updateStatus(s) {
    document.getElementById('sim-title').textContent = s ? `${s.bot.first_name} · @${s.bot.username}` : 'Simulatore';
    clear(status, h('span.led', { class: s?.connected ? 'on' : 'warn' }), s ? (s.connected ? 'bot collegato' : 'in attesa del bot…') : 'nessuna sessione', s?.webhook?.url ? ` · webhook ${s.webhook.url}` : '');
  }

  function resetFeed() {
    since = 0; bubbles.clear(); clear(phoneBody); clear(apiLog);
    if (!sid) phoneBody.append(h('div.bubble.sys', { style: { marginTop: '30%' } }, 'Nessuna sessione attiva.', h('br'), h('br'),
      h('button.btn.primary', { onclick: (e) => run(e.currentTarget, quickSession) }, '+ Crea sessione di simulazione')));
  }

  // ---------------- feed eventi ----------------
  function addBubble(ev) {
    const chat = ev.chatType || 'private';
    let el = null;
    if (ev.kind === 'in') {
      const m = ev.message;
      if (ev.callback) el = h('div.bubble.sys', `▸ premuto pulsante "${ev.callback.data}"`);
      else if (ev.system) el = h('div.bubble.sys', ev.system);
      else el = h('div.bubble.in', m.text || (m.document ? `📎 ${m.document.file_name}` : m.photo ? '🖼 foto' : ''), h('span.meta', `${m.from.first_name} · ${new Date(ev.at).toLocaleTimeString('it-IT')}`));
    } else if (ev.kind === 'out') {
      const m = ev.message;
      const kb = m.reply_markup?.inline_keyboard;
      el = h('div.bubble.out', m.text || '', m.caption ? m.caption : '',
        ev.file ? h('div', h('a', { href: `/api/sim/${sid}/file/${encodeURIComponent(ev.file.id)}` }, `📎 ${ev.file.name} (${Math.ceil(ev.file.size / 1024)} KB)`)) : null,
        kb ? h('div.kb', kb.map((row) => h('div.kb-row', row.map((b) => b.url ? h('a.btn.small', { href: b.url, target: '_blank', rel: 'noopener noreferrer' }, b.text + ' ↗') : h('button', { onclick: () => press(m.message_id, b.callback_data) }, b.text))))) : null,
        h('span.meta', `bot · ${new Date(ev.at).toLocaleTimeString('it-IT')}${ev.parseMode ? ' · ' + ev.parseMode : ''}`));
      bubbles.set(m.message_id, el);
    } else if (ev.kind === 'edit') {
      const b = bubbles.get(ev.message.message_id);
      if (b) { b.firstChild.textContent = ev.message.text || ''; b.style.outline = '1px dashed var(--amber)'; }
      return;
    } else if (ev.kind === 'delete') {
      bubbles.get(ev.messageId)?.classList.add('deleted');
      return;
    } else if (ev.kind === 'toast') el = h('div.bubble.toast-b', (ev.alert ? '⚠ ' : '') + ev.text);
    else if (ev.kind === 'action') el = h('div.bubble.sys', `… il bot sta ${ev.action === 'typing' ? 'scrivendo' : ev.action}`);
    else if (ev.kind === 'system' || ev.kind === 'error') { apiLog.append(h('div', { class: ev.kind === 'error' ? 'l-err' : 'system' }, `${new Date(ev.at).toLocaleTimeString('it-IT')} ${ev.text}`)); if (ev.kind === 'error') el = h('div.bubble.sys', { style: { color: 'var(--red)' } }, ev.text); }
    if (ev.kind === 'api') {
      apiLog.append(h('div', { class: ev.ok ? 'l-api' : 'l-err' }, `${new Date(ev.at).toLocaleTimeString('it-IT')} ${ev.method} ${ev.ok ? 'OK' : '✕ ' + ev.error} ${JSON.stringify(ev.params).slice(0, 220)}`));
      apiLog.scrollTop = apiLog.scrollHeight;
      return;
    }
    if (el) {
      el.dataset.chat = chat === 'private' ? 'private' : 'group';
      if (el.dataset.chat !== chatType) el.classList.add('hidden');
      phoneBody.append(el);
      phoneBody.scrollTop = phoneBody.scrollHeight;
    }
  }

  async function poll() {
    if (sid) {
      try {
        const r = await GET(`/api/sim/${sid}/events?since=${since}`);
        for (const ev of r.events) { addBubble(ev); since = Math.max(since, ev.seq); }
        updateStatus(r.session);
      } catch (e) { if (e.status === 404) { sid = ''; drawLeft(); } }
    }
    await pollRun();
    timer = setTimeout(poll, 800);
  }

  async function pollRun() {
    if (!projectId) return;
    try {
      const r = await GET(`/api/sandbox/${projectId}/status?since=${runSince}`);
      for (const l of r.logs) { runLog.append(h('div', { class: l.stream }, l.text)); runSince = l.seq; }
      if (r.logs.length) runLog.scrollTop = runLog.scrollHeight;
      const st = document.getElementById('run-status');
      if (st) st.textContent = { idle: '', preparing: '◌ preparazione…', running: '● in esecuzione', stopped: '■ fermato', failed: '✕ terminato con errore' }[r.status] || r.status;
    } catch { /* ignorato */ }
  }

  async function sendMsg() {
    if (!sid) return toast('Crea prima una sessione', 'warn');
    const text = msgIn.value.trim();
    if (!text) return;
    try { await POST(`/api/sim/${sid}/send`, { text, chatType }); msgIn.value = ''; } catch (e) { toastErr(e); }
  }
  async function press(messageId, data) { try { await POST(`/api/sim/${sid}/button`, { messageId, data }); } catch (e) { toastErr(e); } }
  async function joinGroup() {
    if (!sid) return;
    try { await POST(`/api/sim/${sid}/join`, { name: 'Nuovo utente' }); setChat('group'); } catch (e) { toastErr(e); }
  }
  async function uploadFile() {
    const f = fileIn.files[0];
    if (!f || !sid) return;
    const fd = new FormData();
    fd.append('file', f, f.name); fd.append('chatType', chatType); fd.append('asPhoto', String(/^image\//.test(f.type)));
    try { await api('POST', `/api/sim/${sid}/upload`, fd); } catch (e) { toastErr(e); }
    fileIn.value = '';
  }

  setChat('private');
  resetFeed();
  await drawLeft();
  poll();
  return () => clearTimeout(timer);
}
