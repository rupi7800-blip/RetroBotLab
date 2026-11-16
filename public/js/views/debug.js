import { h, clear, GET, POST, api, run, toast, toastErr, markdown, codeBlock, langFromName, copyText, download, confirmBox, storage } from '../ui.js';
import { viewHead } from '../app.js';

export async function render(main, params) {
  const projects = (await GET('/api/projects')).projects.filter((p) => !p.archived);
  let projectId = params[0] === 'project' ? params[1] : '';
  let files = {};
  let last = null;

  main.append(viewHead('Analisi, debug e correzione errori', 'Incolla codice, carica file o un progetto ZIP, aggiungi i log del terminale o descrivi il malfunzionamento. L\'analisi statica è immediata e non esegue il codice; l\'analisi approfondita usa l\'AI.'));

  const projSel = h('select', h('option', { value: '' }, '— nessun progetto —'), projects.map((p) => h('option', { value: p.id, selected: p.id === projectId }, p.name)));
  projSel.addEventListener('change', () => { projectId = projSel.value; drawFiles(); });
  const fileList = h('div');
  const pasteName = h('input', { type: 'text', placeholder: 'nome file (es. main.py)', style: { maxWidth: '220px' } });
  const pasteCode = h('textarea', { rows: 8, placeholder: 'Incolla qui il codice…' });
  const addPaste = h('button.btn', { onclick: () => {
    if (!pasteCode.value.trim()) return toast('Incolla del codice', 'warn');
    const n = pasteName.value.trim() || guessName(pasteCode.value);
    files[n] = pasteCode.value; pasteCode.value = ''; pasteName.value = ''; drawFiles();
  } }, '+ Aggiungi file incollato');
  const upload = h('input', { type: 'file', multiple: true, class: 'hidden' });
  upload.addEventListener('change', async () => {
    const fd = new FormData();
    for (const f of upload.files) fd.append('file', f, f.name);
    try { const r = await api('POST', '/api/analyze/upload', fd); Object.assign(files, r.files); toast(`${Object.keys(r.files).length} file caricati`); drawFiles(); } catch (e) { toastErr(e); }
    upload.value = '';
  });
  const logs = h('textarea', { rows: 6, placeholder: 'Incolla qui l\'output del terminale o il messaggio di errore (traceback, stack trace)…' });
  const desc = h('textarea', { rows: 3, placeholder: 'Descrivi il problema: es. "il bot non risponde nei gruppi"', style: { fontFamily: 'var(--sans)' } });
  const results = h('div');
  const aiOut = h('div');
  const analyzeBtn = h('button.btn.primary', { onclick: () => analyze() }, '⚠ Analizza');
  const aiBtn = h('button.btn.blue', { onclick: () => analyzeAi() }, '◉ Analisi approfondita con AI');

  main.append(h('div.grid.cols-2',
    h('div.panel', h('div.panel-title', '1 · Codice'),
      h('div.field', h('label', 'Progetto salvato'), projSel),
      h('div.row', { style: { marginBottom: '8px' } }, h('button.btn', { onclick: () => upload.click() }, '⇪ Carica file o ZIP'), upload),
      h('div.field', h('label', 'Oppure incolla il codice'), h('div.row', { style: { marginBottom: '6px' } }, pasteName, addPaste), pasteCode),
      fileList),
    h('div', h('div.panel', h('div.panel-title', '2 · Log ed errori'), logs),
      h('div.panel', h('div.panel-title', '3 · Descrizione del malfunzionamento'), desc),
      h('div.row', analyzeBtn, aiBtn))),
  results, aiOut);

  function guessName(code) {
    if (/^\s*(from|import)\s+\w+|def \w+\(|async def /m.test(code)) return `file${Object.keys(files).length + 1}.py`;
    if (/<\?php/.test(code)) return `file${Object.keys(files).length + 1}.php`;
    if (/^package \w+/m.test(code)) return `file${Object.keys(files).length + 1}.go`;
    if (/:\s*(string|number|boolean)\b|interface \w+/.test(code)) return `file${Object.keys(files).length + 1}.ts`;
    return `file${Object.keys(files).length + 1}.js`;
  }

  function drawFiles() {
    const names = Object.keys(files);
    clear(fileList, projectId ? h('p.dim', 'Verranno analizzati tutti i file del progetto selezionato', names.length ? ' più i file aggiunti qui sotto.' : '.') : null,
      names.length ? h('table', h('tbody', names.map((n) => h('tr', h('td.mono', n), h('td.dim', `${files[n].split('\n').length} righe`), h('td', h('button.btn.small.danger', { onclick: () => { delete files[n]; drawFiles(); } }, '✕')))))) : null);
  }
  drawFiles();

  async function analyze() {
    if (!projectId && !Object.keys(files).length && !logs.value.trim() && !desc.value.trim()) return toast('Aggiungi codice, log o una descrizione', 'warn');
    await run(analyzeBtn, async () => {
      last = await POST('/api/analyze', { files, logs: logs.value, description: desc.value, projectId: projectId || undefined });
      drawResults();
    }, 'Analisi…');
  }

  function drawResults() {
    const r = last;
    const s = r.summary;
    const report = toMarkdown(r);
    clear(results, h('div.panel', { class: s.critico || s.alto ? 'danger' : s.medio ? 'warn' : 'ok' },
      h('div.panel-title', 'Risultato dell\'analisi statica', h('span.row', h('button.btn.small', { onclick: () => copyText(report, 'Report') }, '⧉ Copia'), h('button.btn.small', { onclick: () => download('analisi-debug.md', report, 'text/markdown;charset=utf-8') }, '⇩ Esporta'))),
      h('div.row', ['critico', 'alto', 'medio', 'basso', 'info'].map((k) => h('span.badge', { class: 'sev-' + k }, `${k}: ${s[k]}`)), h('span.dim', `${r.analyzedFiles} file analizzati`)),
      r.syntax.length ? h('div.table-wrap', { style: { marginTop: '10px' } }, h('table', h('thead', h('tr', h('th', 'File'), h('th', 'Controllo di sintassi'), h('th', 'Strumento'))),
        h('tbody', r.syntax.map((x) => h('tr', h('td.mono', x.file), h('td', x.ok === true ? h('span.badge.green', 'OK') : x.ok === false ? h('span.badge.red', `errore riga ${x.line || '?'}`) : h('span.badge', 'non verificabile')), h('td.dim', x.tool)))))) : null,
      !r.findings.length ? h('p', { style: { marginTop: '10px' } }, 'Nessun problema rilevato dalle regole statiche. Questo non garantisce l\'assenza di errori logici: prova il bot nel simulatore o usa l\'analisi AI.') : null),
    r.findings.map(findingCard));
  }

  function findingCard(f) {
    const canApply = f.fixedCode && projectId && f.file;
    return h('div.finding', { class: 's-' + f.severity },
      h('div.row.between', h('strong', f.title), h('span.row', h('span.badge', { class: 'sev-' + f.severity }, f.severity), h('span.badge', f.category), h('span.badge.adv', f.origin))),
      h('dl',
        f.file ? [h('dt', 'File / punto'), h('dd.mono', f.file + (f.line ? ` : riga ${f.line}` : ''), projectId && f.file && f.line ? h('a', { href: `#/project/${projectId}/code/${f.line}/${encodeURIComponent(f.file)}`, style: { marginLeft: '8px' } }, 'apri nell\'editor') : null)] : null,
        f.snippet ? [h('dt', 'Codice'), h('dd', h('code', f.snippet))] : null,
        f.description && f.description !== f.title ? [h('dt', 'Descrizione'), h('dd', f.description)] : null,
        f.cause ? [h('dt', 'Causa probabile'), h('dd', f.cause)] : null,
        f.solution ? [h('dt', 'Soluzione consigliata'), h('dd', f.solution)] : null,
        f.verify ? [h('dt', 'Verifica'), h('dd', f.verify)] : null,
        f.source ? [h('dt', 'Fonte'), h('dd', h('a', { href: f.source, target: '_blank', rel: 'noopener noreferrer' }, f.source))] : null),
      f.fixedCode ? h('details', { style: { marginTop: '8px' } }, h('summary', { style: { cursor: 'pointer' } }, 'Codice corretto proposto ', f.fixVerified === true ? h('span.badge.green', 'sintassi verificata') : f.fixVerified === false ? h('span.badge.red', 'sintassi non valida') : null),
        codeBlock(f.fixedCode, langFromName(f.file), f.file),
        canApply ? h('button.btn.small.primary', { onclick: async () => {
          if (!(await confirmBox('Applicare la correzione?', `${f.file} verrà sostituito. Prima viene salvata una versione del progetto.`, 'Applica'))) return;
          try { await POST(`/api/projects/${projectId}/apply`, { files: { [f.file]: f.fixedCode }, label: `Correzione: ${f.title}` }); toast('Correzione applicata: riesegui l\'analisi per verificare'); } catch (e) { toastErr(e); }
        } }, 'Applica al progetto') : null) : null);
  }

  async function analyzeAi() {
    const allFiles = { ...(projectId ? (await GET('/api/projects/' + projectId)).files : {}), ...files };
    const relevant = Object.fromEntries(Object.entries(allFiles).filter(([n, c]) => !/\.(md|gitignore|dockerignore)$/.test(n) && c.length < 60000));
    if (!Object.keys(relevant).length && !logs.value.trim() && !desc.value.trim()) return toast('Aggiungi codice, log o una descrizione', 'warn');
    if (!last) { last = await POST('/api/analyze', { files, logs: logs.value, description: desc.value, projectId: projectId || undefined }); drawResults(); }
    const findingsText = last.findings.slice(0, 30).map((f) => `- [${f.severity}] ${f.title}${f.file ? ` (${f.file}${f.line ? ':' + f.line : ''})` : ''}: ${f.solution}`).join('\n') || 'nessuna';
    const prompt = `Risultati dell'analisi statica già eseguita:\n${findingsText}\n\nDescrizione del problema:\n${desc.value || '(non fornita)'}\n\nLog / errori:\n\`\`\`\n${logs.value.slice(0, 30000) || '(nessuno)'}\n\`\`\`\n\nFile:\n${Object.entries(relevant).map(([n, c]) => `### File: ${n}\n\`\`\`\n${c}\n\`\`\``).join('\n\n')}`;
    await run(aiBtn, async () => {
      const r = await POST('/api/ai/chat', { task: 'debug', messages: [{ role: 'user', content: prompt }] });
      const checks = Object.fromEntries((r.fileChecks || []).map((c) => [c.file, c]));
      const names = Object.keys(r.files || {});
      clear(aiOut, h('div.panel.explain', h('div.panel-title', 'Analisi approfondita AI', h('span.row', h('span.badge', `${r.provider} · ${r.model}`), r.redactions?.length ? h('span.badge.blue', 'credenziali rimosse') : null,
        h('button.btn.small', { onclick: () => download('analisi-ai.md', r.text, 'text/markdown;charset=utf-8') }, '⇩ Esporta'))),
      markdown(r.text)),
      names.length ? h('div.panel.code-panel', h('div.panel-title', 'File corretti proposti dall\'AI'),
        h('table', h('tbody', names.map((n) => h('tr', h('td.mono', n), h('td', checks[n]?.ok === true ? h('span.badge.green', 'sintassi verificata') : checks[n]?.ok === false ? h('span.badge.red', `sintassi non valida (riga ${checks[n].line})`) : h('span.badge', 'non verificato')),
          h('td', h('button.btn.small', { onclick: () => download(n.split('/').pop(), r.files[n]) }, 'Scarica')))))),
        h('p.dim', 'Stato: correzione proposta, NON ancora verificata con test. Applicala, riesegui l\'analisi e prova il bot nel simulatore.'),
        projectId ? h('button.btn.primary', { onclick: async () => {
          if (!(await confirmBox('Applicare i file corretti?', 'Prima viene salvata una versione del progetto.', 'Applica'))) return;
          try { await POST(`/api/projects/${projectId}/apply`, { files: r.files, label: 'Correzioni proposte dall\'analisi AI' }); toast('File applicati. Riesegui l\'analisi.'); } catch (e) { toastErr(e); }
        } }, 'Applica al progetto') : null) : null);
      aiOut.scrollIntoView({ behavior: 'smooth' });
    }, 'Analisi AI in corso…');
  }

  if (projectId && storage.get('autoAnalyze', true)) analyze();
}

function toMarkdown(r) {
  const lines = [`# Report di analisi — ${new Date(r.at).toLocaleString('it-IT')}`, '', `File analizzati: ${r.analyzedFiles}`, '', '## Sintassi', ''];
  for (const s of r.syntax) lines.push(`- ${s.file}: ${s.ok === true ? 'OK' : s.ok === false ? `ERRORE riga ${s.line}: ${s.error}` : 'non verificabile'} (${s.tool})`);
  lines.push('', '## Segnalazioni', '');
  r.findings.forEach((f, i) => {
    lines.push(`### ${i + 1}. ${f.title}`, '', `- Gravità: ${f.severity}`, `- Categoria: ${f.category}`);
    if (f.file) lines.push(`- File: ${f.file}${f.line ? ' riga ' + f.line : ''}`);
    if (f.cause) lines.push(`- Causa probabile: ${f.cause}`);
    if (f.solution) lines.push(`- Soluzione: ${f.solution}`);
    if (f.verify) lines.push(`- Verifica: ${f.verify}`);
    if (f.source) lines.push(`- Fonte: ${f.source}`);
    lines.push('');
  });
  return lines.join('\n');
}
