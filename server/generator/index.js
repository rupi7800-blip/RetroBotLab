'use strict';
// Assemblaggio del progetto completo: codice, configurazione, dipendenze, documentazione, test, Docker.
const { normalizeSpec, buildConfigJson, commandList, has } = require('./spec');
const py = require('./python_aiogram');
const js = require('./js_grammy');
const { FEATURES, TEMPLATES, LANGUAGES } = require('./catalog');

function envExample(s) {
  const lines = [
    '# Copia questo file in .env e inserisci i valori reali. NON condividere mai il file .env.',
    '# Token ottenuto da @BotFather (https://t.me/BotFather)',
    'BOT_TOKEN=',
    '# ID Telegram numerici degli amministratori separati da virgola (usa /id nel bot per scoprirlo)',
    'ADMIN_IDS=',
    '# polling (consigliato in locale) oppure webhook (server pubblico con HTTPS)',
    `MODE=${s.mode}`,
    '# Lasciare vuoto per usare Telegram. Per il simulatore di RETRO BOT LAB: http://127.0.0.1:8080/mock',
    'TELEGRAM_API_BASE=',
    'LOG_LEVEL=INFO',
    '',
    '# --- Solo modalità webhook ---',
    '# Indirizzo pubblico HTTPS del server (senza percorso), es. https://bot.example.com',
    'WEBHOOK_URL=',
    'WEBHOOK_PATH=/telegram/webhook',
    '# Stringa casuale 16-256 caratteri [A-Za-z0-9_-]; Telegram la invia nell\'header X-Telegram-Bot-Api-Secret-Token',
    'WEBHOOK_SECRET=',
    'WEBHOOK_HOST=0.0.0.0',
    'WEBHOOK_PORT=8443',
  ];
  if (has(s, 'ai')) lines.push('', '# --- Intelligenza artificiale (API compatibile OpenAI) ---',
    '# Servizio esterno: normalmente a pagamento o con piano gratuito limitato. Ollama in locale è gratuito.',
    'AI_API_BASE=https://api.openai.com/v1', 'AI_API_KEY=', `AI_MODEL=${s.ai.model}`);
  if (has(s, 'api')) lines.push('', '# --- API esterna ---', 'EXTERNAL_API_URL=https://api.github.com/repos/grammyjs/grammY', 'EXTERNAL_API_KEY=');
  if (has(s, 'files')) lines.push('', '# Cartella dove salvare i file ricevuti', 'DOWNLOAD_DIR=');
  return lines.join('\n') + '\n';
}

function featureDocs(s) {
  return s.features.map((f) => `- **${FEATURES[f].label}** — ${FEATURES[f].desc}`).join('\n') || '- Comandi di base (/start, /help, /id)';
}

function readme(s, files) {
  const lang = LANGUAGES.find((l) => l.id === s.language);
  const isPy = s.language === 'python';
  const isTs = s.language === 'typescript';
  const { pub, adm } = commandList(s);
  const install = isPy
    ? '```bash\npython3 -m venv .venv\nsource .venv/bin/activate        # Windows: .venv\\Scripts\\activate\npip install -r requirements.txt\ncp .env.example .env             # Windows: copy .env.example .env\n```'
    : `\`\`\`bash\nnpm install\ncp .env.example .env             # Windows: copy .env.example .env\n${isTs ? 'npm run build\n' : ''}\`\`\``;
  const run = isPy ? '```bash\npython main.py\n```' : '```bash\nnpm start\n```';
  const test = isPy ? '```bash\npython -m unittest discover -s tests -v\n```' : `\`\`\`bash\n${isTs ? 'npm run check\n' : ''}node --test test/*.test.js\n\`\`\``;
  return `# ${s.name}

${s.description || 'Bot Telegram generato da RETRO BOT LAB.'}

| Voce | Valore |
|---|---|
| Linguaggio | ${lang.label} |
| Libreria | ${lang.libraryLabel} |
| Modalità predefinita | ${s.mode === 'webhook' ? 'Webhook (server pubblico HTTPS)' : 'Long polling'} |
| Database | SQLite (file \`bot.db\`) |
| Modello di partenza | ${(TEMPLATES.find((t) => t.id === s.template) || {}).name || 'Personalizzato'} |

## Funzionalità

${featureDocs(s)}

## Comandi

${pub.map((c) => `- \`/${c.command}\` — ${c.description}`).join('\n')}
${adm.length ? `\nRiservati agli amministratori (\`ADMIN_IDS\`):\n\n${adm.map((c) => `- \`/${c.command}\` — ${c.description}`).join('\n')}\n` : ''}
## Struttura

\`\`\`
${files.map((f) => f).join('\n')}
\`\`\`

## 1. Creare il bot con @BotFather

1. Apri Telegram e cerca **@BotFather** (verifica la spunta blu).
2. Invia \`/newbot\`.
3. Scegli il **nome visualizzato** (es. "${s.name}").
4. Scegli lo **username**: deve terminare con \`bot\` (es. \`mio_esempio_bot\`).
5. BotFather risponde con il **token** (formato \`123456789:AA...\`). Copialo **solo** nel file \`.env\`, alla voce \`BOT_TOKEN\`.
6. Facoltativo: \`/setdescription\`, \`/setabouttext\`, \`/setuserpic\` per descrizione e immagine.
   I comandi vengono registrati automaticamente all'avvio (setMyCommands).
${has(s, 'group') ? '7. Per la moderazione dei gruppi: `/setprivacy` → **Disable**, poi aggiungi il bot al gruppo come amministratore con i permessi "Elimina messaggi" e "Banna utenti".\n' : ''}
> ⚠ Il token equivale a una password: non pubblicarlo, non inserirlo nel codice, non incollarlo in chat o in prompt AI.
> Se è stato esposto, rigeneralo con \`/revoke\` in @BotFather.

## 2. Installazione

Requisiti: ${isPy ? 'Python 3.10 o superiore' : 'Node.js 22.13 o superiore (per il modulo integrato `node:sqlite`)'}.

${install}

Apri \`.env\` e compila almeno \`BOT_TOKEN\`${has(s, 'admin') || has(s, 'booking') || has(s, 'form') || has(s, 'shop') ? ' e `ADMIN_IDS` (scrivi `/id` al bot per conoscere il tuo ID)' : ''}.

## 3. Avvio

${run}

Nel terminale compare \`Bot avviato: @nome_bot\`. Apri il bot su Telegram e invia \`/start\`.
${!isPy ? '\nNota: Node.js 22 mostra l\'avviso `ExperimentalWarning: SQLite is an experimental feature`: è normale.\n' : ''}
## 4. Test

Test automatici della configurazione:

${test}

Test funzionali manuali:

1. \`/start\` → messaggio di benvenuto${has(s, 'menu') ? ' con pulsanti del menu' : ''}.
2. \`/help\` → elenco comandi.
3. \`/id\` → mostra il tuo ID numerico.
${has(s, 'commands') && s.commands[0] ? `4. \`/${s.commands[0].command}\` → "${s.commands[0].reply.slice(0, 60)}".\n` : ''}${has(s, 'autoreply') && s.autoreplies[0] ? `5. Scrivi "${s.autoreplies[0].keywords[0]}" → risposta automatica.\n` : ''}${has(s, 'booking') ? '6. `/prenota` → data futura → orario in fascia → nota → conferma e avviso agli admin.\n' : ''}${has(s, 'form') ? '7. `/modulo` → rispondi a tutte le domande → `/esporta` (admin) restituisce un CSV.\n' : ''}${has(s, 'shop') ? '8. `/catalogo` → aggiungi prodotti → `/carrello` → Conferma ordine.\n' : ''}${has(s, 'tasks') ? '9. `/aggiungi Comprare il pane` → `/attivita` → `/fatto 1`.\n' : ''}${has(s, 'files') ? '10. Invia un documento → `/file`.\n' : ''}${has(s, 'admin') ? '11. Da admin: `/stats` e `/broadcast Prova`.\n' : ''}
### Prova senza Telegram (simulatore RETRO BOT LAB)

1. Apri RETRO BOT LAB → **Test & Simulatore** e crea una sessione: ottieni un token di prova.
2. Nel file \`.env\` imposta \`BOT_TOKEN=<token di prova>\` e \`TELEGRAM_API_BASE=http://127.0.0.1:8080/mock\`.
3. Avvia il bot: i messaggi scritti nel simulatore arrivano al bot e le risposte compaiono nella chat simulata.

## 5. Pubblicazione online

**Long polling (più semplice):** basta un computer o un server sempre acceso con accesso a Internet in uscita
(VPS, Raspberry Pi, servizi PaaS con processi "worker"). Non servono porte aperte né HTTPS.

**Webhook:** serve un indirizzo pubblico **HTTPS** (porte supportate da Telegram: 443, 80, 88, 8443).
1. Imposta in \`.env\`: \`MODE=webhook\`, \`WEBHOOK_URL=https://tuo-dominio\`, \`WEBHOOK_SECRET=<stringa casuale>\`.
2. Metti un reverse proxy (Caddy, Nginx) con certificato TLS davanti a \`WEBHOOK_PORT\`.
3. All'avvio il bot chiama \`setWebhook\` con \`secret_token\`: le richieste senza l'header corretto vengono rifiutate.
4. Verifica con: \`curl https://tuo-dominio/health\` → \`ok\`.

**Docker:**

\`\`\`bash
docker build -t ${slug(s.name)} .
docker run -d --name ${slug(s.name)} --env-file .env -v "$(pwd)/data:/app/data" -e DB_PATH=/app/data/bot.db --restart unless-stopped ${slug(s.name)}
\`\`\`

## 6. Manutenzione

- Backup regolare del file \`bot.db\`${has(s, 'files') ? ' e della cartella `downloads/`' : ''}.
- Aggiorna le dipendenze periodicamente${isPy ? ' (`pip install -U -r requirements.txt`)' : ' (`npm outdated`, `npm update`)'} e consulta il changelog della Bot API: https://core.telegram.org/bots/api-changelog
- Controlla i log per errori 403 (utente ha bloccato il bot) e 429 (troppi messaggi: rallentare).
- Non eseguire mai due istanze in polling con lo stesso token (errore 409 Conflict).

## Errori comuni

| Errore | Causa | Soluzione |
|---|---|---|
| 401 Unauthorized | Token errato o revocato | Copia di nuovo il token da @BotFather in \`.env\` |
| 409 Conflict: terminated by other getUpdates request | Due istanze attive o webhook impostato | Ferma l'altra istanza; il bot elimina il webhook all'avvio in polling |
| 403 Forbidden: bot was blocked by the user | L'utente ha bloccato il bot | Gestito automaticamente: l'utente viene marcato come bloccato |
| 429 Too Many Requests | Limite di invio superato | Gestito nel broadcast con attesa \`retry_after\` |
| 400 Bad Request: chat not found | L'utente non ha mai avviato il bot | L'utente deve inviare /start |
${isPy ? '| ModuleNotFoundError: aiogram | Ambiente virtuale non attivo | `source .venv/bin/activate` e `pip install -r requirements.txt` |' : '| Cannot find package \'grammy\' | Dipendenze non installate | `npm install` |\n| No such built-in module: node:sqlite | Node.js troppo vecchio | Installa Node.js 22.13 o superiore |'}

## Riferimenti

- Telegram Bot API: https://core.telegram.org/bots/api
- Funzionalità dei bot: https://core.telegram.org/bots/features
- ${isPy ? 'aiogram: https://docs.aiogram.dev/' : 'grammY: https://grammy.dev/'}

---
Generato da RETRO BOT LAB. Le informazioni su librerie e versioni vanno verificate con la documentazione ufficiale prima della pubblicazione.
`;
}

function slug(n) {
  return n.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'telegram-bot';
}

function dockerfile(s) {
  if (s.language === 'python') {
    return `FROM python:3.12-slim
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
RUN useradd --create-home botuser && mkdir -p /app/data && chown -R botuser /app
USER botuser
${s.mode === 'webhook' ? 'EXPOSE 8443\n' : ''}CMD ["python", "main.py"]
`;
  }
  const ts = s.language === 'typescript';
  return `FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm install${ts ? '' : ' --omit=dev'}
COPY . .
${ts ? 'RUN npm run build && npm prune --omit=dev\n' : ''}RUN mkdir -p /app/data && chown -R node /app
USER node
${s.mode === 'webhook' ? 'EXPOSE 8443\n' : ''}CMD ["node", "${ts ? 'dist/bot.js' : 'bot.js'}"]
`;
}

const DOCKERIGNORE = '.env\n.venv\nnode_modules\ndist\n*.db\ndownloads\n__pycache__\n';
const GITIGNORE = '.env\n.venv/\nnode_modules/\ndist/\n*.db\ndownloads/\ndata/\n__pycache__/\n*.log\n';

const PY_TEST = `"""Test automatici della configurazione (solo libreria standard)."""
import json
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONFIG = json.loads((ROOT / "config.json").read_text(encoding="utf-8"))


class ConfigTest(unittest.TestCase):
    def test_commands_valid(self):
        for c in CONFIG["bot_commands"] + CONFIG.get("admin_commands", []):
            self.assertRegex(c["command"], r"^[a-z0-9_]{1,32}$")
            self.assertTrue(1 <= len(c["description"]) <= 256)

    def test_no_duplicate_commands(self):
        names = [c["command"] for c in CONFIG["bot_commands"]]
        self.assertEqual(len(names), len(set(names)))

    def test_welcome_present(self):
        self.assertTrue(CONFIG["welcome"].strip())

    def test_no_token_in_sources(self):
        pattern = re.compile(r"\\d{6,12}:[A-Za-z0-9_-]{30,}")
        for f in ROOT.glob("*.py"):
            self.assertIsNone(pattern.search(f.read_text(encoding="utf-8")), f"Token trovato in {f.name}")

    def test_main_compiles(self):
        compile((ROOT / "main.py").read_text(encoding="utf-8"), "main.py", "exec")


if __name__ == "__main__":
    unittest.main()
`;

const JS_TEST = (ts) => `// Test automatici della configurazione (node:test, nessuna dipendenza).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CONFIG = JSON.parse(readFileSync(join(ROOT, "config.json"), "utf8"));

test("comandi validi", () => {
  for (const c of [...CONFIG.bot_commands, ...(CONFIG.admin_commands ?? [])]) {
    assert.match(c.command, /^[a-z0-9_]{1,32}$/);
    assert.ok(c.description.length >= 1 && c.description.length <= 256);
  }
});

test("nessun comando duplicato", () => {
  const names = CONFIG.bot_commands.map((c) => c.command);
  assert.equal(new Set(names).size, names.length);
});

test("messaggio di benvenuto presente", () => {
  assert.ok(CONFIG.welcome.trim().length > 0);
});

test("nessun token nei sorgenti", () => {
  const dir = join(ROOT, ${ts ? '"src"' : '"."'});
  for (const f of readdirSync(dir).filter((n) => /\\.(js|ts)$/.test(n))) {
    assert.doesNotMatch(readFileSync(join(dir, f), "utf8"), /\\d{6,12}:[A-Za-z0-9_-]{30,}/, \`Token trovato in \${f}\`);
  }
});
`;

/**
 * Genera tutti i file del progetto.
 * @returns {{ spec, warnings, files: Record<string,string>, entry: string, library: string }}
 */
function generateProject(input, versions = {}) {
  const { spec: s, warnings } = normalizeSpec(input);
  const files = {};
  let entry;
  if (s.language === 'python') {
    entry = 'main.py';
    files['main.py'] = py.gen(s);
    files['requirements.txt'] = py.requirements(versions);
    files['tests/test_config.py'] = PY_TEST;
  } else {
    const ts = s.language === 'typescript';
    entry = ts ? 'src/bot.ts' : 'bot.js';
    files[entry] = js.gen(s, ts);
    files['package.json'] = js.packageJson(s, ts, versions);
    if (ts) files['tsconfig.json'] = js.TSCONFIG;
    files['test/config.test.js'] = JS_TEST(ts);
  }
  files['config.json'] = buildConfigJson(s);
  files['.env.example'] = envExample(s);
  files['.gitignore'] = GITIGNORE;
  files['.dockerignore'] = DOCKERIGNORE;
  files['Dockerfile'] = dockerfile(s);
  const names = Object.keys(files).concat(['README.md']).sort();
  files['README.md'] = readme(s, names);
  const library = s.language === 'python' ? 'aiogram' : 'grammy';
  return { spec: s, warnings, files, entry, library };
}

module.exports = { generateProject, TEMPLATES, FEATURES, LANGUAGES };
