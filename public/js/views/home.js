import { h, GET, fmtDate } from '../ui.js';
import { viewHead } from '../app.js';

const TILES = [
  { href: '#/generator', ico: '✚', title: 'Nuovo progetto', desc: 'Scegli un modello e genera un bot completo, pronto da avviare.' },
  { href: '#/projects', ico: '▤', title: 'Progetti salvati', desc: 'Apri, modifica, duplica, esporta e archivia i tuoi bot.' },
  { href: '#/assistant', ico: '◉', title: 'Assistente AI', desc: 'Descrivi il bot a parole: ricevi proposta tecnica e codice.' },
  { href: '#/commands', ico: '⌘', title: 'Generatore di codice', desc: 'Istruzioni tecniche strutturate per programmatori o altre AI.' },
  { href: '#/debug', ico: '⚠', title: 'Correzione errori', desc: 'Analizza codice, log e configurazioni e ottieni le correzioni.' },
  { href: '#/test', ico: '▶', title: 'Strumenti di verifica', desc: 'Simulatore Telegram e esecuzione isolata dei progetti.' },
  { href: '#/knowledge', ico: '◈', title: 'Documentazione e risorse', desc: 'Fonti ufficiali, librerie, ricerca su GitHub e Stack Overflow.' },
  { href: '#/learn', ico: '✎', title: 'Formazione', desc: 'Percorso in 4 livelli, dal primo bot ai sistemi professionali.' },
  { href: '#/guide', ico: '☰', title: 'Guida BotFather', desc: 'Crea il bot, ottieni il token e collegalo, passo dopo passo.' },
  { href: '#/settings', ico: '⚙', title: 'Impostazioni', desc: 'Fornitori AI, sicurezza, backup, aggiornamenti.' },
];

const STATUS_BADGE = { bozza: '', 'in sviluppo': 'blue', testato: 'green', pubblicato: 'green', manutenzione: 'amber' };

export async function render(main) {
  const d = await GET('/api/dashboard');
  const k = d.knowledge;
  main.append(viewHead('Control Center', 'Descrivi cosa vuoi ottenere: RETRO BOT LAB lo traduce in progetto tecnico, codice funzionante e procedure concrete.'));

  const setup = [];
  if (!d.ai.configured) setup.push(h('li', 'Nessun fornitore AI configurato: generatore, simulatore, analisi e formazione funzionano comunque; per l\'assistente AI vai in ', h('a', { href: '#/settings' }, 'Impostazioni'), '.'));
  if (!k.lastCheck) setup.push(h('li', 'Le fonti non sono ancora state verificate: apri ', h('a', { href: '#/knowledge/updates' }, 'Database e risorse → Aggiornamenti'), '.'));
  if (setup.length) main.append(h('div.panel.warn', h('div.panel-title', 'Configurazione'), h('ul', { style: { margin: 0, paddingLeft: '1.2em' } }, setup)));

  main.append(h('div.grid.auto', { style: { marginBottom: '18px' } }, TILES.map((t) => h('a.tile', { href: t.href }, h('span.t-ico', t.ico), h('span.t-title', t.title), h('span.t-desc', t.desc)))));

  const recent = h('div.panel', h('div.panel-title', 'Progetti recenti', h('a.btn.small', { href: '#/projects' }, 'Tutti')),
    d.recent.length ? h('div.table-wrap', h('table', h('thead', h('tr', h('th', 'Progetto'), h('th', 'Linguaggio'), h('th', 'Stato'), h('th', 'Test'), h('th', 'Modificato'))),
      h('tbody', d.recent.map((p) => h('tr', h('td', h('a', { href: '#/project/' + p.id }, p.name)), h('td.mono', `${p.language} · ${p.library || '—'}`),
        h('td', h('span.badge', { class: STATUS_BADGE[p.status] || '' }, p.status)), h('td', h('span.badge', { class: p.testStatus === 'superati' ? 'green' : p.testStatus === 'falliti' ? 'red' : '' }, p.testStatus)),
        h('td.dim', fmtDate(p.updatedAt)))))))
      : h('div.empty', 'Nessun progetto. ', h('a', { href: '#/generator' }, 'Crea il primo bot →')));

  const status = h('div.panel', h('div.panel-title', 'Stato del sistema'),
    h('table', h('tbody',
      h('tr', h('td', h('span.led', { class: d.ai.configured ? 'on' : 'warn' }), 'Motore AI'), h('td', d.ai.configured ? `${d.ai.configured} fornitore/i attivi` : 'non configurato')),
      h('tr', h('td', h('span.led', { class: k.botApi?.status === 'verificato' ? 'on' : 'warn' }), 'Telegram Bot API'), h('td', k.botApi?.version ? `v${k.botApi.version} · verificata ${fmtDate(k.botApi.verifiedAt)}` : 'versione non ancora verificata')),
      h('tr', h('td', h('span.led', { class: k.lastCheck ? 'on' : 'warn' }), 'Ultimo controllo fonti'), h('td', k.running ? 'in corso…' : fmtDate(k.lastCheck))),
      h('tr', h('td', h('span.led', { class: d.sandbox.enabled ? 'on' : 'warn' }), 'Ambiente di test'), h('td', d.sandbox.enabled ? `attivo${d.sandbox.namespaces ? ' · isolamento namespace' : ''}${d.sandbox.prlimit ? ' · limiti risorse' : ''}` : 'esecuzione disattivata (SANDBOX_EXEC=off)')),
      h('tr', h('td', h('span.led', { class: d.simulator.sessions ? 'blue' : '' }), 'Simulatore'), h('td', `${d.simulator.sessions} sessioni attive`)),
      h('tr', h('td', 'Progetti'), h('td', `${d.counts.projects} attivi · ${d.counts.archived} archiviati · ${d.counts.tested} con test superati`)))),
    k.news.length ? h('div', { style: { marginTop: '10px' } }, h('h4', 'Novità dalle fonti'), h('ul', { style: { margin: 0, paddingLeft: '1.2em', fontSize: '0.88rem' } }, k.news.map((n) => h('li', `${fmtDate(n.at)} — ${n.text}`)))) : null);

  const activity = h('div.panel', h('div.panel-title', 'Ultime attività'),
    d.activity.length ? h('ul', { style: { margin: 0, paddingLeft: '1.1em', fontSize: '0.88rem' } }, d.activity.map((a) => h('li', h('span.dim.mono', fmtDate(a.at) + ' '), a.projectId ? h('a', { href: '#/project/' + a.projectId }, a.text) : a.text)))
      : h('div.dim', 'Nessuna attività registrata.'));

  main.append(h('div.grid.cols-2', h('div', recent, activity), status));
}
