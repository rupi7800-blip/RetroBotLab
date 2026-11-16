import { h, clear, GET, POST, DEL, PUT, run, toast, toastErr, confirmBox, promptBox, fmtDate, storage, api } from '../ui.js';
import { viewHead } from '../app.js';

export async function render(main) {
  let filter = storage.get('projFilter', 'active');
  let q = '';
  const list = h('div');
  const fileInput = h('input', { type: 'file', accept: '.zip', class: 'hidden' });
  fileInput.addEventListener('change', async () => {
    const f = fileInput.files[0];
    if (!f) return;
    const fd = new FormData();
    fd.append('file', f, f.name);
    try {
      const r = await api('POST', '/api/projects/import', fd);
      toast(`Importati ${r.files} file`);
      location.hash = '#/project/' + r.id;
    } catch (e) { toastErr(e); }
    fileInput.value = '';
  });
  main.append(viewHead('Progetti', 'Ogni bot è un progetto indipendente con file, versioni, test e documentazione.',
    h('a.btn.primary', { href: '#/generator' }, '✚ Nuovo dal generatore'),
    h('button.btn', { onclick: blank }, '+ Progetto vuoto'),
    h('button.btn', { onclick: () => fileInput.click() }, '⇪ Importa ZIP'), fileInput));

  const search = h('input', { type: 'search', placeholder: 'Filtra per nome…', style: { maxWidth: '280px' } });
  search.addEventListener('input', () => { q = search.value.toLowerCase(); draw(); });
  const sel = h('select', { style: { maxWidth: '200px' } }, ['active:Attivi', 'archived:Archiviati', 'all:Tutti'].map((x) => { const [v, l] = x.split(':'); return h('option', { value: v, selected: v === filter }, l); }));
  sel.addEventListener('change', () => { filter = sel.value; storage.set('projFilter', filter); draw(); });
  main.append(h('div.row', { style: { marginBottom: '12px' } }, search, sel), list);

  let projects = [];
  async function load() { projects = (await GET('/api/projects')).projects; draw(); }

  async function blank() {
    const name = await promptBox('Nuovo progetto vuoto', 'Nome del progetto', 'Nuovo bot');
    if (!name) return;
    const lang = await promptBox('Linguaggio', 'Linguaggio principale (python, javascript, typescript, php, java, go, csharp)', 'python');
    if (!lang) return;
    const r = await POST('/api/projects', { name, language: lang.trim().toLowerCase(), files: { 'README.md': `# ${name}\n\nDescrivi qui il bot.\n` } });
    location.hash = '#/project/' + r.id;
  }

  function draw() {
    const items = projects.filter((p) => (filter === 'all' || (filter === 'archived' ? p.archived : !p.archived)) && (!q || `${p.name} ${p.description}`.toLowerCase().includes(q)));
    if (!items.length) { clear(list, h('div.empty', projects.length ? 'Nessun progetto corrisponde al filtro.' : 'Nessun progetto: crea il primo con il generatore.')); return; }
    clear(list, h('div.grid.auto', items.map((p) => h('div.panel', { style: { marginBottom: 0 } },
      h('div.row.between', h('h3', { style: { margin: 0 } }, h('a', { href: '#/project/' + p.id }, p.name)), p.archived ? h('span.badge.amber', 'archiviato') : h('span.badge', p.status)),
      h('p.dim', { style: { fontSize: '0.86rem', minHeight: '2.6em' } }, (p.description || '—').slice(0, 140)),
      h('div.mono.dim', { style: { fontSize: '12px' } }, `${p.language} · ${p.library || '—'} · v${p.version} · ${p.fileCount} file`),
      h('div.mono.dim', { style: { fontSize: '12px', marginBottom: '10px' } }, `Test: ${p.testStatus} · ${fmtDate(p.updatedAt)}`),
      h('div.row',
        h('a.btn.small.primary', { href: '#/project/' + p.id }, 'Apri'),
        h('button.btn.small', { onclick: async () => { const n = await promptBox('Duplica progetto', 'Nome della copia', p.name + ' (copia)'); if (n) { const r = await POST(`/api/projects/${p.id}/duplicate`, { name: n }); toast('Progetto duplicato'); location.hash = '#/project/' + r.id; } } }, 'Duplica'),
        h('a.btn.small', { href: `/api/projects/${p.id}/export.zip` }, 'ZIP'),
        h('button.btn.small', { onclick: (e) => run(e.currentTarget, async () => { await PUT('/api/projects/' + p.id, { archived: !p.archived }); toast(p.archived ? 'Ripristinato' : 'Archiviato'); load(); }) }, p.archived ? 'Ripristina' : 'Archivia'),
        h('button.btn.small.danger', { onclick: async () => { if (await confirmBox('Eliminare il progetto?', `"${p.name}" e tutte le sue versioni verranno eliminati definitivamente. Il token salvato verrà rimosso. Suggerimento: esporta prima lo ZIP.`, 'Elimina', true)) { await DEL('/api/projects/' + p.id); toast('Progetto eliminato'); load(); } } }, 'Elimina'))))));
  }
  await load();
}
