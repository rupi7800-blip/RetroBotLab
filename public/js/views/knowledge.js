import { h, clear, GET, POST, run, toast, fmtDate, fmtDay, storage } from '../ui.js';
import { viewHead } from '../app.js';

const LEVEL_CLS = { info: '', nuovo: 'l-ok', avviso: 'system', modifica: 'system', errore: 'l-err' };

export async function render(main, params) {
  let tab = params[0] || storage.get('kTab', 'search');
  let k = await GET('/api/knowledge');
  const tabs = h('div.tabs');
  const body = h('div');
  main.append(viewHead('Database e risorse', 'Fonti ufficiali Telegram, documentazione delle librerie, repository e discussioni della comunità. Ogni informazione riporta fonte, link e data dell\'ultima verifica. Queste sono fonti consultabili (siti, API, archivi), non database strutturati, salvo dove indicato.'), tabs, body);

  const TABS = [['search', 'Ricerca'], ['sources', 'Fonti ufficiali'], ['libraries', 'Librerie a confronto'], ['updates', 'Aggiornamenti']];
  function drawTabs() { clear(tabs, TABS.map(([id, l]) => h('button', { class: tab === id ? 'active' : '', onclick: () => { tab = id; storage.set('kTab', id); drawTabs(); draw(); } }, l))); }

  const statusBadge = (c) => !c ? h('span.badge', 'non ancora verificato') : c.status === 'verificato' ? h('span.badge.green', `verificato ${fmtDay(c.verifiedAt)}`) : c.status === 'parzialmente verificato' ? h('span.badge.amber', { title: c.error || '' }, `parziale ${fmtDay(c.verifiedAt)}`) : h('span.badge.red', { title: c.error || '' }, c.status);

  // ---------------- RICERCA ----------------
  function drawSearch() {
    const q = h('input', { type: 'search', placeholder: 'Es. "webhook aiogram nginx", "prenotazioni calendario", "409 conflict"', value: storage.get('kQuery', '') });
    const provs = Object.entries(k.providers).map(([id, p]) => {
      const cb = h('input', { type: 'checkbox', value: id, checked: storage.get('kProv', ['local', 'github', 'stackoverflow']).includes(id) });
      return h('label.inline', cb, p.label);
    });
    const lang = h('select', { style: { maxWidth: '180px' } }, ['', 'python', 'javascript', 'typescript', 'php', 'java', 'go', 'csharp'].map((l) => h('option', { value: l }, l || 'Tutti i linguaggi')));
    const out = h('div');
    const go = h('button.btn.primary', { onclick: () => run(go, async () => {
      const providers = provs.map((l) => l.querySelector('input')).filter((c) => c.checked).map((c) => c.value);
      storage.set('kProv', providers); storage.set('kQuery', q.value);
      const r = await GET(`/api/knowledge/search?q=${encodeURIComponent(q.value)}&providers=${providers.join(',')}&language=${lang.value}`);
      clear(out, r.errors.length ? h('div.panel.warn', r.errors.map((e) => h('div', `${e.label}: ${e.error}`))) : null,
        r.results.length ? h('div.table-wrap', h('table', h('thead', h('tr', h('th', 'Risorsa'), h('th', 'Fonte'), h('th', 'Aggiornata'), h('th', 'Linguaggio / versione'), h('th', 'Licenza'), h('th', 'Stato'))),
          h('tbody', r.results.map((x) => h('tr',
            h('td', h('a', { href: x.url, target: x.internal || x.url?.startsWith('#') ? null : '_blank', rel: 'noopener noreferrer' }, x.title), h('br'), h('small.dim', (x.snippet || '').slice(0, 180))),
            h('td', h('span.badge', { class: x.priority <= 2 ? 'green' : x.priority >= 5 ? 'amber' : '' }, x.source), h('br'), h('small.dim', x.sourceType)),
            h('td.mono', { style: { fontSize: '12px' } }, x.updated ? fmtDay(x.updated) : '—'),
            h('td', [x.language, x.version ? 'v' + x.version : null, x.stars !== undefined ? `★ ${x.stars}` : null].filter(Boolean).join(' · ') || '—'),
            h('td', x.license || '—'),
            h('td', x.maintenance ? h('span.badge', { class: x.maintenance === 'attivo' ? 'green' : /archiv|non mant/.test(x.maintenance) ? 'red' : 'amber' }, x.maintenance) : x.answered !== undefined ? h('span.badge', { class: x.answered ? 'green' : '' }, x.answered ? 'con risposta' : 'senza risposta') : '—',
              h('br'), h('small.faint', `verifica: ${fmtDate(x.checkedAt)}`))))))) : h('div.empty', 'Nessun risultato.'),
        h('p.dim', { style: { fontSize: '0.82rem', marginTop: '8px' } }, 'Priorità: documentazione ufficiale Telegram → documentazione dei framework → repository mantenuti → documentazione tecnica → comunità. Rispetta le licenze prima di riutilizzare codice: senza licenza dichiarata il codice non è riutilizzabile liberamente.'));
    }, 'Ricerca…') }, 'Cerca');
    q.addEventListener('keydown', (e) => { if (e.key === 'Enter') go.click(); });
    clear(body, h('div.panel', h('div.row', q, lang, go), h('div.row', { style: { marginTop: '8px' } }, provs),
      !k.githubToken ? h('p.dim', { style: { fontSize: '0.82rem', margin: '6px 0 0' } }, 'GitHub senza token consente poche ricerche al minuto: imposta GITHUB_TOKEN (token in sola lettura) nel file .env del server per limiti più alti.') : null), out);
  }

  // ---------------- FONTI ----------------
  function drawSources() {
    const groups = {};
    for (const s of k.sources) (groups[s.type] ||= []).push(s);
    clear(body, Object.entries(groups).sort((a, b) => a[1][0].priority - b[1][0].priority).map(([type, list]) => h('div.panel', h('div.panel-title', type),
      h('div.table-wrap', h('table', h('tbody', list.map((s) => h('tr',
        h('td', h('a', { href: s.url, target: '_blank', rel: 'noopener noreferrer' }, s.title), s.desc ? h('div.dim', { style: { fontSize: '0.85rem' } }, s.desc) : null),
        h('td.mono.dim', { style: { fontSize: '12px' } }, s.lang || ''),
        h('td', statusBadge(s.check), s.check?.changedAt ? h('div', h('span.badge.amber', `modificata ${fmtDay(s.check.changedAt)}`)) : null)))))))));
  }

  // ---------------- LIBRERIE ----------------
  function drawLibraries() {
    const langs = [...new Set(k.libraries.map((l) => l.lang))];
    clear(body,
      h('div.panel.explain', h('p', { style: { margin: 0 } }, 'Versioni, licenze e stato di manutenzione vengono letti dai registri (PyPI, npm, Packagist, NuGet) e dall\'API di GitHub. I valori senza data di verifica sono indicativi. Tutte le librerie elencate sono open source e gratuite.')),
      langs.map((lang) => h('div.panel', h('div.panel-title', lang), h('div.table-wrap', h('table',
        h('thead', h('tr', h('th', 'Libreria'), h('th', 'Ultima versione'), h('th', 'Licenza'), h('th', 'Manutenzione'), h('th', 'Punti di forza'), h('th', 'Limiti'), h('th', 'Ideale per'))),
        h('tbody', k.libraries.filter((l) => l.lang === lang).map((l) => {
          const c = l.check || {};
          return h('tr',
            h('td', h('a', { href: l.docs, target: '_blank', rel: 'noopener noreferrer' }, l.name), h('br'), h('a.dim', { href: `https://github.com/${l.repo}`, target: '_blank', rel: 'noopener noreferrer', style: { fontSize: '12px' } }, l.repo)),
            h('td.mono', c.version ? `${c.version}` : '—', c.published ? h('div.dim', { style: { fontSize: '11px' } }, fmtDay(c.published)) : null),
            h('td', c.license || h('span', { title: 'Valore di partenza, da verificare' }, `${l.license} *`)),
            h('td', c.maintenance ? h('span.badge', { class: c.maintenance === 'attivo' ? 'green' : /archiv|non mant/.test(c.maintenance) ? 'red' : 'amber' }, c.maintenance) : '—', h('div', statusBadge(l.check))),
            h('td', h('ul', { style: { margin: 0, paddingLeft: '1em', fontSize: '0.85rem' } }, l.pros.map((x) => h('li', x)))),
            h('td', h('ul', { style: { margin: 0, paddingLeft: '1em', fontSize: '0.85rem' } }, l.cons.map((x) => h('li', x)))),
            h('td', { style: { fontSize: '0.85rem' } }, l.best));
        })))))),
      h('p.dim', '* licenza non ancora verificata dall\'aggiornamento automatico.'));
  }

  // ---------------- AGGIORNAMENTI ----------------
  function drawUpdates() {
    const api = k.botApi;
    const btn = (scope, label) => { const b = h('button.btn', { class: scope === 'all' ? 'primary' : '', disabled: k.running }, label); b.onclick = () => run(b, async () => { await POST('/api/knowledge/update', { scope }); toast('Controllo avviato'); k.running = true; draw(); waitDone(); }); return b; };
    clear(body,
      h('div.grid.cols-2',
        h('div.panel', { class: api?.status === 'verificato' ? 'ok' : 'warn' }, h('div.panel-title', 'Telegram Bot API'),
          api?.version ? [h('p', h('span.mono', { style: { fontSize: '1.6rem', color: 'var(--green)' } }, 'v' + api.version), api.published ? ` · pubblicata il ${fmtDay(api.published)}` : ''),
            h('p.dim', `Verificata il ${fmtDate(api.verifiedAt)} da `, h('a', { href: api.url, target: '_blank', rel: 'noopener noreferrer' }, 'api-changelog')),
            api.highlights?.length ? h('details', h('summary', 'Novità principali'), h('ul', { style: { fontSize: '0.88rem' } }, api.highlights.map((x) => h('li', x)))) : null]
            : h('p', 'Versione non ancora verificata.', api?.error ? h('span.dim', ` Ultimo tentativo: ${api.error}`) : '')),
        h('div.panel', h('div.panel-title', 'Controllo delle fonti'),
          h('p', 'Ultimo controllo completo: ', h('strong', fmtDate(k.lastCheck)), k.running ? h('span.badge.blue', { style: { marginLeft: '8px' } }, 'in corso…') : null),
          h('div.row', btn('all', '⟳ Aggiorna tutto'), btn('botapi', 'Solo Bot API'), btn('libraries', 'Solo librerie'), btn('sources', 'Solo link e pagine')),
          h('p.dim', { style: { fontSize: '0.85rem', marginTop: '8px' } }, 'Il controllo automatico si attiva all\'avvio e periodicamente (impostabile). Le nuove versioni vengono segnalate ma non applicate automaticamente ai progetti: il generatore usa una versione più recente solo se della stessa versione maggiore collaudata.'),
          k.versions?.notes?.length ? h('div.panel.warn', { style: { marginTop: '8px' } }, k.versions.notes.map((n) => h('div', n))) : null)),
      h('div.panel', h('div.panel-title', 'Registro degli aggiornamenti'), k.log.length ? h('div.log', { style: { maxHeight: '480px' } }, k.log.map((l) => h('div', { class: LEVEL_CLS[l.level] || '' }, `${fmtDate(l.at)} [${l.level}] ${l.text}`))) : h('div.dim', 'Nessun controllo eseguito.')));
  }

  let waitTimer = null;
  async function waitDone() {
    clearTimeout(waitTimer);
    k = await GET('/api/knowledge');
    if (tab === 'updates') drawUpdates();
    if (k.running) waitTimer = setTimeout(waitDone, 2500);
    else toast('Controllo delle fonti completato');
  }

  function draw() { if (tab === 'search') drawSearch(); else if (tab === 'sources') drawSources(); else if (tab === 'libraries') drawLibraries(); else drawUpdates(); }
  drawTabs(); draw();
  if (k.running) waitDone();
  return () => clearTimeout(waitTimer);
}
