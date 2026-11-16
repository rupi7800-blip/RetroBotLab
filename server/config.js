'use strict';
// Configurazione centrale. Tutti i valori sono sovrascrivibili tramite variabili d'ambiente.
const path = require('node:path');
const fs = require('node:fs');

// Caricamento minimale di un file .env (nessuna dipendenza esterna).
function loadDotEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m || line.trim().startsWith('#')) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
}

const ROOT = path.resolve(__dirname, '..');
loadDotEnv(path.join(ROOT, '.env'));

const env = process.env;
const config = {
  ROOT,
  // --lan: accetta connessioni dagli altri dispositivi della rete locale (telefono, tablet)
  HOST: process.argv.includes('--lan') ? '0.0.0.0' : env.HOST || '127.0.0.1',
  // on: accetta anche connessioni da indirizzi pubblici (solo dietro reverse proxy HTTPS o firewall)
  ALLOW_PUBLIC: (env.ALLOW_PUBLIC || 'off').toLowerCase() === 'on',
  PORT: Number(env.PORT || 8080),
  DATA_DIR: path.resolve(ROOT, env.DATA_DIR || 'data'),
  PUBLIC_DIR: path.join(ROOT, 'public'),
  APP_SECRET: env.APP_SECRET || '',
  // Controllo periodico delle fonti (ore). 0 = disattivato.
  KNOWLEDGE_UPDATE_HOURS: Number(env.KNOWLEDGE_UPDATE_HOURS ?? 24),
  GITHUB_TOKEN: env.GITHUB_TOKEN || '',
  // Esecuzione dei bot nel sandbox: on | off
  SANDBOX_EXEC: (env.SANDBOX_EXEC || 'on').toLowerCase() === 'on',
  SANDBOX_MAX_SECONDS: Number(env.SANDBOX_MAX_SECONDS || 300),
  SANDBOX_MAX_MEMORY_MB: Number(env.SANDBOX_MAX_MEMORY_MB || 512),
  PUBLIC_URL: env.PUBLIC_URL || '',
  SESSION_HOURS: Number(env.SESSION_HOURS || 72),
  HTTP_TIMEOUT_MS: Number(env.HTTP_TIMEOUT_MS || 20000),
};

fs.mkdirSync(config.DATA_DIR, { recursive: true });
module.exports = config;
