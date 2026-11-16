'use strict';
// Chiamate reali alla Telegram Bot API per la configurazione dei bot (verifica token, comandi, descrizioni, webhook).
// Il token viene letto dalla cassaforte cifrata e non viene mai restituito al browser né inviato a servizi AI.
const config = require('./config');

async function api(token, method, params = {}) {
  if (!/^\d+:[A-Za-z0-9_-]{20,}$/.test(token || '')) throw Object.assign(new Error('Token non valido nel formato'), { status: 400 });
  let res;
  try {
    res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(params), signal: AbortSignal.timeout(config.HTTP_TIMEOUT_MS),
    });
  } catch (e) {
    throw Object.assign(new Error(`Telegram non raggiungibile dal server (${e.cause?.code || e.message})`), { status: 502 });
  }
  const data = await res.json().catch(() => ({ ok: false, description: 'Risposta non valida' }));
  if (!data.ok) throw Object.assign(new Error(`Telegram: ${data.error_code || res.status} ${data.description || ''}`.trim()), { status: data.error_code === 401 ? 401 : 400 });
  return data.result;
}

module.exports = { api };
