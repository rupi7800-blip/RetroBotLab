'use strict';
// Percorso formativo in 4 livelli. Ogni lezione: spiegazione semplice e approfondita, esempio, codice, esercizio, soluzione, link.
// Gli esempi di codice usano aiogram 3 (Python) e grammY (JavaScript).

const L = [];
const add = (o) => L.push(o);

// ============================== LIVELLO 1 — PRINCIPIANTE
add({
  id: 'cosa-e-un-bot', level: 1, title: 'Cos\'è un bot Telegram',
  summary: 'Un bot è un account Telegram controllato da un programma invece che da una persona.',
  simple: 'Un bot è come un utente Telegram automatico. Le persone gli scrivono, e un programma che gira su un computer o su un server legge i messaggi e risponde. Il bot non "vive" dentro Telegram: vive nel tuo programma, che dialoga con Telegram tramite Internet.',
  advanced: 'I bot usano la Bot API, un\'interfaccia HTTPS esposta da Telegram (https://api.telegram.org/bot<token>/<metodo>). Il programma riceve gli "update" (messaggi, pressioni di pulsanti, ingressi nei gruppi) tramite long polling (getUpdates) o webhook (Telegram invia una richiesta POST al tuo server) e risponde chiamando metodi come sendMessage. I bot non hanno numero di telefono, non possono iniziare conversazioni con utenti che non li hanno avviati e nei gruppi, con la privacy mode attiva, vedono solo comandi e menzioni.',
  example: 'Un bot di un ristorante risponde a /orari con gli orari di apertura e a /menu con il menu del giorno.',
  code: {
    python: '# Il flusso, in pseudocodice commentato:\n# 1. Telegram riceve un messaggio per il bot\n# 2. Il tuo programma chiede a Telegram: "ci sono novità?" (getUpdates)\n# 3. Telegram risponde con l\'update che contiene il messaggio\n# 4. Il programma decide la risposta e chiama sendMessage\n',
    javascript: '// Stesso flusso: getUpdates (o webhook) -> elaborazione -> sendMessage\n',
  },
  exercise: 'Elenca tre attività ripetitive che svolgi su Telegram o via email che un bot potrebbe automatizzare.',
  solution: 'Esempi: rispondere alle domande frequenti, inviare un promemoria ogni mattina, raccogliere iscrizioni a un evento con un modulo.',
  links: ['https://core.telegram.org/bots', 'https://core.telegram.org/bots/features'],
});
add({
  id: 'come-funziona', level: 1, title: 'Come funziona: update, polling e webhook',
  summary: 'Il bot riceve gli eventi da Telegram in due modi: polling o webhook.',
  simple: 'Polling: il tuo programma chiede continuamente a Telegram "ci sono messaggi nuovi?". È il metodo più semplice e funziona anche sul tuo PC. Webhook: è Telegram a "bussare" al tuo server ogni volta che arriva un messaggio; serve un indirizzo internet pubblico con HTTPS.',
  advanced: 'getUpdates con il parametro timeout mantiene la richiesta aperta fino a 50 secondi (long polling), riducendo le chiamate. Il parametro offset conferma gli update già elaborati. Con setWebhook Telegram invia POST JSON all\'URL indicato (porte 443, 80, 88 o 8443) e, se impostato secret_token, aggiunge l\'header X-Telegram-Bot-Api-Secret-Token da verificare. Webhook e getUpdates sono mutuamente esclusivi: con un webhook attivo getUpdates restituisce l\'errore 409.',
  example: 'In sviluppo usi il polling sul tuo PC; in produzione su un server puoi passare al webhook.',
  code: {
    python: 'import asyncio\nfrom aiogram import Bot, Dispatcher\n\nasync def main():\n    bot = Bot(token="LEGGI_DA_.ENV")\n    dp = Dispatcher()\n    await dp.start_polling(bot)  # long polling\n\nasyncio.run(main())\n',
    javascript: 'import { Bot } from "grammy";\nconst bot = new Bot(process.env.BOT_TOKEN);\nbot.start(); // long polling\n',
  },
  exercise: 'Quale modalità sceglieresti per un bot che gira su un Raspberry Pi in casa, senza IP pubblico? Perché?',
  solution: 'Il long polling: non richiede che il dispositivo sia raggiungibile da Internet, basta la connessione in uscita.',
  links: ['https://core.telegram.org/bots/api#getting-updates', 'https://core.telegram.org/bots/webhooks'],
});
add({
  id: 'creare-bot', level: 1, title: 'Creare un bot e ottenere il token',
  summary: 'Il bot si crea con @BotFather, che fornisce il token di accesso.',
  simple: 'Apri Telegram, cerca @BotFather (con la spunta blu), invia /newbot, scegli un nome e uno username che termina con "bot". BotFather ti dà un token: è la chiave del tuo bot. Conservalo come una password, nel file .env.',
  advanced: 'Il token ha la forma <id_numerico>:<stringa>. Chi lo possiede controlla completamente il bot. Va caricato da variabile d\'ambiente (os.getenv / process.env), mai scritto nel codice o pubblicato. Se compromesso, /revoke in BotFather lo invalida e ne genera uno nuovo. Con /setcommands, /setdescription, /setabouttext, /setuserpic e /setprivacy si configurano comandi, descrizioni, immagine e privacy mode.',
  example: 'File .env:\nBOT_TOKEN=123456789:AA...\n(il file .env va in .gitignore)',
  code: {
    python: 'import os\nfrom dotenv import load_dotenv\n\nload_dotenv()\nBOT_TOKEN = os.getenv("BOT_TOKEN")\nif not BOT_TOKEN:\n    raise SystemExit("Imposta BOT_TOKEN nel file .env")\n',
    javascript: 'process.loadEnvFile(".env"); // Node.js 22+\nconst BOT_TOKEN = process.env.BOT_TOKEN;\nif (!BOT_TOKEN) throw new Error("Imposta BOT_TOKEN nel file .env");\n',
  },
  exercise: 'Crea il tuo primo bot con @BotFather e salva il token in un file .env. Poi segui la Guida BotFather di RETRO BOT LAB e usa "Verifica token".',
  solution: 'La verifica chiama getMe: se il token è valido viene mostrato lo username del bot.',
  links: ['https://core.telegram.org/bots/features#botfather', 'https://core.telegram.org/bots/tutorial'],
});
add({
  id: 'primi-messaggi', level: 1, title: 'Inviare e ricevere messaggi',
  summary: 'Il primo bot: risponde a /start e ripete i messaggi (echo).',
  simple: 'Un "handler" è una funzione che viene chiamata quando arriva un certo tipo di messaggio. Registri un handler per /start che saluta, e uno per i messaggi di testo che ripete ciò che l\'utente ha scritto.',
  advanced: 'In aiogram gli handler si registrano su un Router con filtri (CommandStart(), F.text); in grammY con bot.command() e bot.on("message:text"). L\'ordine conta: i gestori più specifici vanno registrati prima di quelli generici. message.answer() / ctx.reply() chiamano sendMessage nella stessa chat.',
  example: 'Utente: /start → Bot: "Ciao Mario!". Utente: "prova" → Bot: "prova".',
  code: {
    python: 'import asyncio, os\nfrom aiogram import Bot, Dispatcher, F, Router\nfrom aiogram.filters import CommandStart\nfrom aiogram.types import Message\nfrom dotenv import load_dotenv\n\nload_dotenv()\nrouter = Router()\n\n@router.message(CommandStart())\nasync def start(message: Message):\n    await message.answer(f"Ciao {message.from_user.first_name}!")\n\n@router.message(F.text)\nasync def echo(message: Message):\n    await message.answer(message.text)\n\nasync def main():\n    dp = Dispatcher()\n    dp.include_router(router)\n    await dp.start_polling(Bot(os.getenv("BOT_TOKEN")))\n\nasyncio.run(main())\n',
    javascript: 'import { Bot } from "grammy";\nprocess.loadEnvFile(".env");\nconst bot = new Bot(process.env.BOT_TOKEN);\n\nbot.command("start", (ctx) => ctx.reply(`Ciao ${ctx.from?.first_name}!`));\nbot.on("message:text", (ctx) => ctx.reply(ctx.message.text));\nbot.catch((err) => console.error(err.error));\nbot.start();\n',
  },
  exercise: 'Modifica il bot echo perché risponda in MAIUSCOLO e conti i caratteri del messaggio.',
  solution: 'Python: await message.answer(f"{message.text.upper()} ({len(message.text)} caratteri)")\nJS: ctx.reply(`${ctx.message.text.toUpperCase()} (${ctx.message.text.length} caratteri)`)',
  links: ['https://docs.aiogram.dev/en/latest/dispatcher/router.html', 'https://grammy.dev/guide/basics'],
});

// ============================== LIVELLO 2 — INTERMEDIO
add({
  id: 'comandi', level: 2, title: 'Comandi e argomenti',
  summary: 'Comandi con parametri e registrazione del menu comandi.',
  simple: 'I comandi iniziano con "/". Puoi leggere ciò che l\'utente scrive dopo il comando (es. /meteo Roma → "Roma"). Con setMyCommands l\'elenco dei comandi compare nel menu di Telegram.',
  advanced: 'In aiogram CommandObject.args contiene il testo dopo il comando; in grammY ctx.match. I nomi dei comandi: 1-32 caratteri tra a-z, 0-9 e _. setMyCommands supporta scope (privati, gruppi, admin) e language_code per menu localizzati.',
  example: '/somma 3 5 → 8',
  code: {
    python: 'from aiogram.filters import Command, CommandObject\n\n@router.message(Command("somma"))\nasync def somma(message: Message, command: CommandObject):\n    try:\n        numeri = [float(x) for x in (command.args or "").split()]\n    except ValueError:\n        return await message.answer("Uso: /somma 3 5")\n    await message.answer(f"Risultato: {sum(numeri):g}")\n\n# all\'avvio:\n# await bot.set_my_commands([BotCommand(command="somma", description="Somma numeri")])\n',
    javascript: 'bot.command("somma", (ctx) => {\n  const nums = ctx.match.split(/\\s+/).filter(Boolean).map(Number);\n  if (!nums.length || nums.some(Number.isNaN)) return ctx.reply("Uso: /somma 3 5");\n  return ctx.reply(`Risultato: ${nums.reduce((a, b) => a + b, 0)}`);\n});\nawait bot.api.setMyCommands([{ command: "somma", description: "Somma numeri" }]);\n',
  },
  exercise: 'Crea il comando /media che calcola la media dei numeri passati.',
  solution: 'Come /somma ma dividi la somma per len(numeri) controllando che la lista non sia vuota.',
  links: ['https://core.telegram.org/bots/features#commands', 'https://core.telegram.org/bots/api#setmycommands'],
});
add({
  id: 'pulsanti', level: 2, title: 'Pulsanti e menu (tastiere inline)',
  summary: 'Tastiere inline con callback e risposta ai pulsanti.',
  simple: 'Sotto un messaggio puoi mettere dei pulsanti. Quando l\'utente ne preme uno, il bot riceve un "callback" con un codice (callback_data) e può rispondere.',
  advanced: 'callback_data è limitato a 64 byte. Bisogna sempre chiamare answerCallbackQuery (anche senza testo) per togliere l\'indicatore di caricamento. Per aggiornare il messaggio si usa editMessageText; se il contenuto non cambia Telegram restituisce "message is not modified". Esistono anche tastiere "reply" (sostituiscono la tastiera del telefono) e pulsanti URL o Mini App.',
  example: 'Messaggio "Scegli:" con pulsanti [Sì] [No].',
  code: {
    python: 'from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton, CallbackQuery\n\nkb = InlineKeyboardMarkup(inline_keyboard=[[\n    InlineKeyboardButton(text="Sì", callback_data="voto:si"),\n    InlineKeyboardButton(text="No", callback_data="voto:no"),\n]])\n\n@router.message(Command("vota"))\nasync def vota(message: Message):\n    await message.answer("Ti piace il bot?", reply_markup=kb)\n\n@router.callback_query(F.data.startswith("voto:"))\nasync def on_voto(cb: CallbackQuery):\n    await cb.answer("Grazie!")\n    await cb.message.edit_text(f"Hai votato: {cb.data.split(\':\')[1]}")\n',
    javascript: 'import { InlineKeyboard } from "grammy";\nconst kb = new InlineKeyboard().text("Sì", "voto:si").text("No", "voto:no");\nbot.command("vota", (ctx) => ctx.reply("Ti piace il bot?", { reply_markup: kb }));\nbot.callbackQuery(/^voto:(si|no)$/, async (ctx) => {\n  await ctx.answerCallbackQuery({ text: "Grazie!" });\n  await ctx.editMessageText(`Hai votato: ${ctx.match[1]}`);\n});\n',
  },
  exercise: 'Crea un menu con tre pulsanti (Orari, Indirizzo, Contatti) che risponde con un testo diverso per ciascuno.',
  solution: 'Usa callback_data "menu:0", "menu:1", "menu:2" e un unico handler che legge l\'indice. Il generatore di RETRO BOT LAB (funzione "Menu a pulsanti") produce esattamente questo codice.',
  links: ['https://core.telegram.org/bots/features#inline-keyboards', 'https://core.telegram.org/bots/api#answercallbackquery'],
});
add({
  id: 'utenti-database', level: 2, title: 'Gestione utenti e database SQLite',
  summary: 'Salvare utenti e dati con query parametrizzate.',
  simple: 'Un database permette al bot di ricordare: chi lo ha usato, preferenze, prenotazioni. SQLite è un database in un singolo file, gratuito e senza server: ideale per iniziare.',
  advanced: 'Usa sempre query parametrizzate (? come segnaposto) per evitare SQL injection. In codice asincrono le chiamate sqlite3 sono sincrone: brevi query vanno bene, per carichi elevati usa aiosqlite o PostgreSQL con asyncpg. In Node.js 22.13+ è disponibile node:sqlite integrato. UPSERT (INSERT ... ON CONFLICT DO UPDATE) aggiorna l\'utente se esiste già.',
  example: 'Tabella users(id, first_name, created_at) aggiornata a ogni messaggio.',
  code: {
    python: 'import sqlite3\n\nconn = sqlite3.connect("bot.db")\nconn.execute("CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, first_name TEXT)")\n\ndef salva_utente(user_id: int, nome: str) -> None:\n    conn.execute(\n        "INSERT INTO users (id, first_name) VALUES (?, ?) "\n        "ON CONFLICT(id) DO UPDATE SET first_name = excluded.first_name",\n        (user_id, nome),\n    )\n    conn.commit()\n',
    javascript: 'import { DatabaseSync } from "node:sqlite";\nconst db = new DatabaseSync("bot.db");\ndb.exec("CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, first_name TEXT)");\nconst upsert = db.prepare(\n  "INSERT INTO users (id, first_name) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET first_name = excluded.first_name",\n);\nbot.use(async (ctx, next) => {\n  if (ctx.from) upsert.run(ctx.from.id, ctx.from.first_name);\n  await next();\n});\n',
  },
  exercise: 'Aggiungi il comando /utenti che mostra quante persone hanno usato il bot.',
  solution: 'SELECT COUNT(*) FROM users e rispondi con il numero. Limitalo agli amministratori controllando l\'ID.',
  links: ['https://docs.python.org/3/library/sqlite3.html', 'https://nodejs.org/api/sqlite.html'],
});
add({
  id: 'file-immagini', level: 2, title: 'File e immagini',
  summary: 'Ricevere, scaricare e inviare documenti e foto.',
  simple: 'Quando un utente invia un file, Telegram fornisce un identificativo (file_id). Con getFile ottieni il percorso e puoi scaricarlo. Per inviare un file puoi caricarlo dal disco o riusare un file_id.',
  advanced: 'Limiti della Bot API standard: download fino a 20 MB, upload fino a 50 MB (più alti con un server Bot API locale). Le foto arrivano in più risoluzioni: l\'ultima della lista è la più grande. Sanifica sempre il nome del file prima di salvarlo per evitare path traversal.',
  example: 'L\'utente invia una ricevuta in PDF, il bot la salva in downloads/<id_utente>/.',
  code: {
    python: '@router.message(F.document)\nasync def on_doc(message: Message, bot: Bot):\n    doc = message.document\n    if doc.file_size and doc.file_size > 20 * 1024 * 1024:\n        return await message.answer("File troppo grande")\n    nome = re.sub(r"[^A-Za-z0-9._-]", "_", doc.file_name or "file")\n    await bot.download(doc, destination=f"downloads/{nome}")\n    await message.answer("Salvato!")\n',
    javascript: 'bot.on("message:document", async (ctx) => {\n  const file = await ctx.getFile();\n  const url = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${file.file_path}`;\n  const data = Buffer.from(await (await fetch(url)).arrayBuffer());\n  // salva data su disco con un nome sanificato\n  await ctx.reply(`Ricevuti ${data.length} byte`);\n});\n',
  },
  exercise: 'Fai rispondere il bot con le dimensioni in KB di ogni foto ricevuta.',
  solution: 'Leggi message.photo[-1].file_size (Python) o ctx.message.photo.at(-1).file_size (JS) e dividi per 1024.',
  links: ['https://core.telegram.org/bots/api#getfile', 'https://core.telegram.org/bots/api#senddocument'],
});
add({
  id: 'notifiche', level: 2, title: 'Notifiche e automazioni programmate',
  summary: 'Inviare messaggi a orari stabiliti rispettando i limiti.',
  simple: 'Il bot può inviare messaggi da solo, per esempio ogni mattina alle 9, ma solo agli utenti che lo hanno avviato almeno una volta.',
  advanced: 'Un task in background (asyncio.create_task, setInterval) o una libreria di scheduling (APScheduler, node-cron) controlla l\'orario. Limiti: circa 30 messaggi al secondo in totale e 1 al secondo per la stessa chat; su 429 attendere retry_after. Gli utenti che hanno bloccato il bot generano 403: vanno marcati e saltati.',
  example: 'Promemoria quotidiano "Ricorda di bere acqua" alle 10:00 agli iscritti.',
  code: {
    python: 'async def scheduler(bot: Bot):\n    inviato_oggi = None\n    while True:\n        ora = datetime.now()\n        if ora.strftime("%H:%M") == "10:00" and inviato_oggi != ora.date():\n            inviato_oggi = ora.date()\n            for uid in iscritti():\n                try:\n                    await bot.send_message(uid, "Ricorda di bere acqua 💧")\n                except TelegramForbiddenError:\n                    segna_bloccato(uid)\n                await asyncio.sleep(0.05)\n        await asyncio.sleep(20)\n',
    javascript: 'setInterval(async () => {\n  const now = new Date();\n  if (now.getHours() === 10 && now.getMinutes() === 0 && lastDay !== now.toDateString()) {\n    lastDay = now.toDateString();\n    for (const id of iscritti()) {\n      try { await bot.api.sendMessage(id, "Ricorda di bere acqua 💧"); }\n      catch (e) { if (e.error_code === 403) segnaBloccato(id); }\n      await new Promise((r) => setTimeout(r, 50));\n    }\n  }\n}, 20_000);\n',
  },
  exercise: 'Aggiungi i comandi /iscriviti e /disiscriviti che modificano un campo subscribed nel database.',
  solution: 'UPDATE users SET subscribed = 1/0 WHERE id = ? e filtra gli iscritti con WHERE subscribed = 1. Il modello "Notifiche" del generatore lo implementa completamente.',
  links: ['https://core.telegram.org/bots/faq#my-bot-is-hitting-limits-how-do-i-avoid-this'],
});

// ============================== LIVELLO 3 — AVANZATO
add({
  id: 'webhook', level: 3, title: 'Webhook in produzione',
  summary: 'Configurare webhook sicuri con HTTPS e secret token.',
  simple: 'Con il webhook Telegram invia i messaggi direttamente al tuo server. Serve un dominio con certificato HTTPS valido e una "parola segreta" che Telegram allega a ogni richiesta, così il server rifiuta le richieste false.',
  advanced: 'setWebhook(url, secret_token, allowed_updates, max_connections). Il server deve rispondere 200 rapidamente (operazioni lunghe in background). Reverse proxy consigliato: Caddy (certificati automatici) o Nginx + Let\'s Encrypt. Monitora getWebhookInfo: pending_update_count e last_error_message. aiogram: SimpleRequestHandler(secret_token=...); grammY: webhookCallback(bot, adapter, { secretToken }).',
  example: 'WEBHOOK_URL=https://bot.example.com, WEBHOOK_PATH=/telegram/webhook, porta locale 8443 dietro Caddy.',
  code: {
    python: 'from aiohttp import web\nfrom aiogram.webhook.aiohttp_server import SimpleRequestHandler, setup_application\n\nasync def on_startup(bot: Bot):\n    await bot.set_webhook(f"{WEBHOOK_URL}/telegram/webhook", secret_token=WEBHOOK_SECRET)\n\ndp.startup.register(on_startup)\napp = web.Application()\nSimpleRequestHandler(dispatcher=dp, bot=bot, secret_token=WEBHOOK_SECRET).register(app, path="/telegram/webhook")\nsetup_application(app, dp, bot=bot)\nweb.run_app(app, host="0.0.0.0", port=8443)\n',
    javascript: 'import { createServer } from "node:http";\nimport { webhookCallback } from "grammy";\nconst handle = webhookCallback(bot, "http", { secretToken: process.env.WEBHOOK_SECRET });\ncreateServer((req, res) => req.url === "/telegram/webhook" ? handle(req, res) : res.end()).listen(8443);\nawait bot.api.setWebhook(`${process.env.WEBHOOK_URL}/telegram/webhook`, { secret_token: process.env.WEBHOOK_SECRET });\n',
  },
  exercise: 'Scrivi la configurazione Caddy che inoltra https://bot.example.com al bot sulla porta 8443.',
  solution: 'Caddyfile:\nbot.example.com {\n    reverse_proxy 127.0.0.1:8443\n}',
  links: ['https://core.telegram.org/bots/webhooks', 'https://core.telegram.org/bots/api#setwebhook', 'https://grammy.dev/guide/deployment-types'],
});
add({
  id: 'api-esterne', level: 3, title: 'API esterne e integrazione AI',
  summary: 'Chiamare servizi REST e modelli AI in modo asincrono e sicuro.',
  simple: 'Il bot può chiedere dati ad altri servizi (meteo, gestionali, intelligenza artificiale) e riportarli all\'utente. Le chiavi di questi servizi vanno nel file .env.',
  advanced: 'Usa client HTTP asincroni (aiohttp, fetch) con timeout. Gestisci errori di rete e codici HTTP; non mostrare all\'utente messaggi tecnici. Per l\'AI: limita la lunghezza della cronologia, imposta un prompt di sistema, considera costi e privacy (non inviare dati personali non necessari). I servizi AI cloud sono generalmente a pagamento o con piano gratuito limitato; Ollama in locale è gratuito ma richiede hardware adeguato.',
  example: '/meteo Roma → chiama un\'API meteo e risponde con la temperatura.',
  code: {
    python: 'import aiohttp\n\nasync def get_json(url: str, params: dict) -> dict:\n    timeout = aiohttp.ClientTimeout(total=15)\n    async with aiohttp.ClientSession(timeout=timeout) as s:\n        async with s.get(url, params=params) as r:\n            r.raise_for_status()\n            return await r.json()\n',
    javascript: 'async function getJson(url) {\n  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });\n  if (!res.ok) throw new Error(`HTTP ${res.status}`);\n  return res.json();\n}\n',
  },
  exercise: 'Crea /repo <owner/nome> che mostra le stelle di un repository GitHub usando https://api.github.com/repos/<owner>/<nome>.',
  solution: 'Chiama l\'URL, leggi stargazers_count e gestisci 404 con "Repository non trovato".',
  links: ['https://docs.aiohttp.org/en/stable/client_quickstart.html', 'https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API'],
});
add({
  id: 'permessi', level: 3, title: 'Sistemi multiutente e permessi',
  summary: 'Ruoli, amministratori e controllo degli accessi.',
  simple: 'Alcuni comandi devono essere usati solo da te o dal tuo staff. Il bot controlla l\'ID Telegram di chi scrive e lo confronta con un elenco di amministratori.',
  advanced: 'Gli ID Telegram sono stabili, gli username no: autorizza sempre per ID. Per ruoli multipli usa una tabella roles(user_id, role) e un middleware/filtro riutilizzabile. Nei gruppi puoi verificare i permessi reali con getChatMember. Registra nei log le azioni amministrative.',
  example: 'ADMIN_IDS=12345,67890 nel file .env; /broadcast è riservato a questi utenti.',
  code: {
    python: 'from aiogram.filters import BaseFilter\n\nclass IsAdmin(BaseFilter):\n    async def __call__(self, message: Message) -> bool:\n        return message.from_user.id in ADMIN_IDS\n\n@router.message(Command("broadcast"), IsAdmin())\nasync def broadcast(message: Message): ...\n',
    javascript: 'const adminOnly = (ctx, next) => ADMIN_IDS.has(ctx.from?.id) ? next() : ctx.reply("⛔ Riservato");\nbot.command("broadcast", adminOnly, async (ctx) => { /* ... */ });\n',
  },
  exercise: 'Aggiungi un ruolo "moderatore" che può usare /ban ma non /broadcast.',
  solution: 'Crea MODERATOR_IDS, un filtro IsModerator che accetta admin o moderatori, e applicalo solo a /ban.',
  links: ['https://core.telegram.org/bots/api#getchatmember', 'https://docs.aiogram.dev/en/latest/dispatcher/filters/index.html'],
});
add({
  id: 'sicurezza', level: 3, title: 'Sicurezza del bot',
  summary: 'Token, credenziali, input e dipendenze.',
  simple: 'Le regole d\'oro: il token sta solo nel file .env; non fidarti mai di ciò che scrivono gli utenti; aggiorna le librerie; non stampare password nei log.',
  advanced: 'Checklist: segreti in variabili d\'ambiente o secret manager; .env in .gitignore; query parametrizzate; escape dell\'HTML; validazione di lunghezze e formati; secret_token sui webhook; container non root; audit delle dipendenze (pip-audit, npm audit); rate limiting per utente; log senza dati sensibili; backup cifrati del database.',
  example: 'Un utente con nome "<b>Mario" rompe un messaggio HTML non escapato: html.escape lo previene.',
  code: {
    python: 'import html\nawait message.answer(f"Ciao <b>{html.escape(message.from_user.first_name)}</b>", parse_mode="HTML")\n',
    javascript: 'const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");\nawait ctx.reply(`Ciao <b>${esc(ctx.from.first_name)}</b>`, { parse_mode: "HTML" });\n',
  },
  exercise: 'Esegui l\'Analisi del codice di RETRO BOT LAB su un tuo progetto e correggi tutte le segnalazioni di gravità critica e alta.',
  solution: 'Le segnalazioni includono file, riga e soluzione; per il token nel codice viene proposta la correzione automatica.',
  links: ['https://core.telegram.org/bots/api#formatting-options', 'https://pypi.org/project/pip-audit/', 'https://docs.npmjs.com/cli/commands/npm-audit'],
});
add({
  id: 'architettura', level: 3, title: 'Architetture modulari e prestazioni',
  summary: 'Organizzare il codice in moduli e mantenerlo veloce.',
  simple: 'Quando il bot cresce, dividilo in file: uno per i comandi, uno per il database, uno per i servizi esterni. È più facile da leggere e correggere.',
  advanced: 'aiogram: un Router per area funzionale, inclusi nel Dispatcher; grammY: Composer per moduli. Separa handler (interfaccia), servizi (logica) e repository (dati). Prestazioni: niente chiamate bloccanti negli handler, risposte rapide alle callback, cache per dati letti spesso, code (Redis) per lavori pesanti, indici sul database.',
  example: 'bot/handlers/start.py, bot/handlers/booking.py, bot/services/db.py, bot/main.py',
  code: {
    python: '# handlers/booking.py\nfrom aiogram import Router\nrouter = Router(name="booking")\n\n# main.py\nfrom handlers import booking, start\ndp.include_routers(start.router, booking.router)\n',
    javascript: '// booking.js\nimport { Composer } from "grammy";\nexport const booking = new Composer();\nbooking.command("prenota", (ctx) => ctx.reply("..."));\n// bot.js\nbot.use(booking);\n',
  },
  exercise: 'Riorganizza un progetto generato spostando le prenotazioni in un modulo separato.',
  solution: 'Sposta handler e funzioni di prenotazione in un file dedicato con il proprio Router/Composer e includilo nel file principale.',
  links: ['https://docs.aiogram.dev/en/latest/dispatcher/router.html', 'https://grammy.dev/advanced/structuring'],
});

// ============================== LIVELLO 4 — PROFESSIONALE
add({
  id: 'scalabilita', level: 4, title: 'Progettazione di sistemi complessi e scalabilità',
  summary: 'Più istanze, stato condiviso, code di lavoro.',
  simple: 'Se il bot ha moltissimi utenti, può servire più di un processo. I processi devono condividere le informazioni tramite un database centrale invece che nella memoria del singolo programma.',
  advanced: 'Con il polling si può avere una sola istanza per token: per scalare usa webhook dietro un bilanciatore. Lo stato (sessioni, FSM, carrelli) va in Redis o PostgreSQL (aiogram RedisStorage, grammY storage adapters). Lavori lenti in code (Celery, RQ, BullMQ). Idempotenza: lo stesso update può essere riconsegnato, usa update_id per deduplicare.',
  example: 'Due istanze webhook dietro Nginx, stato FSM in Redis, database PostgreSQL.',
  code: {
    python: 'from aiogram.fsm.storage.redis import RedisStorage\n\nstorage = RedisStorage.from_url("redis://localhost:6379/0")\ndp = Dispatcher(storage=storage)\n',
    javascript: '// grammY: sessioni persistenti con un adapter di storage\n// https://grammy.dev/plugins/session#known-storage-adapters\n',
  },
  exercise: 'Elenca quali dati dei progetti generati sono in memoria (e quindi persi al riavvio) e dove li sposteresti.',
  solution: 'STATE delle procedure, carrelli (CARTS) e cronologia AI: da spostare in Redis o in tabelle del database.',
  links: ['https://docs.aiogram.dev/en/latest/dispatcher/finite_state_machine/storages.html', 'https://grammy.dev/plugins/session'],
});
add({
  id: 'distribuzione', level: 4, title: 'Distribuzione, monitoraggio e backup',
  summary: 'Docker, servizi di sistema, log e salvataggi.',
  simple: 'Per tenere il bot sempre acceso lo si installa su un server come servizio che riparte da solo. Si controllano i log e si fanno copie di sicurezza del database.',
  advanced: 'Opzioni: Docker con --restart unless-stopped; systemd con Restart=always; PaaS. Monitoraggio: health check HTTP, log strutturati, alert su errori ripetuti (Sentry, Uptime Kuma - self-hosted e gratuiti). Backup: copia periodica di bot.db (sqlite3 .backup), conservazione su storage esterno, test di ripristino.',
  example: 'Unità systemd /etc/systemd/system/mio-bot.service con Restart=always.',
  code: {
    python: '# /etc/systemd/system/mio-bot.service\n# [Unit]\n# Description=Mio bot Telegram\n# After=network-online.target\n# [Service]\n# WorkingDirectory=/opt/mio-bot\n# ExecStart=/opt/mio-bot/.venv/bin/python main.py\n# Restart=always\n# User=botuser\n# [Install]\n# WantedBy=multi-user.target\n',
    javascript: '# Backup giornaliero con cron (crontab -e)\n# 0 3 * * * sqlite3 /opt/mio-bot/bot.db ".backup /backup/bot-$(date +\\%F).db"\n',
  },
  exercise: 'Prepara un\'unità systemd per un progetto generato e verifica che il bot riparta dopo un riavvio del server.',
  solution: 'systemctl enable --now mio-bot; dopo il riavvio systemctl status mio-bot deve risultare active (running).',
  links: ['https://docs.docker.com/engine/containers/start-containers-automatically/', 'https://www.sqlite.org/backup.html'],
});
add({
  id: 'test-automatici', level: 4, title: 'Test automatici e manutenzione',
  summary: 'Testare la logica senza Telegram e aggiornare in sicurezza.',
  simple: 'I test sono piccoli programmi che controllano che il bot funzioni dopo ogni modifica. Il simulatore di RETRO BOT LAB permette di provare il bot senza usare Telegram.',
  advanced: 'Separa la logica pura (calcoli, validazioni) dagli handler per testarla con unittest/pytest o node:test. Test di integrazione contro un server Bot API simulato (es. il simulatore di RETRO BOT LAB, impostando TELEGRAM_API_BASE). Aggiornamenti: leggi il changelog della Bot API e delle librerie, aggiorna in un ramo separato, esegui i test, poi pubblica.',
  example: 'Test che verifica la validazione della data di prenotazione.',
  code: {
    python: 'import unittest\nfrom datetime import date\n\ndef data_valida(testo: str) -> bool:\n    try:\n        g, m, a = map(int, testo.split("/"))\n        return date(a, m, g) >= date.today()\n    except ValueError:\n        return False\n\nclass T(unittest.TestCase):\n    def test_formato(self):\n        self.assertFalse(data_valida("31/02/2030"))\n        self.assertTrue(data_valida("01/01/2099"))\n',
    javascript: 'import { test } from "node:test";\nimport assert from "node:assert/strict";\nconst valida = (s) => /^\\d{2}\\/\\d{2}\\/\\d{4}$/.test(s);\ntest("formato data", () => {\n  assert.ok(valida("01/01/2099"));\n  assert.ok(!valida("1-1-2099"));\n});\n',
  },
  exercise: 'Avvia un progetto generato nel simulatore (Test & Simulatore → Esegui nel sandbox) e prova tutti i comandi.',
  solution: 'Il registro delle chiamate API mostra ogni richiesta del bot: verifica che non compaiano errori.',
  links: ['https://docs.python.org/3/library/unittest.html', 'https://nodejs.org/api/test.html', 'https://core.telegram.org/bots/api-changelog'],
});
add({
  id: 'piu-bot', level: 4, title: 'Gestione di più bot',
  summary: 'Organizzare più bot, token e ambienti.',
  simple: 'Se gestisci più bot, tieni separati token, database e configurazioni. È utile avere un bot "di prova" diverso da quello pubblico.',
  advanced: 'Un token per ambiente (sviluppo, produzione). aiogram può gestire più bot nello stesso processo (start_polling(bot1, bot2)); grammY con istanze separate. Configurazione per ambiente tramite file .env distinti. Nomenclatura e documentazione coerenti, CI che esegue i test su ogni modifica.',
  example: 'mio_bot (produzione) e mio_bot_test (sviluppo) con .env.production e .env.development.',
  code: {
    python: '# aiogram: più bot nello stesso dispatcher\n# await dp.start_polling(bot_prod, bot_supporto)\n',
    javascript: '// grammY: due istanze indipendenti\n// const a = new Bot(process.env.TOKEN_A); const b = new Bot(process.env.TOKEN_B);\n// a.start(); b.start();\n',
  },
  exercise: 'Duplica un progetto in RETRO BOT LAB per creare la versione di test e usa un token diverso.',
  solution: 'Progetti → Duplica. Nel nuovo progetto imposta un altro token e, se serve, un altro database.',
  links: ['https://docs.aiogram.dev/en/latest/dispatcher/dispatcher.html'],
});

const LEVELS = [
  { level: 1, title: 'Principiante', desc: 'Cos\'è un bot, come crearlo, primi messaggi.' },
  { level: 2, title: 'Intermedio', desc: 'Comandi, pulsanti, database, file, notifiche.' },
  { level: 3, title: 'Avanzato', desc: 'Webhook, API esterne e AI, permessi, sicurezza, architettura.' },
  { level: 4, title: 'Professionale', desc: 'Scalabilità, distribuzione, test, più bot.' },
];

module.exports = { LESSONS: L, LEVELS };
