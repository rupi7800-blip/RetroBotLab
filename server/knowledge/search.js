'use strict';
// Motore di ricerca delle risorse: indice locale + GitHub, GitLab, Codeberg, Stack Overflow, npm.
// Ogni risultato riporta fonte, collegamento, data di aggiornamento, linguaggio, licenza e data di verifica.
const store = require('../store');
const { SOURCES, LIBRARIES } = require('./sources');
const { fetchJson } = require('./net');
const { maintenance } = require('./updater');
const KB = require('../analyzer/errors-kb');
const lessons = require('../lessons');

const cache = new Map(); // chiave -> { at, data }
const TTL = 3600_000;

const PROVIDERS = {
  local: { label: 'Indice locale', type: 'indice interno' },
  github: { label: 'GitHub', type: 'repository' },
  gitlab: { label: 'GitLab', type: 'repository' },
  codeberg: { label: 'Codeberg', type: 'repository' },
  stackoverflow: { label: 'Stack Overflow', type: 'discussioni della comunità' },
  npm: { label: 'npm', type: 'registro pacchetti' },
};

const LANG_MAP = { python: 'Python', javascript: 'JavaScript', typescript: 'TypeScript', php: 'PHP', java: 'Java', go: 'Go', csharp: 'C#' };

function decodeEntities(s) {
  return String(s || '').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function tokens(q) {
  return String(q).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9_.+#-]+/).filter((t) => t.length > 1);
}

function score(text, toks) {
  const t = String(text).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  return toks.reduce((s, k) => s + (t.includes(k) ? 1 + (t.split(k).length - 2) * 0.2 : 0), 0);
}

function searchLocal(q, language) {
  const toks = tokens(q);
  if (!toks.length) return [];
  const items = store.db().knowledge.items;
  const now = new Date().toISOString();
  const out = [];
  for (const s of SOURCES) {
    const sc = score(`${s.title} ${s.desc || ''} ${s.type} ${s.lang || ''}`, toks);
    if (sc > 0) {
      const it = items['src:' + s.id] || {};
      out.push({ title: s.title, url: s.url, source: 'Catalogo fonti', sourceType: s.type, priority: s.priority, snippet: s.desc || '', language: s.lang || null,
        updated: it.changedAt || null, verifiedAt: it.verifiedAt || null, status: it.status || 'non ancora verificato', score: sc + (6 - s.priority) });
    }
  }
  for (const l of LIBRARIES) {
    if (language && LANG_MAP[language] && !l.lang.includes(LANG_MAP[language])) continue;
    const sc = score(`${l.name} ${l.lang} ${l.pros.join(' ')} ${l.best}`, toks);
    if (sc > 0) {
      const it = items['lib:' + l.id] || {};
      out.push({ title: `${l.name} (libreria ${l.lang})`, url: l.docs, source: 'Catalogo librerie', sourceType: 'libreria', priority: 2, snippet: l.best, language: l.lang,
        version: it.version || null, license: it.license || l.license + ' (da verificare)', updated: it.published || null, verifiedAt: it.verifiedAt || null, maintenance: it.maintenance || null, score: sc + 3 });
    }
  }
  for (const e of KB) {
    const sc = score(`${e.title} ${e.cause} ${e.category}`, toks);
    if (sc > 0) out.push({ title: e.title, url: e.source, source: 'Errori noti', sourceType: 'soluzione documentata', priority: 2, snippet: e.solution, score: sc + 2, verifiedAt: null });
  }
  for (const l of lessons.LESSONS) {
    const sc = score(`${l.title} ${l.summary} ${l.simple}`, toks);
    if (sc > 0) out.push({ title: `Lezione: ${l.title}`, url: `#/learn/${l.id}`, source: 'Formazione', sourceType: 'lezione interna', priority: 3, snippet: l.summary, score: sc + 1, internal: true });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 25).map((r) => ({ ...r, provider: 'local', checkedAt: now }));
}

async function searchGithub(q, language) {
  const parts = [q, 'telegram bot'];
  if (language && LANG_MAP[language]) parts.push(`language:"${LANG_MAP[language]}"`);
  const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(parts.join(' '))}&per_page=15`;
  const j = await fetchJson(url, { headers: { Accept: 'application/vnd.github+json' } });
  return (j.items || []).map((r) => ({
    title: r.full_name, url: r.html_url, source: 'GitHub', sourceType: 'repository', priority: r.archived ? 6 : 3, snippet: r.description || '',
    language: r.language, license: r.license?.spdx_id && r.license.spdx_id !== 'NOASSERTION' ? r.license.spdx_id : r.license ? 'licenza non standard' : 'nessuna licenza dichiarata',
    stars: r.stargazers_count, updated: r.pushed_at, created: r.created_at, maintenance: maintenance(r.pushed_at, r.archived), topics: r.topics || [],
  }));
}

async function searchGitlab(q) {
  const j = await fetchJson(`https://gitlab.com/api/v4/projects?search=${encodeURIComponent('telegram ' + q)}&order_by=last_activity_at&per_page=15&simple=true`);
  return (j || []).map((r) => ({
    title: r.name_with_namespace, url: r.web_url, source: 'GitLab', sourceType: 'repository', priority: 3, snippet: r.description || '',
    language: null, license: 'da verificare sul repository', stars: r.star_count, updated: r.last_activity_at, maintenance: maintenance(r.last_activity_at, false),
  }));
}

async function searchCodeberg(q) {
  const j = await fetchJson(`https://codeberg.org/api/v1/repos/search?q=${encodeURIComponent('telegram ' + q)}&limit=15&sort=updated&order=desc`);
  return (j.data || []).map((r) => ({
    title: r.full_name, url: r.html_url, source: 'Codeberg', sourceType: 'repository', priority: r.archived ? 6 : 3, snippet: r.description || '',
    language: r.language || null, license: 'da verificare sul repository', stars: r.stars_count, updated: r.updated_at, maintenance: maintenance(r.updated_at, r.archived),
  }));
}

async function searchStackOverflow(q) {
  const j = await fetchJson(`https://api.stackexchange.com/2.3/search/advanced?order=desc&sort=relevance&q=${encodeURIComponent(q)}&tagged=telegram-bot&site=stackoverflow&pagesize=15`);
  return (j.items || []).map((r) => ({
    title: decodeEntities(r.title), url: r.link, source: 'Stack Overflow', sourceType: 'discussione della comunità', priority: 5,
    snippet: `${r.is_answered ? 'Con risposta' : 'Senza risposta accettata'} · punteggio ${r.score} · tag: ${(r.tags || []).join(', ')}`,
    license: 'CC BY-SA (contenuti Stack Overflow)', updated: new Date(r.last_activity_date * 1000).toISOString(), answered: r.is_answered,
  }));
}

async function searchNpm(q) {
  const j = await fetchJson(`https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent('telegram ' + q)}&size=15`);
  return (j.objects || []).map((o) => ({
    title: o.package.name, url: o.package.links?.npm || `https://www.npmjs.com/package/${o.package.name}`, source: 'npm', sourceType: 'pacchetto', priority: 4,
    snippet: o.package.description || '', version: o.package.version, license: o.package.license || 'da verificare', updated: o.package.date, language: 'JavaScript',
  }));
}

const REMOTE = { github: searchGithub, gitlab: searchGitlab, codeberg: searchCodeberg, stackoverflow: searchStackOverflow, npm: searchNpm };

/** Cerca su più fornitori in parallelo. Gli errori di un fornitore non bloccano gli altri. */
async function search(q, { providers = ['local', 'github', 'stackoverflow'], language = '' } = {}) {
  const query = String(q || '').trim().slice(0, 200);
  if (!query) return { query, results: [], errors: [] };
  const errors = [];
  const results = [];
  const now = new Date().toISOString();
  await Promise.all(providers.map(async (p) => {
    if (p === 'local') { results.push(...searchLocal(query, language)); return; }
    if (!REMOTE[p]) return;
    const key = `${p}|${language}|${query.toLowerCase()}`;
    const c = cache.get(key);
    if (c && Date.now() - c.at < TTL) { results.push(...c.data); return; }
    try {
      const data = (await REMOTE[p](query, language)).map((r) => ({ ...r, provider: p, checkedAt: now }));
      cache.set(key, { at: Date.now(), data });
      results.push(...data);
    } catch (e) {
      errors.push({ provider: p, label: PROVIDERS[p].label, error: e.message });
    }
  }));
  // ordinamento: priorità della fonte, poi manutenzione, poi aggiornamento recente
  const recency = (r) => (r.updated ? new Date(r.updated).getTime() : 0);
  results.sort((a, b) => (a.provider === 'local') !== (b.provider === 'local') ? (a.provider === 'local' ? -1 : 1) : (a.priority - b.priority) || (b.score || 0) - (a.score || 0) || recency(b) - recency(a));
  return { query, results, errors, providers };
}

module.exports = { search, searchLocal, PROVIDERS };
