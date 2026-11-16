import { h, clear, GET, POST, run, toast, toastErr, markdown, storage, copyText, download, TOKEN_RE, confirmBox, fmtDate } from '../ui.js';
import { viewHead } from '../app.js';

const EXAMPLES = [
  'Voglio creare un bot che risponda automaticamente ai messaggi',
  'Voglio un bot che legga le email e invii notifiche Telegram',
  'Voglio un bot che interroghi un database PostgreSQL',
  'Voglio un bot che gestisca prenotazioni con promemoria',
  'Voglio un bot che invii notifiche a orari prestabiliti',
  'Voglio un bot che utilizzi un\'intelligenza artificiale',
  'Voglio un bot che gestisca più utenti con permessi differenti',
  'Voglio un bot che interagisca con la mia applicazione web',
  'Voglio un bot che gestisca documenti e file',
  'Voglio un bot che esegua operazioni automatiche tramite API esterne',
];

export async function render(main) {
  const settings = await GET('/api/settings');
  const projects = (await GET('/api/projects')).projects.filter((p) => !p.archived);
  let messages = storage.get('chat', []);

  main.append(viewHead('Assistente AI', 'Specializzato esclusivamente in bot Telegram. Descrivi cosa vuoi ottenere anche senza termini tecnici: l\'assistente analizza la richiesta, chiede solo ciò che manca e propone soluzione, librerie e codice.',
    h('button.btn', { onclick: async () => { if (messages.length && await confirmBox('Nuova conversazione', 'La conversazione attuale verrà cancellata da questo browser.', 'Nuova')) { messages = []; save(); draw(); } } }, '+ Nuova conversazione')));

  if (!settings.providers.some((p) => p.enabled !== false)) {
    main.append(h('div.panel.warn', h('div.panel-title', 'Motore AI non configurato'),
      h('p', 'Per usare l\'assistente aggiungi un fornitore AI in ', h('a', { href: '#/settings' }, 'Impostazioni'), ' (Anthropic, OpenAI, OpenRouter, Groq, Mistral, Gemini, DeepSeek o Ollama in locale, gratuito).'),
      h('p', 'Senza AI puoi comunque usare il ', h('a', { href: '#/generator' }, 'Generatore di bot'), ', il simulatore, l\'analisi del codice e la formazione.')));
  }

  const chat = h('div.chat');
  const input = h('textarea', { placeholder: 'Descrivi il bot o fai una domanda tecnica… (Ctrl+Invio per inviare)', 'aria-label': 'Messaggio' });
  const warn = h('div.panel.danger.hidden', { style: { margin: '8px 0' } }, '⚠ Il testo sembra contenere un token Telegram. Non va mai condiviso con servizi AI: verrà sostituito con <TELEGRAM_BOT_TOKEN> prima dell\'invio. Tienilo nel file .env.');
  input.addEventListener('input', () => warn.classList.toggle('hidden', !TOKEN_RE.test(input.value)));
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send(); } });
  const web = h('input', { type: 'checkbox', checked: storage.get('chatWeb', false) });
  web.addEventListener('change', () => storage.set('chatWeb', web.checked));
  const projSel = h('select', { style: { maxWidth: '260px' } }, h('option', { value: '' }, 'Nessun progetto di riferimento'), projects.map((p) => h('option', { value: p.id }, p.name)));
  const filesBox = h('div.adv.row', { style: { fontSize: '0.85rem' } });
  projSel.addEventListener('change', async () => {
    clear(filesBox);
    if (!projSel.value) return;
    const p = await GET('/api/projects/' + projSel.value);
    filesBox.append(h('span.dim', 'Includi file:'), Object.keys(p.files).filter((n) => !/\.(md|gitignore|dockerignore)$/.test(n)).map((n) => h('label.inline', h('input', { type: 'checkbox', value: n, checked: /^(main\.py|bot\.js|src\/bot\.ts|config\.json)$/.test(n) }), n)));
  });
  const sendBtn = h('button.btn.primary', { onclick: send }, 'Invia ▶');
  const specBtn = h('button.btn.blue', {
    title: 'Trasforma la conversazione in una configurazione del generatore (Python o JS/TS)',
    onclick: () => run(specBtn, async () => {
      const desc = messages.filter((m) => m.role === 'user').map((m) => m.content).join('\n\n') || input.value;
      if (!desc.trim()) return toast('Scrivi prima cosa deve fare il bot', 'warn');
      const r = await POST('/api/ai/spec', { description: desc });
      storage.set('pendingSpec', r.spec);
      toast('Configurazione pronta: controllala nel generatore');
      location.hash = '#/generator';
    }, 'Preparazione…'),
  }, '✚ Crea progetto con il generatore');

  const composer = h('div.composer', warn, input,
    h('div.row.between', { style: { marginTop: '8px' } },
      h('div.row', h('label.inline', { title: 'Cerca repository su GitHub e discussioni su Stack Overflow e passali all\'AI come fonti (con link, data e licenza)' }, web, 'Cerca fonti online'), projSel),
      h('div.row', specBtn, sendBtn)), filesBox);

  main.append(chat, composer);

  function save() { storage.set('chat', messages.slice(-60)); }

  function filePanel(m) {
    const names = Object.keys(m.files || {});
    if (!names.length) return null;
    const target = h('select', { style: { maxWidth: '240px' } }, h('option', { value: '' }, 'Scegli progetto…'), projects.map((p) => h('option', { value: p.id }, p.name)));
    const checks = Object.fromEntries((m.fileChecks || []).map((c) => [c.file, c]));
    return h('div.panel.code-panel', { style: { marginTop: '10px' } }, h('div.panel-title', `File proposti (${names.length})`),
      h('table', h('tbody', names.map((n) => {
        const c = checks[n];
        return h('tr', h('td.mono', n), h('td', c ? (c.ok === true ? h('span.badge.green', 'sintassi verificata') : c.ok === false ? h('span.badge.red', `errore riga ${c.line || '?'}: ${c.error}`) : h('span.badge', 'non verificabile')) : h('span.badge', 'non verificato')),
          h('td', h('button.btn.small', { onclick: () => copyText(m.files[n], n) }, 'Copia'), ' ', h('button.btn.small', { onclick: () => download(n.split('/').pop(), m.files[n]) }, 'Scarica')));
      }))),
      h('div.row', { style: { marginTop: '10px' } }, target,
        h('button.btn.small', { onclick: async () => {
          if (!target.value) return toast('Scegli un progetto', 'warn');
          if (!(await confirmBox('Applicare i file al progetto?', `${names.join(', ')} verranno scritti nel progetto. Prima viene salvata una versione per poter tornare indietro.`, 'Applica'))) return;
          try { await POST(`/api/projects/${target.value}/apply`, { files: m.files, label: 'File proposti dall\'assistente AI' }); toast('File applicati al progetto'); } catch (e) { toastErr(e); }
        } }, 'Applica al progetto'),
        h('button.btn.small', { onclick: async () => {
          const r = await POST('/api/projects', { name: 'Progetto dall\'assistente', description: 'Creato dai file proposti dall\'assistente AI', language: names.some((n) => n.endsWith('.py')) ? 'python' : names.some((n) => n.endsWith('.ts')) ? 'typescript' : names.some((n) => n.endsWith('.php')) ? 'php' : names.some((n) => n.endsWith('.go')) ? 'go' : names.some((n) => n.endsWith('.java')) ? 'java' : 'javascript', files: m.files, source: 'ai' });
          toast('Progetto creato'); location.hash = '#/project/' + r.id;
        } }, 'Nuovo progetto con questi file')),
      h('p.dim', { style: { fontSize: '0.8rem', marginTop: '8px', marginBottom: 0 } }, 'Codice generato dall\'AI: la verifica di sintassi non garantisce il funzionamento. Provalo nel simulatore prima dell\'uso.'));
  }

  function bubble(m) {
    if (m.role === 'user') return h('div.msg.user', h('div.who', 'TU'), h('div', { style: { whiteSpace: 'pre-wrap' } }, m.content));
    if (m.role === 'error') return h('div.msg', { style: { borderColor: 'var(--red)' } }, h('div.who', { style: { color: 'var(--red)' } }, 'ERRORE'), h('div', m.content));
    const meta = m.meta || {};
    return h('div.msg', h('div.who', 'ASSISTENTE', meta.provider ? h('span.badge', `${meta.provider} · ${meta.model}`) : null,
      meta.fallbackUsed ? h('span.badge.amber', 'fornitore di riserva') : null, meta.redactions?.length ? h('span.badge.blue', { title: meta.redactions.join(', ') }, 'credenziali rimosse dal prompt') : null,
      meta.truncated ? h('span.badge.red', 'risposta troncata') : null, h('span.faint', fmtDate(m.at)),
      h('button.btn.small.ghost', { onclick: () => copyText(m.content, 'Risposta') }, '⧉')),
    markdown(m.content), filePanel(m),
    meta.web?.length ? h('details', { style: { marginTop: '10px' } }, h('summary.dim', `Fonti recuperate online (${meta.web.length})`),
      h('ul', { style: { fontSize: '0.85rem' } }, meta.web.map((r) => h('li', h('a', { href: r.url, target: '_blank', rel: 'noopener noreferrer' }, r.title), ` — ${r.source} · agg. ${String(r.updated || 'n/d').slice(0, 10)} · ${r.license || 'licenza n/d'}${r.maintenance ? ' · ' + r.maintenance : ''}`)))) : null,
    meta.webErrors?.length ? h('div.dim', { style: { fontSize: '0.8rem' } }, 'Ricerca non riuscita su: ' + meta.webErrors.map((e) => `${e.label} (${e.error})`).join(', ')) : null);
  }

  function draw() {
    if (!messages.length) {
      clear(chat, h('div.panel.explain', h('div.panel-title', 'Esempi di richieste'), h('div.row', EXAMPLES.map((ex) => h('button.btn.small', { onclick: () => { input.value = ex; input.focus(); } }, ex)))),
        h('p.dim', 'L\'assistente etichetta le informazioni come DOCUMENTATO, SUGGERIMENTO AI o DA VERIFICARE. Le credenziali vengono rimosse automaticamente prima dell\'invio al servizio AI.'));
      return;
    }
    clear(chat, messages.map(bubble));
  }

  async function send() {
    const text = input.value.trim();
    if (!text) return;
    messages.push({ role: 'user', content: text, at: new Date().toISOString() });
    input.value = ''; warn.classList.add('hidden');
    save(); draw();
    const thinking = h('div.msg', h('div.who', 'ASSISTENTE'), h('div.dim.mono', h('span.spin', { style: { display: 'inline-block', width: '10px', height: '10px', border: '2px solid currentColor', borderRightColor: 'transparent', borderRadius: '50%', animation: 'spin .8s linear infinite', marginRight: '8px' } }), web.checked ? 'Ricerca fonti e analisi in corso…' : 'Analisi in corso…'));
    chat.append(thinking);
    thinking.scrollIntoView({ behavior: 'smooth', block: 'end' });
    sendBtn.disabled = true;
    try {
      const includeFiles = [...filesBox.querySelectorAll('input:checked')].map((c) => c.value);
      const r = await POST('/api/ai/chat', { task: 'chat', messages: messages.filter((m) => m.role !== 'error').map(({ role, content }) => ({ role, content })), withWeb: web.checked, projectId: projSel.value || undefined, includeFiles });
      messages.push({ role: 'assistant', content: r.text, at: new Date().toISOString(), files: r.files, fileChecks: r.fileChecks, meta: { provider: r.provider, model: r.model, fallbackUsed: r.fallbackUsed, redactions: r.redactions, web: r.web, webErrors: r.webErrors, truncated: r.truncated } });
    } catch (e) {
      messages.push({ role: 'error', content: e.message, at: new Date().toISOString() });
    } finally {
      sendBtn.disabled = false;
      save(); draw();
      chat.lastChild?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }
  draw();
}
