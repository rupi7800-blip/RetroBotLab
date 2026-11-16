import { h, clear, GET, POST, run, toast, codeBlock, langFromName, storage, esc } from '../ui.js';
import { viewHead } from '../app.js';

// Generatore guidato: modello → configurazione → anteprima → creazione progetto.
export async function render(main, params) {
  const cat = await GET('/api/generator/catalog');
  let spec = null;
  let regenerateId = null;
  if (params[0] === 'edit' && params[1]) {
    const p = await GET('/api/projects/' + params[1]);
    if (!p.spec) { main.append(h('div.panel.warn', 'Questo progetto non è stato creato dal generatore: non è possibile rigenerarlo.')); return; }
    spec = structuredClone(p.spec);
    regenerateId = p.id;
  }
  const pending = storage.get('pendingSpec', null);
  if (!spec && pending) { spec = pending; storage.set('pendingSpec', null); }

  main.append(viewHead(regenerateId ? 'Modifica e rigenera progetto' : 'Generatore di bot Telegram',
    regenerateId ? 'Modifica la configurazione: i file generati verranno aggiornati, quelli aggiunti da te restano invariati. Prima della rigenerazione viene salvata una versione.'
      : 'Scegli un modello, personalizzalo e ottieni un progetto completo: codice, configurazione, dipendenze, README con istruzioni BotFather, test e Dockerfile.'));
  const body = h('div');
  main.append(body);

  const step = (n) => {
    if (n === 1) return chooseTemplate();
    if (n === 2) return configure();
    return preview();
  };

  function stepper(active) {
    const s = ['1 · Modello', '2 · Configurazione', '3 · Anteprima e creazione'];
    return h('div.tabs', s.map((label, i) => h('button', { class: i + 1 === active ? 'active' : '', disabled: !spec && i > 0, onclick: () => step(i + 1) }, label)));
  }

  function chooseTemplate() {
    const aiBox = h('textarea', { placeholder: 'Es. "Voglio un bot per il mio studio dentistico che gestisca gli appuntamenti, mandi un promemoria il giorno della visita e risponda alle domande sugli orari"', rows: 3 });
    const aiBtn = h('button.btn.blue', {
      onclick: () => run(aiBtn, async () => {
        if (!aiBox.value.trim()) return toast('Scrivi prima una descrizione', 'warn');
        const r = await POST('/api/ai/spec', { description: aiBox.value });
        spec = r.spec;
        if (r.warnings?.length) r.warnings.forEach((w) => toast(w, 'warn'));
        toast(`Configurazione proposta da ${r.provider}: verificala prima di generare`);
        step(2);
      }, 'L\'AI sta preparando la configurazione…'),
    }, '◉ Proponi configurazione con l\'AI');
    clear(body, stepper(1),
      h('div.panel.explain', h('div.panel-title', 'Descrivi il bot a parole (facoltativo, richiede un fornitore AI)'), aiBox, h('div.row', { style: { marginTop: '8px' } }, aiBtn,
        h('small.dim', 'L\'AI compila la configurazione; il codice viene poi prodotto dal generatore collaudato.'))),
      h('h2', 'Oppure scegli un modello'),
      h('div.grid.auto', cat.templates.map((t) => h('button.tile', {
        onclick: () => { spec = structuredClone(cat.defaults[t.id]); spec.language = spec.language || 'python'; step(2); },
      }, h('span.t-ico', t.icon), h('span.t-title', t.name), h('span.t-desc', t.desc),
      h('span.t-desc', h('em', 'Esempio: ' + t.example)),
      h('span', t.features.map((f) => h('span.badge', { style: { margin: '2px' } }, cat.features[f].label)))))));
  }

  // ---------------- configurazione ----------------
  function configure() {
    const s = spec;
    const field = (label, input, help) => h('div.field', h('label', label), input, help ? h('div.help', help) : null);
    const text = (obj, key, attrs = {}) => { const i = h('input', { type: 'text', value: obj[key] ?? '', ...attrs }); i.addEventListener('input', () => { obj[key] = i.value; }); return i; };
    const area = (obj, key, rows = 3) => { const i = h('textarea', { rows, style: { fontFamily: 'var(--sans)', fontSize: '14px' } }, obj[key] ?? ''); i.addEventListener('input', () => { obj[key] = i.value; }); return i; };
    const featureForms = h('div');

    const langCards = h('div.grid.cols-3', cat.languages.map((l) => {
      const b = h('button.tile', { class: s.language === l.id ? 'selected' : '', onclick: () => { s.language = l.id; langCards.querySelectorAll('.tile').forEach((x) => x.classList.remove('selected')); b.classList.add('selected'); } },
        h('span.t-title', l.label), h('span.t-desc', l.libraryLabel), h('span.t-desc', l.note));
      return b;
    }));
    const mode = h('select', h('option', { value: 'polling', selected: s.mode === 'polling' }, 'Long polling — semplice, funziona ovunque'), h('option', { value: 'webhook', selected: s.mode === 'webhook' }, 'Webhook — server pubblico con HTTPS'));
    mode.addEventListener('change', () => { s.mode = mode.value; });

    const feats = h('div.grid.cols-2', Object.entries(cat.features).map(([id, f]) => {
      const cb = h('input', { type: 'checkbox', checked: s.features.includes(id) });
      cb.addEventListener('change', () => {
        s.features = cb.checked ? [...new Set([...s.features, id])] : s.features.filter((x) => x !== id);
        renderFeatureForms();
      });
      return h('label.inline', { style: { alignItems: 'flex-start' } }, cb, h('span', h('strong', f.label), h('br'), h('small.dim', f.desc)));
    }));

    function listEditor(arr, cols, addLabel, blank) {
      const wrap = h('div');
      const draw = () => {
        clear(wrap, ...arr.map((item, idx) => h('div.row', { style: { marginBottom: '6px', alignItems: 'flex-start' } },
          ...cols.map((c) => {
            const val = Array.isArray(item[c.key]) ? item[c.key].join(', ') : item[c.key] ?? '';
            const i = c.area ? h('textarea', { rows: 2, placeholder: c.label, style: { flex: c.flex || 1, minHeight: '40px', fontFamily: 'var(--sans)' } }, val) : h('input', { type: c.type || 'text', value: val, placeholder: c.label, style: { flex: c.flex || 1, minWidth: '90px' } });
            i.addEventListener('input', () => { item[c.key] = c.list ? i.value.split(',').map((x) => x.trim()).filter(Boolean) : c.type === 'number' ? Number(i.value) : i.value; });
            return i;
          }),
          h('button.btn.small.danger', { 'aria-label': 'Rimuovi', onclick: () => { arr.splice(idx, 1); draw(); } }, '✕'))),
        h('button.btn.small', { onclick: () => { arr.push(structuredClone(blank)); draw(); } }, '+ ' + addLabel));
      };
      draw();
      return wrap;
    }

    function renderFeatureForms() {
      const F = (f) => s.features.includes(f);
      const blocks = [];
      if (F('commands')) blocks.push(h('div.panel', h('div.panel-title', 'Comandi personalizzati'), h('p.dim', 'Nome senza "/", solo lettere minuscole, numeri e _. Alcuni nomi sono riservati alle funzioni integrate.'),
        listEditor(s.commands, [{ key: 'command', label: 'comando', flex: 0.6 }, { key: 'description', label: 'descrizione menu' }, { key: 'reply', label: 'risposta', area: true, flex: 2 }], 'Aggiungi comando', { command: '', description: '', reply: '' })));
      if (F('autoreply')) blocks.push(h('div.panel', h('div.panel-title', 'Risposte automatiche'), h('p.dim', 'Parole chiave separate da virgola: se il messaggio ne contiene una, il bot risponde.'),
        listEditor(s.autoreplies, [{ key: 'keywords', label: 'parole chiave', list: true }, { key: 'reply', label: 'risposta', area: true, flex: 2 }], 'Aggiungi regola', { keywords: [], reply: '' })));
      if (F('menu')) blocks.push(h('div.panel', h('div.panel-title', 'Menu a pulsanti'), listEditor(s.menu, [{ key: 'label', label: 'etichetta pulsante' }, { key: 'reply', label: 'risposta', area: true, flex: 2 }], 'Aggiungi voce', { label: '', reply: '' })));
      if (F('notify')) blocks.push(h('div.panel', h('div.panel-title', 'Notifiche programmate'), h('div.grid.cols-2', field('Orario (ora del server)', text(s.notify, 'time', { type: 'time' })), field('Testo della notifica', area(s.notify, 'text', 2)))));
      if (F('booking')) blocks.push(h('div.panel', h('div.panel-title', 'Prenotazioni'), h('div.grid.cols-3',
        field('Apertura', text(s.booking, 'openFrom', { type: 'time' })), field('Chiusura', text(s.booking, 'openTo', { type: 'time' })),
        field('Giorni minimi di anticipo', (() => { const i = h('input', { type: 'number', min: 0, value: s.booking.minDaysAhead }); i.addEventListener('input', () => { s.booking.minDaysAhead = Number(i.value); }); return i; })()))));
      if (F('group')) {
        const bw = h('input', { type: 'text', value: s.group.bannedWords.join(', ') });
        bw.addEventListener('input', () => { s.group.bannedWords = bw.value.split(',').map((x) => x.trim()).filter(Boolean); });
        blocks.push(h('div.panel', h('div.panel-title', 'Gruppi'), field('Messaggio di benvenuto ({name} = nome)', area(s.group, 'welcome', 2)), field('Parole vietate (separate da virgola)', bw)));
      }
      if (F('form')) {
        const qa = h('textarea', { rows: 4, style: { fontFamily: 'var(--sans)' } }, s.form.questions.join('\n'));
        qa.addEventListener('input', () => { s.form.questions = qa.value.split('\n').map((x) => x.trim()).filter(Boolean); });
        blocks.push(h('div.panel', h('div.panel-title', 'Raccolta dati'), field('Titolo del modulo', text(s.form, 'title')), field('Domande (una per riga)', qa)));
      }
      if (F('ai')) blocks.push(h('div.panel.warn', h('div.panel-title', 'Intelligenza artificiale nel bot'),
        h('p', 'Il bot userà un servizio AI compatibile OpenAI configurato nel suo file .env (AI_API_BASE, AI_API_KEY, AI_MODEL). I servizi cloud sono di norma a pagamento o con piano gratuito limitato; Ollama in locale è gratuito.'),
        field('Istruzioni di sistema per l\'AI del bot', area(s.ai, 'systemPrompt', 3)),
        h('div.grid.cols-2', field('Modello predefinito', text(s.ai, 'model'), 'Il nome esatto dipende dal fornitore scelto: verificalo nella sua documentazione.'),
          field('Messaggi di cronologia da ricordare', (() => { const i = h('input', { type: 'number', min: 0, max: 30, value: s.ai.historyLength }); i.addEventListener('input', () => { s.ai.historyLength = Number(i.value); }); return i; })()))));
      if (F('shop')) blocks.push(h('div.panel', h('div.panel-title', 'Catalogo'), field('Valuta', text(s.shop, 'currency')),
        listEditor(s.shop.products, [{ key: 'name', label: 'prodotto', flex: 2 }, { key: 'price', label: 'prezzo', type: 'number' }], 'Aggiungi prodotto', { name: '', price: 0 }),
        h('p.dim', { style: { marginTop: '8px' } }, 'Gli ordini vengono inviati agli amministratori. Il pagamento non è integrato: per i pagamenti Telegram consulta https://core.telegram.org/bots/payments.')));
      if (F('api')) blocks.push(h('div.panel', h('div.panel-title', 'API esterna'), field('Descrizione del comando /api', text(s.api, 'description')), h('p.dim', 'L\'indirizzo del servizio si imposta nel file .env (EXTERNAL_API_URL, EXTERNAL_API_KEY).')));
      if (F('admin') || F('booking') || F('form') || F('shop')) blocks.push(h('div.panel.explain', h('p', { style: { margin: 0 } }, 'Gli amministratori si indicano nel file .env con ADMIN_IDS (ID numerici separati da virgola). Il comando /id del bot mostra il proprio ID.')));
      clear(featureForms, ...blocks);
    }
    renderFeatureForms();

    clear(body, stepper(2),
      h('div.panel', h('div.panel-title', 'Identità del bot'), h('div.grid.cols-2', field('Nome del progetto / bot', text(s, 'name')), field('Descrizione', text(s, 'description')))),
      h('div.panel', h('div.panel-title', 'Linguaggio e libreria'), langCards,
        h('p.dim', { style: { marginTop: '8px' } }, 'Per PHP, Java, C#, Go, python-telegram-bot o Telegraf usa l\'Assistente AI o il Generatore comandi: il codice verrà prodotto dall\'AI e verificato sintatticamente.'),
        field('Modalità di ricezione degli aggiornamenti', mode)),
      h('div.panel', h('div.panel-title', 'Messaggi'), h('div.grid.cols-2', field('Benvenuto a /start ({name} = nome dell\'utente)', area(s, 'welcome')), field('Risposta quando il bot non capisce (vuoto = nessuna)', area(s, 'fallback')))));
    body.append(h('div.panel', h('div.panel-title', 'Funzionalità'), feats), featureForms,
      h('div.row', h('button.btn', { onclick: () => step(1) }, '← Modello'), h('button.btn.primary', { onclick: () => step(3) }, 'Anteprima del progetto →')));
  }

  // ---------------- anteprima ----------------
  async function preview() {
    clear(body, stepper(3), h('div.dim.mono', 'Generazione in corso…'));
    const r = await POST('/api/generator/preview', { spec });
    spec = r.spec;
    const names = Object.keys(r.files).sort((a, b) => (a === r.entry ? -1 : b === r.entry ? 1 : a.localeCompare(b)));
    const viewer = h('div');
    const tree = h('div.filetree');
    const show = (name) => {
      tree.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.name === name));
      clear(viewer, codeBlock(r.files[name], langFromName(name), name));
    };
    names.forEach((n) => tree.append(h('button', { 'data-name': n, onclick: () => show(n) }, n)));
    const createBtn = h('button.btn.primary', {
      onclick: () => run(createBtn, async () => {
        if (regenerateId) {
          const out = await POST(`/api/projects/${regenerateId}/regenerate`, { spec });
          (out.warnings || []).forEach((w) => toast(w, 'warn'));
          toast('Progetto rigenerato (versione precedente salvata nella cronologia)');
          location.hash = '#/project/' + regenerateId;
        } else {
          const out = await POST('/api/projects', { spec });
          toast('Progetto creato');
          location.hash = '#/project/' + out.id;
        }
      }, 'Creazione…'),
    }, regenerateId ? '⟳ Rigenera il progetto' : '✚ Crea il progetto');
    clear(body, stepper(3),
      r.warnings.length ? h('div.panel.warn', h('ul', { style: { margin: 0 } }, r.warnings.map((w) => h('li', w)))) : null,
      r.notes?.length ? h('div.panel.warn', h('div.panel-title', 'Versioni librerie'), h('ul', { style: { margin: 0 } }, r.notes.map((w) => h('li', w)))) : null,
      h('div.panel.ok', h('div.panel-title', 'Riepilogo'), h('p', { html: `<strong>${esc(spec.name)}</strong> · ${esc(cat.languages.find((l) => l.id === spec.language).label)} · ${esc(cat.languages.find((l) => l.id === spec.language).libraryLabel)} · ${spec.mode === 'webhook' ? 'webhook' : 'long polling'} · ${names.length} file` }),
        h('p.dim', 'Codice prodotto dal generatore deterministico: tutte le combinazioni di modelli sono state verificate (sintassi, nomi non definiti, compilazione TypeScript) ed eseguite contro il simulatore Bot API durante il collaudo di RETRO BOT LAB.'),
        h('div.row', h('button.btn', { onclick: () => step(2) }, '← Configurazione'), createBtn)),
      h('div.split', tree, viewer));
    show(names[0]);
  }

  step(spec ? 2 : 1);
}
