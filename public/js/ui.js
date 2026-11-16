// Utilità di interfaccia: chiamate API, costruzione DOM, notifiche, finestre, markdown sicuro, evidenziazione sintassi.

export async function api(method, url, body, { raw = false } = {}) {
  const opts = { method, headers: { 'X-RBL': '1' }, credentials: 'same-origin' };
  if (body instanceof FormData) opts.body = body;
  else if (body !== undefined) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  const res = await fetch(url, opts);
  if (raw) return res;
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { error: text }; }
  if (!res.ok) {
    if (res.status === 401 && !url.startsWith('/api/auth')) { location.hash = '#/login'; }
    const e = new Error(data.error || `Errore ${res.status}`);
    e.status = res.status; e.data = data;
    throw e;
  }
  return data;
}
export const GET = (u) => api('GET', u);
export const POST = (u, b) => api('POST', u, b ?? {});
export const PUT = (u, b) => api('PUT', u, b ?? {});
export const DEL = (u) => api('DELETE', u);

/** h('div.classe#id', {attr}, ...figli) */
export function h(tag, attrs, ...children) {
  const m = tag.match(/^([a-z0-9-]+)?((?:[.#][\w-]+)*)$/i);
  const el = document.createElement(m[1] || 'div');
  for (const part of (m[2] || '').match(/[.#][\w-]+/g) || []) {
    if (part[0] === '.') el.classList.add(part.slice(1)); else el.id = part.slice(1);
  }
  if (attrs && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) { children.unshift(attrs); attrs = null; }
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'class') el.className += ' ' + v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'value') el.value = v;
    else if (k === 'checked') el.checked = !!v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, children);
  return el;
}
function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}
export function clear(el, ...children) { el.replaceChildren(); append(el, children); return el; }

export function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ---------- notifiche ----------
export function toast(msg, type = 'ok', ms = 4200) {
  const t = h('div.toast', { class: type === 'ok' ? '' : type }, msg);
  document.getElementById('toasts').append(t);
  setTimeout(() => t.remove(), ms);
}
export function toastErr(e) { toast(e?.message || String(e), 'err', 7000); }

// ---------- finestre modali ----------
export function modal(title, body, actions = []) {
  return new Promise((resolve) => {
    const close = (v) => { back.remove(); document.removeEventListener('keydown', onKey); resolve(v); };
    const onKey = (e) => { if (e.key === 'Escape') close(null); };
    const back = h('div.modal-back', { onclick: (e) => { if (e.target === back) close(null); } },
      h('div.modal', { role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
        h('h2', title), body,
        h('div.actions', actions.map((a) => h('button.btn', { class: a.cls || '', onclick: () => close(a.value !== undefined ? (typeof a.value === 'function' ? a.value() : a.value) : a.label) }, a.label)))));
    document.body.append(back);
    document.addEventListener('keydown', onKey);
    const f = back.querySelector('input, textarea, select, .btn.primary');
    if (f) setTimeout(() => f.focus(), 30);
  });
}
export async function confirmBox(title, text, okLabel = 'Conferma', danger = false) {
  const r = await modal(title, h('p', text), [{ label: 'Annulla', value: false }, { label: okLabel, value: true, cls: danger ? 'danger' : 'primary' }]);
  return r === true;
}
export async function promptBox(title, label, value = '', { help = '', type = 'text' } = {}) {
  const input = h('input', { type, value });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') e.target.closest('.modal').querySelector('.btn.primary').click(); });
  const r = await modal(title, h('div.field', h('label', label), input, help ? h('div.help', help) : null),
    [{ label: 'Annulla', value: null }, { label: 'OK', cls: 'primary', value: () => input.value }]);
  return r === null ? null : r;
}

// ---------- copia / download ----------
export async function copyText(text, what = 'Testo') {
  try { await navigator.clipboard.writeText(text); toast(`${what} copiato negli appunti`); }
  catch {
    const ta = h('textarea', { style: { position: 'fixed', opacity: '0' } }, text);
    document.body.append(ta); ta.select();
    try { document.execCommand('copy'); toast(`${what} copiato negli appunti`); } catch { toast('Copia non riuscita: seleziona e copia manualmente', 'warn'); }
    ta.remove();
  }
}
export function download(name, content, type = 'text/plain;charset=utf-8') {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const a = h('a', { href: URL.createObjectURL(blob), download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

export function btnBusy(btn, busy, label) {
  if (busy) { btn.dataset.label = btn.innerHTML; btn.disabled = true; btn.innerHTML = `<span class="spin"></span> ${esc(label || 'Attendere…')}`; }
  else { btn.disabled = false; if (btn.dataset.label) btn.innerHTML = btn.dataset.label; }
}
/** Esegue una funzione asincrona mostrando lo stato sul pulsante e gli errori in un toast. */
export async function run(btn, fn, label) {
  if (btn) btnBusy(btn, true, label);
  try { return await fn(); } catch (e) { toastErr(e); return undefined; } finally { if (btn) btnBusy(btn, false); }
}

export const fmtDate = (s) => (s ? new Date(s).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' }) : '—');
export const fmtDay = (s) => (s ? new Date(s).toLocaleDateString('it-IT') : '—');

export const storage = {
  get(k, d) { try { const v = localStorage.getItem('rbl:' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('rbl:' + k, JSON.stringify(v)); } catch { /* archivio locale non disponibile */ } },
};

// ---------- evidenziazione sintassi ----------
const KW = {
  python: 'and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield match case None True False self',
  js: 'async await break case catch class const continue debugger default delete do else export extends finally for from function if import in instanceof let new of return static super switch this throw try typeof var void while yield null true false undefined type interface implements enum as readonly private public protected',
  php: 'abstract and array as break case catch class clone const continue declare default do echo else elseif empty endfor endforeach endif endwhile extends final finally fn for foreach function global if implements include include_once instanceof interface isset list namespace new or print private protected public require require_once return static switch throw trait try unset use var while yield null true false',
  go: 'break case chan const continue default defer else fallthrough for func go goto if import interface map package range return select struct switch type var nil true false',
  java: 'abstract assert boolean break byte case catch char class const continue default do double else enum extends final finally float for if implements import instanceof int interface long native new package private protected public return short static super switch synchronized this throw throws try void volatile while null true false var record',
  sh: 'if then else fi for do done while case esac function in export source cd echo sudo npm pip python python3 node git docker curl cp mv rm mkdir',
};
KW.ts = KW.js; KW.csharp = KW.java + ' using namespace async await string object bool';
const LANG_ALIAS = { py: 'python', python: 'python', js: 'js', javascript: 'js', mjs: 'js', cjs: 'js', ts: 'ts', typescript: 'ts', json: 'json', php: 'php', go: 'go', java: 'java', cs: 'csharp', csharp: 'csharp', bash: 'sh', sh: 'sh', shell: 'sh', console: 'sh', dockerfile: 'docker', docker: 'docker', yaml: 'yaml', yml: 'yaml', env: 'env', ini: 'env', toml: 'env', md: 'md', markdown: 'md', sql: 'sql', txt: 'txt', text: 'txt', caddyfile: 'txt' };
const SETS = {};
function kwSet(l) { return SETS[l] || (SETS[l] = new Set((KW[l] || '').split(' '))); }

export function langFromName(name) {
  const n = String(name || '').toLowerCase();
  if (n.endsWith('dockerfile')) return 'docker';
  if (n.endsWith('.env') || n.includes('.env.') || n.endsWith('.gitignore') || n.endsWith('.dockerignore')) return 'env';
  if (n.endsWith('requirements.txt')) return 'env';
  const ext = n.split('.').pop();
  return LANG_ALIAS[ext] || 'txt';
}

export function highlight(code, lang) {
  const L = LANG_ALIAS[String(lang || '').toLowerCase()] || lang || 'txt';
  const src = String(code ?? '');
  if (L === 'txt' || L === 'md' || src.length > 400000) return esc(src);
  let re;
  if (L === 'python') re = /(#[^\n]*)|("""[\s\S]*?"""|'''[\s\S]*?'''|[rbfRBF]{0,2}"(?:\\.|[^"\\\n])*"|[rbfRBF]{0,2}'(?:\\.|[^'\\\n])*')|(@[\w.]+)|(\b\d[\d_]*(?:\.\d+)?\b)|([A-Za-z_]\w*)(\s*\()?/g;
  else if (L === 'js' || L === 'ts' || L === 'java' || L === 'csharp' || L === 'go' || L === 'php') re = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/|#(?!\[)[^\n]*(?=\n|$)(?<=^[\s]*#[^\n]*))|(`(?:\\.|[^`\\])*`|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*')|(@[\w.]+)|(\b\d[\d_]*(?:\.\d+)?n?\b)|(\$?[A-Za-z_]\w*)(\s*\()?/gm;
  else if (L === 'json') re = /()("(?:\\.|[^"\\])*"(?=\s*:))|("(?:\\.|[^"\\])*")|(-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b)|(\btrue\b|\bfalse\b|\bnull\b)()/g;
  else if (L === 'sh' || L === 'docker' || L === 'yaml' || L === 'env') re = /(#[^\n]*)|("(?:\\.|[^"\\\n])*"|'[^'\n]*')|(^\s*[A-Za-z_][\w.-]*(?=\s*[=:])|\$\{?\w+\}?)|(\b\d+(?:\.\d+)*\b)|(\b[A-Za-z_][\w-]*\b)()/gm;
  else if (L === 'sql') re = /(--[^\n]*)|('(?:''|[^'])*')|()(\b\d+\b)|(\b[A-Za-z_]\w*\b)()/g;
  else return esc(src);
  const kws = L === 'docker' ? new Set('FROM RUN CMD COPY WORKDIR ENV EXPOSE USER ENTRYPOINT ARG ADD LABEL VOLUME'.split(' ')) : L === 'sql' ? new Set('SELECT FROM WHERE INSERT INTO VALUES UPDATE SET DELETE CREATE TABLE IF NOT EXISTS PRIMARY KEY INTEGER TEXT REAL NULL DEFAULT AND OR ORDER BY LIMIT ON CONFLICT DO AUTOINCREMENT COUNT AS'.split(' ')) : kwSet(L === 'ts' ? 'js' : L);
  let out = '', last = 0, m;
  re.lastIndex = 0;
  while ((m = re.exec(src))) {
    if (m[0] === '') { re.lastIndex++; continue; }
    out += esc(src.slice(last, m.index));
    last = m.index + m[0].length;
    const [all, com, str, deco, num, word, call] = m;
    if (L === 'json') {
      if (m[2]) out += `<span class="tok-f">${esc(m[2])}</span>`;
      else if (m[3]) out += `<span class="tok-s">${esc(m[3])}</span>`;
      else if (m[4]) out += `<span class="tok-n">${esc(m[4])}</span>`;
      else out += `<span class="tok-k">${esc(all)}</span>`;
      continue;
    }
    if (com) out += `<span class="tok-c">${esc(com)}</span>`;
    else if (str) out += `<span class="tok-s">${esc(str)}</span>`;
    else if (deco) out += `<span class="tok-d">${esc(deco)}</span>`;
    else if (num) out += `<span class="tok-n">${esc(num)}</span>`;
    else if (word) {
      const isKw = kws.has(word) || (L === 'sql' && kws.has(word.toUpperCase()));
      out += isKw ? `<span class="tok-k">${esc(word)}</span>` : call ? `<span class="tok-f">${esc(word)}</span>` : /^[A-Z][A-Za-z0-9_]*$/.test(word) && L !== 'env' && L !== 'sh' ? `<span class="tok-b">${esc(word)}</span>` : esc(word);
      if (call) out += esc(call);
    } else out += esc(all);
  }
  return out + esc(src.slice(last));
}

export function codeBlock(code, lang, title, extraButtons = []) {
  const pre = h('pre', h('code', { html: highlight(code, lang) }));
  return h('div.codeblock',
    h('div.cb-head', h('span', title || lang || 'codice'),
      h('span.row', ...extraButtons, h('button.btn.small.ghost', { onclick: () => copyText(code, 'Codice'), title: 'Copia' }, '⧉ Copia'))),
    pre);
}

// ---------- markdown sicuro ----------
function inline(s) {
  let t = esc(s);
  t = t.replace(/`([^`]+)`/g, (_, c) => `<code>${c}</code>`);
  t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  t = t.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|#[^\s)]*)\)/g, (_, txt, url) => `<a href="${url}" ${url.startsWith('#') ? '' : 'target="_blank" rel="noopener noreferrer"'}>${txt}</a>`);
  t = t.replace(/(^|[\s(])(https?:\/\/[^\s<)]+[^\s<).,;:])/g, '$1<a href="$2" target="_blank" rel="noopener noreferrer">$2</a>');
  t = t.replace(/\[DOCUMENTATO\]/g, '<span class="badge green">DOCUMENTATO</span>')
    .replace(/\[SUGGERIMENTO AI\]/g, '<span class="badge amber">SUGGERIMENTO AI</span>')
    .replace(/\[DA VERIFICARE\]/g, '<span class="badge blue">DA VERIFICARE</span>')
    .replace(/\[TESTATO\]/g, '<span class="badge">TESTATO? (dichiarato dall\'AI, non verificato)</span>');
  return t;
}

/** Converte markdown in DOM (l'HTML del testo viene sempre escapato). */
export function markdown(src, { onFile } = {}) {
  const root = h('div.md');
  const lines = String(src || '').replace(/\r\n/g, '\n').split('\n');
  let i = 0, pendingFile = null;
  while (i < lines.length) {
    const line = lines[i];
    const fence = line.match(/^\s*```\s*([\w+#.-]*)/);
    if (fence) {
      const buf = [];
      i++;
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) buf.push(lines[i++]);
      i++;
      const code = buf.join('\n');
      const lang = fence[1] || (pendingFile ? langFromName(pendingFile) : 'txt');
      const extra = pendingFile && onFile ? onFile(pendingFile, code) : [];
      root.append(codeBlock(code, lang, pendingFile || lang, extra));
      pendingFile = null;
      continue;
    }
    const fileHead = line.match(/^#{2,4}\s*File:\s*`?([^`\n]+?)`?\s*$/);
    if (fileHead) { pendingFile = fileHead[1].trim(); root.append(h('h4', { html: '📄 ' + esc(pendingFile) })); i++; continue; }
    const head = line.match(/^(#{1,4})\s+(.*)$/);
    if (head) { root.append(h('h' + Math.min(4, head[1].length + 1), { html: inline(head[2]) })); i++; continue; }
    if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
      const row = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const head2 = row(line);
      i += 2;
      const body = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) body.push(row(lines[i++]));
      root.append(h('div.table-wrap', h('table', h('thead', h('tr', head2.map((c) => h('th', { html: inline(c) })))), h('tbody', body.map((r) => h('tr', r.map((c) => h('td', { html: inline(c) }))))))));
      continue;
    }
    if (/^\s*([-*+]|\d+[.)])\s+/.test(line)) {
      const ordered = /^\s*\d/.test(line);
      const list = h(ordered ? 'ol' : 'ul');
      while (i < lines.length && /^\s*([-*+]|\d+[.)])\s+/.test(lines[i])) {
        list.append(h('li', { html: inline(lines[i].replace(/^\s*([-*+]|\d+[.)])\s+/, '')) }));
        i++;
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !/^\s*([-*+]|\d+[.)])\s+/.test(lines[i]) && !/^\s*```/.test(lines[i])) {
          list.lastChild.innerHTML += '<br>' + inline(lines[i].trim()); i++;
        }
      }
      root.append(list);
      continue;
    }
    if (/^>\s?/.test(line)) {
      const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ''));
      root.append(h('blockquote', { html: buf.map(inline).join('<br>') }));
      continue;
    }
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) { root.append(h('hr')); i++; continue; }
    if (!line.trim()) { i++; continue; }
    const buf = [line];
    i++;
    while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|\s*```|\s*([-*+]|\d+[.)])\s+|>|\s*\|)/.test(lines[i])) buf.push(lines[i++]);
    root.append(h('p', { html: buf.map(inline).join('<br>') }));
  }
  return root;
}

export const TOKEN_RE = /\b\d{6,12}:[A-Za-z0-9_-]{30,}\b/;
