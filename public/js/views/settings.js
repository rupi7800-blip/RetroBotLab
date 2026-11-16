import { h, clear, GET, POST, PUT, DEL, api, run, toast, toastErr, confirmBox, promptBox, fmtDate } from '../ui.js';
import { viewHead, app } from '../app.js';

export async function render(main) {
  let s = await GET('/api/settings');
  const caps = await GET('/api/sandbox/capabilities');
  main.append(viewHead('Impostazioni', 'Motore AI, interfaccia, aggiornamenti, sicurezza e backup.'));
  const aiBox = h('div');
  main.append(aiBox);

  async function reload() { s = await GET('/api/settings'); app.settings = s; drawAi(); }

  function drawAi() {
    const preset = h('select', s.presets.map((p, i) => h('option', { value: i }, `${p.name} — ${p.cost}`)));
    const name = h('input', { type: 'text' });
    const base = h('input', { type: 'url' });
    const model = h('input', { type: 'text', list: 'model-list' });
    const modelList = h('datalist#model-list');
    const key = h('input', { type: 'password', autocomplete: 'off', placeholder: 'Chiave API (salvata cifrata)' });
    const info = h('p.dim', { style: { fontSize: '0.85rem' } });
    const fill = () => {
      const p = s.presets[preset.value];
      name.value = p.name; base.value = p.baseUrl; model.value = p.model;
      clear(modelList, (p.models || []).map((m) => h('option', { value: m })));
      key.disabled = !p.needsKey;
      clear(info, h('strong', 'Costi: '), p.cost, ' ', p.keyUrl ? h('a', { href: p.keyUrl, target: '_blank', rel: 'noopener noreferrer' }, 'Ottieni la chiave / informazioni') : null,
        p.models ? '' : h('div', 'Indica il nome esatto del modello come riportato nella documentazione del fornitore.'));
    };
    preset.addEventListener('change', fill);
    const add = h('button.btn.primary', { onclick: () => run(add, async () => {
      const p = s.presets[preset.value];
      if (p.needsKey && !key.value) return toast('Inserisci la chiave API', 'warn');
      await POST('/api/ai/providers', { kind: p.kind, name: name.value, baseUrl: base.value, model: model.value, key: key.value || undefined });
      key.value = '';
      toast('Fornitore aggiunto'); await reload(); app.refreshStatus();
    }) }, '+ Aggiungi fornitore');
    const routeSel = (task) => {
      const sel = h('select', h('option', { value: '' }, 'Primo disponibile'), s.providers.map((p) => h('option', { value: p.id, selected: s.routing[task] === p.id }, `${p.name} · ${p.model || '?'}`)));
      sel.addEventListener('change', async () => { await PUT('/api/settings', { routing: { [task]: sel.value } }); toast('Instradamento aggiornato'); });
      return sel;
    };
    const fb = h('input', { type: 'checkbox', checked: s.fallback });
    fb.addEventListener('change', () => PUT('/api/settings', { fallback: fb.checked }).then(() => toast('Salvato')));
    clear(aiBox, h('div.panel', h('div.panel-title', 'Intelligenza artificiale — fornitori'),
      s.providers.length ? h('div.table-wrap', h('table', h('thead', h('tr', h('th', 'Fornitore'), h('th', 'Modello'), h('th', 'Chiave'), h('th', 'Attivo'), h('th', ''))),
        h('tbody', s.providers.map((p) => {
          const en = h('input', { type: 'checkbox', checked: p.enabled !== false });
          en.addEventListener('change', async () => { await PUT('/api/ai/providers/' + p.id, { enabled: en.checked }); app.refreshStatus(); });
          const mdl = h('input', { type: 'text', value: p.model, style: { minWidth: '160px' } });
          mdl.addEventListener('change', async () => { await PUT('/api/ai/providers/' + p.id, { model: mdl.value }); toast('Modello aggiornato'); });
          const test = h('button.btn.small', { onclick: () => run(test, async () => { const r = await POST(`/api/ai/providers/${p.id}/test`); if (r.ok) toast(`Connessione OK: ${r.model} (${r.ms} ms)`); else toast('Test non riuscito: ' + r.error, 'err', 9000); }, 'Test…') }, 'Test');
          return h('tr', h('td', p.name, h('div.dim.mono', { style: { fontSize: '11px' } }, p.baseUrl)), h('td', mdl),
            h('td', p.key.set ? h('span.badge.green', p.key.hint) : h('span.badge', 'nessuna')), h('td', en),
            h('td', h('div.row', test,
              h('button.btn.small', { onclick: async () => { const k = await promptBox('Aggiorna chiave API', 'Nuova chiave API', '', { type: 'password', help: 'Viene cifrata sul server.' }); if (k) { await PUT('/api/ai/providers/' + p.id, { key: k }); toast('Chiave aggiornata'); reload(); } } }, 'Chiave'),
              h('button.btn.small.danger', { onclick: async () => { if (await confirmBox('Rimuovere il fornitore?', `${p.name} e la sua chiave cifrata verranno eliminati.`, 'Rimuovi', true)) { await DEL('/api/ai/providers/' + p.id); reload(); app.refreshStatus(); } } }, '✕'))));
        })))) : h('div.empty', 'Nessun fornitore configurato.'),
      h('h3', { style: { marginTop: '16px' } }, 'Aggiungi fornitore'),
      h('div.grid.cols-2', h('div.field', h('label', 'Modello predefinito'), preset), h('div.field', h('label', 'Nome'), name),
        h('div.field', h('label', 'Indirizzo base API'), base), h('div.field', h('label', 'Modello'), model, modelList)),
      h('div.field', h('label', 'Chiave API'), key, h('div.help', 'La chiave viene cifrata sul server e non viene mai rimandata al browser. Non viene inclusa nei backup in chiaro.')),
      info, add),
    h('div.panel', h('div.panel-title', 'Instradamento per compito'),
      h('p.dim', 'Scegli il modello più adatto per ogni attività. Se il fornitore scelto non risponde e il fallback è attivo, vengono provati gli altri fornitori attivi e la risposta lo segnala.'),
      h('div.grid.cols-2', ['chat:Assistente', 'code:Codice e documenti tecnici', 'debug:Debug', 'search:Ricerca'].map((x) => { const [t, l] = x.split(':'); return h('div.field', h('label', l), routeSel(t)); })),
      h('label.inline', fb, 'Usa un altro fornitore se quello scelto non è disponibile')));
    fill();
  }
  drawAi();

  // interfaccia
  const mode = h('select', h('option', { value: 'simple', selected: s.uiMode === 'simple' }, 'Semplice — guida passo passo'), h('option', { value: 'advanced', selected: s.uiMode === 'advanced' }, 'Avanzata — log, parametri, strumenti'));
  mode.addEventListener('change', async () => { await PUT('/api/settings', { uiMode: mode.value }); document.body.classList.toggle('simple', mode.value === 'simple'); app.settings.uiMode = mode.value; const b = document.getElementById('mode-btn'); if (b) b.textContent = mode.value === 'advanced' ? 'Modalità: avanzata' : 'Modalità: semplice'; toast('Salvato'); });
  const expl = h('select', h('option', { value: 'simple', selected: s.explainLevel === 'simple' }, 'Spiegazioni semplici'), h('option', { value: 'technical', selected: s.explainLevel === 'technical' }, 'Approfondimenti tecnici'));
  expl.addEventListener('change', async () => { await PUT('/api/settings', { explainLevel: expl.value }); try { localStorage.setItem('rbl:explainLevel', JSON.stringify(expl.value)); } catch { /* ignorato */ } toast('Salvato'); });
  const au = h('input', { type: 'checkbox', checked: s.autoUpdate });
  au.addEventListener('change', () => PUT('/api/settings', { autoUpdate: au.checked }).then(() => toast('Salvato')));
  main.append(h('div.grid.cols-2',
    h('div.panel', h('div.panel-title', 'Interfaccia'), h('div.field', h('label', 'Modalità'), mode), h('div.field', h('label', 'Livello delle spiegazioni'), expl)),
    h('div.panel', h('div.panel-title', 'Aggiornamento delle conoscenze'), h('label.inline', au, `Controllo automatico delle fonti (ogni ${s.updateHours || 0} ore)`),
      h('p.dim', { style: { fontSize: '0.85rem', marginTop: '8px' } }, 'Intervallo configurabile con KNOWLEDGE_UPDATE_HOURS nel file .env del server. ', s.github.tokenSet ? 'GITHUB_TOKEN configurato.' : 'GITHUB_TOKEN non configurato (limiti GitHub ridotti).'),
      h('a.btn.small', { href: '#/knowledge/updates' }, 'Apri il registro aggiornamenti'))));

  // sicurezza
  const oldPw = h('input', { type: 'password', autocomplete: 'current-password' });
  const newPw = h('input', { type: 'password', autocomplete: 'new-password' });
  const chg = h('button.btn', { onclick: () => run(chg, async () => { await POST('/api/auth/password', { oldPassword: oldPw.value, newPassword: newPw.value }); oldPw.value = ''; newPw.value = ''; toast('Password modificata'); }) }, 'Cambia password');
  const restoreIn = h('input', { type: 'file', accept: '.zip', class: 'hidden' });
  restoreIn.addEventListener('change', async () => {
    const f = restoreIn.files[0];
    if (!f) return;
    if (!(await confirmBox('Ripristinare il backup?', 'Progetti e impostazioni verranno sostituiti con quelli del backup. Una copia dello stato attuale viene salvata nella cartella dati. La password di accesso resta quella attuale.', 'Ripristina', true))) { restoreIn.value = ''; return; }
    const fd = new FormData(); fd.append('file', f, f.name);
    try { const r = await api('POST', '/api/backup/restore', fd); toast(`Backup ripristinato: ${r.projects} progetti`); setTimeout(() => location.reload(), 800); } catch (e) { toastErr(e); }
    restoreIn.value = '';
  });
  const activity = await GET('/api/activity');
  main.append(h('div.grid.cols-2',
    h('div.panel', h('div.panel-title', 'Sicurezza'),
      h('ul', { style: { fontSize: '0.88rem', paddingLeft: '1.1em' } },
        h('li', 'Token e chiavi API cifrati con AES-256-GCM; ', s.appSecretFromEnv ? 'chiave master da APP_SECRET.' : h('span', { style: { color: 'var(--amber)' } }, 'chiave master in data/.master.key: per maggiore sicurezza imposta APP_SECRET nel file .env del server.')),
        h('li', 'Credenziali rimosse automaticamente dai prompt inviati ai servizi AI e dai log.'),
        h('li', 'Sessioni con cookie HttpOnly/SameSite=Strict, protezione CSRF, limite ai tentativi di accesso.'),
        h('li', 'Codice dei bot eseguito solo nel sandbox, mai dentro il processo dell\'applicazione.')),
      h('div.grid.cols-2', h('div.field', h('label', 'Password attuale'), oldPw), h('div.field', h('label', 'Nuova password'), newPw)), chg),
    h('div.panel', h('div.panel-title', 'Backup'),
      h('p', 'Il backup contiene progetti, versioni, impostazioni e credenziali cifrate (recuperabili solo con la stessa chiave master).'),
      h('div.row', h('a.btn.primary', { href: '/api/backup.zip' }, '⇩ Scarica backup'), h('button.btn', { onclick: () => restoreIn.click() }, '⇪ Ripristina backup'), restoreIn))),
  h('div.grid.cols-2',
    h('div.panel', h('div.panel-title', 'Ambiente di test (server)'), h('table', h('tbody',
      h('tr', h('td', 'Esecuzione nel sandbox'), h('td', caps.enabled ? 'attiva' : 'disattivata (SANDBOX_EXEC=off)')),
      h('tr', h('td', 'Python 3'), h('td', caps.python ? 'disponibile' : 'non installato')),
      h('tr', h('td', 'Limiti di risorse (prlimit)'), h('td', caps.prlimit ? `sì · ${caps.maxMemoryMb} MB` : 'non disponibile')),
      h('tr', h('td', 'Isolamento cartelle (namespace)'), h('td', caps.namespaces ? 'sì' : 'non disponibile su questo sistema')),
      h('tr', h('td', 'Durata massima'), h('td', caps.maxSeconds + ' s'))))),
    h('div.panel.adv', h('div.panel-title', 'Registro eventi'), h('div.log', { style: { maxHeight: '260px' } }, activity.activity.map((a) => h('div', { class: a.type === 'security' ? 'system' : '' }, `${fmtDate(a.at)} [${a.type}] ${a.text}`))))));
}
