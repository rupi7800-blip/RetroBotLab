'use strict';
// Generatore JavaScript / TypeScript — grammY 1.x, SQLite integrato (node:sqlite, Node.js >= 22.13).
const { has } = require('./spec');

function gen(s, ts = false) {
  const F = (f) => has(s, f);
  const T = (annotation) => (ts ? annotation : ''); // annotazioni di tipo solo in TypeScript
  const flows = F('booking') || F('form');
  const needsSender = F('admin') || F('notify');
  const scheduler = F('notify');
  const ctxT = T(': Context');
  const p = [];

  p.push(`/**
 * ${s.name.replace(/\*\//g, '')} — bot Telegram generato da RETRO BOT LAB.
 *
 * Libreria: grammY 1.x (https://grammy.dev/)
 * Riferimento API: https://core.telegram.org/bots/api
 *
 * - I testi e le opzioni si modificano in config.json.
 * - Le credenziali stanno nel file .env (mai nel codice sorgente).
 * - Avvio: ${ts ? 'npm run build && npm start' : 'npm start'}
 */
import { readFileSync, existsSync${F('files') ? ', mkdirSync, writeFileSync' : ''} } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";
import { DatabaseSync } from "node:sqlite";
import { Bot, GrammyError, HttpError, InlineKeyboard${F('form') ? ', InputFile' : ''}, webhookCallback${ts ? ', type Context' : ''} } from "grammy";

// ---------------------------------------------------------------------------
// Configurazione
// ---------------------------------------------------------------------------
const BASE_DIR = ${ts ? 'join(dirname(fileURLToPath(import.meta.url)), "..")' : 'dirname(fileURLToPath(import.meta.url))'};
const ENV_FILE = join(BASE_DIR, ".env");
if (existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);

const BOT_TOKEN = (process.env.BOT_TOKEN ?? "").trim();
const MODE = (process.env.MODE ?? "${s.mode}").trim().toLowerCase();
// Vuoto = server ufficiale Telegram. Per il simulatore di RETRO BOT LAB: http://127.0.0.1:8080/mock
const API_ROOT = (process.env.TELEGRAM_API_BASE ?? "").trim().replace(/\\/+$/, "") || "https://api.telegram.org";
const ADMIN_IDS = new Set((process.env.ADMIN_IDS ?? "").split(/[,\\s]+/).filter((x) => /^-?\\d+$/.test(x)).map(Number));
const DB_PATH = process.env.DB_PATH ?? join(BASE_DIR, "bot.db");
const WEBHOOK_URL = (process.env.WEBHOOK_URL ?? "").trim().replace(/\\/+$/, "");
const WEBHOOK_PATH = process.env.WEBHOOK_PATH ?? "/telegram/webhook";
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET ?? "";
const WEBHOOK_HOST = process.env.WEBHOOK_HOST ?? "0.0.0.0";
const WEBHOOK_PORT = Number(process.env.WEBHOOK_PORT ?? 8443);

const CONFIG${T(': any')} = JSON.parse(readFileSync(join(BASE_DIR, "config.json"), "utf8"));
const DENIED = "⛔ Comando riservato agli amministratori.";

const log = {
  info: (...a${T(': unknown[]')}) => console.log(new Date().toISOString(), "INFO", ...a),
  warn: (...a${T(': unknown[]')}) => console.warn(new Date().toISOString(), "WARN", ...a),
  error: (...a${T(': unknown[]')}) => console.error(new Date().toISOString(), "ERROR", ...a),
};

if (!/^\\d+:[A-Za-z0-9_-]{20,}$/.test(BOT_TOKEN)) {
  console.error("❌ BOT_TOKEN mancante o non valido. Copia .env.example in .env e inserisci il token di @BotFather.");
  process.exit(1);
}

const bot = new Bot(BOT_TOKEN, { client: { apiRoot: API_ROOT } });
${flows ? `
// Stato delle procedure guidate in corso: userId -> { flow, step, data }
const STATE = new Map${T('<number, { flow: string; step: number; data: any }>')}();
` : ''}
// ---------------------------------------------------------------------------
// Database (SQLite integrato in Node.js, query sempre parametrizzate)
// ---------------------------------------------------------------------------
const db = new DatabaseSync(DB_PATH);
db.exec(\`CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  username TEXT,
  first_name TEXT,
  subscribed INTEGER NOT NULL DEFAULT 1,
  blocked INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  last_seen TEXT NOT NULL)\`);
${F('booking') ? `db.exec(\`CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  day TEXT NOT NULL,
  time TEXT NOT NULL,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'attiva',
  created_at TEXT NOT NULL)\`);
` : ''}${F('tasks') ? `db.exec(\`CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  text TEXT NOT NULL,
  done INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL)\`);
` : ''}${F('files') ? `db.exec(\`CREATE TABLE IF NOT EXISTS files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  file_name TEXT NOT NULL,
  path TEXT NOT NULL,
  size INTEGER,
  created_at TEXT NOT NULL)\`);
` : ''}${F('form') ? `db.exec(\`CREATE TABLE IF NOT EXISTS form_responses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  answers TEXT NOT NULL,
  created_at TEXT NOT NULL)\`);
` : ''}${F('shop') ? `db.exec(\`CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  items TEXT NOT NULL,
  total REAL NOT NULL,
  created_at TEXT NOT NULL)\`);
` : ''}
/** Restituisce tutte le righe di una query parametrizzata. */
const all = (sql${T(': string')}, ...params${T(': any[]')})${T(': any[]')} => db.prepare(sql).all(...params);
/** Esegue una query di modifica e restituisce l'id inserito. */
const run = (sql${T(': string')}, ...params${T(': any[]')})${T(': number')} => Number(db.prepare(sql).run(...params).lastInsertRowid);
const nowIso = () => new Date().toISOString().slice(0, 19);
const isAdmin = (id${T(': number | undefined')}) => id !== undefined && ADMIN_IDS.has(id);
const personalize = (text${T(': string')}, name${T('?: string')}) => text.replaceAll("{name}", name ?? "");
const sleep = (ms${T(': number')}) => new Promise((r) => setTimeout(r, ms));
const todayIso = () => {
  const d = new Date();
  return \`\${d.getFullYear()}-\${String(d.getMonth() + 1).padStart(2, "0")}-\${String(d.getDate()).padStart(2, "0")}\`;
};

/** Invia testi lunghi suddividendoli (limite Telegram: 4096 caratteri). */
async function replyLong(ctx${ctxT}, text${T(': string')}) {
  const t = text || "(vuoto)";
  for (let i = 0; i < t.length; i += 4000) await ctx.reply(t.slice(i, i + 4000));
}

async function notifyAdmins(text${T(': string')}) {
  for (const id of ADMIN_IDS) {
    try {
      await bot.api.sendMessage(id, text);
    } catch (e) {
      log.warn(\`Impossibile avvisare l'admin \${id}:\`, String(e));
    }
  }
}

// ---------------------------------------------------------------------------
// Middleware: registra ogni utente che scrive al bot
// ---------------------------------------------------------------------------
bot.use(async (ctx, next) => {
  const u = ctx.from;
  if (u && !u.is_bot) {
    const ts = nowIso();
    run(
      \`INSERT INTO users (id, username, first_name, created_at, last_seen) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET username = excluded.username, first_name = excluded.first_name,
       last_seen = excluded.last_seen, blocked = 0\`,
      u.id, u.username ?? null, u.first_name, ts, ts,
    );
  }
  await next();
});
`);

  if (F('menu')) p.push(`
// ---------------------------------------------------------------------------
// Menu a pulsanti
// ---------------------------------------------------------------------------
const MENU${T(': { label: string; reply: string }[]')} = CONFIG.menu ?? [];

function menuKeyboard() {
  if (!MENU.length) return undefined;
  const kb = new InlineKeyboard();
  MENU.forEach((item, i) => kb.text(item.label, \`menu:\${i}\`).row());
  return kb;
}

bot.command("menu", (ctx) => ctx.reply("Scegli una voce:", { reply_markup: menuKeyboard() }));

bot.callbackQuery(/^menu:(\\d+)$/, async (ctx) => {
  const idx = Number(ctx.match[1]);
  if (MENU[idx] && ctx.chat) await ctx.api.sendMessage(ctx.chat.id, MENU[idx].reply);
  await ctx.answerCallbackQuery();
});
`);

  p.push(`
// ---------------------------------------------------------------------------
// Comandi di base
// ---------------------------------------------------------------------------
bot.command("start", async (ctx) => {
${flows ? '  STATE.delete(ctx.from?.id);\n' : ''}  await ctx.reply(personalize(CONFIG.welcome, ctx.from?.first_name)${F('menu') ? ', { reply_markup: menuKeyboard() }' : ''});
});

bot.command("help", async (ctx) => {
  const fmt = (c${T(': { command: string; description: string }')}) => \`/\${c.command} — \${c.description}\`;
  let lines = ["Comandi disponibili:", ...CONFIG.bot_commands.map(fmt)];
  if (isAdmin(ctx.from?.id) && CONFIG.admin_commands?.length) {
    lines = lines.concat(["", "Comandi amministratore:", ...CONFIG.admin_commands.map(fmt)]);
  }
  await ctx.reply(lines.join("\\n"));
});

bot.command("id", (ctx) => ctx.reply(\`Il tuo ID Telegram è: \${ctx.from?.id}\\nID di questa chat: \${ctx.chat.id}\`));
${flows ? `
bot.command("stop", async (ctx) => {
  await ctx.reply(STATE.delete(ctx.from${ts ? '!' : '?'}.id) ? "Procedura annullata." : "Nessuna procedura in corso.");
});
` : ''}`);

  if (F('commands')) p.push(`
// Comandi personalizzati definiti in config.json
for (const c of (CONFIG.commands ?? [])${T(' as { command: string; reply: string }[]')}) {
  bot.command(c.command, (ctx) => ctx.reply(c.reply));
}
`);

  if (needsSender) p.push(`
/** Invia un messaggio a tutti gli utenti rispettando i limiti di Telegram. */
async function sendToUsers(text${T(': string')}, onlySubscribed = false) {
  const rows = all("SELECT id FROM users WHERE blocked = 0" + (onlySubscribed ? " AND subscribed = 1" : ""));
  let sent = 0;
  let failed = 0;
  for (const row of rows) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await bot.api.sendMessage(Number(row.id), text);
        sent++;
        break;
      } catch (e) {
        if (e instanceof GrammyError && e.error_code === 429 && attempt === 0) {
          await sleep(((e.parameters.retry_after ?? 1) + 1) * 1000);
          continue;
        }
        if (e instanceof GrammyError && e.error_code === 403) run("UPDATE users SET blocked = 1 WHERE id = ?", row.id);
        else log.warn(\`Invio a \${row.id} fallito:\`, String(e));
        failed++;
        break;
      }
    }
    await sleep(50); // max ~20 messaggi al secondo
  }
  return { sent, failed };
}
`);

  if (F('admin')) p.push(`
// ---------------------------------------------------------------------------
// Amministrazione
// ---------------------------------------------------------------------------
bot.command("stats", async (ctx) => {
  if (!isAdmin(ctx.from?.id)) return ctx.reply(DENIED);
  const count = (sql${T(': string')}, ...a${T(': any[]')}) => Number(all(sql, ...a)[0].n);
  const lines = [
    \`👥 Utenti registrati: \${count("SELECT COUNT(*) AS n FROM users")}\`,
    \`✅ Utenti raggiungibili: \${count("SELECT COUNT(*) AS n FROM users WHERE blocked = 0")}\`,
  ];
${F('notify') ? '  lines.push(`🔔 Iscritti alle notifiche: ${count("SELECT COUNT(*) AS n FROM users WHERE subscribed = 1 AND blocked = 0")}`);\n' : ''}${F('booking') ? '  lines.push(`📅 Prenotazioni future: ${count("SELECT COUNT(*) AS n FROM bookings WHERE status = \'attiva\' AND day >= ?", todayIso())}`);\n' : ''}${F('tasks') ? '  lines.push(`☑ Attività aperte: ${count("SELECT COUNT(*) AS n FROM tasks WHERE done = 0")}`);\n' : ''}${F('form') ? '  lines.push(`✎ Moduli compilati: ${count("SELECT COUNT(*) AS n FROM form_responses")}`);\n' : ''}${F('shop') ? '  lines.push(`🛒 Ordini ricevuti: ${count("SELECT COUNT(*) AS n FROM orders")}`);\n' : ''}${F('files') ? '  lines.push(`📁 File archiviati: ${count("SELECT COUNT(*) AS n FROM files")}`);\n' : ''}  await ctx.reply(lines.join("\\n"));
});

bot.command("broadcast", async (ctx) => {
  if (!isAdmin(ctx.from?.id)) return ctx.reply(DENIED);
  const text = String(ctx.match ?? "").trim();
  if (!text) return ctx.reply("Uso: /broadcast <testo del messaggio>");
  await ctx.reply("📤 Invio in corso…");
  const { sent, failed } = await sendToUsers(text);
  await ctx.reply(\`Inviati: \${sent} — Non recapitati: \${failed}\`);
});
`);

  if (F('notify')) p.push(`
// ---------------------------------------------------------------------------
// Notifiche programmate
// ---------------------------------------------------------------------------
bot.command("iscriviti", async (ctx) => {
  run("UPDATE users SET subscribed = 1 WHERE id = ?", ctx.from${ts ? '!' : '?'}.id);
  await ctx.reply(\`🔔 Iscrizione attiva. Riceverai le notifiche ogni giorno alle \${CONFIG.notify.time}.\`);
});

bot.command("disiscriviti", async (ctx) => {
  run("UPDATE users SET subscribed = 0 WHERE id = ?", ctx.from${ts ? '!' : '?'}.id);
  await ctx.reply("🔕 Non riceverai più le notifiche. Usa /iscriviti per riattivarle.");
});

let lastNotifyDay = "";
let schedulerTimer${T(': NodeJS.Timeout | undefined')};
function startScheduler() {
  log.info(\`Notifiche programmate ogni giorno alle \${CONFIG.notify.time} (ora del server)\`);
  schedulerTimer = setInterval(async () => {
    const now = new Date();
    const hhmm = \`\${String(now.getHours()).padStart(2, "0")}:\${String(now.getMinutes()).padStart(2, "0")}\`;
    const today = todayIso();
    if (hhmm !== CONFIG.notify.time || lastNotifyDay === today) return;
    lastNotifyDay = today;
    const { sent, failed } = await sendToUsers(CONFIG.notify.text, true);
    log.info(\`Notifica quotidiana: inviati \${sent}, falliti \${failed}\`);
${F('booking') ? `    for (const row of all("SELECT user_id, time FROM bookings WHERE status = 'attiva' AND day = ?", today)) {
      try {
        await bot.api.sendMessage(Number(row.user_id), \`⏰ Promemoria: oggi hai una prenotazione alle \${row.time}.\`);
      } catch (e) {
        log.warn("Promemoria non inviato:", String(e));
      }
    }
` : ''}  }, 20_000);
}
`);

  if (F('booking')) p.push(`
// ---------------------------------------------------------------------------
// Prenotazioni
// ---------------------------------------------------------------------------
const BOOKING = CONFIG.booking;
const itDate = (iso${T(': string')}) => iso.split("-").reverse().join("/");

bot.command("prenota", async (ctx) => {
  STATE.set(ctx.from${ts ? '!' : '?'}.id, { flow: "booking", step: 0, data: {} });
  await ctx.reply("📅 Nuova prenotazione.\\nIndica la data nel formato GG/MM/AAAA (es. 25/12/2026).\\nScrivi /stop per annullare.");
});

async function flowBooking(ctx${ctxT}, st${T(': { step: number; data: any }')}) {
  const text = (ctx.message?.text ?? "").trim();
  const uid = ctx.from${ts ? '!' : '?'}.id;
  if (st.step === 0) {
    const m = text.match(/^(\\d{1,2})\\/(\\d{1,2})\\/(\\d{4})$/);
    const d = m ? new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])) : null;
    if (!m || !d || d.getDate() !== Number(m[1]) || d.getMonth() !== Number(m[2]) - 1) {
      return ctx.reply("Data non valida. Usa il formato GG/MM/AAAA, ad esempio 25/12/2026.");
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffDays = Math.round((d.getTime() - today.getTime()) / 86_400_000);
    if (diffDays < BOOKING.min_days_ahead) return ctx.reply("La data non è disponibile: scegli una data futura.");
    st.data.day = \`\${m[3]}-\${m[2].padStart(2, "0")}-\${m[1].padStart(2, "0")}\`;
    st.step = 1;
    return ctx.reply(\`Perfetto. A che ora? Formato HH:MM, tra le \${BOOKING.open_from} e le \${BOOKING.open_to}.\`);
  }
  if (st.step === 1) {
    if (!/^([01]\\d|2[0-3]):[0-5]\\d$/.test(text)) return ctx.reply("Orario non valido. Usa il formato HH:MM, ad esempio 15:30.");
    if (text < BOOKING.open_from || text > BOOKING.open_to) {
      return ctx.reply(\`Orario fuori fascia: scegli tra le \${BOOKING.open_from} e le \${BOOKING.open_to}.\`);
    }
    if (all("SELECT 1 FROM bookings WHERE day = ? AND time = ? AND status = 'attiva'", st.data.day, text).length) {
      return ctx.reply("Questo orario è già occupato. Indica un altro orario.");
    }
    st.data.time = text;
    st.step = 2;
    return ctx.reply("Vuoi aggiungere una nota? Scrivila ora, oppure invia - per nessuna nota.");
  }
  const note = text === "-" ? "" : text.slice(0, 500);
  const id = run("INSERT INTO bookings (user_id, day, time, note, created_at) VALUES (?, ?, ?, ?, ?)", uid, st.data.day, st.data.time, note, nowIso());
  STATE.delete(uid);
  await ctx.reply(\`✅ Prenotazione n. \${id} confermata per il \${itDate(st.data.day)} alle \${st.data.time}.\\nUsa /prenotazioni per vederle.\`);
  await notifyAdmins(\`📅 Nuova prenotazione n. \${id}\\nUtente: \${ctx.from${ts ? '!' : '?'}.first_name} (id \${uid})\\nData: \${itDate(st.data.day)} ore \${st.data.time}\\nNota: \${note || "-"}\`);
}

bot.command("prenotazioni", async (ctx) => {
  const admin = isAdmin(ctx.from?.id);
  const rows = admin
    ? all("SELECT * FROM bookings WHERE status = 'attiva' AND day >= ? ORDER BY day, time LIMIT 50", todayIso())
    : all("SELECT * FROM bookings WHERE status = 'attiva' AND day >= ? AND user_id = ? ORDER BY day, time", todayIso(), ctx.from${ts ? '!' : '?'}.id);
  if (!rows.length) return ctx.reply("Nessuna prenotazione attiva. Usa /prenota per crearne una.");
  const lines = [admin ? "📋 Prossime prenotazioni (tutti gli utenti):" : "📋 Le tue prenotazioni:"];
  for (const r of rows) lines.push(\`n. \${r.id} — \${itDate(String(r.day))} ore \${r.time}\${r.note ? " — " + r.note : ""}\`);
  await replyLong(ctx, lines.join("\\n") + "\\n\\nPer annullare: /annulla <numero>");
});

bot.command("annulla", async (ctx) => {
  const arg = String(ctx.match ?? "").trim();
  if (!/^\\d+$/.test(arg)) return ctx.reply("Uso: /annulla <numero prenotazione>");
  const rows = all("SELECT * FROM bookings WHERE id = ? AND status = 'attiva'", Number(arg));
  if (!rows.length || (Number(rows[0].user_id) !== ctx.from?.id && !isAdmin(ctx.from?.id))) {
    return ctx.reply("Prenotazione non trovata.");
  }
  run("UPDATE bookings SET status = 'annullata' WHERE id = ?", Number(arg));
  await ctx.reply(\`❎ Prenotazione n. \${arg} annullata.\`);
  await notifyAdmins(\`❎ Prenotazione n. \${arg} annullata da \${ctx.from?.first_name}.\`);
});
`);

  if (F('tasks')) p.push(`
// ---------------------------------------------------------------------------
// Gestione attività
// ---------------------------------------------------------------------------
bot.command("aggiungi", async (ctx) => {
  const text = String(ctx.match ?? "").trim();
  if (!text) return ctx.reply("Uso: /aggiungi <descrizione attività>");
  const id = run("INSERT INTO tasks (user_id, text, created_at) VALUES (?, ?, ?)", ctx.from${ts ? '!' : '?'}.id, text.slice(0, 500), nowIso());
  await ctx.reply(\`☑ Attività n. \${id} aggiunta.\`);
});

bot.command("attivita", async (ctx) => {
  const rows = all("SELECT * FROM tasks WHERE user_id = ? ORDER BY done, id", ctx.from${ts ? '!' : '?'}.id);
  if (!rows.length) return ctx.reply("Nessuna attività. Aggiungine una con /aggiungi <testo>.");
  await replyLong(ctx, ["Le tue attività:", ...rows.map((r) => \`\${r.done ? "✅" : "⬜"} \${r.id}. \${r.text}\`)].join("\\n"));
});

async function taskUpdate(ctx${ctxT}, del${T(': boolean')}) {
  const arg = String(ctx.match ?? "").trim();
  if (!/^\\d+$/.test(arg)) return ctx.reply(\`Uso: /\${del ? "elimina" : "fatto"} <numero attività>\`);
  if (!all("SELECT id FROM tasks WHERE id = ? AND user_id = ?", Number(arg), ctx.from${ts ? '!' : '?'}.id).length) {
    return ctx.reply("Attività non trovata.");
  }
  if (del) {
    run("DELETE FROM tasks WHERE id = ?", Number(arg));
    return ctx.reply(\`🗑 Attività n. \${arg} eliminata.\`);
  }
  run("UPDATE tasks SET done = 1 WHERE id = ?", Number(arg));
  return ctx.reply(\`✅ Attività n. \${arg} completata.\`);
}

bot.command("fatto", (ctx) => taskUpdate(ctx, false));
bot.command("elimina", (ctx) => taskUpdate(ctx, true));
`);

  if (F('files')) p.push(`
// ---------------------------------------------------------------------------
// Documenti e file
// ---------------------------------------------------------------------------
const DOWNLOAD_DIR = process.env.DOWNLOAD_DIR ?? join(BASE_DIR, "downloads");
const MAX_FILE_SIZE = 20 * 1024 * 1024; // limite di download della Bot API standard

bot.on(["message:document", "message:photo"], async (ctx) => {
  const msg = ctx.message;
  const doc = msg.document;
  const obj${T(': { file_id: string; file_unique_id: string; file_size?: number }')} = doc ?? msg.photo${ts ? '!' : ''}[msg.photo${ts ? '!' : ''}.length - 1];
  const name = doc ? (doc.file_name ?? \`documento_\${doc.file_unique_id}\`) : \`foto_\${obj.file_unique_id}.jpg\`;
  if ((obj.file_size ?? 0) > MAX_FILE_SIZE) return ctx.reply("⚠ File troppo grande: il limite è 20 MB.");
  try {
    const file = await ctx.api.getFile(obj.file_id);
    const res = await fetch(\`\${API_ROOT}/file/bot\${BOT_TOKEN}/\${file.file_path}\`);
    if (!res.ok) throw new Error(\`HTTP \${res.status}\`);
    const data = Buffer.from(await res.arrayBuffer());
    const userDir = join(DOWNLOAD_DIR, String(ctx.from.id));
    mkdirSync(userDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
    const dest = join(userDir, \`\${stamp}_\${name.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 120)}\`);
    writeFileSync(dest, data);
    run("INSERT INTO files (user_id, file_name, path, size, created_at) VALUES (?, ?, ?, ?, ?)", ctx.from.id, name, dest, data.length, nowIso());
    await ctx.reply(\`📁 File salvato: \${name} (\${Math.floor(data.length / 1024) + 1} KB)\`);
  } catch (e) {
    log.error("Download fallito:", String(e));
    await ctx.reply("⚠ Non è stato possibile scaricare il file. Riprova.");
  }
});

bot.command("file", async (ctx) => {
  const rows = isAdmin(ctx.from?.id)
    ? all("SELECT * FROM files ORDER BY id DESC LIMIT 30")
    : all("SELECT * FROM files WHERE user_id = ? ORDER BY id DESC LIMIT 30", ctx.from${ts ? '!' : '?'}.id);
  if (!rows.length) return ctx.reply("Nessun file salvato. Inviami un documento o una foto.");
  await replyLong(ctx, ["📁 File archiviati:", ...rows.map((r) => \`\${r.id}. \${r.file_name} — \${String(r.created_at).slice(0, 16).replace("T", " ")}\`)].join("\\n"));
});
`);

  if (F('group')) p.push(`
// ---------------------------------------------------------------------------
// Gestione gruppi
// Nota: per leggere tutti i messaggi del gruppo disattiva la privacy con @BotFather (/setprivacy)
// oppure nomina il bot amministratore. Per eliminare messaggi e bannare servono i permessi di admin.
// ---------------------------------------------------------------------------
const BANNED_WORDS${T(': string[]')} = (CONFIG.group.banned_words ?? []).map((w${T(': string')}) => w.toLowerCase());
const escapeRe = (s${T(': string')}) => s.replace(/[.*+?^\${}()|[\\]\\\\]/g, "\\\\$&");

bot.on("message:new_chat_members", async (ctx) => {
  for (const m of ctx.message.new_chat_members) {
    if (!m.is_bot) await ctx.reply(personalize(CONFIG.group.welcome, m.first_name));
  }
});

async function moderate(ctx${ctxT}) {
  if (!ctx.chat || !["group", "supergroup"].includes(ctx.chat.type) || isAdmin(ctx.from?.id) || !BANNED_WORDS.length) return false;
  const low = (ctx.message?.text ?? "").toLowerCase();
  if (!BANNED_WORDS.some((w) => new RegExp(\`(?<![\\\\p{L}\\\\p{N}_])\${escapeRe(w)}(?![\\\\p{L}\\\\p{N}_])\`, "u").test(low))) return false;
  try {
    await ctx.deleteMessage();
    await ctx.reply(\`⚠ \${ctx.from?.first_name}, il messaggio è stato rimosso perché contiene parole non consentite.\`);
  } catch (e) {
    log.warn("Moderazione non riuscita (il bot è amministratore del gruppo?):", String(e));
  }
  return true;
}

bot.command("ban", async (ctx) => {
  if (!isAdmin(ctx.from?.id)) return ctx.reply(DENIED);
  const target = ctx.message?.reply_to_message?.from;
  if (!["group", "supergroup"].includes(ctx.chat.type) || !target) {
    return ctx.reply("Usa /ban in un gruppo, rispondendo al messaggio dell'utente da bannare.");
  }
  try {
    await ctx.api.banChatMember(ctx.chat.id, target.id);
    await ctx.reply(\`🔨 \${target.first_name} è stato bannato.\`);
  } catch (e) {
    await ctx.reply(\`Impossibile bannare l'utente: \${e instanceof GrammyError ? e.description : String(e)}\`);
  }
});
`);

  if (F('form')) p.push(`
// ---------------------------------------------------------------------------
// Raccolta dati (modulo a domande)
// ---------------------------------------------------------------------------
const FORM${T(': { title: string; questions: string[] }')} = CONFIG.form;

bot.command("modulo", async (ctx) => {
  STATE.set(ctx.from${ts ? '!' : '?'}.id, { flow: "form", step: 0, data: { answers: [] } });
  await ctx.reply(\`✎ \${FORM.title}\\n(scrivi /stop per annullare)\\n\\n1/\${FORM.questions.length} — \${FORM.questions[0]}\`);
});

async function flowForm(ctx${ctxT}, st${T(': { data: any }')}) {
  const answers${T(': string[]')} = st.data.answers;
  answers.push((ctx.message?.text ?? "").trim().slice(0, 1000));
  if (answers.length < FORM.questions.length) {
    return ctx.reply(\`\${answers.length + 1}/\${FORM.questions.length} — \${FORM.questions[answers.length]}\`);
  }
  STATE.delete(ctx.from${ts ? '!' : '?'}.id);
  const id = run("INSERT INTO form_responses (user_id, answers, created_at) VALUES (?, ?, ?)", ctx.from${ts ? '!' : '?'}.id, JSON.stringify(answers), nowIso());
  await ctx.reply("✅ Grazie! Le tue risposte sono state registrate.");
  const summary = FORM.questions.map((q, i) => \`• \${q}: \${answers[i]}\`).join("\\n");
  await notifyAdmins(\`✎ Nuovo modulo n. \${id} da \${ctx.from?.first_name} (id \${ctx.from?.id}):\\n\${summary}\`);
}

bot.command("esporta", async (ctx) => {
  if (!isAdmin(ctx.from?.id)) return ctx.reply(DENIED);
  const rows = all("SELECT * FROM form_responses ORDER BY id");
  if (!rows.length) return ctx.reply("Nessuna risposta da esportare.");
  const cell = (v${T(': unknown')}) => \`"\${String(v ?? "").replaceAll('"', '""')}"\`;
  const lines = [["n", "data", "user_id", ...FORM.questions].map(cell).join(";")];
  for (const r of rows) lines.push([r.id, r.created_at, r.user_id, ...JSON.parse(String(r.answers))].map(cell).join(";"));
  const data = Buffer.from("\\ufeff" + lines.join("\\r\\n"), "utf8");
  await ctx.replyWithDocument(new InputFile(data, "risposte.csv"), { caption: \`\${rows.length} risposte\` });
});
`);

  if (F('shop')) p.push(`
// ---------------------------------------------------------------------------
// Catalogo, carrello e ordini (senza pagamento integrato)
// ---------------------------------------------------------------------------
const PRODUCTS${T(': { name: string; price: number }[]')} = CONFIG.shop.products;
const CURRENCY = CONFIG.shop.currency;
const CARTS = new Map${T('<number, Map<number, number>>')}();
const money = (v${T(': number')}) => \`\${v.toFixed(2)} \${CURRENCY}\`;

function catalogKeyboard() {
  const kb = new InlineKeyboard();
  PRODUCTS.forEach((p, i) => kb.text(\`➕ \${p.name} — \${money(p.price)}\`, \`shop:add:\${i}\`).row());
  return kb.text("🧺 Vedi carrello", "shop:cart");
}

function cartView(userId${T(': number')})${T(': { text: string; kb?: InlineKeyboard }')} {
  const cart = CARTS.get(userId);
  if (!cart || !cart.size) return { text: "Il carrello è vuoto. Usa /catalogo per aggiungere prodotti." };
  let total = 0;
  const lines = ["🧺 Il tuo carrello:"];
  for (const [idx, qty] of cart) {
    const p = PRODUCTS[idx];
    total += p.price * qty;
    lines.push(\`\${qty} × \${p.name} = \${money(p.price * qty)}\`);
  }
  lines.push(\`\\nTotale: \${money(total)}\`);
  return { text: lines.join("\\n"), kb: new InlineKeyboard().text("✅ Conferma ordine", "shop:order").text("🗑 Svuota", "shop:clear") };
}

bot.command("catalogo", (ctx) => ctx.reply("🛒 Catalogo — tocca un prodotto per aggiungerlo al carrello:", { reply_markup: catalogKeyboard() }));
bot.command("carrello", (ctx) => {
  const v = cartView(ctx.from${ts ? '!' : '?'}.id);
  return ctx.reply(v.text, { reply_markup: v.kb });
});

bot.callbackQuery(/^shop:(add|cart|clear|order)(?::(\\d+))?$/, async (ctx) => {
  const uid = ctx.from.id;
  const action = ctx.match[1];
  const chatId = ctx.chat?.id ?? uid;
  if (action === "add") {
    const idx = Number(ctx.match[2]);
    if (!PRODUCTS[idx]) return ctx.answerCallbackQuery();
    const cart = CARTS.get(uid) ?? new Map${T('<number, number>')}();
    cart.set(idx, (cart.get(idx) ?? 0) + 1);
    CARTS.set(uid, cart);
    return ctx.answerCallbackQuery({ text: \`Aggiunto: \${PRODUCTS[idx].name} (×\${cart.get(idx)})\` });
  }
  if (action === "cart") {
    const v = cartView(uid);
    await ctx.api.sendMessage(chatId, v.text, { reply_markup: v.kb });
  } else if (action === "clear") {
    CARTS.delete(uid);
    await ctx.api.sendMessage(chatId, "🗑 Carrello svuotato.");
  } else if (action === "order") {
    const cart = CARTS.get(uid);
    if (!cart || !cart.size) return ctx.answerCallbackQuery({ text: "Il carrello è vuoto." });
    CARTS.delete(uid);
    const items = [...cart].map(([i, qty]) => ({ name: PRODUCTS[i].name, price: PRODUCTS[i].price, qty }));
    const total = items.reduce((s, it) => s + it.price * it.qty, 0);
    const id = run("INSERT INTO orders (user_id, items, total, created_at) VALUES (?, ?, ?, ?)", uid, JSON.stringify(items), total, nowIso());
    await ctx.api.sendMessage(chatId, \`✅ Ordine n. \${id} inviato! Totale \${money(total)}. Ti contatteremo per la conferma.\`);
    await notifyAdmins(\`🛒 Nuovo ordine n. \${id} da \${ctx.from.first_name} (id \${uid})\\n\${items.map((it) => \`\${it.qty} × \${it.name}\`).join("\\n")}\\nTotale: \${money(total)}\`);
  }
  await ctx.answerCallbackQuery();
});
`);

  if (F('api')) p.push(`
// ---------------------------------------------------------------------------
// Integrazione con API REST esterna
// ---------------------------------------------------------------------------
bot.command("api", async (ctx) => {
  const base = (process.env.EXTERNAL_API_URL ?? "").trim();
  if (!base) return ctx.reply("⚠ Servizio esterno non configurato: imposta EXTERNAL_API_URL nel file .env.");
  const url = new URL(base);
  const arg = String(ctx.match ?? "").trim();
  if (arg) url.searchParams.set("q", arg);
  const headers${T(': Record<string, string>')} = { Accept: "application/json" };
  if (process.env.EXTERNAL_API_KEY) headers.Authorization = \`Bearer \${process.env.EXTERNAL_API_KEY}\`;
  let body${T(': string')};
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(20_000) });
    body = await res.text();
    if (!res.ok) {
      log.warn(\`API esterna: HTTP \${res.status}\`);
      return ctx.reply(\`⚠ Il servizio esterno ha risposto con errore \${res.status}.\`);
    }
  } catch (e) {
    log.error("API esterna non raggiungibile:", String(e));
    return ctx.reply("⚠ Il servizio esterno non è raggiungibile al momento.");
  }
  let pretty = body;
  try {
    pretty = JSON.stringify(JSON.parse(body), null, 2);
  } catch {
    /* risposta non JSON: mostrata così com'è */
  }
  await replyLong(ctx, pretty.slice(0, 3800));
});
`);

  if (F('ai')) p.push(`
// ---------------------------------------------------------------------------
// Intelligenza artificiale (API compatibile OpenAI: OpenAI, OpenRouter, Groq, Mistral, Ollama…)
// Attenzione: i servizi AI cloud sono generalmente a pagamento o con piano gratuito limitato.
// ---------------------------------------------------------------------------
const AI_HISTORY = new Map${T('<number, { role: string; content: string }[]>')}();

async function askAi(userId${T(': number')}, text${T(': string')})${T(': Promise<string>')} {
  const base = (process.env.AI_API_BASE ?? "https://api.openai.com/v1").trim().replace(/\\/+$/, "");
  const key = (process.env.AI_API_KEY ?? "").trim();
  const model = (process.env.AI_MODEL ?? "").trim() || CONFIG.ai.model;
  if (!key && !/localhost|127\\.0\\.0\\.1/.test(base)) return "⚠ AI non configurata: imposta AI_API_KEY nel file .env.";
  const history = AI_HISTORY.get(userId) ?? [];
  const messages = [{ role: "system", content: CONFIG.ai.system_prompt }, ...history, { role: "user", content: text }];
  const headers${T(': Record<string, string>')} = { "Content-Type": "application/json" };
  if (key) headers.Authorization = \`Bearer \${key}\`;
  let data${T(': any')};
  try {
    const res = await fetch(\`\${base}/chat/completions\`, {
      method: "POST",
      headers,
      body: JSON.stringify({ model, messages }),
      signal: AbortSignal.timeout(90_000),
    });
    data = await res.json();
    if (!res.ok) {
      log.error(\`Errore AI HTTP \${res.status}:\`, JSON.stringify(data).slice(0, 300));
      return "⚠ Il servizio AI ha restituito un errore. Riprova più tardi.";
    }
  } catch (e) {
    log.error("Servizio AI non raggiungibile:", String(e));
    return "⚠ Il servizio AI non è raggiungibile al momento.";
  }
  const reply = String(data?.choices?.[0]?.message?.content ?? "").trim();
  if (!reply) return "⚠ Risposta del servizio AI non valida.";
  const keep = (CONFIG.ai.history_length ?? 6) * 2;
  history.push({ role: "user", content: text }, { role: "assistant", content: reply });
  AI_HISTORY.set(userId, keep ? history.slice(-keep) : []);
  return reply;
}

bot.command("reset", async (ctx) => {
  AI_HISTORY.delete(ctx.from${ts ? '!' : '?'}.id);
  await ctx.reply("🧹 Conversazione azzerata.");
});

async function handleAi(ctx${ctxT}) {
  const text = ctx.message?.text ?? "";
  if (ctx.chat?.type !== "private") {
    const me = ctx.me;
    const repliedToBot = ctx.message?.reply_to_message?.from?.id === me.id;
    if (!text.toLowerCase().includes(\`@\${me.username}\`.toLowerCase()) && !repliedToBot) return;
  }
  await ctx.replyWithChatAction("typing");
  await replyLong(ctx, await askAi(ctx.from${ts ? '!' : '?'}.id, text));
}
`);

  if (F('autoreply')) p.push(`
// ---------------------------------------------------------------------------
// Risposte automatiche a parole chiave
// ---------------------------------------------------------------------------
const reEscape = (s${T(': string')}) => s.replace(/[.*+?^\${}()|[\\]\\\\]/g, "\\\\$&");
const AUTOREPLIES = (CONFIG.autoreplies ?? []).map((r${T(': { keywords: string[]; reply: string }')}) => ({
  patterns: r.keywords.map((k) => new RegExp(\`(?<![\\\\p{L}\\\\p{N}_])\${reEscape(k.toLowerCase())}(?![\\\\p{L}\\\\p{N}_])\`, "u")),
  reply: r.reply,
}));

function findAutoreply(text${T(': string')}) {
  const low = text.toLowerCase();
  return AUTOREPLIES.find((r${T(': { patterns: RegExp[]; reply: string }')}) => r.patterns.some((re) => re.test(low)))?.reply;
}
`);

  const flowMap = [F('booking') ? 'booking: flowBooking' : null, F('form') ? 'form: flowForm' : null].filter(Boolean).join(', ');
  p.push(`
// ---------------------------------------------------------------------------
// Messaggi di testo liberi (registrato per ultimo: i comandi hanno la precedenza)
// ---------------------------------------------------------------------------
${flows ? `const FLOWS${T(': Record<string, (ctx: Context, st: any) => Promise<unknown>>')} = { ${flowMap} };\n\n` : ''}bot.on("message:text", async (ctx) => {
  const text = ctx.message.text;
  if (text.startsWith("/")) {
    if (ctx.chat.type === "private") await ctx.reply("Comando non riconosciuto. Scrivi /help per l'elenco.");
    return;
  }
${F('group') ? '  if (await moderate(ctx)) return;\n' : ''}${flows ? '  const st = STATE.get(ctx.from.id);\n  if (st) {\n    await FLOWS[st.flow](ctx, st);\n    return;\n  }\n' : ''}${F('autoreply') ? '  const reply = findAutoreply(text);\n  if (reply) {\n    await ctx.reply(reply);\n    return;\n  }\n' : ''}${F('ai') ? '  await handleAi(ctx);\n' : '  if (ctx.chat.type === "private" && CONFIG.fallback) await ctx.reply(CONFIG.fallback);\n'}});

bot.catch((err) => {
  const e = err.error;
  if (e instanceof GrammyError) log.error(\`Errore Bot API (update \${err.ctx.update.update_id}):\`, e.description);
  else if (e instanceof HttpError) log.error("Errore di rete verso Telegram:", String(e));
  else log.error("Errore non gestito:", e);
});

// ---------------------------------------------------------------------------
// Avvio
// ---------------------------------------------------------------------------
async function main() {
  await bot.api.setMyCommands(CONFIG.bot_commands.map((c${T(': { command: string; description: string }')}) => ({ command: c.command, description: c.description.slice(0, 256) })));
  await bot.init();
  log.info(\`Bot avviato: @\${bot.botInfo.username} (modalità \${MODE})\`);
${scheduler ? '  startScheduler();\n' : ''}
  if (MODE === "webhook") {
    if (!WEBHOOK_URL.startsWith("https://")) throw new Error("In modalità webhook WEBHOOK_URL deve essere un indirizzo https:// pubblico.");
    if (!/^[A-Za-z0-9_-]{16,256}$/.test(WEBHOOK_SECRET)) throw new Error("WEBHOOK_SECRET deve contenere 16-256 caratteri tra A-Z, a-z, 0-9, _ e -.");
    const handle = webhookCallback(bot, "http", { secretToken: WEBHOOK_SECRET });
    const server = createServer((req, res) => {
      if (req.method === "POST" && req.url === WEBHOOK_PATH) return handle(req, res);
      if (req.url === "/health") return res.end("ok");
      res.statusCode = 404;
      res.end();
    });
    server.listen(WEBHOOK_PORT, WEBHOOK_HOST, () => log.info(\`Server webhook in ascolto su \${WEBHOOK_HOST}:\${WEBHOOK_PORT}\${WEBHOOK_PATH}\`));
    await bot.api.setWebhook(\`\${WEBHOOK_URL}\${WEBHOOK_PATH}\`, { secret_token: WEBHOOK_SECRET });
    log.info(\`Webhook impostato su \${WEBHOOK_URL}\${WEBHOOK_PATH}\`);
  } else {
    await bot.api.deleteWebhook();
    void bot.start({ onStart: () => log.info("Long polling attivo") });
  }
}

const stop = () => {
${scheduler ? '  if (schedulerTimer) clearInterval(schedulerTimer);\n' : ''}  if (bot.isRunning()) void bot.stop();
  db.close();
  log.info("Bot arrestato");
  process.exit(0);
};
process.once("SIGINT", stop);
process.once("SIGTERM", stop);

main().catch((e) => {
  log.error("Avvio non riuscito:", e instanceof Error ? e.message : e);
  process.exit(1);
});
`);
  return p.join('');
}

function packageJson(s, ts, versions) {
  const grammy = versions?.grammy || '1.46.0';
  const pkg = {
    name: s.name.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'telegram-bot',
    version: '1.0.0',
    description: s.description || 'Bot Telegram generato da RETRO BOT LAB',
    type: 'module',
    private: true,
    main: ts ? 'dist/bot.js' : 'bot.js',
    engines: { node: '>=22.13' },
    scripts: ts
      ? { build: 'tsc', start: 'node dist/bot.js', dev: 'tsc && node dist/bot.js', check: 'tsc --noEmit', test: 'node --test test/*.test.js' }
      : { start: 'node bot.js', check: 'node --check bot.js', test: 'node --test test/*.test.js' },
    dependencies: { grammy: `^${grammy}` },
  };
  if (ts) pkg.devDependencies = { typescript: '^5.6.0', '@types/node': '^22.13.0' };
  return JSON.stringify(pkg, null, 2) + '\n';
}

const TSCONFIG = JSON.stringify({
  compilerOptions: {
    target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', outDir: 'dist', rootDir: 'src',
    strict: false, noImplicitAny: false, esModuleInterop: true, skipLibCheck: true, types: ['node'],
  },
  include: ['src'],
}, null, 2) + '\n';

module.exports = { gen, packageJson, TSCONFIG };
