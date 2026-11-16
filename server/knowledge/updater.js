'use strict';
// Aggiornamento automatico delle conoscenze: versioni Bot API, librerie, licenze, manutenzione, link, modifiche documentazione.
// I risultati vengono registrati con data di verifica; nulla viene sostituito automaticamente nei progetti.
const crypto = require('node:crypto');
const store = require('../store');
const { SOURCES, LIBRARIES } = require('./sources');
const { fetchText, fetchJson } = require('./net');

let running = null;

function log(level, text) {
  store.update((d) => {
    d.knowledge.log.unshift({ at: new Date().toISOString(), level, text });
    d.knowledge.log = d.knowledge.log.slice(0, 500);
  });
}

function setItem(id, data) {
  store.update((d) => { d.knowledge.items[id] = { ...(d.knowledge.items[id] || {}), ...data }; });
}

const MONTHS = { January: 1, February: 2, March: 3, April: 4, May: 5, June: 6, July: 7, August: 8, September: 9, October: 10, November: 11, December: 12 };

/** Estrae l'ultima versione della Bot API dalla pagina changelog. */
function parseChangelog(html) {
  const text = html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
  const v = text.match(/Bot API (\d+\.\d+(?:\.\d+)?)/);
  if (!v) return null;
  const before = text.slice(0, v.index);
  const dates = [...before.matchAll(/(January|February|March|April|May|June|July|August|September|October|November|December) (\d{1,2}), (\d{4})/g)];
  const last = dates.pop();
  const date = last ? `${last[3]}-${String(MONTHS[last[1]]).padStart(2, '0')}-${String(last[2]).padStart(2, '0')}` : null;
  // elenco sintetico delle novità (prime voci dopo il titolo della versione)
  const after = html.slice(html.indexOf(v[0]));
  const items = [...after.slice(0, 20000).matchAll(/<li>([\s\S]*?)<\/li>/g)].slice(0, 12).map((m) => m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()).filter(Boolean);
  return { version: v[1], date, highlights: items };
}

async function checkBotApi() {
  const id = 'bot-api';
  try {
    const r = await fetchText('https://core.telegram.org/bots/api-changelog');
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const info = parseChangelog(r.text);
    if (!info) throw new Error('versione non trovata nella pagina');
    const prev = store.db().knowledge.items[id];
    if (prev && prev.version && prev.version !== info.version) {
      log('nuovo', `Nuova versione della Bot API: ${prev.version} → ${info.version}. Verificare la compatibilità di librerie ed esempi prima di aggiornare i progetti.`);
    }
    setItem(id, { kind: 'botapi', title: 'Telegram Bot API', version: info.version, published: info.date, highlights: info.highlights, url: 'https://core.telegram.org/bots/api-changelog', verifiedAt: new Date().toISOString(), status: 'verificato', error: null });
    return info;
  } catch (e) {
    setItem(id, { kind: 'botapi', title: 'Telegram Bot API', url: 'https://core.telegram.org/bots/api-changelog', status: 'non verificato', error: e.message, lastAttempt: new Date().toISOString() });
    log('errore', `Bot API: controllo non riuscito (${e.message})`);
    return null;
  }
}

async function registryVersion(lib) {
  switch (lib.registry) {
    case 'pypi': {
      const j = await fetchJson(`https://pypi.org/pypi/${encodeURIComponent(lib.pkg)}/json`);
      const files = j.releases?.[j.info.version] || [];
      return { version: j.info.version, published: files[0]?.upload_time_iso_8601 || null, requires: j.info.requires_python || null, registryUrl: `https://pypi.org/project/${lib.pkg}/` };
    }
    case 'npm': {
      const j = await fetchJson(`https://registry.npmjs.org/${encodeURIComponent(lib.pkg)}`);
      const v = j['dist-tags']?.latest;
      return { version: v, published: j.time?.[v] || null, deprecated: j.versions?.[v]?.deprecated || null, registryUrl: `https://www.npmjs.com/package/${lib.pkg}` };
    }
    case 'packagist': {
      const j = await fetchJson(`https://repo.packagist.org/p2/${lib.pkg}.json`);
      const list = j.packages?.[lib.pkg] || [];
      const stable = list.find((x) => !/dev|alpha|beta|rc/i.test(x.version)) || list[0];
      return { version: stable?.version?.replace(/^v/, ''), published: stable?.time || null, registryUrl: `https://packagist.org/packages/${lib.pkg}` };
    }
    case 'nuget': {
      const j = await fetchJson(`https://api.nuget.org/v3-flatcontainer/${lib.pkg.toLowerCase()}/index.json`);
      const stable = (j.versions || []).filter((v) => !v.includes('-'));
      return { version: stable[stable.length - 1], published: null, registryUrl: `https://www.nuget.org/packages/${lib.pkg}` };
    }
    default: {
      const j = await fetchJson(`https://api.github.com/repos/${lib.repo}/releases/latest`);
      return { version: String(j.tag_name).replace(/^v/, ''), published: j.published_at, registryUrl: j.html_url };
    }
  }
}

function maintenance(pushedAt, archived) {
  if (archived) return 'archiviato';
  if (!pushedAt) return 'sconosciuto';
  const days = (Date.now() - new Date(pushedAt).getTime()) / 86400000;
  if (days > 730) return 'non mantenuto (nessuna attività da oltre 2 anni)';
  if (days > 365) return 'attività ridotta (oltre 1 anno)';
  return 'attivo';
}

async function checkLibrary(lib) {
  const id = 'lib:' + lib.id;
  const prev = store.db().knowledge.items[id] || {};
  const data = { kind: 'library', title: lib.name, lang: lib.lang, url: lib.docs, lastAttempt: new Date().toISOString() };
  const errors = [];
  try {
    Object.assign(data, await registryVersion(lib));
  } catch (e) { errors.push('versione: ' + e.message); }
  try {
    const repo = await fetchJson(`https://api.github.com/repos/${lib.repo}`);
    Object.assign(data, {
      license: repo.license?.spdx_id && repo.license.spdx_id !== 'NOASSERTION' ? repo.license.spdx_id : (repo.license?.name || null),
      pushedAt: repo.pushed_at, archived: !!repo.archived, stars: repo.stargazers_count, openIssues: repo.open_issues_count,
      repoUrl: repo.html_url, maintenance: maintenance(repo.pushed_at, repo.archived),
    });
    if (repo.archived) log('avviso', `${lib.name}: il repository risulta archiviato. Valutare alternative.`);
  } catch (e) { errors.push('repository: ' + e.message); }
  if (data.version && prev.version && data.version !== prev.version) {
    log('nuovo', `${lib.name}: nuova versione ${prev.version} → ${data.version}. I progetti esistenti non vengono modificati automaticamente.`);
  }
  if (data.deprecated) log('avviso', `${lib.name}: la versione ${data.version} è segnata come deprecata su npm (${data.deprecated}).`);
  data.status = errors.length === 0 ? 'verificato' : data.version || data.license ? 'parzialmente verificato' : 'non verificato';
  data.error = errors.join('; ') || null;
  if (data.status !== 'non verificato') data.verifiedAt = new Date().toISOString();
  setItem(id, data);
  if (errors.length) log('errore', `${lib.name}: ${data.error}`);
  return data;
}

function normalizePage(html) {
  return html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

async function checkSource(src) {
  const id = 'src:' + src.id;
  try {
    const r = await fetchText(src.url);
    const data = { kind: 'source', title: src.title, url: src.url, httpStatus: r.status, lastAttempt: new Date().toISOString() };
    if (!r.ok) {
      data.status = 'link non funzionante';
      data.error = 'HTTP ' + r.status;
      log('errore', `${src.title}: link non raggiungibile (HTTP ${r.status})`);
    } else {
      data.status = 'verificato';
      data.error = null;
      data.verifiedAt = new Date().toISOString();
      if (src.monitor) {
        const h = crypto.createHash('sha256').update(normalizePage(r.text)).digest('hex');
        const prevHash = store.db().knowledge.pageHashes[src.id];
        if (prevHash && prevHash !== h) {
          data.changedAt = new Date().toISOString();
          log('modifica', `${src.title}: la pagina è stata modificata dall'ultimo controllo.`);
        }
        store.update((d) => { d.knowledge.pageHashes[src.id] = h; });
      }
    }
    setItem(id, data);
  } catch (e) {
    setItem(id, { kind: 'source', title: src.title, url: src.url, status: 'non verificato', error: e.message, lastAttempt: new Date().toISOString() });
    log('errore', `${src.title}: ${e.message}`);
  }
}

/** Esegue il controllo completo. scope: 'all' | 'botapi' | 'libraries' | 'sources' */
function runUpdate(scope = 'all', reason = 'manuale') {
  if (running) return running;
  running = (async () => {
    const started = Date.now();
    log('info', `Controllo fonti avviato (${reason}, ambito: ${scope})`);
    if (scope === 'all' || scope === 'botapi') await checkBotApi();
    if (scope === 'all' || scope === 'libraries') {
      for (const lib of LIBRARIES) await checkLibrary(lib);
    }
    if (scope === 'all' || scope === 'sources') {
      const list = SOURCES.filter((s) => !s.repo);
      for (let i = 0; i < list.length; i += 5) await Promise.all(list.slice(i, i + 5).map(checkSource));
    }
    const items = Object.values(store.db().knowledge.items);
    const ok = items.filter((x) => x.status === 'verificato').length;
    store.update((d) => { d.knowledge.lastCheck = new Date().toISOString(); });
    log('info', `Controllo completato in ${Math.round((Date.now() - started) / 1000)}s: ${ok}/${items.length} voci verificate.`);
    return { ok, total: items.length };
  })().finally(() => { running = null; });
  return running;
}

function isRunning() { return !!running; }

/** Versioni note da usare nella generazione (verificate se disponibili, altrimenti valori di base collaudati). */
// Versioni con cui il codice generato è stato collaudato. Una versione più recente viene usata come minimo
// solo se appartiene alla stessa versione maggiore (stessa API); un cambio di versione maggiore viene
// segnalato ma NON applicato automaticamente.
const TESTED = { aiogram: '3.32.0', grammy: '1.46.0' };
function knownVersions() {
  const items = store.db().knowledge.items;
  const pick = (name) => {
    const v = items['lib:' + name]?.version;
    if (!v || !/^\d+\.\d+/.test(v)) return { version: TESTED[name], note: null };
    if (v.split('.')[0] !== TESTED[name].split('.')[0]) return { version: TESTED[name], note: `Disponibile ${name} ${v} (nuova versione maggiore): non applicata automaticamente, il codice è collaudato con ${TESTED[name]}.` };
    return { version: v, note: null };
  };
  const a = pick('aiogram'), g = pick('grammy');
  return { aiogram: a.version, grammy: g.version, botApi: items['bot-api']?.version || null, notes: [a.note, g.note].filter(Boolean), tested: TESTED };
}

let timer = null;
function schedule(hours) {
  clearInterval(timer);
  if (!hours || hours <= 0) return;
  timer = setInterval(() => {
    if (store.db().settings.autoUpdate) runUpdate('all', 'automatico').catch(() => {});
  }, hours * 3600_000);
  timer.unref();
}

module.exports = { runUpdate, isRunning, schedule, knownVersions, parseChangelog, maintenance, checkBotApi };
