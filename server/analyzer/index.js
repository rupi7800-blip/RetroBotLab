'use strict';
// Analisi statica di codice, configurazioni e log. Nessun codice viene eseguito durante l'analisi:
// i controlli di sintassi usano parser (ast.parse di Python, node --check) senza eseguire il programma.
const path = require('node:path');
const KB = require('./errors-kb');
const sandbox = require('../sandbox');

const SEV_ORDER = { critico: 0, alto: 1, medio: 2, basso: 3, info: 4 };
const TOKEN_RE = /\b\d{6,12}:[A-Za-z0-9_-]{30,}\b/;
const NODE_BUILTINS = new Set(['fs', 'path', 'http', 'https', 'url', 'crypto', 'os', 'util', 'events', 'stream', 'child_process', 'zlib', 'net', 'dns', 'readline', 'buffer', 'timers', 'assert', 'querystring', 'worker_threads', 'process', 'module', 'perf_hooks', 'tls', 'cluster', 'v8', 'vm']);
const PY_STDLIB = new Set(['asyncio', 'os', 'sys', 're', 'json', 'logging', 'sqlite3', 'datetime', 'pathlib', 'time', 'typing', 'collections', 'csv', 'io', 'random', 'math', 'html', 'urllib', 'subprocess', 'functools', 'itertools', 'dataclasses', 'enum', 'uuid', 'hashlib', 'hmac', 'secrets', 'base64', 'tempfile', 'shutil', 'traceback', 'unittest', 'contextlib', 'string', 'textwrap', 'decimal', 'zoneinfo', 'signal', 'threading', 'queue', 'copy', 'pprint', 'abc', 'argparse', 'configparser', 'email', 'smtplib', 'imaplib', 'ssl', 'socket', 'http', 'statistics', 'glob', 'fnmatch', 'zipfile', 'gzip', 'pickle', 'operator', 'inspect', 'warnings', 'weakref', 'locale', 'calendar', 'mimetypes', 'platform', '__future__']);
// nome import Python -> nome pacchetto PyPI
const PY_PKG = { dotenv: 'python-dotenv', telegram: 'python-telegram-bot', telebot: 'pyTelegramBotAPI', yaml: 'PyYAML', bs4: 'beautifulsoup4', PIL: 'Pillow', sklearn: 'scikit-learn', dateutil: 'python-dateutil', psycopg2: 'psycopg2-binary', MySQLdb: 'mysqlclient', jwt: 'PyJWT' };

function lineOf(text, index) { return text.slice(0, index).split('\n').length; }
function lines(text) { return String(text).split('\n'); }

function finding(o) {
  return {
    id: o.id, title: o.title, severity: o.severity || 'medio', category: o.category || 'Generale',
    file: o.file || null, line: o.line || null, snippet: o.snippet || null,
    description: o.description || o.title, cause: o.cause || '', solution: o.solution || '',
    fixedCode: o.fixedCode || null, verify: o.verify || '', source: o.source || null, origin: o.origin || 'regola statica',
  };
}

function lang(file) {
  const ext = path.extname(file).toLowerCase();
  return { '.py': 'python', '.js': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript', '.ts': 'typescript', '.php': 'php', '.go': 'go', '.java': 'java', '.cs': 'csharp', '.json': 'json', '.env': 'env' }[ext]
    || (path.basename(file) === '.env' ? 'env' : path.basename(file) === 'Dockerfile' ? 'docker' : path.basename(file) === 'requirements.txt' ? 'requirements' : 'text');
}

// ------------------------------------------------------------------ regole
function ruleSecrets(file, text, out) {
  const L = lang(file);
  if (L === 'env' || /\.env(\.|$)/.test(path.basename(file)) && !/example|sample/i.test(file)) {
    if (TOKEN_RE.test(text) || /^(?:[A-Z_]*(?:KEY|SECRET|PASSWORD|TOKEN)[A-Z_]*)\s*=\s*\S{8,}/m.test(text)) {
      out.push(finding({ id: 'env-committed', title: 'Il file .env contiene credenziali reali', severity: 'alto', category: 'Sicurezza', file,
        cause: 'Il file .env è stato incluso nel materiale condiviso. Se finisce in un repository o in una chat, le credenziali sono compromesse.',
        solution: 'Non condividere né caricare il file .env (aggiungilo a .gitignore). Se è già stato pubblicato, rigenera il token con /revoke in @BotFather e le altre chiavi.',
        verify: 'git check-ignore .env deve restituire ".env".', source: 'https://core.telegram.org/bots/features#botfather' }));
    }
    return;
  }
  if (/example|sample/i.test(file) && L === 'text') return;
  const ls = lines(text);
  ls.forEach((ln, i) => {
    const m = ln.match(TOKEN_RE);
    if (m) {
      let fixed = null;
      if (L === 'python') fixed = fixPyToken(text);
      else if (L === 'javascript' || L === 'typescript') fixed = fixJsToken(text);
      out.push(finding({ id: 'hardcoded-token', title: 'Token Telegram scritto nel codice sorgente', severity: 'critico', category: 'Sicurezza', file, line: i + 1,
        snippet: ln.replace(TOKEN_RE, '<TOKEN NASCOSTO>').trim(),
        cause: 'Chiunque legga il file (repository, backup, chat, AI esterne) può controllare il bot.',
        solution: 'Sposta il token nel file .env (BOT_TOKEN=...) e leggilo con ' + (L === 'python' ? 'os.getenv("BOT_TOKEN") dopo load_dotenv()' : 'process.env.BOT_TOKEN') + '. Rigenera il token con /revoke in @BotFather perché va considerato compromesso.',
        fixedCode: fixed, verify: 'Cerca nel progetto la stringa del token: non deve comparire in nessun file tranne .env.', source: 'https://core.telegram.org/bots/features#botfather' }));
    }
    if (/\b(sk-[A-Za-z0-9_-]{20,}|sk-ant-[A-Za-z0-9_-]{20,}|AIza[0-9A-Za-z_-]{30,}|gh[pousr]_[A-Za-z0-9]{30,})/.test(ln)) {
      out.push(finding({ id: 'hardcoded-key', title: 'Chiave API scritta nel codice', severity: 'critico', category: 'Sicurezza', file, line: i + 1,
        snippet: ln.replace(/(sk-ant-|sk-|AIza|gh[pousr]_)[A-Za-z0-9_-]+/g, '$1••••').trim(),
        cause: 'Le chiavi API nel sorgente vengono esposte con il codice.', solution: 'Spostala in .env e leggila da variabile d\'ambiente; revoca la chiave esposta dal pannello del fornitore.',
        verify: 'Nessuna chiave nel sorgente.' }));
    }
    if (/\b(print|console\.(log|info|debug)|log(ging)?\.(info|debug|warning))\s*\(.*\b(BOT_TOKEN|TOKEN|API_KEY|token)\b/.test(ln) && !/getenv|process\.env\.[A-Z_]+\s*\?\?/.test(ln)) {
      out.push(finding({ id: 'token-logged', title: 'Possibile stampa del token nei log', severity: 'alto', category: 'Sicurezza', file, line: i + 1, snippet: ln.trim(),
        cause: 'I log vengono spesso condivisi per chiedere aiuto: il token verrebbe esposto.', solution: 'Non stampare credenziali; al massimo mostra le ultime 4 cifre.', verify: 'Avvia il bot e controlla che il token non compaia nei log.' }));
    }
  });
}

function fixPyToken(text) {
  let t = text.replace(/(["'])\d{6,12}:[A-Za-z0-9_-]{30,}\1/g, 'os.getenv("BOT_TOKEN", "")');
  if (!/^\s*import os\b/m.test(t)) t = 'import os\n' + t;
  if (!/load_dotenv/.test(t)) t = t.replace(/^import os\n/m, 'import os\n\nfrom dotenv import load_dotenv\n\nload_dotenv()\n');
  return t;
}
function fixJsToken(text) {
  return text.replace(/(["'`])\d{6,12}:[A-Za-z0-9_-]{30,}\1/g, 'process.env.BOT_TOKEN');
}

function rulePython(file, text, out) {
  const ls = lines(text);
  const hasAsync = /\basync\s+def\b/.test(text);
  // aiogram 2 / PTB 13
  ls.forEach((ln, i) => {
    const at = { file, line: i + 1, snippet: ln.trim() };
    if (/from aiogram\.utils import executor|executor\.start_polling|@dp\.message_handler|@dp\.callback_query_handler|Dispatcher\(\s*bot\s*\)|aiogram\.contrib/.test(ln)) {
      out.push(finding({ ...at, id: 'aiogram2', title: 'Sintassi aiogram 2.x (incompatibile con aiogram 3)', severity: 'alto', category: 'Versioni',
        cause: 'aiogram 3 ha rimosso executor, message_handler e Dispatcher(bot).', solution: 'Usa Router: @router.message(Command("start")); dp = Dispatcher(); dp.include_router(router); await dp.start_polling(bot).',
        verify: 'Il bot si avvia con aiogram 3 senza ImportError.', source: 'https://docs.aiogram.dev/en/latest/migration_2_to_3.html' }));
    }
    if (/use_context\s*=|Updater\(\s*(token|["'A-Z])|\.dispatcher\b|from telegram\.ext import[^\n]*\bFilters\b/.test(ln)) {
      out.push(finding({ ...at, id: 'ptb13', title: 'Sintassi python-telegram-bot 13 (incompatibile con 20+)', severity: 'alto', category: 'Versioni',
        cause: 'La versione 20+ è asincrona e usa Application.', solution: 'app = Application.builder().token(TOKEN).build(); handler async def; app.run_polling().',
        verify: 'Avvio senza TypeError.', source: 'https://github.com/python-telegram-bot/python-telegram-bot/wiki/Transition-guide-to-Version-20.0' }));
    }
    if (hasAsync && /^\s+time\.sleep\(/.test(ln)) {
      out.push(finding({ ...at, id: 'blocking-sleep', title: 'time.sleep() blocca il bot asincrono', severity: 'medio', category: 'Prestazioni',
        cause: 'In codice asyncio time.sleep ferma l\'intero event loop: il bot smette di rispondere a tutti.', solution: 'Usa await asyncio.sleep(secondi) dentro le funzioni async.',
        fixedCode: null, verify: 'Durante l\'attesa il bot deve rispondere ad altri utenti.', source: 'https://docs.python.org/3/library/asyncio-task.html#sleeping' }));
    }
    if (hasAsync && /\brequests\.(get|post|put|delete|request)\(/.test(ln)) {
      out.push(finding({ ...at, id: 'blocking-http', title: 'Richiesta HTTP bloccante (requests) in codice asincrono', severity: 'medio', category: 'Prestazioni',
        cause: 'requests è sincrona: durante la richiesta il bot è bloccato.', solution: 'Usa aiohttp (già incluso con aiogram) o httpx.AsyncClient.', verify: 'Il bot risponde ad altri utenti durante la richiesta.' }));
    }
    if (/\.(execute|executemany|executescript)\(\s*(f["']|["'][^"']*["']\s*(%|\+|\.format))/.test(ln) && /select|insert|update|delete|where/i.test(ln)) {
      out.push(finding({ ...at, id: 'sql-injection', title: 'Query SQL costruita con concatenazione di stringhe', severity: 'alto', category: 'Sicurezza',
        cause: 'Se il valore arriva dall\'utente è possibile una SQL injection.', solution: 'Usa parametri: cursor.execute("SELECT * FROM t WHERE id = ?", (valore,)).',
        verify: 'Prova con input contenente un apice (\'): nessun errore SQL.', source: 'https://docs.python.org/3/library/sqlite3.html#sqlite3-placeholders' }));
    }
    if (/\b(eval|exec)\s*\(/.test(ln) && !/^\s*#/.test(ln)) {
      out.push(finding({ ...at, id: 'eval', title: 'Uso di eval/exec', severity: 'critico', category: 'Sicurezza',
        cause: 'Eseguire testo arbitrario permette a un utente di prendere il controllo del server.', solution: 'Elimina eval/exec; usa json.loads o un parser dedicato.', verify: 'Nessun eval nel codice.' }));
    }
    if (/subprocess\.[a-z_]+\([^)]*shell\s*=\s*True|os\.system\(/.test(ln)) {
      out.push(finding({ ...at, id: 'shell', title: 'Comando di sistema con shell', severity: 'alto', category: 'Sicurezza',
        cause: 'Input dell\'utente in un comando shell consente l\'esecuzione di comandi arbitrari.', solution: 'Usa subprocess.run([...lista argomenti...], shell=False) e valida l\'input.', verify: 'Prova input con ; e &&: nessun comando eseguito.' }));
    }
    if (/^\s*except\s*:\s*$/.test(ln)) {
      out.push(finding({ ...at, id: 'bare-except', title: 'except generico senza tipo', severity: 'basso', category: 'Qualità',
        cause: 'Cattura anche KeyboardInterrupt/SystemExit e nasconde gli errori.', solution: 'Usa except Exception as e: e registra l\'errore con log.exception().', verify: 'Gli errori compaiono nei log.' }));
    }
    if (/set_webhook\(/.test(ln) && !/secret_token/.test(ls.slice(i, i + 4).join(' '))) {
      out.push(finding({ ...at, id: 'webhook-no-secret', title: 'Webhook senza secret_token', severity: 'alto', category: 'Sicurezza',
        cause: 'Chiunque conosca l\'URL può inviare update falsi al bot.', solution: 'Passa secret_token=WEBHOOK_SECRET a set_webhook e verifica l\'header X-Telegram-Bot-Api-Secret-Token (SimpleRequestHandler(..., secret_token=...)).',
        verify: 'Una POST senza header deve ricevere 401.', source: 'https://core.telegram.org/bots/api#setwebhook' }));
    }
    if (/parse_mode\s*=\s*(["']HTML["']|ParseMode\.HTML)/.test(ln) && /\{[^}]*(message\.text|first_name|full_name|username|\.text)\b/.test(ls.slice(Math.max(0, i - 2), i + 1).join(' ')) && !/escape|quote/.test(ls.slice(Math.max(0, i - 3), i + 1).join(' '))) {
      out.push(finding({ ...at, id: 'html-unescaped', title: 'Testo dell\'utente in HTML senza escape', severity: 'medio', category: 'Messaggi',
        cause: 'Caratteri come < o & nel nome o nel messaggio causano "can\'t parse entities".', solution: 'Usa html.escape(testo) prima di inserirlo nel messaggio HTML.', verify: 'Prova con un nome contenente "<b>".', source: 'https://core.telegram.org/bots/api#html-style' }));
    }
  });
  if (/(for .+ in .+:)\s*\n(\s+.*\n){0,2}\s+await .*send_message\(/.test(text) && !/except\s+(Telegram\w*Error|TelegramAPIError|Exception)/.test(text)) {
    const idx = text.search(/send_message\(/);
    out.push(finding({ id: 'broadcast-no-try', title: 'Invio multiplo senza gestione degli errori', severity: 'medio', category: 'Robustezza', file, line: lineOf(text, idx),
      cause: 'Se un utente ha bloccato il bot (403) o si supera il limite (429) il ciclo si interrompe.', solution: 'Racchiudi send_message in try/except TelegramForbiddenError / TelegramRetryAfter e inserisci una pausa tra gli invii.',
      verify: 'Il broadcast prosegue anche con utenti che hanno bloccato il bot.', source: 'https://core.telegram.org/bots/faq#my-bot-is-hitting-limits-how-do-i-avoid-this' }));
  }
}

function ruleJs(file, text, out) {
  const ls = lines(text);
  const isGrammy = /from\s+["']grammy["']|require\(["']grammy["']\)/.test(text);
  if (isGrammy && /\bbot\.start\(/.test(text) && !/\bbot\.catch\(/.test(text)) {
    out.push(finding({ id: 'grammy-no-catch', title: 'grammY senza gestore errori (bot.catch)', severity: 'alto', category: 'Robustezza', file, line: lineOf(text, text.indexOf('bot.start(')),
      cause: 'Senza bot.catch, un errore in un handler arresta il long polling.', solution: 'Aggiungi bot.catch((err) => console.error(err.error)); prima di bot.start().',
      verify: 'Provoca un errore in un comando: il bot deve continuare a rispondere.', source: 'https://grammy.dev/guide/errors' }));
  }
  if (/require\(["']telegraf["']\)|from\s+["']telegraf["']/.test(text) && /\.launch\(/.test(text) && !/process\.once\(\s*["']SIG(INT|TERM)/.test(text)) {
    out.push(finding({ id: 'telegraf-signals', title: 'Telegraf senza arresto controllato', severity: 'basso', category: 'Robustezza', file,
      solution: 'Aggiungi process.once("SIGINT", () => bot.stop("SIGINT")) e process.once("SIGTERM", () => bot.stop("SIGTERM")).', source: 'https://telegraf.js.org/' }));
  }
  ls.forEach((ln, i) => {
    const at = { file, line: i + 1, snippet: ln.trim() };
    if (/\.(query|exec|prepare|run|all|get)\(\s*`[^`]*\$\{/.test(ln) && /select|insert|update|delete|where/i.test(ln)) {
      out.push(finding({ ...at, id: 'sql-injection', title: 'Query SQL costruita con template string', severity: 'alto', category: 'Sicurezza',
        cause: 'Valori dell\'utente inseriti direttamente nella query permettono SQL injection.', solution: 'Usa segnaposto: db.prepare("SELECT * FROM t WHERE id = ?").get(id).', verify: 'Input con apice non deve causare errori.' }));
    }
    if (/\beval\s*\(|new Function\s*\(/.test(ln)) {
      out.push(finding({ ...at, id: 'eval', title: 'Uso di eval/new Function', severity: 'critico', category: 'Sicurezza', cause: 'Esecuzione di codice arbitrario.', solution: 'Rimuovi eval; usa JSON.parse.' }));
    }
    if (/child_process|\bexec\(\s*`/.test(ln) && /\$\{/.test(ln)) {
      out.push(finding({ ...at, id: 'shell', title: 'Comando di sistema con input interpolato', severity: 'alto', category: 'Sicurezza', solution: 'Usa execFile/spawn con array di argomenti e valida l\'input.' }));
    }
    if (/webhookCallback\(/.test(ln) && !/secretToken/.test(ls.slice(i, i + 3).join(' '))) {
      out.push(finding({ ...at, id: 'webhook-no-secret', title: 'webhookCallback senza secretToken', severity: 'alto', category: 'Sicurezza',
        solution: 'webhookCallback(bot, "express", { secretToken: process.env.WEBHOOK_SECRET }) e setWebhook(url, { secret_token }).', source: 'https://grammy.dev/guide/deployment-types' }));
    }
    if (/setWebhook\(/.test(ln) && !/secret_token/.test(ls.slice(i, i + 3).join(' '))) {
      out.push(finding({ ...at, id: 'webhook-no-secret', title: 'setWebhook senza secret_token', severity: 'alto', category: 'Sicurezza', solution: 'Passa { secret_token: process.env.WEBHOOK_SECRET } e verificane l\'header.', source: 'https://core.telegram.org/bots/api#setwebhook' }));
    }
    if (/parse_mode:\s*["']HTML["']/.test(ln) && /\$\{[^}]*(message\.text|first_name|username|\.text)/.test(ls.slice(Math.max(0, i - 2), i + 1).join(' ')) && !/escape/i.test(ls.slice(Math.max(0, i - 3), i + 1).join(' '))) {
      out.push(finding({ ...at, id: 'html-unescaped', title: 'Testo dell\'utente in HTML senza escape', severity: 'medio', category: 'Messaggi', solution: 'Sostituisci & < > con &amp; &lt; &gt; prima dell\'invio.', source: 'https://core.telegram.org/bots/api#html-style' }));
    }
    if (/\bctx\.message\.text\b/.test(ln) && !/message:text|on\(["']text/.test(text)) {
      out.push(finding({ ...at, id: 'ctx-message-undefined', title: 'Accesso a ctx.message.text senza filtro', severity: 'basso', category: 'Logica',
        cause: 'Per callback, foto o sticker ctx.message o .text sono undefined.', solution: 'Usa bot.on("message:text", ...) oppure ctx.message?.text.', source: 'https://grammy.dev/guide/filter-queries' }));
    }
  });
}

function ruleDeps(files, out) {
  const names = Object.keys(files);
  // Python
  const pyFiles = names.filter((n) => n.endsWith('.py'));
  const req = names.find((n) => path.basename(n) === 'requirements.txt');
  if (pyFiles.length) {
    const localMods = new Set(pyFiles.map((n) => path.basename(n, '.py')).concat(names.filter((n) => n.includes('/')).map((n) => n.split('/')[0])));
    const imports = new Map();
    for (const f of pyFiles) {
      for (const m of files[f].matchAll(/^\s*(?:from\s+([A-Za-z_][\w]*)[\w.]*\s+import|import\s+([A-Za-z_][\w]*))/gm)) {
        const mod = m[1] || m[2];
        if (!PY_STDLIB.has(mod) && !localMods.has(mod) && !imports.has(mod)) imports.set(mod, { file: f, line: lineOf(files[f], m.index) });
      }
    }
    if (!req && imports.size) {
      out.push(finding({ id: 'no-requirements', title: 'requirements.txt mancante', severity: 'medio', category: 'Dipendenze',
        cause: `Il progetto importa librerie esterne (${[...imports.keys()].join(', ')}) ma non le elenca.`,
        solution: 'Crea requirements.txt con le dipendenze e le versioni minime.', fixedCode: [...imports.keys()].map((m) => PY_PKG[m] || m).join('\n') + '\n', file: 'requirements.txt' }));
    } else if (req) {
      const reqText = files[req].toLowerCase();
      for (const [mod, at] of imports) {
        const pkg = (PY_PKG[mod] || mod).toLowerCase();
        if (!new RegExp(`^\\s*${pkg.replace(/[-_]/g, '[-_]')}\\b`, 'm').test(reqText)) {
          out.push(finding({ id: 'missing-dep', title: `Dipendenza "${PY_PKG[mod] || mod}" non presente in requirements.txt`, severity: 'alto', category: 'Dipendenze', ...at,
            solution: `Aggiungi "${PY_PKG[mod] || mod}" a requirements.txt e reinstalla (pip install -r requirements.txt).`, verify: `python -c "import ${mod}"` }));
        }
      }
      lines(files[req]).forEach((l, i) => {
        if (/^[A-Za-z0-9_.-]+\s*$/.test(l.trim()) && l.trim()) {
          out.push(finding({ id: 'unpinned', title: `Versione non indicata per ${l.trim()}`, severity: 'basso', category: 'Dipendenze', file: req, line: i + 1,
            cause: 'Senza vincoli di versione un aggiornamento importante può rompere il bot.', solution: `Indica un intervallo, es. ${l.trim()}>=X.Y,<X+1`, verify: 'pip install -r requirements.txt riproducibile.' }));
        }
      });
    }
  }
  // Node
  const jsFiles = names.filter((n) => /\.(m?js|cjs|ts)$/.test(n) && !n.includes('node_modules'));
  const pkgName = names.find((n) => path.basename(n) === 'package.json');
  if (jsFiles.length && pkgName) {
    let pkg;
    try { pkg = JSON.parse(files[pkgName]); } catch { pkg = null; }
    if (pkg) {
      const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
      const seen = new Set();
      for (const f of jsFiles) {
        for (const m of files[f].matchAll(/(?:from\s+["']([^"'./][^"']*)["']|require\(\s*["']([^"'./][^"']*)["']\s*\))/g)) {
          let mod = m[1] || m[2];
          if (mod.startsWith('node:')) continue;
          mod = mod.startsWith('@') ? mod.split('/').slice(0, 2).join('/') : mod.split('/')[0];
          if (NODE_BUILTINS.has(mod) || seen.has(mod)) continue;
          seen.add(mod);
          if (!deps[mod]) {
            out.push(finding({ id: 'missing-dep', title: `Pacchetto "${mod}" non presente in package.json`, severity: 'alto', category: 'Dipendenze', file: f, line: lineOf(files[f], m.index),
              solution: `Esegui npm install ${mod}`, verify: 'npm ls ' + mod }));
          }
        }
      }
      if (/import\s.+from\s/.test(jsFiles.filter((f) => f.endsWith('.js')).map((f) => files[f]).join('\n')) && pkg.type !== 'module') {
        out.push(finding({ id: 'esm-type', title: 'Sintassi import/ESM senza "type": "module"', severity: 'alto', category: 'Configurazione', file: pkgName,
          cause: 'Node.js interpreta i file .js come CommonJS: gli import generano "Cannot use import statement outside a module".',
          solution: 'Aggiungi "type": "module" in package.json oppure rinomina i file in .mjs.', source: 'https://nodejs.org/api/packages.html#type' }));
      }
    }
  }
  const docker = names.find((n) => path.basename(n) === 'Dockerfile');
  if (docker && !/^\s*USER\s+/m.test(files[docker])) {
    out.push(finding({ id: 'docker-root', title: 'Container eseguito come root', severity: 'basso', category: 'Sicurezza', file: docker,
      solution: 'Crea un utente dedicato e aggiungi USER nel Dockerfile.', source: 'https://docs.docker.com/build/building/best-practices/#user' }));
  }
}

// ------------------------------------------------------------------ log
function analyzeLogs(logs) {
  const out = [];
  if (!logs || !logs.trim()) return out;
  const seen = new Set();
  for (const e of KB) {
    const m = logs.match(e.re);
    if (m && !seen.has(e.id)) {
      seen.add(e.id);
      const loc = locate(logs, m.index);
      out.push(finding({ id: e.id, title: e.title, severity: e.severity, category: e.category, cause: e.cause, solution: e.solution, verify: e.verify, source: e.source,
        snippet: logs.slice(Math.max(0, logs.lastIndexOf('\n', m.index) + 1), logs.indexOf('\n', m.index) > -1 ? logs.indexOf('\n', m.index) : undefined).trim().slice(0, 300),
        file: loc.file, line: loc.line, origin: 'log' }));
    }
  }
  return out;
}

function locate(logs, idx) {
  // cerca il riferimento al file più vicino prima del punto dell'errore (traceback Python o stack Node)
  const before = logs.slice(0, idx + 400);
  const py = [...before.matchAll(/File "([^"]+)", line (\d+)/g)].filter((m) => !/site-packages|dist-packages|asyncio|<frozen/.test(m[1])).pop();
  if (py) return { file: path.basename(py[1]), line: Number(py[2]) };
  const js = [...before.matchAll(/\(?((?:\/|[A-Z]:\\|file:\/\/)[^():\s]+\.(?:m?js|ts)):(\d+):\d+\)?/g)].filter((m) => !/node_modules|node:internal/.test(m[1])).pop();
  if (js) return { file: path.basename(js[1]), line: Number(js[2]) };
  return { file: null, line: null };
}

const SYMPTOMS = [
  { re: /non risponde|non funziona|nessuna risposta|silenzio|non succede niente/i, title: 'Il bot non risponde',
    solution: '1) Il processo è in esecuzione? 2) Nei log compare "Bot avviato"? 3) Il token in .env è corretto (Verifica token)? 4) È attivo un webhook che intercetta gli update (getWebhookInfo)? 5) Nei gruppi la privacy mode limita i messaggi visibili (/setprivacy). 6) C\'è un\'altra istanza attiva (errore 409)?' },
  { re: /gruppo|group/i, title: 'Comportamento nei gruppi',
    solution: 'Con la privacy mode attiva il bot riceve nei gruppi solo comandi, risposte ai suoi messaggi e menzioni. Disattivala con /setprivacy in @BotFather o rendi il bot amministratore, poi rimuovi e riaggiungi il bot al gruppo.' },
  { re: /pulsant|bottone|button|callback/i, title: 'Pulsanti che non reagiscono',
    solution: 'Verifica che esista un gestore per callback_query con lo stesso callback_data (max 64 byte) e che venga sempre chiamato answerCallbackQuery.' },
  { re: /webhook/i, title: 'Problemi di webhook',
    solution: 'Controlla getWebhookInfo (last_error_message), certificato HTTPS valido, porta 443/80/88/8443 e corrispondenza del secret_token.' },
  { re: /lent|ritard|slow/i, title: 'Bot lento',
    solution: 'Cerca operazioni bloccanti (time.sleep, requests, query lente) dentro handler asincroni; sposta i lavori lunghi in task in background.' },
];

function analyzeDescription(desc) {
  if (!desc || !desc.trim()) return [];
  return SYMPTOMS.filter((s) => s.re.test(desc)).map((s) => finding({ id: 'symptom', title: s.title, severity: 'info', category: 'Diagnosi guidata', solution: s.solution, origin: 'descrizione' }));
}

// ------------------------------------------------------------------ principale
async function analyze({ files = {}, logs = '', description = '' } = {}) {
  const out = [];
  const names = Object.keys(files).filter((n) => typeof files[n] === 'string');
  for (const f of names) {
    const text = files[f];
    ruleSecrets(f, text, out);
    const L = lang(f);
    if (L === 'python') rulePython(f, text, out);
    if (L === 'javascript' || L === 'typescript') ruleJs(f, text, out);
  }
  ruleDeps(files, out);
  out.push(...analyzeLogs(logs), ...analyzeDescription(description));

  const syntax = [];
  for (const f of names) {
    const res = await sandbox.syntaxCheck(f, files[f]);
    if (res) {
      syntax.push(res);
      if (res.ok === false) {
        out.push(finding({ id: 'syntax', title: `Errore di sintassi in ${f}`, severity: 'critico', category: 'Sintassi', file: f, line: res.line,
          snippet: res.snippet, description: res.error, cause: res.error, solution: 'Correggi il punto indicato; i controlli successivi dipendono da un file sintatticamente valido.',
          verify: res.tool, origin: 'sintassi' }));
      }
    }
  }
  // verifica sintattica delle correzioni automatiche proposte
  for (const fnd of out) {
    if (fnd.fixedCode && fnd.file && lang(fnd.file) !== 'text') {
      const r = await sandbox.syntaxCheck(fnd.file, fnd.fixedCode);
      fnd.fixVerified = r ? r.ok : null;
    }
  }
  out.sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity]);
  const summary = { total: out.length };
  for (const k of Object.keys(SEV_ORDER)) summary[k] = out.filter((x) => x.severity === k).length;
  return { findings: dedupe(out), syntax, summary, analyzedFiles: names.length, at: new Date().toISOString() };
}

function dedupe(list) {
  const seen = new Set();
  return list.filter((f) => {
    const k = `${f.id}|${f.file}|${f.line}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

module.exports = { analyze, analyzeLogs, KB };
