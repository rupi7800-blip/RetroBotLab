// Editor di codice leggero: evidenziazione, numeri di riga, ricerca/sostituzione, indentazione, salvataggio automatico.
import { h, highlight, langFromName, toast } from './ui.js';

export function createEditor({ value = '', filename = '', onChange, onSave, readOnly = false } = {}) {
  const lang = () => langFromName(state.filename);
  const state = { filename, timer: null };
  const gutter = h('div.gutter', { 'aria-hidden': 'true' });
  const pre = h('pre', { 'aria-hidden': 'true' });
  const ta = h('textarea', { spellcheck: 'false', autocapitalize: 'off', autocomplete: 'off', 'aria-label': 'Editor di codice', wrap: 'off' });
  if (readOnly) ta.readOnly = true;
  ta.value = value;
  const area = h('div.area', pre, ta);
  const el = h('div.editor', gutter, area);

  // ricerca
  const findInput = h('input', { type: 'search', placeholder: 'Cerca nel file…', style: { maxWidth: '200px' }, 'aria-label': 'Cerca' });
  const replInput = h('input', { type: 'text', placeholder: 'Sostituisci con…', style: { maxWidth: '170px' }, class: 'adv', 'aria-label': 'Sostituisci' });
  const findInfo = h('span.savestate');
  const find = (dir = 1) => {
    const q = findInput.value;
    if (!q) return;
    const text = ta.value;
    const all = [];
    let p = text.indexOf(q);
    while (p !== -1) { all.push(p); p = text.indexOf(q, p + q.length); }
    if (!all.length) { findInfo.textContent = '0 risultati'; return; }
    const cur = ta.selectionStart;
    let idx = dir > 0 ? all.findIndex((x) => x > cur || (x === cur && ta.selectionEnd === cur)) : [...all].reverse().findIndex((x) => x < cur);
    if (dir < 0 && idx !== -1) idx = all.length - 1 - idx;
    if (idx === -1) idx = dir > 0 ? 0 : all.length - 1;
    ta.focus();
    ta.setSelectionRange(all[idx], all[idx] + q.length);
    const line = text.slice(0, all[idx]).split('\n').length;
    ta.scrollTop = Math.max(0, (line - 5) * lineHeight());
    sync();
    findInfo.textContent = `${idx + 1}/${all.length}`;
  };
  findInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); find(e.shiftKey ? -1 : 1); } });
  const replaceAll = () => {
    const q = findInput.value;
    if (!q || readOnly) return;
    const n = ta.value.split(q).length - 1;
    if (!n) return toast('Nessuna occorrenza', 'warn');
    ta.value = ta.value.split(q).join(replInput.value);
    render(); changed();
    toast(`${n} sostituzioni`);
  };
  const searchBar = h('span.row', findInput, h('button.btn.small', { onclick: () => find(-1), title: 'Precedente' }, '↑'), h('button.btn.small', { onclick: () => find(1), title: 'Successivo' }, '↓'), findInfo,
    readOnly ? null : replInput, readOnly ? null : h('button.btn.small.adv', { onclick: replaceAll }, 'Sostituisci tutto'));

  function lineHeight() { return parseFloat(getComputedStyle(ta).lineHeight) || 19.5; }
  function render() {
    pre.innerHTML = highlight(ta.value, lang()) + '\n';
    const n = ta.value.split('\n').length;
    gutter.textContent = Array.from({ length: n }, (_, i) => i + 1).join('\n') + '\n';
    sync();
  }
  function sync() {
    pre.scrollTop = ta.scrollTop; pre.scrollLeft = ta.scrollLeft;
    gutter.scrollTop = ta.scrollTop;
  }
  function changed() {
    if (onChange) onChange(ta.value);
    clearTimeout(state.timer);
    if (onSave) state.timer = setTimeout(() => onSave(ta.value), 1200);
  }
  ta.addEventListener('scroll', sync);
  ta.addEventListener('input', () => { render(); changed(); });
  ta.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); clearTimeout(state.timer); if (onSave) onSave(ta.value, true); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') { e.preventDefault(); findInput.focus(); findInput.select(); return; }
    if (readOnly) return;
    const indent = lang() === 'python' || lang() === 'php' || lang() === 'java' ? '    ' : '  ';
    if (e.key === 'Tab') {
      e.preventDefault();
      const { selectionStart: s, selectionEnd: en, value: v } = ta;
      if (s === en && !e.shiftKey) { ta.setRangeText(indent, s, en, 'end'); }
      else {
        const ls = v.lastIndexOf('\n', s - 1) + 1;
        const block = v.slice(ls, en);
        const nb = e.shiftKey ? block.replace(new RegExp(`^( {1,${indent.length}}|\\t)`, 'gm'), '') : block.replace(/^/gm, indent);
        ta.setRangeText(nb, ls, en, 'select');
      }
      render(); changed();
    } else if (e.key === 'Enter') {
      const { selectionStart: s, value: v } = ta;
      const ls = v.lastIndexOf('\n', s - 1) + 1;
      const cur = v.slice(ls, s);
      let ind = (cur.match(/^\s*/) || [''])[0];
      if (/[:{([]\s*$/.test(cur)) ind += indent;
      e.preventDefault();
      ta.setRangeText('\n' + ind, s, ta.selectionEnd, 'end');
      render(); changed();
    }
  });
  render();

  return {
    el, searchBar, textarea: ta,
    get value() { return ta.value; },
    set value(v) { ta.value = v; render(); },
    setFile(name, v) { state.filename = name; ta.value = v; ta.scrollTop = 0; ta.scrollLeft = 0; render(); },
    gotoLine(n) {
      const lines = ta.value.split('\n');
      const pos = lines.slice(0, Math.max(0, n - 1)).join('\n').length + (n > 1 ? 1 : 0);
      ta.focus(); ta.setSelectionRange(pos, pos + (lines[n - 1] || '').length);
      ta.scrollTop = Math.max(0, (n - 6) * lineHeight()); sync();
    },
    flush() { if (state.timer) { clearTimeout(state.timer); state.timer = null; if (onSave) onSave(ta.value); } },
  };
}
