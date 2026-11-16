import { h, clear, GET, PUT, codeBlock, storage, toastErr } from '../ui.js';
import { viewHead, app } from '../app.js';

export async function render(main, params) {
  const data = await GET('/api/lessons');
  const progress = data.progress;
  const lessonId = params[0];

  if (!lessonId) {
    const done = Object.keys(progress).length;
    main.append(viewHead('Formazione', 'Percorso in quattro livelli, dal primo bot ai sistemi professionali. Ogni lezione contiene spiegazione, esempio, codice, esercizio con soluzione e link alla documentazione.'),
      h('div.panel', h('div.row.between', h('span', `Completate ${done} lezioni su ${data.lessons.length}`), h('span.mono', Math.round((done / data.lessons.length) * 100) + '%')),
        h('div.progress', { style: { marginTop: '8px' } }, h('div', { style: { width: (done / data.lessons.length) * 100 + '%' } }))),
      data.levels.map((lv) => h('div.panel', h('div.panel-title', `Livello ${lv.level} — ${lv.title}`), h('p.dim', lv.desc),
        h('div.grid.auto', data.lessons.filter((l) => l.level === lv.level).map((l) => h('a.tile', { href: '#/learn/' + l.id },
          h('span.t-title', (progress[l.id] ? '✓ ' : '') + l.title), h('span.t-desc', l.summary)))))));
    return;
  }

  const l = data.lessons.find((x) => x.id === lessonId);
  if (!l) { main.append(h('div.panel.danger', 'Lezione non trovata.')); return; }
  const idx = data.lessons.indexOf(l);
  let level = storage.get('explainLevel', app.settings?.explainLevel || 'simple');
  const explain = h('div');
  const drawExplain = () => clear(explain, h('div.panel.explain', h('div.panel-title', level === 'simple' ? 'Spiegazione semplice' : 'Approfondimento tecnico',
    h('button.btn.small', { onclick: () => { level = level === 'simple' ? 'technical' : 'simple'; storage.set('explainLevel', level); drawExplain(); } }, level === 'simple' ? 'Passa all\'approfondimento tecnico' : 'Passa alla spiegazione semplice')),
  h('p', level === 'simple' ? l.simple : l.advanced)));
  drawExplain();
  let codeLang = storage.get('lessonLang', 'python');
  const codeBox = h('div');
  const drawCode = () => clear(codeBox, h('div.tabs', ['python', 'javascript'].map((c) => h('button', { class: codeLang === c ? 'active' : '', onclick: () => { codeLang = c; storage.set('lessonLang', c); drawCode(); } }, c === 'python' ? 'Python (aiogram)' : 'JavaScript (grammY)'))),
    codeBlock(l.code[codeLang], codeLang === 'python' ? 'python' : 'js', 'Codice dimostrativo'));
  drawCode();
  const sol = h('div.hidden', h('pre.log', l.solution));
  const doneCb = h('input', { type: 'checkbox', checked: !!progress[l.id] });
  doneCb.addEventListener('change', async () => { try { await PUT('/api/lessons/progress', { id: l.id, done: doneCb.checked }); } catch (e) { toastErr(e); } });
  const prev = data.lessons[idx - 1], next = data.lessons[idx + 1];

  main.append(h('div.row', { style: { marginBottom: '8px' } }, h('a', { href: '#/learn' }, '← Tutte le lezioni'), h('span.badge', `Livello ${l.level}`)),
    viewHead(l.title, l.summary),
    explain,
    h('div.panel', h('div.panel-title', 'Esempio concreto'), h('p', { style: { whiteSpace: 'pre-wrap' } }, l.example)),
    h('div.panel.code-panel', h('div.panel-title', 'Codice'), codeBox),
    h('div.panel.warn', h('div.panel-title', 'Esercizio pratico'), h('p', l.exercise), h('button.btn.small', { onclick: (e) => { sol.classList.toggle('hidden'); e.currentTarget.textContent = sol.classList.contains('hidden') ? 'Mostra la soluzione' : 'Nascondi la soluzione'; } }, 'Mostra la soluzione'), sol),
    h('div.panel', h('div.panel-title', 'Documentazione'), h('ul', l.links.map((u) => h('li', h('a', { href: u, target: '_blank', rel: 'noopener noreferrer' }, u))))),
    h('div.row.between', h('label.inline', doneCb, 'Lezione completata'),
      h('div.row', prev ? h('a.btn', { href: '#/learn/' + prev.id }, '← ' + prev.title) : null, next ? h('a.btn.primary', { href: '#/learn/' + next.id }, next.title + ' →') : null)));
}
