import { h, clear, GET, POST, PUT, DEL, api, run, toast, toastErr, confirmBox, promptBox, fmtDate, copyText, download, storage, esc } from '../ui.js';
import { viewHead } from '../app.js';
import { createEditor } from '../editor.js';

export async function render(main, params) {
  const id = params[0];
  let p = await GET('/api/projects/' + id);
  let tab = params[1] || storage.get('projTab', 'code');
  let initialLine = Number(params[2]) || 0;
  if (params[3]) storage.set('projFile:' + id, params[3]);
  let current = null;
  let editor = null;
  let dirty = false;

  const head = h('div');
  const tabs = h('div.tabs');
  const body = h('div');
  main.append(head, tabs, body);

  function drawHead() {
    clear(head, viewHead(p.name, p.description || '',
      h('span.badge', { class: p.archived ? 'amber' : '' }, p.archived ? 'archiviato' : p.status),
      h('span.badge.mono', `v${p.version}`),
      h('a.btn', { href: `/api/projects/${id}/export.zip` }, '⇩ ZIP progetto'),
      h('a.btn', { href: `#/debug/project/${id}` }, '⚠ Analizza'),
      h('a.btn.blue', { href: `#/test/${id}` }, '▶ Prova nel simulatore')));
  }
  const TABS = [['code', 'Codice'], ['overview', 'Panoramica'], ['versions', 'Versioni'], ['bot', 'Configura bot'], ['tests', 'Test'], ['docs', 'Documentazione']];
  function drawTabs() {
    clear(tabs, TABS.map(([k, l]) => h('button', { class: tab === k ? 'active' : '', onclick: () => switchTab(k) }, l)));
  }
  async function switchTab(k) {
    if (editor) editor.flush();
    tab = k; storage.set('projTab', k);
    drawTabs();
    await draw();
  }
  async function reload() { p = await GET('/api/projects/' + id); drawHead(); }

  async function saveFile(path, content, manual) {
    try {
      await PUT(`/api/projects/${id}/files`, { path, content });
      p.files[path] = content;
      dirty = false;
      const s = document.getElementById('savestate');
      if (s) s.textContent = `● salvato ${new Date().toLocaleTimeString('it-IT')}`;
      if (manual) toast('File salvato');
    } catch (e) { toastErr(e); }
  }

  // ---------------- CODICE ----------------
  function drawCode() {
    const names = Object.keys(p.files).sort();
    if (!current) current = storage.get('projFile:' + id, null);
    if (!current || p.files[current] === undefined) current = names.find((n) => /^(main\.py|bot\.js|src\/bot\.ts)$/.test(n)) || names[0] || null;
    const tree = h('div.filetree', names.map((n) => h('button', { class: n === current ? 'active' : '', title: n, onclick: () => { editor?.flush(); current = n; drawCode(); } }, n)));
    tree.classList.add('desktop-only');
    const fileSel = h('select.mobile-only', { 'aria-label': 'File da modificare' }, names.map((n) => h('option', { value: n, selected: n === current }, n)));
    fileSel.addEventListener('change', () => { editor?.flush(); current = fileSel.value; drawCode(); });
    const treeBox = h('div', tree, fileSel, h('div.row', { style: { marginTop: '8px' } },
      h('button.btn.small', { onclick: newFile }, '+ File'),
      current ? h('button.btn.small', { onclick: renameFile }, 'Rinomina') : null,
      current ? h('button.btn.small.danger', { onclick: deleteFile }, 'Elimina') : null));
    if (!current) { clear(body, h('div.split', treeBox, h('div.empty', 'Nessun file. Crea un file o rigenera il progetto.'))); return; }
    const state = h('span.savestate#savestate', '● salvato');
    editor = createEditor({
      value: p.files[current], filename: current,
      onChange: () => { dirty = true; state.textContent = '○ modifiche non salvate…'; },
      onSave: (v, manual) => saveFile(current, v, manual),
    });
    clear(body, h('div.split', treeBox, h('div',
      h('div.editor-bar', h('strong.mono', current), state, h('span.grow'), editor.searchBar,
        h('button.btn.small', { onclick: () => copyText(editor.value, 'File') }, '⧉ Copia'),
        h('button.btn.small', { onclick: () => download(current.split('/').pop(), editor.value) }, '⇩ Scarica'),
        h('button.btn.small.primary', { onclick: () => saveFile(current, editor.value, true) }, 'Salva (Ctrl+S)')),
      editor.el,
      h('div.dim', { style: { fontSize: '12px', marginTop: '6px' } }, 'Salvataggio automatico dopo 1,2 s di inattività. Per tornare indietro usa la scheda Versioni (salva una versione prima di modifiche importanti).'))));
    storage.set('projFile:' + id, current);
    if (initialLine) { const ln = initialLine; initialLine = 0; setTimeout(() => editor.gotoLine(ln), 50); }
  }
  async function newFile() {
    const name = await promptBox('Nuovo file', 'Percorso del file (es. handlers/admin.py)', '');
    if (!name) return;
    if (p.files[name] !== undefined) return toast('Esiste già', 'warn');
    await PUT(`/api/projects/${id}/files`, { path: name, content: '' });
    p.files[name] = ''; current = name; drawCode();
  }
  async function renameFile() {
    const to = await promptBox('Rinomina file', 'Nuovo percorso', current);
    if (!to || to === current) return;
    try { await POST(`/api/projects/${id}/files/rename`, { from: current, to }); p.files[to] = p.files[current]; delete p.files[current]; current = to; drawCode(); } catch (e) { toastErr(e); }
  }
  async function deleteFile() {
    if (!(await confirmBox('Eliminare il file?', `${current} verrà eliminato. Una copia resta nella cronologia versioni.`, 'Elimina', true))) return;
    await DEL(`/api/projects/${id}/files?path=${encodeURIComponent(current)}`);
    delete p.files[current]; current = null; await reload(); drawCode();
  }

  // ---------------- PANORAMICA ----------------
  function drawOverview() {
    const f = (label, key, type = 'text') => {
      const i = type === 'area' ? h('textarea', { rows: 6, style: { fontFamily: 'var(--sans)' } }, p[key] || '') : h('input', { type: 'text', value: p[key] || '' });
      i.dataset.key = key;
      return h('div.field', h('label', label), i);
    };
    const status = h('select', ['bozza', 'in sviluppo', 'testato', 'pubblicato', 'manutenzione'].map((s) => h('option', { selected: p.status === s }, s)));
    const form = h('div.panel', h('div.panel-title', 'Dati del progetto'),
      h('div.grid.cols-2', f('Nome', 'name'), f('Versione (x.y.z)', 'version'), f('Linguaggio', 'language'), f('Libreria', 'library')),
      f('Descrizione', 'description'), h('div.field', h('label', 'Stato'), status), f('Note', 'notes', 'area'));
    const saveBtn = h('button.btn.primary', {
      onclick: () => run(saveBtn, async () => {
        const data = { status: status.value };
        form.querySelectorAll('[data-key]').forEach((i) => { data[i.dataset.key] = i.value; });
        p = { ...p, ...(await PUT('/api/projects/' + id, data)) };
        drawHead(); toast('Dati salvati');
      }),
    }, 'Salva dati');
    form.append(saveBtn);
    const kv = p.knownVersions || {};
    clear(body, h('div.grid.cols-2', h('div', form,
      p.spec ? h('div.panel', h('div.panel-title', 'Generatore'), h('p', 'Progetto creato dal generatore (modello: ', h('strong', p.template || 'personalizzato'), ').'),
        h('p.dim', 'Funzionalità: ' + (p.features || []).join(', ')),
        h('a.btn', { href: `#/generator/edit/${id}` }, '⟳ Modifica configurazione e rigenera')) : null),
    h('div',
      h('div.panel', h('div.panel-title', 'Informazioni'), h('table', h('tbody',
        h('tr', h('td.dim', 'Creato'), h('td', fmtDate(p.createdAt))), h('tr', h('td.dim', 'Modificato'), h('td', fmtDate(p.updatedAt))),
        h('tr', h('td.dim', 'File'), h('td', Object.keys(p.files).length)), h('tr', h('td.dim', 'Versioni salvate'), h('td', p.versions.length)),
        h('tr', h('td.dim', 'Stato test'), h('td', p.testStatus)), h('tr', h('td.dim', 'Token bot'), h('td', p.botToken.set ? `impostato (${p.botToken.hint})` : 'non impostato')),
        h('tr', h('td.dim', 'Bot API rilevata'), h('td', kv.botApi ? 'v' + kv.botApi : 'non verificata'))))),
      kv.notes?.length ? h('div.panel.warn', h('div.panel-title', 'Aggiornamenti disponibili'), h('ul', kv.notes.map((n) => h('li', n)))) : null,
      h('div.panel', h('div.panel-title', 'Cronologia modifiche'), h('div.log', { style: { maxHeight: '320px' } }, p.history.map((x) => h('div', h('span.faint', fmtDate(x.at) + '  '), x.text)))),
      h('div.panel.danger', h('div.panel-title', 'Archivio'), h('div.row',
        h('button.btn', { onclick: async () => { await PUT('/api/projects/' + id, { archived: !p.archived }); await reload(); drawOverview(); toast(p.archived ? 'Archiviato' : 'Ripristinato'); } }, p.archived ? 'Ripristina dall\'archivio' : 'Archivia progetto'),
        h('button.btn', { onclick: async () => { const n = await promptBox('Usa come base', 'Nome del nuovo progetto', p.name + ' v2'); if (n) { const r = await POST(`/api/projects/${id}/duplicate`, { name: n }); location.hash = '#/project/' + r.id; } } }, 'Usa come base per un nuovo progetto'))))));
  }

  // ---------------- VERSIONI ----------------
  function drawVersions() {
    const label = h('input', { type: 'text', placeholder: 'Descrizione della versione (es. "aggiunto menu")' });
    const bump = h('select', { style: { maxWidth: '220px' } }, h('option', { value: '' }, 'Numero di versione invariato'), h('option', { value: 'patch' }, 'Correzione (x.y.Z)'), h('option', { value: 'minor' }, 'Funzionalità (x.Y.0)'), h('option', { value: 'major' }, 'Cambiamento importante (X.0.0)'));
    const save = h('button.btn.primary', { onclick: () => run(save, async () => { const r = await POST(`/api/projects/${id}/versions`, { label: label.value, bump: bump.value || undefined }); toast('Versione salvata: v' + r.version); await reload(); drawVersions(); }) }, 'Salva versione');
    const diffBox = h('div');
    const opts = () => [h('option', { value: 'current' }, 'Stato attuale'), ...p.versions.map((v) => h('option', { value: v.id }, `${fmtDate(v.at)} — ${v.label}`))];
    const a = h('select', opts()); const b = h('select', opts());
    if (p.versions[0]) a.value = p.versions[0].id;
    const cmp = h('button.btn', { onclick: () => run(cmp, async () => {
      const r = await GET(`/api/projects/${id}/diff?a=${a.value}&b=${b.value}`);
      const changed = r.files.filter((f) => f.status !== 'same');
      clear(diffBox, changed.length ? changed.map((f) => h('div', { style: { marginBottom: '12px' } },
        h('h4', `${f.name} `, h('span.badge', { class: f.status === 'added' ? 'green' : f.status === 'removed' ? 'red' : 'amber' }, f.status === 'added' ? 'aggiunto' : f.status === 'removed' ? 'rimosso' : `+${f.diff.stats.added} −${f.diff.stats.removed}`)),
        h('div.diff', compactDiff(f.diff.ops)))) : h('div.empty', 'Nessuna differenza.'));
    }) }, 'Confronta');
    clear(body,
      h('div.panel', h('div.panel-title', 'Salva una versione'), h('div.row', label, bump, save)),
      h('div.panel', h('div.panel-title', 'Confronto tra versioni'), h('div.row', h('span', 'Da'), a, h('span', 'a'), b, cmp), h('div', { style: { marginTop: '12px' } }, diffBox)),
      h('div.panel', h('div.panel-title', `Cronologia versioni (${p.versions.length})`), p.versions.length ? h('div.table-wrap', h('table',
        h('thead', h('tr', h('th', 'Data'), h('th', 'Descrizione'), h('th', 'Ver.'), h('th', 'File'), h('th', ''))),
        h('tbody', p.versions.map((v) => h('tr', h('td.mono', fmtDate(v.at)), h('td', v.label), h('td.mono', v.version || ''), h('td', v.fileCount),
          h('td', h('button.btn.small', { onclick: async () => { if (await confirmBox('Ripristinare questa versione?', 'I file attuali verranno sostituiti. Lo stato attuale viene prima salvato come nuova versione.', 'Ripristina')) { await POST(`/api/projects/${id}/versions/${v.id}/restore`); toast('Versione ripristinata'); await reload(); drawVersions(); } } }, 'Ripristina'))))))) : h('div.dim', 'Nessuna versione salvata.')));
  }

  // ---------------- CONFIGURA BOT ----------------
  function drawBot() {
    const out = h('div.log', { style: { minHeight: '60px' } }, 'Risultati delle operazioni su Telegram…');
    const log = (text, cls = '') => { if (out.textContent.startsWith('Risultati')) out.textContent = ''; out.append(h('div', { class: cls }, `[${new Date().toLocaleTimeString('it-IT')}] ${text}`)); };
    const tokenIn = h('input', { type: 'password', placeholder: '123456789:AA…', autocomplete: 'off' });
    const setBtn = h('button.btn.primary', { onclick: () => run(setBtn, async () => { const r = await PUT(`/api/projects/${id}/bot/token`, { token: tokenIn.value }); tokenIn.value = ''; p.botToken = r; toast('Token salvato in forma cifrata'); drawBot(); }) }, 'Salva token cifrato');
    const act = (label, fn, cls = '') => { const b = h('button.btn', { class: cls, disabled: !p.botToken.set }); b.textContent = label; b.onclick = () => run(b, async () => { try { await fn(); } catch (e) { log(e.message, 'l-err'); throw e; } }); return b; };
    const desc = h('textarea', { rows: 3, placeholder: 'Testo mostrato prima di premere "Avvia" (max 512)', style: { fontFamily: 'var(--sans)' } }, p.description || '');
    const short = h('input', { type: 'text', placeholder: 'Descrizione breve nel profilo (max 120)' });
    clear(body, h('div.grid.cols-2',
      h('div', h('div.panel.warn', h('div.panel-title', 'Token del bot'),
        h('p', 'Il token viene cifrato (AES-256-GCM) e usato solo dal server per chiamare Telegram. Non viene mai mostrato, inserito nei file del progetto, nei log o nei prompt AI. Nel file .env del bot va inserito manualmente.'),
        h('p', 'Stato: ', p.botToken.set ? h('span.badge.green', `impostato · ${p.botToken.hint} · ${fmtDate(p.botToken.updatedAt)}`) : h('span.badge.amber', 'non impostato')),
        h('div.row', tokenIn, setBtn),
        p.botToken.set ? h('button.btn.small.danger', { style: { marginTop: '8px' }, onclick: async () => { if (await confirmBox('Rimuovere il token?', 'Il token cifrato verrà eliminato da RETRO BOT LAB.', 'Rimuovi', true)) { await DEL(`/api/projects/${id}/bot/token`); p.botToken = { set: false }; drawBot(); } } }, 'Rimuovi token') : null,
        h('p.dim', { style: { marginTop: '8px', fontSize: '0.85rem' } }, 'Non hai ancora un token? Segui la ', h('a', { href: '#/guide' }, 'Guida BotFather'), '.')),
      h('div.panel', h('div.panel-title', 'Operazioni su Telegram'), h('div.stack',
        h('div.row', act('✓ Verifica token (getMe)', async () => { const r = await POST(`/api/projects/${id}/bot/verify`); log(`Token valido: @${r.bot.username} (${r.bot.first_name}), id ${r.bot.id}; gruppi: ${r.bot.can_join_groups ? 'sì' : 'no'}; legge tutti i messaggi nei gruppi: ${r.bot.can_read_all_group_messages ? 'sì' : 'no'}`, 'l-ok'); }, 'primary')),
        h('div.row', act('☰ Registra comandi da config.json', async () => { const r = await POST(`/api/projects/${id}/bot/commands`); log('Comandi registrati: ' + r.commands.map((c) => '/' + c.command).join(' '), 'l-ok'); })),
        h('div.row', act('⌁ Stato webhook', async () => { const r = await GET(`/api/projects/${id}/bot/webhook`); log(`Webhook: ${r.info.url || '(nessuno: polling)'} · update in attesa: ${r.info.pending_update_count}${r.info.last_error_message ? ' · ultimo errore: ' + r.info.last_error_message : ''}`); }),
          act('Elimina webhook', async () => { await POST(`/api/projects/${id}/bot/webhook/delete`); log('Webhook eliminato: ora il bot può usare il polling', 'l-ok'); })))),
      h('div.panel', h('div.panel-title', 'Descrizioni del bot'), h('div.field', h('label', 'Descrizione'), desc), h('div.field', h('label', 'Descrizione breve'), short),
        act('Aggiorna descrizioni su Telegram', async () => { await POST(`/api/projects/${id}/bot/description`, { description: desc.value, shortDescription: short.value || undefined }); log('Descrizioni aggiornate', 'l-ok'); }))),
    h('div', h('div.panel', h('div.panel-title', 'Esito'), out),
      h('div.panel.explain', h('div.panel-title', 'Configurazione locale del bot'), h('p', 'Nella cartella del progetto copia .env.example in .env e compila:'),
        h('pre.log', 'BOT_TOKEN=<il tuo token>\nADMIN_IDS=<il tuo ID numerico>\nMODE=polling'),
        h('p.dim', 'Per l\'immagine del profilo usa /setuserpic in @BotFather (non disponibile via Bot API).')))));
  }

  // ---------------- TEST ----------------
  function drawTests() {
    const note = h('textarea', { rows: 3, placeholder: 'Esito, comandi provati, problemi riscontrati…', style: { fontFamily: 'var(--sans)' } });
    const mark = (s) => run(null, async () => { p = { ...p, ...(await PUT('/api/projects/' + id, { testStatus: s, testNote: note.value })) }; toast('Esito registrato'); drawHead(); drawTests(); });
    clear(body, h('div.grid.cols-2',
      h('div', h('div.panel', h('div.panel-title', 'Esegui i test'),
        h('ol', h('li', 'Verifica automatica: ', h('a', { href: `#/debug/project/${id}` }, 'Analisi del codice'), ' (sintassi, dipendenze, sicurezza).'),
          h('li', 'Prova funzionale senza Telegram: ', h('a', { href: `#/test/${id}` }, 'Simulatore + esecuzione nel sandbox'), '.'),
          h('li', 'Test automatici inclusi nel progetto: ', h('code', p.language === 'python' ? 'python -m unittest discover -s tests -v' : 'npm test'), '.'),
          h('li', 'Prova reale su Telegram con il token del bot.'))),
      h('div.panel', h('div.panel-title', 'Registra l\'esito'), note, h('div.row', { style: { marginTop: '8px' } },
        h('button.btn.primary', { onclick: () => mark('superati') }, '✓ Superati'), h('button.btn.amber', { onclick: () => mark('parziali') }, '◐ Parziali'), h('button.btn.danger', { onclick: () => mark('falliti') }, '✕ Falliti')),
        h('p.dim', { style: { fontSize: '0.85rem', marginTop: '8px' } }, 'L\'esito è dichiarato da te dopo aver eseguito le prove: RETRO BOT LAB non lo imposta mai automaticamente.'))),
      h('div.panel', h('div.panel-title', `Registro test — stato attuale: ${p.testStatus}`), p.testLog.length ? h('div.log', p.testLog.map((t) => h('div', h('span', { class: t.status === 'superati' ? 'l-ok' : t.status === 'falliti' ? 'l-err' : 'system' }, `${fmtDate(t.at)} ${t.status.toUpperCase()}`), t.note ? ' — ' + t.note : ''))) : h('div.dim', 'Nessun test registrato.'))));
  }

  // ---------------- DOCUMENTAZIONE ----------------
  function drawDocs() {
    const readme = p.files['README.md'];
    const exportDoc = () => {
      const md = `# ${p.name} — documentazione\n\nVersione ${p.version} · ${p.language} · ${p.library}\n\n${p.description || ''}\n\n${readme || ''}\n\n## Note\n\n${p.notes || '-'}\n\n## Cronologia\n\n${p.history.map((x) => `- ${x.at.slice(0, 16).replace('T', ' ')} ${x.text}`).join('\n')}\n`;
      download(`${p.name.replace(/[^\w-]+/g, '_')}-documentazione.md`, md, 'text/markdown;charset=utf-8');
    };
    import('../ui.js').then(({ markdown }) => {
      clear(body, h('div.row', { style: { marginBottom: '12px' } },
        h('button.btn', { onclick: exportDoc }, '⇩ Scarica documentazione (.md)'),
        readme ? h('button.btn', { onclick: () => copyText(readme, 'README') }, '⧉ Copia README') : null,
        h('a.btn', { href: `/api/projects/${id}/export.zip` }, '⇩ Progetto completo ZIP')),
      readme ? h('div.panel', markdown(readme)) : h('div.empty', 'Nessun README.md nel progetto.'));
    });
  }

  async function draw() {
    editor = null;
    if (tab === 'code') drawCode();
    else if (tab === 'overview') drawOverview();
    else if (tab === 'versions') drawVersions();
    else if (tab === 'bot') drawBot();
    else if (tab === 'tests') drawTests();
    else drawDocs();
  }

  drawHead(); drawTabs(); await draw();
  const beforeUnload = (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
  window.addEventListener('beforeunload', beforeUnload);
  return () => { editor?.flush(); window.removeEventListener('beforeunload', beforeUnload); };
}

function compactDiff(ops) {
  // mostra solo le righe modificate con 3 righe di contesto
  const keep = new Set();
  ops.forEach((o, i) => { if (o.t !== '=') for (let k = Math.max(0, i - 3); k <= Math.min(ops.length - 1, i + 3); k++) keep.add(k); });
  const out = [];
  let skipped = false;
  ops.forEach((o, i) => {
    if (!keep.has(i)) { if (!skipped) { out.push(h('div.ctx', '…')); skipped = true; } return; }
    skipped = false;
    out.push(h('div', { class: o.t === '+' ? 'add' : o.t === '-' ? 'del' : 'ctx' }, h('span.ln', `${o.a ?? ''}${o.t === '=' ? '' : ''} ${o.b ?? ''}`), `${o.t === '=' ? ' ' : o.t} ${o.line}`));
  });
  return out;
}

export { compactDiff };
void esc; void api;
