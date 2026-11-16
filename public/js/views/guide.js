import { h, clear, GET, PUT, copyText, toastErr } from '../ui.js';
import { viewHead } from '../app.js';

export async function render(main) {
  const data = await GET('/api/guide');
  const progress = data.progress;
  main.append(viewHead('Guida: creare e configurare il bot', 'Tutorial interattivo dalla creazione con @BotFather alla manutenzione. Spunta i passaggi completati: il progresso viene salvato.'));
  const bar = h('div');
  const drawBar = () => {
    const done = data.steps.filter((s) => progress[s.id]).length;
    clear(bar, h('div.panel', h('div.row.between', h('span', `${done} passaggi su ${data.steps.length}`), h('span.mono', Math.round((done / data.steps.length) * 100) + '%')),
      h('div.progress', { style: { marginTop: '8px' } }, h('div', { style: { width: (done / data.steps.length) * 100 + '%' } }))));
  };
  drawBar();
  main.append(bar, h('div.panel.danger', h('strong', '⚠ Regola d\'oro: '), 'il token del bot non va mai scritto in chat pubbliche, nel codice sorgente o in un prompt AI. Va solo nel file .env o nel campo protetto "Configura bot" di un progetto.'));

  // schema del flusso
  main.append(h('div.panel', h('div.panel-title', 'Come si collegano le parti'),
    h('pre.log', { style: { textAlign: 'center', color: 'var(--green)' } },
      'Utente Telegram ──messaggio──▶ Server Telegram ──update──▶ Il tuo programma (bot)\n' +
      '        ▲                              │  getUpdates (polling) o webhook\n' +
      '        └──────── risposta ◀── sendMessage ◀──────────────┘\n\n' +
      '@BotFather ──▶ token ──▶ file .env (BOT_TOKEN) ──▶ letto dal programma all\'avvio')));

  let phase = null;
  for (const s of data.steps) {
    if (s.phase !== phase) { phase = s.phase; main.append(h('h2', { style: { marginTop: '18px' } }, phase)); }
    const cb = h('input', { type: 'checkbox', checked: !!progress[s.id], 'aria-label': 'Completato: ' + s.title });
    const card = h('div.panel', { class: progress[s.id] ? 'ok' : '' },
      h('div.row', cb, h('h3', { style: { margin: 0 } }, s.title)),
      h('p', { style: { marginTop: '8px' } }, s.text),
      s.command ? h('div.row', h('code.badge.green', s.command), h('button.btn.small', { onclick: () => copyText(s.command, 'Comando') }, 'Copia')) : null,
      s.example ? h('pre.log', s.example) : null,
      s.code ? h('pre.log', s.code) : null,
      s.warning ? h('div.panel.danger', { style: { marginTop: '8px', marginBottom: 0 } }, s.warning) : null,
      s.tip ? h('p.dim', { style: { fontSize: '0.85rem', marginBottom: 0 } }, s.tip) : null,
      s.link ? h('a', { href: s.link, target: '_blank', rel: 'noopener noreferrer' }, s.link) : null);
    cb.addEventListener('change', async () => {
      try { await PUT('/api/guide/progress', { id: s.id, done: cb.checked }); if (cb.checked) progress[s.id] = 1; else delete progress[s.id]; card.classList.toggle('ok', cb.checked); drawBar(); } catch (e) { toastErr(e); }
    });
    main.append(card);
  }
  main.append(h('div.panel.explain', h('p', { style: { margin: 0 } }, 'Prossimo passo: ', h('a', { href: '#/generator' }, 'genera il progetto del bot'), ' oppure ', h('a', { href: '#/learn' }, 'segui il percorso di formazione'), '.')));
}
