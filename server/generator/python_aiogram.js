'use strict';
// Generatore Python — aiogram 3.x. Produce main.py completo in base alle funzionalità scelte.
const { has } = require('./spec');

function gen(s) {
  const F = (f) => has(s, f);
  const flows = F('booking') || F('form');
  const usesAiohttp = F('ai') || F('api');
  const needsSender = F('admin') || F('notify');
  const scheduler = F('notify');
  const usesDate = F('booking') || F('notify');
  const usesCmdObj = F('commands') || F('admin') || F('booking') || F('tasks') || F('api');
  const usesKb = F('menu') || F('shop');
  const parts = [];

  parts.push(`#!/usr/bin/env python3
"""
${s.name.replace(/"""/g, '')} — bot Telegram generato da RETRO BOT LAB.

Libreria: aiogram 3.x (https://docs.aiogram.dev/)
Riferimento API: https://core.telegram.org/bots/api

- I testi e le opzioni si modificano in config.json.
- Le credenziali stanno nel file .env (mai nel codice sorgente).
- Avvio: python main.py
"""
import asyncio
${F('form') ? 'import csv\nimport io\n' : ''}import json
import logging
import os
import re
import sqlite3
from datetime import ${usesDate ? 'date, ' : ''}datetime
from pathlib import Path

${usesAiohttp ? 'import aiohttp\n' : ''}from aiogram import Bot, Dispatcher, F, Router
from aiogram.client.session.aiohttp import AiohttpSession
from aiogram.client.telegram import TelegramAPIServer
from aiogram.exceptions import TelegramAPIError${needsSender ? ', TelegramForbiddenError, TelegramRetryAfter' : ''}
from aiogram.filters import Command, ${usesCmdObj ? 'CommandObject, ' : ''}CommandStart
from aiogram.types import (
    BotCommand,
${F('form') ? '    BufferedInputFile,\n' : ''}${usesKb ? '    CallbackQuery,\n' : ''}    ErrorEvent,
${usesKb ? '    InlineKeyboardButton,\n    InlineKeyboardMarkup,\n' : ''}    Message,
)
from dotenv import load_dotenv

# ---------------------------------------------------------------------------
# Configurazione
# ---------------------------------------------------------------------------
BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

BOT_TOKEN = os.getenv("BOT_TOKEN", "").strip()
MODE = os.getenv("MODE", "${s.mode}").strip().lower()
# Vuoto = server ufficiale Telegram. Per il simulatore di RETRO BOT LAB: http://127.0.0.1:8080/mock
TELEGRAM_API_BASE = os.getenv("TELEGRAM_API_BASE", "").strip().rstrip("/")
ADMIN_IDS = {int(x) for x in re.split(r"[,\\s]+", os.getenv("ADMIN_IDS", "")) if x.strip().lstrip("-").isdigit()}
DB_PATH = os.getenv("DB_PATH", str(BASE_DIR / "bot.db"))
WEBHOOK_URL = os.getenv("WEBHOOK_URL", "").strip().rstrip("/")
WEBHOOK_PATH = os.getenv("WEBHOOK_PATH", "/telegram/webhook")
WEBHOOK_SECRET = os.getenv("WEBHOOK_SECRET", "")
WEBHOOK_HOST = os.getenv("WEBHOOK_HOST", "0.0.0.0")
WEBHOOK_PORT = int(os.getenv("WEBHOOK_PORT", "8443"))

CONFIG = json.loads((BASE_DIR / "config.json").read_text(encoding="utf-8"))

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
log = logging.getLogger("bot")

router = Router()
dp = Dispatcher()
DENIED = "⛔ Comando riservato agli amministratori."
${flows ? '\n# Stato delle procedure guidate in corso: user_id -> {"flow": str, "step": int, "data": dict}\nSTATE: dict[int, dict] = {}\n' : ''}${scheduler ? 'BACKGROUND_TASKS: list[asyncio.Task] = []\n' : ''}

# ---------------------------------------------------------------------------
# Database (SQLite, query sempre parametrizzate)
# ---------------------------------------------------------------------------
def q(sql: str, params: tuple = (), fetch: bool = False):
    """Esegue una query parametrizzata. Con fetch=True restituisce le righe."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        cur = conn.execute(sql, params)
        rows = cur.fetchall() if fetch else None
        conn.commit()
        return rows if fetch else cur.lastrowid
    finally:
        conn.close()


def init_db() -> None:
    q("""CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY,
        username TEXT,
        first_name TEXT,
        subscribed INTEGER NOT NULL DEFAULT 1,
        blocked INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        last_seen TEXT NOT NULL)""")
${F('booking') ? `    q("""CREATE TABLE IF NOT EXISTS bookings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        day TEXT NOT NULL,
        time TEXT NOT NULL,
        note TEXT,
        status TEXT NOT NULL DEFAULT 'attiva',
        created_at TEXT NOT NULL)""")
` : ''}${F('tasks') ? `    q("""CREATE TABLE IF NOT EXISTS tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        text TEXT NOT NULL,
        done INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL)""")
` : ''}${F('files') ? `    q("""CREATE TABLE IF NOT EXISTS files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        file_name TEXT NOT NULL,
        path TEXT NOT NULL,
        size INTEGER,
        created_at TEXT NOT NULL)""")
` : ''}${F('form') ? `    q("""CREATE TABLE IF NOT EXISTS form_responses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        answers TEXT NOT NULL,
        created_at TEXT NOT NULL)""")
` : ''}${F('shop') ? `    q("""CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        items TEXT NOT NULL,
        total REAL NOT NULL,
        created_at TEXT NOT NULL)""")
` : ''}

def now_iso() -> str:
    return datetime.now().isoformat(timespec="seconds")


def is_admin(user_id: int) -> bool:
    return user_id in ADMIN_IDS


def personalize(text: str, first_name: str | None) -> str:
    return text.replace("{name}", first_name or "")


async def answer_long(message: Message, text: str) -> None:
    """Invia testi lunghi suddividendoli (limite Telegram: 4096 caratteri)."""
    text = text or "(vuoto)"
    for i in range(0, len(text), 4000):
        await message.answer(text[i:i + 4000])


async def notify_admins(bot: Bot, text: str) -> None:
    for admin_id in ADMIN_IDS:
        try:
            await bot.send_message(admin_id, text)
        except TelegramAPIError as e:
            log.warning("Impossibile avvisare l'admin %s: %s", admin_id, e)


# ---------------------------------------------------------------------------
# Middleware: registra ogni utente che scrive al bot
# ---------------------------------------------------------------------------
async def track_user(handler, event, data):
    user = getattr(event, "from_user", None)
    if user and not user.is_bot:
        ts = now_iso()
        q("""INSERT INTO users (id, username, first_name, created_at, last_seen) VALUES (?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET username = excluded.username,
             first_name = excluded.first_name, last_seen = excluded.last_seen, blocked = 0""",
          (user.id, user.username, user.first_name, ts, ts))
    return await handler(event, data)


router.message.outer_middleware(track_user)
router.callback_query.outer_middleware(track_user)
`);

  // ---------- menu keyboard ----------
  if (F('menu')) parts.push(`
# ---------------------------------------------------------------------------
# Menu a pulsanti
# ---------------------------------------------------------------------------
MENU = CONFIG.get("menu", [])


def menu_keyboard() -> InlineKeyboardMarkup | None:
    if not MENU:
        return None
    rows = [[InlineKeyboardButton(text=item["label"], callback_data=f"menu:{i}")] for i, item in enumerate(MENU)]
    return InlineKeyboardMarkup(inline_keyboard=rows)


@router.message(Command("menu"))
async def cmd_menu(message: Message) -> None:
    await message.answer("Scegli una voce:", reply_markup=menu_keyboard())


@router.callback_query(F.data.startswith("menu:"))
async def on_menu(callback: CallbackQuery, bot: Bot) -> None:
    try:
        idx = int(callback.data.split(":", 1)[1])
    except ValueError:
        idx = -1
    if 0 <= idx < len(MENU):
        chat_id = callback.message.chat.id if callback.message else callback.from_user.id
        await bot.send_message(chat_id, MENU[idx]["reply"])
    await callback.answer()
`);

  // ---------- base commands ----------
  parts.push(`
# ---------------------------------------------------------------------------
# Comandi di base
# ---------------------------------------------------------------------------
@router.message(CommandStart())
async def cmd_start(message: Message) -> None:
${flows ? '    STATE.pop(message.from_user.id, None)\n' : ''}    await message.answer(personalize(CONFIG["welcome"], message.from_user.first_name)${F('menu') ? ', reply_markup=menu_keyboard()' : ''})


@router.message(Command("help"))
async def cmd_help(message: Message) -> None:
    lines = ["Comandi disponibili:"]
    lines += [f"/{c['command']} — {c['description']}" for c in CONFIG["bot_commands"]]
    if is_admin(message.from_user.id) and CONFIG.get("admin_commands"):
        lines += ["", "Comandi amministratore:"]
        lines += [f"/{c['command']} — {c['description']}" for c in CONFIG["admin_commands"]]
    await message.answer("\\n".join(lines))


@router.message(Command("id"))
async def cmd_id(message: Message) -> None:
    await message.answer(f"Il tuo ID Telegram è: {message.from_user.id}\\nID di questa chat: {message.chat.id}")
${flows ? `

@router.message(Command("stop"))
async def cmd_stop(message: Message) -> None:
    if STATE.pop(message.from_user.id, None):
        await message.answer("Procedura annullata.")
    else:
        await message.answer("Nessuna procedura in corso.")
` : ''}`);

  if (F('commands')) parts.push(`

# Comandi personalizzati definiti in config.json
CUSTOM_COMMANDS = {c["command"].lower(): c["reply"] for c in CONFIG.get("commands", [])}


async def cmd_custom(message: Message, command: CommandObject) -> None:
    reply = CUSTOM_COMMANDS.get(command.command.lower())
    if reply:
        await message.answer(reply)


if CUSTOM_COMMANDS:
    router.message.register(cmd_custom, Command(*CUSTOM_COMMANDS.keys()))
`);

  if (needsSender) parts.push(`

async def send_to_users(bot: Bot, text: str, only_subscribed: bool = False) -> tuple[int, int]:
    """Invia un messaggio a tutti gli utenti rispettando i limiti di Telegram. Restituisce (inviati, falliti)."""
    sql = "SELECT id FROM users WHERE blocked = 0" + (" AND subscribed = 1" if only_subscribed else "")
    sent = failed = 0
    for row in q(sql, fetch=True):
        for attempt in range(2):
            try:
                await bot.send_message(row["id"], text)
                sent += 1
                break
            except TelegramRetryAfter as e:
                await asyncio.sleep(e.retry_after + 1)
            except TelegramForbiddenError:
                q("UPDATE users SET blocked = 1 WHERE id = ?", (row["id"],))
                failed += 1
                break
            except TelegramAPIError as e:
                log.warning("Invio a %s fallito: %s", row["id"], e)
                failed += 1
                break
        else:
            failed += 1
        await asyncio.sleep(0.05)  # max ~20 messaggi al secondo
    return sent, failed
`);

  if (F('admin')) parts.push(`

# ---------------------------------------------------------------------------
# Amministrazione
# ---------------------------------------------------------------------------
@router.message(Command("stats"))
async def cmd_stats(message: Message) -> None:
    if not is_admin(message.from_user.id):
        await message.answer(DENIED)
        return
    total = q("SELECT COUNT(*) AS n FROM users", fetch=True)[0]["n"]
    active = q("SELECT COUNT(*) AS n FROM users WHERE blocked = 0", fetch=True)[0]["n"]
    lines = [f"👥 Utenti registrati: {total}", f"✅ Utenti raggiungibili: {active}"]
${F('notify') ? '    subs = q("SELECT COUNT(*) AS n FROM users WHERE subscribed = 1 AND blocked = 0", fetch=True)[0]["n"]\n    lines.append(f"🔔 Iscritti alle notifiche: {subs}")\n' : ''}${F('booking') ? '    nb = q("SELECT COUNT(*) AS n FROM bookings WHERE status = \'attiva\' AND day >= ?", (date.today().isoformat(),), fetch=True)[0]["n"]\n    lines.append(f"📅 Prenotazioni future: {nb}")\n' : ''}${F('tasks') ? '    nt = q("SELECT COUNT(*) AS n FROM tasks WHERE done = 0", fetch=True)[0]["n"]\n    lines.append(f"☑ Attività aperte: {nt}")\n' : ''}${F('form') ? '    nf = q("SELECT COUNT(*) AS n FROM form_responses", fetch=True)[0]["n"]\n    lines.append(f"✎ Moduli compilati: {nf}")\n' : ''}${F('shop') ? '    no = q("SELECT COUNT(*) AS n FROM orders", fetch=True)[0]["n"]\n    lines.append(f"🛒 Ordini ricevuti: {no}")\n' : ''}${F('files') ? '    nfi = q("SELECT COUNT(*) AS n FROM files", fetch=True)[0]["n"]\n    lines.append(f"📁 File archiviati: {nfi}")\n' : ''}    await message.answer("\\n".join(lines))


@router.message(Command("broadcast"))
async def cmd_broadcast(message: Message, command: CommandObject, bot: Bot) -> None:
    if not is_admin(message.from_user.id):
        await message.answer(DENIED)
        return
    if not command.args:
        await message.answer("Uso: /broadcast <testo del messaggio>")
        return
    await message.answer("📤 Invio in corso…")
    sent, failed = await send_to_users(bot, command.args)
    await message.answer(f"Inviati: {sent} — Non recapitati: {failed}")
`);

  if (F('notify')) parts.push(`

# ---------------------------------------------------------------------------
# Notifiche programmate
# ---------------------------------------------------------------------------
@router.message(Command("iscriviti"))
async def cmd_subscribe(message: Message) -> None:
    q("UPDATE users SET subscribed = 1 WHERE id = ?", (message.from_user.id,))
    await message.answer(f"🔔 Iscrizione attiva. Riceverai le notifiche ogni giorno alle {CONFIG['notify']['time']}.")


@router.message(Command("disiscriviti"))
async def cmd_unsubscribe(message: Message) -> None:
    q("UPDATE users SET subscribed = 0 WHERE id = ?", (message.from_user.id,))
    await message.answer("🔕 Non riceverai più le notifiche. Usa /iscriviti per riattivarle.")


async def daily_scheduler(bot: Bot) -> None:
    """Controlla l'orario ogni 20 secondi e invia la notifica una volta al giorno (ora del server)."""
    last_sent: date | None = None
    target = CONFIG["notify"]["time"]
    log.info("Notifiche programmate ogni giorno alle %s (ora del server)", target)
    while True:
        now = datetime.now()
        if now.strftime("%H:%M") == target and last_sent != now.date():
            last_sent = now.date()
            sent, failed = await send_to_users(bot, CONFIG["notify"]["text"], only_subscribed=True)
            log.info("Notifica quotidiana: inviati %s, falliti %s", sent, failed)
${F('booking') ? `            for row in q("SELECT user_id, time FROM bookings WHERE status = 'attiva' AND day = ?",
                         (now.date().isoformat(),), fetch=True):
                try:
                    await bot.send_message(row["user_id"], f"⏰ Promemoria: oggi hai una prenotazione alle {row['time']}.")
                except TelegramAPIError as e:
                    log.warning("Promemoria non inviato a %s: %s", row["user_id"], e)
` : ''}        await asyncio.sleep(20)
`);

  if (F('booking')) parts.push(`

# ---------------------------------------------------------------------------
# Prenotazioni
# ---------------------------------------------------------------------------
BOOKING = CONFIG["booking"]


@router.message(Command("prenota"))
async def cmd_book(message: Message) -> None:
    STATE[message.from_user.id] = {"flow": "booking", "step": 0, "data": {}}
    await message.answer("📅 Nuova prenotazione.\\nIndica la data nel formato GG/MM/AAAA (es. 25/12/2026).\\nScrivi /stop per annullare.")


async def flow_booking(message: Message, st: dict, bot: Bot) -> None:
    text = (message.text or "").strip()
    uid = message.from_user.id
    if st["step"] == 0:
        try:
            day = datetime.strptime(text, "%d/%m/%Y").date()
        except ValueError:
            await message.answer("Data non valida. Usa il formato GG/MM/AAAA, ad esempio 25/12/2026.")
            return
        if (day - date.today()).days < BOOKING["min_days_ahead"]:
            await message.answer("La data non è disponibile: scegli una data futura.")
            return
        st["data"]["day"] = day.isoformat()
        st["step"] = 1
        await message.answer(f"Perfetto. A che ora? Formato HH:MM, tra le {BOOKING['open_from']} e le {BOOKING['open_to']}.")
    elif st["step"] == 1:
        if not re.fullmatch(r"([01]\\d|2[0-3]):[0-5]\\d", text):
            await message.answer("Orario non valido. Usa il formato HH:MM, ad esempio 15:30.")
            return
        if not (BOOKING["open_from"] <= text <= BOOKING["open_to"]):
            await message.answer(f"Orario fuori fascia: scegli tra le {BOOKING['open_from']} e le {BOOKING['open_to']}.")
            return
        busy = q("SELECT 1 FROM bookings WHERE day = ? AND time = ? AND status = 'attiva'", (st["data"]["day"], text), fetch=True)
        if busy:
            await message.answer("Questo orario è già occupato. Indica un altro orario.")
            return
        st["data"]["time"] = text
        st["step"] = 2
        await message.answer("Vuoi aggiungere una nota? Scrivila ora, oppure invia - per nessuna nota.")
    else:
        note = "" if text == "-" else text[:500]
        d = st["data"]
        booking_id = q("INSERT INTO bookings (user_id, day, time, note, created_at) VALUES (?, ?, ?, ?, ?)",
                       (uid, d["day"], d["time"], note, now_iso()))
        STATE.pop(uid, None)
        day_it = datetime.fromisoformat(d["day"]).strftime("%d/%m/%Y")
        await message.answer(f"✅ Prenotazione n. {booking_id} confermata per il {day_it} alle {d['time']}.\\nUsa /prenotazioni per vederle.")
        await notify_admins(bot, f"📅 Nuova prenotazione n. {booking_id}\\nUtente: {message.from_user.full_name} (id {uid})\\n"
                                 f"Data: {day_it} ore {d['time']}\\nNota: {note or '-'}")


@router.message(Command("prenotazioni"))
async def cmd_bookings(message: Message) -> None:
    today = date.today().isoformat()
    if is_admin(message.from_user.id):
        rows = q("SELECT * FROM bookings WHERE status = 'attiva' AND day >= ? ORDER BY day, time LIMIT 50", (today,), fetch=True)
        title = "📋 Prossime prenotazioni (tutti gli utenti):"
    else:
        rows = q("SELECT * FROM bookings WHERE status = 'attiva' AND day >= ? AND user_id = ? ORDER BY day, time",
                 (today, message.from_user.id), fetch=True)
        title = "📋 Le tue prenotazioni:"
    if not rows:
        await message.answer("Nessuna prenotazione attiva. Usa /prenota per crearne una.")
        return
    lines = [title] + [
        f"n. {r['id']} — {datetime.fromisoformat(r['day']).strftime('%d/%m/%Y')} ore {r['time']}" + (f" — {r['note']}" if r["note"] else "")
        for r in rows
    ]
    await answer_long(message, "\\n".join(lines) + "\\n\\nPer annullare: /annulla <numero>")


@router.message(Command("annulla"))
async def cmd_cancel_booking(message: Message, command: CommandObject, bot: Bot) -> None:
    if not command.args or not command.args.strip().isdigit():
        await message.answer("Uso: /annulla <numero prenotazione>")
        return
    booking_id = int(command.args.strip())
    rows = q("SELECT * FROM bookings WHERE id = ? AND status = 'attiva'", (booking_id,), fetch=True)
    if not rows or (rows[0]["user_id"] != message.from_user.id and not is_admin(message.from_user.id)):
        await message.answer("Prenotazione non trovata.")
        return
    q("UPDATE bookings SET status = 'annullata' WHERE id = ?", (booking_id,))
    await message.answer(f"❎ Prenotazione n. {booking_id} annullata.")
    await notify_admins(bot, f"❎ Prenotazione n. {booking_id} annullata da {message.from_user.full_name}.")
`);

  if (F('tasks')) parts.push(`

# ---------------------------------------------------------------------------
# Gestione attività
# ---------------------------------------------------------------------------
@router.message(Command("aggiungi"))
async def cmd_task_add(message: Message, command: CommandObject) -> None:
    text = (command.args or "").strip()
    if not text:
        await message.answer("Uso: /aggiungi <descrizione attività>")
        return
    task_id = q("INSERT INTO tasks (user_id, text, created_at) VALUES (?, ?, ?)", (message.from_user.id, text[:500], now_iso()))
    await message.answer(f"☑ Attività n. {task_id} aggiunta.")


@router.message(Command("attivita"))
async def cmd_task_list(message: Message) -> None:
    rows = q("SELECT * FROM tasks WHERE user_id = ? ORDER BY done, id", (message.from_user.id,), fetch=True)
    if not rows:
        await message.answer("Nessuna attività. Aggiungine una con /aggiungi <testo>.")
        return
    lines = ["Le tue attività:"] + [f"{'✅' if r['done'] else '⬜'} {r['id']}. {r['text']}" for r in rows]
    await answer_long(message, "\\n".join(lines))


async def _task_update(message: Message, command: CommandObject, delete: bool) -> None:
    arg = (command.args or "").strip()
    if not arg.isdigit():
        await message.answer(f"Uso: /{command.command} <numero attività>")
        return
    rows = q("SELECT id FROM tasks WHERE id = ? AND user_id = ?", (int(arg), message.from_user.id), fetch=True)
    if not rows:
        await message.answer("Attività non trovata.")
        return
    if delete:
        q("DELETE FROM tasks WHERE id = ?", (int(arg),))
        await message.answer(f"🗑 Attività n. {arg} eliminata.")
    else:
        q("UPDATE tasks SET done = 1 WHERE id = ?", (int(arg),))
        await message.answer(f"✅ Attività n. {arg} completata.")


@router.message(Command("fatto"))
async def cmd_task_done(message: Message, command: CommandObject) -> None:
    await _task_update(message, command, delete=False)


@router.message(Command("elimina"))
async def cmd_task_delete(message: Message, command: CommandObject) -> None:
    await _task_update(message, command, delete=True)
`);

  if (F('files')) parts.push(`

# ---------------------------------------------------------------------------
# Documenti e file
# ---------------------------------------------------------------------------
DOWNLOAD_DIR = Path(os.getenv("DOWNLOAD_DIR", str(BASE_DIR / "downloads")))
MAX_FILE_SIZE = 20 * 1024 * 1024  # limite di download della Bot API standard


@router.message(F.document | F.photo)
async def on_file(message: Message, bot: Bot) -> None:
    if message.document:
        obj = message.document
        name = obj.file_name or f"documento_{obj.file_unique_id}"
    else:
        obj = message.photo[-1]  # risoluzione più alta
        name = f"foto_{obj.file_unique_id}.jpg"
    if obj.file_size and obj.file_size > MAX_FILE_SIZE:
        await message.answer("⚠ File troppo grande: il limite è 20 MB.")
        return
    safe_name = re.sub(r"[^A-Za-z0-9._-]", "_", name)[:120]
    user_dir = DOWNLOAD_DIR / str(message.from_user.id)
    user_dir.mkdir(parents=True, exist_ok=True)
    dest = user_dir / f"{datetime.now():%Y%m%d_%H%M%S}_{safe_name}"
    try:
        await bot.download(obj, destination=dest)
    except TelegramAPIError as e:
        log.error("Download fallito: %s", e)
        await message.answer("⚠ Non è stato possibile scaricare il file. Riprova.")
        return
    size = dest.stat().st_size
    q("INSERT INTO files (user_id, file_name, path, size, created_at) VALUES (?, ?, ?, ?, ?)",
      (message.from_user.id, name, str(dest), size, now_iso()))
    await message.answer(f"📁 File salvato: {name} ({size // 1024 + 1} KB)")


@router.message(Command("file"))
async def cmd_files(message: Message) -> None:
    if is_admin(message.from_user.id):
        rows = q("SELECT * FROM files ORDER BY id DESC LIMIT 30", fetch=True)
    else:
        rows = q("SELECT * FROM files WHERE user_id = ? ORDER BY id DESC LIMIT 30", (message.from_user.id,), fetch=True)
    if not rows:
        await message.answer("Nessun file salvato. Inviami un documento o una foto.")
        return
    lines = ["📁 File archiviati:"] + [f"{r['id']}. {r['file_name']} — {r['created_at'][:16].replace('T', ' ')}" for r in rows]
    await answer_long(message, "\\n".join(lines))
`);

  if (F('group')) parts.push(`

# ---------------------------------------------------------------------------
# Gestione gruppi
# Nota: per leggere tutti i messaggi del gruppo disattiva la privacy con @BotFather (/setprivacy)
# oppure nomina il bot amministratore. Per eliminare messaggi e bannare servono i permessi di admin.
# ---------------------------------------------------------------------------
BANNED_WORDS = [w.lower() for w in CONFIG["group"].get("banned_words", [])]


@router.message(F.new_chat_members)
async def on_new_members(message: Message) -> None:
    for member in message.new_chat_members:
        if not member.is_bot:
            await message.answer(personalize(CONFIG["group"]["welcome"], member.first_name))


async def moderate(message: Message) -> bool:
    """Restituisce True se il messaggio è stato rimosso perché contiene parole vietate."""
    if message.chat.type not in ("group", "supergroup") or is_admin(message.from_user.id) or not BANNED_WORDS:
        return False
    low = (message.text or "").lower()
    if any(re.search(rf"(?<!\\w){re.escape(w)}(?!\\w)", low) for w in BANNED_WORDS):
        try:
            await message.delete()
            await message.answer(f"⚠ {message.from_user.first_name}, il messaggio è stato rimosso perché contiene parole non consentite.")
        except TelegramAPIError as e:
            log.warning("Moderazione non riuscita (il bot è amministratore del gruppo?): %s", e)
        return True
    return False


@router.message(Command("ban"))
async def cmd_ban(message: Message, bot: Bot) -> None:
    if not is_admin(message.from_user.id):
        await message.answer(DENIED)
        return
    if message.chat.type not in ("group", "supergroup") or not message.reply_to_message or not message.reply_to_message.from_user:
        await message.answer("Usa /ban in un gruppo, rispondendo al messaggio dell'utente da bannare.")
        return
    target = message.reply_to_message.from_user
    try:
        await bot.ban_chat_member(message.chat.id, target.id)
        await message.answer(f"🔨 {target.full_name} è stato bannato.")
    except TelegramAPIError as e:
        await message.answer(f"Impossibile bannare l'utente: {e.message}")
`);

  if (F('form')) parts.push(`

# ---------------------------------------------------------------------------
# Raccolta dati (modulo a domande)
# ---------------------------------------------------------------------------
FORM = CONFIG["form"]


@router.message(Command("modulo"))
async def cmd_form(message: Message) -> None:
    STATE[message.from_user.id] = {"flow": "form", "step": 0, "data": {"answers": []}}
    await message.answer(f"✎ {FORM['title']}\\n(scrivi /stop per annullare)\\n\\n1/{len(FORM['questions'])} — {FORM['questions'][0]}")


async def flow_form(message: Message, st: dict, bot: Bot) -> None:
    answers = st["data"]["answers"]
    answers.append((message.text or "").strip()[:1000])
    questions = FORM["questions"]
    if len(answers) < len(questions):
        n = len(answers)
        await message.answer(f"{n + 1}/{len(questions)} — {questions[n]}")
        return
    STATE.pop(message.from_user.id, None)
    response_id = q("INSERT INTO form_responses (user_id, answers, created_at) VALUES (?, ?, ?)",
                    (message.from_user.id, json.dumps(answers, ensure_ascii=False), now_iso()))
    await message.answer("✅ Grazie! Le tue risposte sono state registrate.")
    summary = "\\n".join(f"• {qq}: {a}" for qq, a in zip(questions, answers))
    await notify_admins(bot, f"✎ Nuovo modulo n. {response_id} da {message.from_user.full_name} (id {message.from_user.id}):\\n{summary}")


@router.message(Command("esporta"))
async def cmd_export(message: Message) -> None:
    if not is_admin(message.from_user.id):
        await message.answer(DENIED)
        return
    rows = q("SELECT * FROM form_responses ORDER BY id", fetch=True)
    if not rows:
        await message.answer("Nessuna risposta da esportare.")
        return
    buf = io.StringIO()
    writer = csv.writer(buf, delimiter=";")
    writer.writerow(["n", "data", "user_id"] + FORM["questions"])
    for r in rows:
        writer.writerow([r["id"], r["created_at"], r["user_id"]] + json.loads(r["answers"]))
    data = buf.getvalue().encode("utf-8-sig")
    await message.answer_document(BufferedInputFile(data, filename="risposte.csv"), caption=f"{len(rows)} risposte")
`);

  if (F('shop')) parts.push(`

# ---------------------------------------------------------------------------
# Catalogo, carrello e ordini (senza pagamento integrato)
# ---------------------------------------------------------------------------
PRODUCTS = CONFIG["shop"]["products"]
CURRENCY = CONFIG["shop"]["currency"]
CARTS: dict[int, dict[int, int]] = {}


def money(value: float) -> str:
    return f"{value:.2f} {CURRENCY}"


def catalog_keyboard() -> InlineKeyboardMarkup:
    rows = [[InlineKeyboardButton(text=f"➕ {p['name']} — {money(p['price'])}", callback_data=f"shop:add:{i}")]
            for i, p in enumerate(PRODUCTS)]
    rows.append([InlineKeyboardButton(text="🧺 Vedi carrello", callback_data="shop:cart")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def cart_view(user_id: int) -> tuple[str, InlineKeyboardMarkup | None]:
    cart = CARTS.get(user_id, {})
    if not cart:
        return "Il carrello è vuoto. Usa /catalogo per aggiungere prodotti.", None
    lines, total = ["🧺 Il tuo carrello:"], 0.0
    for idx, qty in cart.items():
        p = PRODUCTS[idx]
        total += p["price"] * qty
        lines.append(f"{qty} × {p['name']} = {money(p['price'] * qty)}")
    lines.append(f"\\nTotale: {money(total)}")
    kb = InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(text="✅ Conferma ordine", callback_data="shop:order"),
        InlineKeyboardButton(text="🗑 Svuota", callback_data="shop:clear"),
    ]])
    return "\\n".join(lines), kb


@router.message(Command("catalogo"))
async def cmd_catalog(message: Message) -> None:
    await message.answer("🛒 Catalogo — tocca un prodotto per aggiungerlo al carrello:", reply_markup=catalog_keyboard())


@router.message(Command("carrello"))
async def cmd_cart(message: Message) -> None:
    text, kb = cart_view(message.from_user.id)
    await message.answer(text, reply_markup=kb)


@router.callback_query(F.data.startswith("shop:"))
async def on_shop(callback: CallbackQuery, bot: Bot) -> None:
    uid = callback.from_user.id
    parts = callback.data.split(":")
    chat_id = callback.message.chat.id if callback.message else uid
    if parts[1] == "add" and len(parts) == 3 and parts[2].isdigit() and int(parts[2]) < len(PRODUCTS):
        idx = int(parts[2])
        cart = CARTS.setdefault(uid, {})
        cart[idx] = cart.get(idx, 0) + 1
        await callback.answer(f"Aggiunto: {PRODUCTS[idx]['name']} (×{cart[idx]})")
        return
    if parts[1] == "cart":
        text, kb = cart_view(uid)
        await bot.send_message(chat_id, text, reply_markup=kb)
    elif parts[1] == "clear":
        CARTS.pop(uid, None)
        await bot.send_message(chat_id, "🗑 Carrello svuotato.")
    elif parts[1] == "order":
        cart = CARTS.pop(uid, {})
        if not cart:
            await callback.answer("Il carrello è vuoto.")
            return
        items = [{"name": PRODUCTS[i]["name"], "price": PRODUCTS[i]["price"], "qty": qty} for i, qty in cart.items()]
        total = sum(it["price"] * it["qty"] for it in items)
        order_id = q("INSERT INTO orders (user_id, items, total, created_at) VALUES (?, ?, ?, ?)",
                     (uid, json.dumps(items, ensure_ascii=False), total, now_iso()))
        await bot.send_message(chat_id, f"✅ Ordine n. {order_id} inviato! Totale {money(total)}. Ti contatteremo per la conferma.")
        detail = "\\n".join(f"{it['qty']} × {it['name']}" for it in items)
        await notify_admins(bot, f"🛒 Nuovo ordine n. {order_id} da {callback.from_user.full_name} (id {uid})\\n{detail}\\nTotale: {money(total)}")
    await callback.answer()
`);

  if (F('api')) parts.push(`

# ---------------------------------------------------------------------------
# Integrazione con API REST esterna
# ---------------------------------------------------------------------------
@router.message(Command("api"))
async def cmd_api(message: Message, command: CommandObject) -> None:
    url = os.getenv("EXTERNAL_API_URL", "").strip()
    if not url:
        await message.answer("⚠ Servizio esterno non configurato: imposta EXTERNAL_API_URL nel file .env.")
        return
    params = {"q": command.args.strip()} if command.args else None
    headers = {"Accept": "application/json"}
    api_key = os.getenv("EXTERNAL_API_KEY", "")
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    try:
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=20)) as session:
            async with session.get(url, params=params, headers=headers) as resp:
                body = await resp.text()
                if resp.status >= 400:
                    log.warning("API esterna: HTTP %s", resp.status)
                    await message.answer(f"⚠ Il servizio esterno ha risposto con errore {resp.status}.")
                    return
    except (aiohttp.ClientError, asyncio.TimeoutError) as e:
        log.error("API esterna non raggiungibile: %s", e)
        await message.answer("⚠ Il servizio esterno non è raggiungibile al momento.")
        return
    try:
        pretty = json.dumps(json.loads(body), ensure_ascii=False, indent=2)
    except ValueError:
        pretty = body
    await answer_long(message, pretty[:3800])
`);

  if (F('ai')) parts.push(`

# ---------------------------------------------------------------------------
# Intelligenza artificiale (API compatibile OpenAI: OpenAI, OpenRouter, Groq, Mistral, Ollama…)
# Attenzione: i servizi AI cloud sono generalmente a pagamento o con piano gratuito limitato.
# ---------------------------------------------------------------------------
AI_HISTORY: dict[int, list[dict]] = {}


async def ask_ai(user_id: int, text: str) -> str:
    base = os.getenv("AI_API_BASE", "https://api.openai.com/v1").strip().rstrip("/")
    key = os.getenv("AI_API_KEY", "").strip()
    model = os.getenv("AI_MODEL", "").strip() or CONFIG["ai"]["model"]
    if not key and not any(h in base for h in ("localhost", "127.0.0.1")):
        return "⚠ AI non configurata: imposta AI_API_KEY nel file .env."
    history = AI_HISTORY.setdefault(user_id, [])
    messages = [{"role": "system", "content": CONFIG["ai"]["system_prompt"]}] + history + [{"role": "user", "content": text}]
    headers = {"Content-Type": "application/json"}
    if key:
        headers["Authorization"] = f"Bearer {key}"
    try:
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=90)) as session:
            async with session.post(f"{base}/chat/completions", json={"model": model, "messages": messages}, headers=headers) as resp:
                data = await resp.json(content_type=None)
                if resp.status != 200:
                    log.error("Errore AI HTTP %s: %s", resp.status, str(data)[:300])
                    return "⚠ Il servizio AI ha restituito un errore. Riprova più tardi."
    except (aiohttp.ClientError, asyncio.TimeoutError, ValueError) as e:
        log.error("Servizio AI non raggiungibile: %s", e)
        return "⚠ Il servizio AI non è raggiungibile al momento."
    try:
        reply = (data["choices"][0]["message"]["content"] or "").strip()
    except (KeyError, IndexError, TypeError):
        log.error("Risposta AI inattesa: %s", str(data)[:300])
        return "⚠ Risposta del servizio AI non valida."
    keep = CONFIG["ai"].get("history_length", 6) * 2
    history.extend([{"role": "user", "content": text}, {"role": "assistant", "content": reply}])
    del history[:-keep or None]
    if keep == 0:
        history.clear()
    return reply or "(nessuna risposta)"


@router.message(Command("reset"))
async def cmd_reset(message: Message) -> None:
    AI_HISTORY.pop(message.from_user.id, None)
    await message.answer("🧹 Conversazione azzerata.")


async def handle_ai(message: Message, bot: Bot) -> None:
    text = message.text or ""
    if message.chat.type != "private":
        me = await bot.me()
        replied_to_bot = bool(message.reply_to_message and message.reply_to_message.from_user
                              and message.reply_to_message.from_user.id == me.id)
        if f"@{me.username}".lower() not in text.lower() and not replied_to_bot:
            return
    await bot.send_chat_action(message.chat.id, "typing")
    await answer_long(message, await ask_ai(message.from_user.id, text))
`);

  if (F('autoreply')) parts.push(`

# ---------------------------------------------------------------------------
# Risposte automatiche a parole chiave
# ---------------------------------------------------------------------------
AUTOREPLIES = [([k.lower() for k in r["keywords"]], r["reply"]) for r in CONFIG.get("autoreplies", [])]


def find_autoreply(text: str) -> str | None:
    low = text.lower()
    for keywords, reply in AUTOREPLIES:
        if any(re.search(rf"(?<!\\w){re.escape(k)}(?!\\w)", low) for k in keywords):
            return reply
    return None
`);

  // ---------- catch-all ----------
  const flowMap = [F('booking') ? '"booking": flow_booking' : null, F('form') ? '"form": flow_form' : null].filter(Boolean).join(', ');
  parts.push(`

# ---------------------------------------------------------------------------
# Messaggi di testo liberi (registrato per ultimo: i comandi hanno la precedenza)
# ---------------------------------------------------------------------------
${flows ? `FLOWS = {${flowMap}}\n\n\n` : ''}@router.message(F.text)
async def on_text(message: Message, bot: Bot) -> None:
    text = message.text or ""
    if text.startswith("/"):
        if message.chat.type == "private":
            await message.answer("Comando non riconosciuto. Scrivi /help per l'elenco.")
        return
${F('group') ? '    if await moderate(message):\n        return\n' : ''}${flows ? '    st = STATE.get(message.from_user.id)\n    if st:\n        await FLOWS[st["flow"]](message, st, bot)\n        return\n' : ''}${F('autoreply') ? '    reply = find_autoreply(text)\n    if reply:\n        await message.answer(reply)\n        return\n' : ''}${F('ai') ? '    await handle_ai(message, bot)\n    return\n' : `    if message.chat.type == "private" and CONFIG.get("fallback"):
        await message.answer(CONFIG["fallback"])
`}

@router.errors()
async def on_error(event: ErrorEvent) -> bool:
    log.error("Errore non gestito durante l'aggiornamento: %r", event.exception, exc_info=event.exception)
    return True


# ---------------------------------------------------------------------------
# Avvio
# ---------------------------------------------------------------------------
dp.include_router(router)


async def on_startup(bot: Bot) -> None:
    await bot.set_my_commands([BotCommand(command=c["command"], description=c["description"][:256])
                               for c in CONFIG["bot_commands"]])
    me = await bot.get_me()
    log.info("Bot avviato: @%s (modalità %s)", me.username, MODE)
${scheduler ? '    BACKGROUND_TASKS.append(asyncio.create_task(daily_scheduler(bot)))\n' : ''}    if MODE == "webhook":
        await bot.set_webhook(url=f"{WEBHOOK_URL}{WEBHOOK_PATH}", secret_token=WEBHOOK_SECRET,
                              allowed_updates=dp.resolve_used_update_types())
        log.info("Webhook impostato su %s%s", WEBHOOK_URL, WEBHOOK_PATH)


async def on_shutdown() -> None:
${scheduler ? '    for task in BACKGROUND_TASKS:\n        task.cancel()\n' : ''}    log.info("Bot arrestato")


def check_config() -> None:
    if not re.fullmatch(r"\\d+:[A-Za-z0-9_-]{20,}", BOT_TOKEN):
        raise SystemExit("❌ BOT_TOKEN mancante o non valido. Copia .env.example in .env e inserisci il token di @BotFather.")
    if MODE == "webhook":
        if not WEBHOOK_URL.startswith("https://"):
            raise SystemExit("❌ In modalità webhook WEBHOOK_URL deve essere un indirizzo https:// pubblico.")
        if not re.fullmatch(r"[A-Za-z0-9_-]{16,256}", WEBHOOK_SECRET):
            raise SystemExit("❌ WEBHOOK_SECRET deve contenere 16-256 caratteri tra A-Z, a-z, 0-9, _ e -.")


def create_bot() -> Bot:
    session = AiohttpSession(api=TelegramAPIServer.from_base(TELEGRAM_API_BASE)) if TELEGRAM_API_BASE else None
    return Bot(token=BOT_TOKEN, session=session)


async def run_polling() -> None:
    bot = create_bot()
    await bot.delete_webhook(drop_pending_updates=False)
    await dp.start_polling(bot, allowed_updates=dp.resolve_used_update_types())


def run_webhook() -> None:
    from aiohttp import web
    from aiogram.webhook.aiohttp_server import SimpleRequestHandler, setup_application

    bot = create_bot()
    app = web.Application()

    async def health(_request: web.Request) -> web.Response:
        return web.Response(text="ok")

    app.router.add_get("/health", health)
    SimpleRequestHandler(dispatcher=dp, bot=bot, secret_token=WEBHOOK_SECRET).register(app, path=WEBHOOK_PATH)
    setup_application(app, dp, bot=bot)
    web.run_app(app, host=WEBHOOK_HOST, port=WEBHOOK_PORT)


def main() -> None:
    check_config()
    init_db()
    dp.startup.register(on_startup)
    dp.shutdown.register(on_shutdown)
    if MODE == "webhook":
        run_webhook()
    else:
        asyncio.run(run_polling())


if __name__ == "__main__":
    main()
`);
  return parts.join('');
}

function requirements(versions) {
  const ag = versions?.aiogram || '3.32.0';
  const major = ag.split('.')[0];
  // aiohttp è già una dipendenza di aiogram, ma viene dichiarato perché usato direttamente (webhook, API esterne, AI)
  return `# Dipendenze del bot (installa con: pip install -r requirements.txt)\naiogram>=${ag},<${Number(major) + 1}\naiohttp>=3.9\npython-dotenv>=1.0\n`;
}

module.exports = { gen, requirements };
