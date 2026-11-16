import { h, clear, GET, POST, run, toast, markdown, copyText, download, storage, TOKEN_RE, confirmBox, toastErr } from '../ui.js';
import { viewHead } from '../app.js';

const OUTPUTS = [
  ['doc', 'Documento tecnico completo (13 sezioni)'],
  ['prompt', 'Prompt tecnico per un\'altra AI'],
  ['patch', 'Modifica a codice esistente (file completi aggiornati)'],
  ['terminal', 'Comandi da terminale e procedura'],
  ['db', 'Struttura di database'],
  ['config', 'Configurazioni API / deploy'],
  ['fix', 'Istruzioni per correggere un errore'],
];
const LANGS = ['Scegli tu (motiva la scelta)', 'Python', 'JavaScript', 'TypeScript', 'PHP', 'Java', 'C#', 'Go'];

export async function render(main) {
  const projects = (await GET('/api/projects')).projects.filter((p) => !p.archived);
  main.append(viewHead('Generatore di comandi per programmatori', 'Trasforma una richiesta in istruzioni tecniche precise, utilizzabili direttamente da un programmatore o da un\'altra intelligenza artificiale: obiettivo, librerie, file, codice completo, configurazioni, installazione, test ed errori possibili.'));

  const req = h('textarea', { rows: 6, placeholder: 'Es. "Aggiungi al mio bot un comando /report che ogni lunedì alle 8 invia agli admin il numero di nuovi utenti della settimana"', style: { fontFamily: 'var(--sans)', fontSize: '15px' } }, storage.get('cmdDraft', ''));
  req.addEventListener('input', () => storage.set('cmdDraft', req.value));
  const out = h('select', OUTPUTS.map(([v, l]) => h('option', { value: v }, l)));
  const lang = h('select', LANGS.map((l) => h('option', l)));
  const proj = h('select', h('option', { value: '' }, 'Nessuno'), projects.map((p) => h('option', { value: p.id }, `${p.name} (${p.language})`)));
  const web = h('input', { type: 'checkbox' });
  const result = h('div');
  const go = h('button.btn.primary', { onclick: () => generate() }, '⌘ Genera istruzioni');

  main.append(h('div.panel', h('div.panel-title', 'Richiesta'), req,
    h('div.grid.cols-3', { style: { marginTop: '10px' } },
      h('div.field', h('label', 'Tipo di risultato'), out), h('div.field', h('label', 'Linguaggio'), lang), h('div.field', h('label', 'Progetto esistente da modificare'), proj)),
    h('div.row.between', h('label.inline', web, 'Cerca esempi e soluzioni online (GitHub, Stack Overflow)'), go)), result);

  async function generate() {
    const text = req.value.trim();
    if (!text) return toast('Scrivi la richiesta', 'warn');
    if (TOKEN_RE.test(text)) toast('Il testo contiene un token: verrà rimosso prima dell\'invio', 'warn');
    const label = OUTPUTS.find(([v]) => v === out.value)[1];
    const prompt = `Tipo di risultato richiesto: ${label}.\nLinguaggio: ${lang.value}.\n${proj.value ? 'Il progetto esistente è allegato: preserva tutte le funzionalità non interessate dalla modifica e restituisci i file modificati completi.\n' : ''}\nRichiesta:\n${text}`;
    let includeFiles = [];
    if (proj.value) {
      const p = await GET('/api/projects/' + proj.value);
      includeFiles = Object.keys(p.files).filter((n) => !/\.(md|gitignore|dockerignore)$|^Dockerfile$/.test(n) && p.files[n].length < 60000);
    }
    await run(go, async () => {
      const r = await POST('/api/ai/chat', { task: 'code', messages: [{ role: 'user', content: prompt }], withWeb: web.checked, projectId: proj.value || undefined, includeFiles });
      show(r, proj.value);
    }, 'Generazione in corso…');
  }

  function show(r, projectId) {
    // suddivide il documento in sezioni "## N. Titolo" mostrate in pannelli distinti
    const parts = r.text.split(/\n(?=##\s+\d{1,2}\.)/);
    const intro = parts[0].startsWith('## ') ? null : parts.shift();
    const files = r.files || {};
    const checks = Object.fromEntries((r.fileChecks || []).map((c) => [c.file, c]));
    const names = Object.keys(files);
    const docName = `istruzioni-${new Date().toISOString().slice(0, 10)}.md`;
    clear(result,
      h('div.row', { style: { marginBottom: '10px' } },
        h('span.badge', `${r.provider} · ${r.model}`), r.redactions?.length ? h('span.badge.blue', 'credenziali rimosse dal prompt') : null, r.truncated ? h('span.badge.red', 'risposta troncata: chiedi il seguito') : null,
        h('span', { style: { flex: 1 } }),
        h('button.btn', { onclick: () => copyText(r.text, 'Documento') }, '⧉ Copia tutto'),
        h('button.btn', { onclick: () => download(docName, r.text, 'text/markdown;charset=utf-8') }, '⇩ Esporta .md')),
      intro?.trim() ? h('div.panel.explain', markdown(intro)) : null,
      parts.map((sec) => {
        const title = (sec.match(/^##\s+(.*)/) || [])[1] || 'Sezione';
        const isCode = /codice completo/i.test(title);
        return h('details.panel', { class: isCode ? 'code-panel' : 'explain', open: true },
          h('summary', { style: { cursor: 'pointer', fontFamily: 'var(--mono)', color: isCode ? 'var(--green)' : 'var(--amber)', fontWeight: 600 } }, title,
            h('button.btn.small.ghost', { style: { marginLeft: '8px' }, onclick: (e) => { e.preventDefault(); copyText(sec, 'Sezione'); } }, '⧉')),
          markdown(sec.replace(/^##\s+.*\n?/, '')));
      }),
      names.length ? h('div.panel.code-panel', h('div.panel-title', `File estratti (${names.length})`),
        h('table', h('tbody', names.map((n) => h('tr', h('td.mono', n), h('td', checks[n] ? (checks[n].ok === true ? h('span.badge.green', 'sintassi verificata') : checks[n].ok === false ? h('span.badge.red', `errore riga ${checks[n].line || '?'}`) : h('span.badge', 'non verificabile')) : h('span.badge', 'non verificato')),
          h('td', h('button.btn.small', { onclick: () => download(n.split('/').pop(), files[n]) }, 'Scarica')))))),
        projectId ? h('button.btn.primary', { style: { marginTop: '10px' }, onclick: async () => {
          if (!(await confirmBox('Applicare le modifiche?', `I file ${names.join(', ')} verranno scritti nel progetto. Prima viene salvata una versione per poter tornare indietro.`, 'Applica'))) return;
          try { await POST(`/api/projects/${projectId}/apply`, { files, label: 'Modifica dal Generatore comandi' }); toast('Modifiche applicate'); } catch (e) { toastErr(e); }
        } }, 'Applica i file al progetto') : null) : null,
      r.web?.length ? h('div.panel', h('div.panel-title', 'Fonti recuperate online'), h('ul', r.web.map((w) => h('li', h('a', { href: w.url, target: '_blank', rel: 'noopener noreferrer' }, w.title), ` — ${w.source} · ${String(w.updated || '').slice(0, 10)} · ${w.license || ''}`)))) : null);
    result.scrollIntoView({ behavior: 'smooth' });
  }
}
