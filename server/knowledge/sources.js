'use strict';
// Catalogo delle fonti. "type" distingue: documentazione, API, libreria, repository, archivio/forum, registro pacchetti.
// "priority": 1 = ufficiale Telegram, 2 = ufficiale framework, 3 = repository ufficiali/mantenuti,
// 4 = documentazione tecnica riconosciuta, 5 = comunità.
// Nessuna voce rappresenta un "database strutturato" se non lo è: siti e archivi sono indicati come tali.

const SOURCES = [
  // 7.1 Fonti ufficiali Telegram
  { id: 'tg-bot-api', title: 'Telegram Bot API', url: 'https://core.telegram.org/bots/api', type: 'documentazione ufficiale', priority: 1, monitor: true, desc: 'Riferimento completo di metodi, tipi e parametri della Bot API.' },
  { id: 'tg-bots', title: 'Telegram Bots — introduzione', url: 'https://core.telegram.org/bots', type: 'documentazione ufficiale', priority: 1, monitor: true, desc: 'Panoramica su cosa sono i bot e come funzionano.' },
  { id: 'tg-features', title: 'Telegram Bot Features', url: 'https://core.telegram.org/bots/features', type: 'documentazione ufficiale', priority: 1, monitor: true, desc: 'Comandi, tastiere, inline mode, BotFather, privacy mode, pagamenti.' },
  { id: 'tg-faq', title: 'Telegram Bot FAQ', url: 'https://core.telegram.org/bots/faq', type: 'documentazione ufficiale', priority: 1, monitor: true, desc: 'Limiti di invio, webhook, privacy, domande frequenti.' },
  { id: 'tg-tutorial', title: 'Telegram Bot Tutorial', url: 'https://core.telegram.org/bots/tutorial', type: 'documentazione ufficiale', priority: 1, monitor: true, desc: 'Tutorial ufficiale passo-passo (Java).' },
  { id: 'tg-webapps', title: 'Telegram Mini Apps', url: 'https://core.telegram.org/bots/webapps', type: 'documentazione ufficiale', priority: 1, monitor: true, desc: 'Applicazioni web integrate in Telegram.' },
  { id: 'tg-changelog', title: 'Bot API Changelog', url: 'https://core.telegram.org/bots/api-changelog', type: 'documentazione ufficiale', priority: 1, monitor: true, desc: 'Storico delle versioni della Bot API (fonte per il controllo aggiornamenti).' },
  { id: 'tg-webhooks', title: 'Marvin\'s Guide to Webhooks', url: 'https://core.telegram.org/bots/webhooks', type: 'documentazione ufficiale', priority: 1, monitor: true, desc: 'Configurazione dei webhook, certificati, porte.' },
  { id: 'tg-gateway', title: 'Telegram Gateway API', url: 'https://core.telegram.org/gateway/api', type: 'API ufficiale', priority: 1, monitor: true, desc: 'Invio di codici di verifica tramite Telegram (servizio a pagamento per messaggio).' },
  { id: 'tg-bot-api-server', title: 'telegram-bot-api (server locale)', url: 'https://github.com/tdlib/telegram-bot-api', type: 'repository ufficiale', priority: 1, repo: 'tdlib/telegram-bot-api', desc: 'Server Bot API self-hosted: file fino a 2 GB, webhook locali.' },

  // 7.2 Documentazione librerie
  { id: 'doc-aiogram', title: 'aiogram — documentazione', url: 'https://docs.aiogram.dev/', type: 'documentazione framework', priority: 2, monitor: true, lang: 'Python', desc: 'Framework asincrono Python.' },
  { id: 'doc-ptb', title: 'python-telegram-bot — documentazione', url: 'https://docs.python-telegram-bot.org/', type: 'documentazione framework', priority: 2, monitor: true, lang: 'Python' },
  { id: 'doc-telebot', title: 'pyTelegramBotAPI — repository', url: 'https://github.com/eternnoir/pyTelegramBotAPI', type: 'repository ufficiale', priority: 2, lang: 'Python', repo: 'eternnoir/pyTelegramBotAPI' },
  { id: 'doc-grammy', title: 'grammY — documentazione', url: 'https://grammy.dev/', type: 'documentazione framework', priority: 2, monitor: true, lang: 'JavaScript/TypeScript' },
  { id: 'doc-telegraf', title: 'Telegraf — documentazione', url: 'https://telegraf.js.org/', type: 'documentazione framework', priority: 2, monitor: true, lang: 'JavaScript/TypeScript' },
  { id: 'doc-php-core', title: 'PHP Telegram Bot — core', url: 'https://github.com/php-telegram-bot/core', type: 'repository ufficiale', priority: 2, lang: 'PHP', repo: 'php-telegram-bot/core' },
  { id: 'doc-java', title: 'TelegramBots (Java)', url: 'https://github.com/rubenlagus/TelegramBots', type: 'repository ufficiale', priority: 2, lang: 'Java', repo: 'rubenlagus/TelegramBots' },

  // 7.3 Repository e piattaforme di codice
  { id: 'github', title: 'GitHub', url: 'https://github.com/', type: 'piattaforma repository', priority: 3, desc: 'Ricerca repository tramite GitHub REST API (limite senza token: 10 ricerche/minuto).' },
  { id: 'github-api', title: 'GitHub REST API', url: 'https://docs.github.com/en/rest', type: 'API', priority: 4 },
  { id: 'gitlab', title: 'GitLab', url: 'https://gitlab.com/', type: 'piattaforma repository', priority: 3, desc: 'Ricerca progetti pubblici tramite GitLab API v4.' },
  { id: 'gitlab-api', title: 'GitLab API', url: 'https://docs.gitlab.com/api/', type: 'API', priority: 4 },
  { id: 'codeberg', title: 'Codeberg', url: 'https://codeberg.org/', type: 'piattaforma repository', priority: 3, desc: 'Ricerca repository tramite API Forgejo/Gitea.' },

  // 7.4 Documentazione tecnica e comunità
  { id: 'stackoverflow', title: 'Stack Overflow', url: 'https://stackoverflow.com/questions/tagged/telegram-bot', type: 'archivio domande e risposte (comunità)', priority: 5, desc: 'Archivio pubblico consultabile; ricerca tramite Stack Exchange API (limite giornaliero senza chiave).' },
  { id: 'stackexchange-api', title: 'Stack Exchange API', url: 'https://api.stackexchange.com/', type: 'API', priority: 4 },
  { id: 'readthedocs', title: 'Read the Docs', url: 'https://about.readthedocs.com/', type: 'piattaforma documentazione', priority: 4 },
  { id: 'pypi', title: 'PyPI', url: 'https://pypi.org/', type: 'registro pacchetti', priority: 4, desc: 'Versioni delle librerie Python (JSON API).' },
  { id: 'npm', title: 'npm', url: 'https://www.npmjs.com/', type: 'registro pacchetti', priority: 4, desc: 'Versioni dei pacchetti Node.js (registry API).' },
  { id: 'mdn', title: 'MDN Web Docs', url: 'https://developer.mozilla.org/', type: 'documentazione tecnica', priority: 4 },
  { id: 'pydocs', title: 'Python Documentation', url: 'https://docs.python.org/3/', type: 'documentazione tecnica', priority: 4 },
  { id: 'nodedocs', title: 'Node.js Documentation', url: 'https://nodejs.org/docs/latest/api/', type: 'documentazione tecnica', priority: 4 },
];

// Librerie: dati statici di base + campi verificati dall'aggiornamento (versione, licenza, ultimo push, archiviato).
// La licenza indicata qui è il valore di partenza: l'aggiornamento la legge dall'API GitHub e la sostituisce.
const LIBRARIES = [
  { id: 'aiogram', name: 'aiogram', lang: 'Python', registry: 'pypi', pkg: 'aiogram', repo: 'aiogram/aiogram', docs: 'https://docs.aiogram.dev/', license: 'MIT', async: true,
    pros: ['Asincrono nativo (asyncio)', 'Router, filtri magici, FSM integrata', 'Aggiornato rapidamente alle nuove Bot API'], cons: ['Richiede familiarità con async/await'],
    best: 'Bot di qualsiasi complessità in Python, specialmente con molti utenti.' },
  { id: 'python-telegram-bot', name: 'python-telegram-bot', lang: 'Python', registry: 'pypi', pkg: 'python-telegram-bot', repo: 'python-telegram-bot/python-telegram-bot', docs: 'https://docs.python-telegram-bot.org/', license: 'LGPL-3.0', async: true,
    pros: ['Documentazione e wiki molto estese', 'ConversationHandler, JobQueue', 'Comunità ampia'], cons: ['Licenza LGPL (valutare per software proprietario)', 'Molti esempi online riferiti alla vecchia v13'],
    best: 'Progetti Python con conversazioni complesse e job programmati.' },
  { id: 'pytelegrambotapi', name: 'pyTelegramBotAPI (telebot)', lang: 'Python', registry: 'pypi', pkg: 'pyTelegramBotAPI', repo: 'eternnoir/pyTelegramBotAPI', docs: 'https://pytba.readthedocs.io/', license: 'GPL-2.0', async: false,
    pros: ['Sintassi semplicissima con decoratori', 'Versione sincrona e asincrona'], cons: ['Licenza GPL-2.0', 'Meno strutturato per progetti grandi'],
    best: 'Prototipi e bot semplici per principianti.' },
  { id: 'grammy', name: 'grammY', lang: 'JavaScript/TypeScript', registry: 'npm', pkg: 'grammy', repo: 'grammyjs/grammY', docs: 'https://grammy.dev/', license: 'MIT', async: true,
    pros: ['Tipizzazione TypeScript completa', 'Documentazione eccellente', 'Plugin ufficiali (sessioni, conversazioni, menu)', 'Funziona su Node, Deno, serverless'], cons: ['Ecosistema plugin da imparare'],
    best: 'Bot JavaScript/TypeScript moderni, anche serverless.' },
  { id: 'telegraf', name: 'Telegraf', lang: 'JavaScript/TypeScript', registry: 'npm', pkg: 'telegraf', repo: 'telegraf/telegraf', docs: 'https://telegraf.js.org/', license: 'MIT', async: true,
    pros: ['Molto diffuso, tanti esempi', 'Middleware stile Koa'], cons: ['Ritmo di aggiornamento da verificare con il controllo automatico'],
    best: 'Progetti esistenti basati su Telegraf.' },
  { id: 'node-telegram-bot-api', name: 'node-telegram-bot-api', lang: 'JavaScript', registry: 'npm', pkg: 'node-telegram-bot-api', repo: 'yagop/node-telegram-bot-api', docs: 'https://github.com/yagop/node-telegram-bot-api', license: 'MIT', async: true,
    pros: ['API semplice basata su eventi'], cons: ['Meno strutturata per bot complessi'], best: 'Script semplici in Node.js.' },
  { id: 'php-telegram-bot', name: 'PHP Telegram Bot (core)', lang: 'PHP', registry: 'packagist', pkg: 'longman/telegram-bot', repo: 'php-telegram-bot/core', docs: 'https://github.com/php-telegram-bot/core', license: 'MIT', async: false,
    pros: ['Integrazione MySQL opzionale', 'Adatto a hosting PHP condiviso con webhook'], cons: ['Da verificare il ritmo di aggiornamento'], best: 'Hosting PHP tradizionale.' },
  { id: 'nutgram', name: 'Nutgram', lang: 'PHP', registry: 'packagist', pkg: 'nutgram/nutgram', repo: 'nutgram/nutgram', docs: 'https://nutgram.dev/', license: 'MIT', async: false,
    pros: ['API moderna, integrazione Laravel', 'Conversazioni e middleware'], cons: ['Richiede PHP recente'], best: 'Progetti PHP moderni e Laravel.' },
  { id: 'telegrambots', name: 'TelegramBots (Java)', lang: 'Java', registry: 'github', pkg: 'org.telegram:telegrambots', repo: 'rubenlagus/TelegramBots', docs: 'https://rubenlagus.github.io/TelegramBotsDocumentation/', license: 'MIT', async: false,
    pros: ['Libreria Java di riferimento', 'Usata nel tutorial ufficiale Telegram'], cons: ['Più verbosa'], best: 'Ambienti Java/Spring.' },
  { id: 'telegram-bot-dotnet', name: 'Telegram.Bot (.NET)', lang: 'C#', registry: 'nuget', pkg: 'Telegram.Bot', repo: 'TelegramBots/Telegram.Bot', docs: 'https://telegrambots.github.io/book/', license: 'MIT', async: true,
    pros: ['Client .NET completo e tipizzato'], cons: ['Ecosistema .NET richiesto'], best: 'Applicazioni C#/.NET.' },
  { id: 'go-telegram-bot', name: 'go-telegram/bot', lang: 'Go', registry: 'github', pkg: 'github.com/go-telegram/bot', repo: 'go-telegram/bot', docs: 'https://github.com/go-telegram/bot', license: 'MIT', async: true,
    pros: ['Zero dipendenze, aggiornata alle Bot API recenti'], cons: ['Comunità più piccola'], best: 'Servizi Go leggeri.' },
  { id: 'telebot-go', name: 'Telebot (Go)', lang: 'Go', registry: 'github', pkg: 'gopkg.in/telebot.v4', repo: 'tucnak/telebot', docs: 'https://github.com/tucnak/telebot', license: 'MIT', async: true,
    pros: ['API di alto livello, middleware'], cons: ['Verificare la versione maggiore corrente'], best: 'Bot Go strutturati.' },
  { id: 'go-telegram-bot-api', name: 'go-telegram-bot-api', lang: 'Go', registry: 'github', pkg: 'github.com/go-telegram-bot-api/telegram-bot-api/v5', repo: 'go-telegram-bot-api/telegram-bot-api', docs: 'https://go-telegram-bot-api.dev/', license: 'MIT', async: false,
    pros: ['Molto diffusa negli esempi storici'], cons: ['Verificare lo stato di manutenzione con il controllo automatico'], best: 'Progetti Go esistenti.' },
];

module.exports = { SOURCES, LIBRARIES };
