'use strict';
// Catalogo dei modelli di bot. Ogni modello è una combinazione di funzionalità del generatore.
// Le funzionalità sono implementate realmente nei generatori per Python (aiogram 3) e JS/TS (grammY).

const FEATURES = {
  commands: { label: 'Comandi personalizzati', desc: 'Comandi /nome che rispondono con un testo configurabile.' },
  autoreply: { label: 'Risposte automatiche', desc: 'Risposte a parole chiave contenute nei messaggi.' },
  menu: { label: 'Menu a pulsanti', desc: 'Menu con pulsanti inline e risposte per ogni voce.' },
  admin: { label: 'Amministrazione', desc: 'Comandi riservati agli ADMIN_IDS: /stats e /broadcast.' },
  notify: { label: 'Notifiche programmate', desc: 'Messaggio quotidiano a orario fisso agli iscritti (/iscriviti, /disiscriviti).' },
  booking: { label: 'Prenotazioni', desc: 'Procedura guidata data/ora/nota, /prenotazioni, /annulla, avviso agli admin.' },
  tasks: { label: 'Gestione attività', desc: 'Lista attività per utente: /aggiungi, /attivita, /fatto.' },
  files: { label: 'Documenti e file', desc: 'Riceve documenti e foto, li salva su disco, /file per l\'elenco.' },
  group: { label: 'Gestione gruppi', desc: 'Benvenuto ai nuovi membri, filtro parole vietate, /ban per admin.' },
  form: { label: 'Raccolta dati', desc: 'Questionario a domande con salvataggio e /esporta in CSV per admin.' },
  ai: { label: 'Intelligenza artificiale', desc: 'Risposte generate da un modello AI tramite API compatibile OpenAI (servizio esterno, di norma a pagamento).' },
  shop: { label: 'Catalogo e ordini', desc: 'Catalogo prodotti, carrello, invio ordine agli admin.' },
  api: { label: 'API esterne', desc: 'Comando /api che interroga un servizio REST configurato in EXTERNAL_API_URL.' },
};

const TEMPLATES = [
  {
    id: 'autoreply', name: 'Risposta automatica', icon: '↩',
    desc: 'Risponde automaticamente ai messaggi in base a parole chiave, con risposta predefinita.',
    example: 'Un negozio che risponde subito a "orari", "indirizzo", "prezzi".',
    features: ['autoreply', 'commands'],
  },
  {
    id: 'info', name: 'Bot informativo', icon: 'ℹ',
    desc: 'Menu a pulsanti con sezioni informative e comandi rapidi.',
    example: 'Guida di un evento: programma, mappa, contatti.',
    features: ['menu', 'commands'],
  },
  {
    id: 'support', name: 'Assistenza clienti', icon: '☎',
    desc: 'FAQ a pulsanti, risposte automatiche e raccolta richieste da inoltrare agli operatori.',
    example: 'Help desk: il cliente sceglie la FAQ o apre una richiesta.',
    features: ['menu', 'autoreply', 'form', 'admin'],
  },
  {
    id: 'booking', name: 'Prenotazioni', icon: '📅',
    desc: 'Prenotazione guidata con data, ora e nota; elenco e annullamento; avviso agli amministratori.',
    example: 'Parrucchiere, studio medico, campo da tennis.',
    features: ['booking', 'admin', 'notify'],
  },
  {
    id: 'notify', name: 'Notifiche', icon: '⏰',
    desc: 'Invio programmato di messaggi a orario fisso agli utenti iscritti, broadcast manuale.',
    example: 'Promemoria giornaliero, bollettino del mattino.',
    features: ['notify', 'admin'],
  },
  {
    id: 'tasks', name: 'Gestione attività', icon: '☑',
    desc: 'Lista di cose da fare personale per ogni utente con stato completato.',
    example: 'To-do list del team o personale.',
    features: ['tasks', 'notify'],
  },
  {
    id: 'community', name: 'Gruppi e comunità', icon: '👥',
    desc: 'Benvenuto ai nuovi membri, filtro parole vietate, ban da parte degli admin.',
    example: 'Moderazione di un gruppo pubblico.',
    features: ['group', 'admin', 'commands'],
  },
  {
    id: 'documents', name: 'Gestione documenti', icon: '📁',
    desc: 'Riceve e archivia documenti e foto inviati dagli utenti.',
    example: 'Raccolta ricevute, archiviazione pratiche.',
    features: ['files', 'admin'],
  },
  {
    id: 'datacollect', name: 'Raccolta dati', icon: '✎',
    desc: 'Questionario a più domande con salvataggio su database ed esportazione CSV.',
    example: 'Sondaggi, iscrizioni, moduli di contatto.',
    features: ['form', 'admin'],
  },
  {
    id: 'database', name: 'Bot con database', icon: '🗄',
    desc: 'Registro utenti su SQLite, statistiche, attività salvate e broadcast.',
    example: 'Bot che ricorda utenti e dati personali.',
    features: ['tasks', 'admin', 'commands'],
  },
  {
    id: 'webapp', name: 'Collegato ad app web', icon: '🌐',
    desc: 'Modalità webhook pronta per server pubblico e interrogazione di una API REST esterna.',
    example: 'Bot che mostra lo stato di un gestionale web.',
    features: ['api', 'commands', 'admin'], mode: 'webhook',
  },
  {
    id: 'ai', name: 'Bot con AI', icon: '🧠',
    desc: 'Risponde in linguaggio naturale tramite un modello AI configurabile (API compatibile OpenAI).',
    example: 'Assistente virtuale, tutor, generatore di testi.',
    features: ['ai', 'admin'],
  },
  {
    id: 'automation', name: 'Automazioni', icon: '⚙',
    desc: 'Interroga API esterne e invia notifiche programmate agli iscritti.',
    example: 'Report giornaliero da un servizio esterno.',
    features: ['api', 'notify', 'admin'],
  },
  {
    id: 'shop', name: 'Commercio elettronico', icon: '🛒',
    desc: 'Catalogo prodotti, carrello e invio ordini agli amministratori (senza pagamento integrato).',
    example: 'Ordini di una pizzeria o di un piccolo negozio.',
    features: ['shop', 'admin', 'menu'],
  },
  {
    id: 'custom', name: 'Personalizzato', icon: '✚',
    desc: 'Parti da zero e scegli liberamente le funzionalità.',
    example: 'Qualsiasi combinazione di funzioni.',
    features: [],
  },
];

const LANGUAGES = [
  { id: 'python', label: 'Python 3.10+', library: 'aiogram', libraryLabel: 'aiogram 3.x', note: 'Asincrono, moderno, ottima documentazione. Consigliato per la maggior parte dei progetti.' },
  { id: 'javascript', label: 'JavaScript (Node.js 22.13+)', library: 'grammy', libraryLabel: 'grammY 1.x', note: 'Leggero, ben documentato, ideale per chi lavora già con Node.js.' },
  { id: 'typescript', label: 'TypeScript (Node.js 22.13+)', library: 'grammy', libraryLabel: 'grammY 1.x', note: 'Come JavaScript ma con tipizzazione statica; richiede compilazione con tsc.' },
];

function defaultSpec(templateId = 'custom', language = 'python') {
  const t = TEMPLATES.find((x) => x.id === templateId) || TEMPLATES[TEMPLATES.length - 1];
  return {
    name: t.id === 'custom' ? 'Il mio bot' : t.name,
    description: t.desc,
    template: t.id,
    language,
    mode: t.mode || 'polling',
    features: [...t.features],
    welcome: 'Ciao {name}! 👋 Sono il bot di assistenza. Scrivi /help per vedere cosa posso fare.',
    fallback: t.features.includes('ai') ? '' : 'Non ho capito. Scrivi /help per l\'elenco dei comandi.',
    commands: [
      { command: 'info', description: 'Informazioni', reply: 'Siamo aperti dal lunedì al venerdì, 9:00–18:00.' },
      { command: 'contatti', description: 'Contatti', reply: 'Email: info@example.com — Tel: 000 000000' },
    ],
    autoreplies: [
      { keywords: ['orari', 'orario', 'aperti'], reply: 'Siamo aperti dal lunedì al venerdì, 9:00–18:00.' },
      { keywords: ['prezzo', 'prezzi', 'costo'], reply: 'Il listino completo è disponibile con il comando /info.' },
    ],
    menu: [
      { label: 'Chi siamo', reply: 'Siamo un piccolo team che sviluppa soluzioni digitali.' },
      { label: 'Servizi', reply: 'Offriamo consulenza, sviluppo e assistenza.' },
      { label: 'Contatti', reply: 'Scrivici a info@example.com' },
    ],
    notify: { time: '09:00', text: 'Buongiorno! ☀ Ecco il promemoria quotidiano.' },
    booking: { minDaysAhead: 0, openFrom: '09:00', openTo: '18:00' },
    group: { welcome: 'Benvenuto/a {name} nel gruppo! Leggi le regole fissate.', bannedWords: ['spam', 'truffa'] },
    form: { title: 'Modulo di contatto', questions: ['Come ti chiami?', 'Qual è il tuo indirizzo email?', 'Scrivi la tua richiesta'] },
    ai: { systemPrompt: 'Sei un assistente cortese che risponde in italiano in modo breve e chiaro.', model: 'gpt-4o-mini', historyLength: 6 },
    shop: { currency: 'EUR', products: [{ name: 'Prodotto A', price: 9.9 }, { name: 'Prodotto B', price: 19.5 }, { name: 'Prodotto C', price: 4 }] },
    api: { description: 'Interroga il servizio esterno configurato' },
  };
}

module.exports = { FEATURES, TEMPLATES, LANGUAGES, defaultSpec };
