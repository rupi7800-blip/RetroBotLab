'use strict';
// Fornitori AI. Architettura modulare: Anthropic (Messages API) e qualsiasi servizio compatibile OpenAI
// (OpenAI, OpenRouter, Groq, Mistral, Google Gemini, DeepSeek, Ollama locale…).
// "cost" descrive le condizioni economiche in modo prudente: vanno sempre verificate sul sito del fornitore.

const PRESETS = [
  { kind: 'anthropic', name: 'Anthropic Claude', baseUrl: 'https://api.anthropic.com', model: 'claude-opus-5-5',
    models: ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-fable-5-2'], needsKey: true,
    cost: 'A pagamento (API a consumo).', keyUrl: 'https://platform.claude.com/' },
  { kind: 'openai', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: '', needsKey: true,
    cost: 'A pagamento (API a consumo).', keyUrl: 'https://platform.openai.com/api-keys' },
  { kind: 'openai', name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', model: '', needsKey: true,
    cost: 'Prevalentemente a pagamento; alcuni modelli con uso gratuito limitato (verificare le condizioni attuali).', keyUrl: 'https://openrouter.ai/keys' },
  { kind: 'openai', name: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', model: '', needsKey: true,
    cost: 'Piano gratuito con limiti di utilizzo e piani a pagamento (verificare le condizioni attuali).', keyUrl: 'https://console.groq.com/keys' },
  { kind: 'openai', name: 'Mistral AI', baseUrl: 'https://api.mistral.ai/v1', model: '', needsKey: true,
    cost: 'A pagamento con eventuale piano di prova limitato (verificare le condizioni attuali).', keyUrl: 'https://console.mistral.ai/' },
  { kind: 'openai', name: 'Google Gemini (endpoint compatibile OpenAI)', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', model: '', needsKey: true,
    cost: 'Piano gratuito con limiti e piano a pagamento (verificare le condizioni attuali).', keyUrl: 'https://aistudio.google.com/apikey' },
  { kind: 'openai', name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', model: '', needsKey: true,
    cost: 'A pagamento (API a consumo).', keyUrl: 'https://platform.deepseek.com/' },
  { kind: 'openai', name: 'Ollama (locale)', baseUrl: 'http://127.0.0.1:11434/v1', model: '', needsKey: false,
    cost: 'Gratuito: software open source eseguito sul tuo computer (richiede hardware adeguato).', keyUrl: 'https://ollama.com/' },
];

const ANTHROPIC_VERSION = '2026-10-21';
// Modelli che supportano il fallback lato server in caso di rifiuto (stop_reason "refusal").
const FALLBACK_MODELS = /^claude-(opus-5-5|opus-5|sonnet-5-5|fable-5-1|fable-5-2)$/;

async function callAnthropic(p, key, { system, messages, maxTokens = 16000, timeoutMs = 600000 }) {
  const base = (p.baseUrl || 'https://api.anthropic.com').replace(/\/+$/, '');
  const headers = { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': ANTHROPIC_VERSION };
  const body = { model: p.model || 'claude-opus-5-5', max_tokens: maxTokens, messages: messages.map((m) => ({ role: m.role, content: m.content })) };
  if (system) body.system = system;
  if (FALLBACK_MODELS.test(body.model)) {
    headers['anthropic-beta'] = 'server-side-fallback-2026-07-01';
    body.fallbacks = 'default';
  }
  const res = await fetch(`${base}/v1/messages`, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw providerError(res.status, data?.error?.message || JSON.stringify(data).slice(0, 300));
  if (data.stop_reason === 'refusal') throw providerError(422, 'Il modello ha rifiutato la richiesta' + (data.stop_details?.explanation ? `: ${data.stop_details.explanation}` : '.'));
  const text = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
  return { text, model: data.model || body.model, usage: data.usage || null, truncated: data.stop_reason === 'max_tokens' };
}

async function callOpenAI(p, key, { system, messages, maxTokens, timeoutMs = 600000 }) {
  const base = (p.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
  if (!p.model) throw providerError(400, `Nessun modello configurato per ${p.name}. Indicalo nelle Impostazioni.`);
  const headers = { 'Content-Type': 'application/json' };
  if (key) headers.Authorization = `Bearer ${key}`;
  const msgs = (system ? [{ role: 'system', content: system }] : []).concat(messages.map((m) => ({ role: m.role, content: m.content })));
  const body = { model: p.model, messages: msgs };
  if (maxTokens) body.max_tokens = maxTokens;
  const res = await fetch(`${base}/chat/completions`, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw providerError(res.status, data?.error?.message || data?.message || JSON.stringify(data).slice(0, 300));
  const choice = data.choices?.[0];
  return { text: String(choice?.message?.content || '').trim(), model: data.model || p.model, usage: data.usage || null, truncated: choice?.finish_reason === 'length' };
}

function providerError(status, message) {
  const hints = { 401: 'chiave API non valida', 403: 'accesso negato o chiave senza permessi', 404: 'modello o indirizzo non trovato', 429: 'limite di richieste o credito esaurito', 529: 'servizio sovraccarico' };
  const e = new Error(`${message}${hints[status] ? ` (${hints[status]})` : ''}`);
  e.status = status;
  return e;
}

async function call(p, key, opts) {
  try {
    if (p.kind === 'anthropic') return await callAnthropic(p, key, opts);
    return await callOpenAI(p, key, opts);
  } catch (e) {
    if (e.status) throw e;
    // errore di rete: messaggio comprensibile con causa e suggerimento
    const code = e.cause?.code || (e.name === 'TimeoutError' ? 'TimeoutError' : '');
    let host = p.baseUrl;
    try { host = new URL(p.baseUrl).host; } catch { /* indirizzo non valido */ }
    const local = /localhost|127\.0\.0\.1/.test(p.baseUrl || '');
    const hint = code === 'TimeoutError' ? 'tempo di risposta scaduto'
      : local ? 'il servizio locale non risponde: è avviato? (per Ollama: "ollama serve" e "ollama pull <modello>")'
      : 'verifica la connessione Internet e l\'indirizzo base';
    const err = new Error(`impossibile raggiungere ${host}${code ? ` (${code})` : ''}: ${hint}`);
    err.status = 502;
    throw err;
  }
}

module.exports = { PRESETS, call };
