'use strict';
// Richieste HTTP verso fonti esterne: timeout, user-agent generico, nessuna credenziale dell'utente
// tranne GITHUB_TOKEN (se configurato) inviato solo ad api.github.com.
const config = require('../config');

const UA = 'RetroBotLab/1.0 (+https://github.com/; knowledge updater)';

async function fetchText(url, { headers = {}, timeout = config.HTTP_TIMEOUT_MS, method = 'GET' } = {}) {
  const h = { 'User-Agent': UA, Accept: '*/*', ...headers };
  if (config.GITHUB_TOKEN && new URL(url).hostname === 'api.github.com') h.Authorization = `Bearer ${config.GITHUB_TOKEN}`;
  let res;
  try {
    res = await fetch(url, { method, headers: h, redirect: 'follow', signal: AbortSignal.timeout(timeout) });
  } catch (e) {
    throw new Error(`${new URL(url).hostname} non raggiungibile (${e.cause?.code || e.name})`);
  }
  const text = method === 'HEAD' ? '' : await res.text();
  return { status: res.status, ok: res.ok, text, headers: res.headers, url: res.url };
}

async function fetchJson(url, opts = {}) {
  const r = await fetchText(url, { ...opts, headers: { Accept: 'application/json', ...(opts.headers || {}) } });
  if (!r.ok) {
    const e = new Error(`HTTP ${r.status} da ${new URL(url).hostname}${githubHint(r.status, url)}`);
    e.status = r.status;
    throw e;
  }
  return JSON.parse(r.text);
}

function githubHint(status, url) {
  if (!url.includes('api.github.com')) return '';
  if (status === 403 || status === 429) return ' (limite API GitHub raggiunto: imposta GITHUB_TOKEN)';
  if (status === 401) return ' (credenziali non accettate: controlla GITHUB_TOKEN o il proxy di rete)';
  return '';
}

module.exports = { fetchText, fetchJson };
