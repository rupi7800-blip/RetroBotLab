# RETRO BOT LAB

Piattaforma web per progettare, generare, verificare e correggere bot Telegram.
Interfaccia in stile terminale anni '80, navigazione moderna, modalità semplice e avanzata.

> L'utente descrive cosa vuole ottenere: l'applicazione lo traduce in progetto tecnico, codice funzionante e procedure concrete.

## Avvio rapido

Requisiti: **Node.js 22.13 o superiore**. Facoltativi: Python 3.10+ (per verificare ed eseguire bot Python), `prlimit`/`unshare` (Linux, per l'isolamento del sandbox).

```bash
cd retro-bot-lab
cp .env.example .env        # facoltativo: imposta almeno APP_SECRET
npm start                   # http://127.0.0.1:8080
```

Al primo accesso si imposta la password. Nessuna dipendenza npm da installare: il server usa solo moduli integrati di Node.js.

Test automatici: `npm test`.

## Funzioni

| Sezione | Cosa fa | Richiede |
|---|---|---|
| **Control Center** | Stato dei progetti, ultime attività, stato di AI, Bot API, sandbox e simulatore | — |
| **Generatore di bot** | 15 modelli (risposta automatica, informativo, assistenza, prenotazioni, notifiche, attività, gruppi, documenti, raccolta dati, database, app web, AI, automazioni, e-commerce, personalizzato) combinabili liberamente. Produce codice completo, `config.json`, dipendenze, `.env.example`, README con istruzioni BotFather, test, Dockerfile | — |
| **Progetti** | Editor con evidenziazione, numeri di riga, ricerca/sostituzione, salvataggio automatico, versioni, confronto, ripristino, duplicazione, archivio, importazione ed esportazione ZIP | — |
| **Configura bot** | Token cifrato, verifica (getMe), registrazione comandi, descrizioni, stato/eliminazione webhook — chiamate reali alla Bot API | rete verso api.telegram.org |
| **Assistente AI** | Conversazione specializzata sui bot Telegram, contesto tecnico verificato, fonti online facoltative, file proposti con verifica sintassi, applicazione ai progetti, conversione in configurazione del generatore | un fornitore AI |
| **Generatore comandi** | Documento tecnico in 13 sezioni (obiettivo → errori possibili), prompt per altre AI, modifiche a progetti esistenti preservando il resto | un fornitore AI |
| **Correzione errori** | Analisi statica (sintassi, dipendenze, sicurezza, versioni obsolete di librerie, errori noti nei log, diagnosi da descrizione), correzioni automatiche verificate; analisi approfondita AI | AI solo per l'analisi approfondita |
| **Test & Simulatore** | Simulatore della Bot API (chat privata e gruppo, pulsanti inline, file, nuovi membri, registro chiamate) + esecuzione dei progetti nel sandbox | Python/npm per eseguire progetti |
| **Database e risorse** | Ricerca su indice locale, GitHub, GitLab, Codeberg, Stack Overflow, npm; fonti ufficiali; confronto librerie; registro aggiornamenti | rete |
| **Formazione** | 18 lezioni in 4 livelli con spiegazione semplice/tecnica, esempio, codice Python e JS, esercizio e soluzione | — |
| **Guida BotFather** | Tutorial interattivo con avanzamento salvato | — |
| **Impostazioni** | Fornitori AI e instradamento per compito, interfaccia, aggiornamenti, password, backup/ripristino | — |

## Generatore: linguaggi supportati

Il generatore deterministico produce codice collaudato per:

- **Python** — aiogram 3.x (`main.py`, SQLite integrato)
- **JavaScript** — grammY 1.x (`bot.js`, `node:sqlite`, Node.js 22.13+)
- **TypeScript** — grammY 1.x (`src/bot.ts`, compilazione con `tsc`)

Ogni progetto supporta long polling e webhook (con `secret_token`), e la variabile `TELEGRAM_API_BASE` per collegarsi al simulatore.

Per PHP, Java, C#, Go, python-telegram-bot, Telegraf il codice viene prodotto dall'Assistente AI o dal Generatore comandi e verificato sintatticamente dove gli strumenti sono disponibili (`php -l`, `gofmt`, `node --check`, `ast.parse`).

**Collaudo eseguito sul generatore:** tutte le 90 combinazioni (15 modelli × 3 linguaggi × 2 modalità) superano pyflakes, `node --check` e `tsc --noEmit`; un progetto con tutte le 13 funzionalità attive è stato eseguito in Python, JavaScript e TypeScript contro il simulatore superando 35 verifiche funzionali ciascuno (comandi, menu, prenotazioni, attività, moduli ed esportazione CSV, catalogo e ordini, broadcast, API esterne, moderazione gruppi, ricezione file) senza errori Bot API.

## Uso da telefono

L'interfaccia è pensata anche per lo smartphone (barra di navigazione in basso, comandi adatti al dito, editor e simulatore adattati) e si può **installare come app** (PWA). La schermata **"Usa sul telefono"** guida passo passo.

| Modo | Per chi | Come |
|---|---|---|
| **Rete Wi-Fi di casa** | Android e iPhone, con un computer acceso | Avvia con `npm run lan`, apri "Usa sul telefono" sul computer e inquadra il QR code col telefono |
| **Tutto sul telefono** | Solo Android | Termux (da F-Droid): `pkg install nodejs-lts git python`, poi `git clone` del repository e `npm start`; apri `http://127.0.0.1:8080` in Chrome |
| **Server online HTTPS** | Ovunque, anche iPhone fuori casa | VPS con Docker: imposta `DOMAIN` e `APP_SECRET` in `.env`, poi `docker compose up -d` (Caddy ottiene il certificato HTTPS automaticamente) |

Installazione dell'app: su iPhone Safari → Condividi → "Aggiungi alla schermata Home"; su Android Chrome → ⋮ → "Installa app".

Sicurezza:
- con `npm run lan` il server accetta **solo dispositivi della rete privata** (192.168.x.x, 10.x.x.x, 172.16-31.x.x, hotspot): gli altri ricevono 403. `ALLOW_PUBLIC=on` disattiva il controllo (solo dietro proxy o firewall);
- in rete locale la connessione è HTTP non cifrata: usala su reti fidate. Per l'accesso da Internet usa sempre il server HTTPS;
- il service worker mette in cache solo l'interfaccia, mai i dati (`/api`) né il simulatore.

Su Termux il sandbox funziona senza limiti di risorse e senza isolamento delle cartelle (strumenti non disponibili su Android).

## Intelligenza artificiale

Architettura modulare, nessun vincolo a un singolo fornitore:

| Fornitore | Tipo | Costi (da verificare sul sito del fornitore) |
|---|---|---|
| Anthropic Claude | Messages API | a pagamento |
| OpenAI | compatibile OpenAI | a pagamento |
| OpenRouter | compatibile OpenAI | prevalentemente a pagamento, alcuni modelli con uso gratuito limitato |
| Groq | compatibile OpenAI | piano gratuito con limiti |
| Mistral AI | compatibile OpenAI | a pagamento, eventuale prova limitata |
| Google Gemini | endpoint compatibile OpenAI | piano gratuito con limiti |
| DeepSeek | compatibile OpenAI | a pagamento |
| Ollama (locale) | compatibile OpenAI | gratuito, software open source sul tuo computer |

- Un modello per compito (assistente, codice, debug, ricerca) e fallback automatico su un altro fornitore, segnalato nella risposta.
- Token, chiavi API e password vengono rimossi dal testo prima di ogni invio all'AI.
- Le risposte distinguono **DOCUMENTATO**, **SUGGERIMENTO AI** e **DA VERIFICARE**; l'esito dei test non viene mai dichiarato dall'AI.

## Conoscenze e aggiornamento automatico

- Versione della Bot API dal [changelog ufficiale](https://core.telegram.org/bots/api-changelog), con novità principali.
- Versioni delle librerie da PyPI, npm, Packagist, NuGet e GitHub Releases; licenza, ultimo push, archiviazione e stelle dall'API GitHub.
- Verifica dei link e rilevazione delle modifiche alle pagine di documentazione monitorate.
- Registro degli aggiornamenti; controllo automatico (all'avvio e ogni `KNOWLEDGE_UPDATE_HOURS`), manuale o per ambito.
- Le nuove versioni **non** vengono applicate automaticamente: il generatore usa una versione più recente come minimo solo se appartiene alla stessa versione maggiore collaudata.

Le fonti sono classificate (documentazione ufficiale, framework, repository, API, archivio della comunità, registro pacchetti) senza presentare siti o archivi come database strutturati.

## Sicurezza

- Password di accesso con scrypt; sessioni con cookie `HttpOnly` e `SameSite=Strict`; protezione CSRF; limite ai tentativi di accesso.
- Token dei bot e chiavi API cifrati con AES-256-GCM (chiave da `APP_SECRET` o `data/.master.key`), mai restituiti al browser.
- Content Security Policy restrittiva, nessuna risorsa esterna caricata dall'interfaccia.
- Registro degli eventi di sicurezza.
- Codice dei bot eseguito solo in processi separati (vedi sotto), mai dentro il server.

### Isolamento del sandbox

Quando si esegue un progetto dal simulatore:

1. copia in una cartella temporanea fuori dai dati dell'applicazione;
2. variabili d'ambiente ripulite (nessun segreto dell'app; token di prova del simulatore);
3. limiti di memoria, CPU, processi e dimensione file con `prlimit` (Linux);
4. su Linux con namespace utente disponibili, le cartelle dell'applicazione e dei dati vengono rese invisibili al bot;
5. durata massima configurabile.

**Limite noto:** la rete non è isolata (il bot deve raggiungere il simulatore e può contattare servizi esterni). Per un isolamento completo esegui i bot non fidati in una macchina virtuale o imposta `SANDBOX_EXEC=off` e usa il collegamento manuale al simulatore.

## Architettura

```
server/
  index.js            API HTTP, autenticazione, routing, file statici
  config.js store.js  configurazione e archivio JSON con scrittura atomica
  auth.js secrets.js redact.js   sicurezza
  generator/          catalogo modelli, specifica, generatori Python (aiogram) e JS/TS (grammY)
  ai/                 fornitori, prompt di sistema, instradamento e fallback
  knowledge/          catalogo fonti e librerie, aggiornamento, ricerca
  analyzer/           regole statiche, base degli errori noti
  sandbox.js          controllo sintassi ed esecuzione isolata
  mockapi.js          simulatore Telegram Bot API (/mock/bot<token>/<metodo>)
  telegram.js         chiamate reali alla Bot API per la configurazione
  zip.js diff.js lessons.js guide.js
public/               interfaccia (HTML, CSS, moduli JS senza build)
test/                 test automatici (node --test)
data/                 dati (creata all'avvio, esclusa da git)
```

Separazione: interfaccia (`public/`), logica applicativa (`server/index.js`), motore AI (`server/ai`), motore di ricerca (`server/knowledge`), dati (`server/store.js`), esecuzione (`server/sandbox.js`), sicurezza (`auth`, `secrets`, `redact`).

## Pubblicazione dell'applicazione

Con Docker: `docker compose up -d` (vedi "Uso da telefono"). In alternativa, manualmente:

1. imposta `APP_SECRET`, lascia `HOST=127.0.0.1`;
2. metti davanti un reverse proxy HTTPS (es. Caddy: `retrobotlab.example.com { reverse_proxy 127.0.0.1:8080 }`);
3. imposta `PUBLIC_URL=https://retrobotlab.example.com` (indirizzo del simulatore per bot esterni);
4. avvia come servizio (systemd `Restart=always`) ed esegui backup periodici dalla sezione Impostazioni.

## Limiti dichiarati

- Le funzioni AI richiedono un fornitore configurato (Ollama locale è gratuito).
- La ricerca online e l'aggiornamento delle fonti richiedono accesso a Internet; senza `GITHUB_TOKEN` GitHub consente poche richieste.
- Il simulatore riproduce i metodi della Bot API usati più comunemente (messaggi, pulsanti, file, comandi, webhook, moderazione); i metodi non simulati restituiscono un errore esplicito.
- Le sessioni del simulatore non sopravvivono al riavvio del server.
