// RETRO BOT LAB — shell dell'applicazione, autenticazione e navigazione.
import { h, clear, GET, POST, PUT, toast, toastErr, run } from './ui.js';

const NAV = [
  { group: 'Centrale', items: [{ path: '', ico: '⌂', label: 'Control Center' }] },
  { group: 'Sviluppo', items: [
    { path: 'generator', ico: '✚', label: 'Nuovo progetto / Generatore' },
    { path: 'projects', ico: '▤', label: 'Progetti' },
    { path: 'assistant', ico: '◉', label: 'Assistente AI' },
    { path: 'commands', ico: '⌘', label: 'Generatore comandi' },
  ] },
  { group: 'Verifica', items: [
    { path: 'debug', ico: '⚠', label: 'Correzione errori' },
    { path: 'test', ico: '▶', label: 'Test & Simulatore' },
  ] },
  { group: 'Conoscenza', items: [
    { path: 'knowledge', ico: '◈', label: 'Database e risorse' },
    { path: 'learn', ico: '✎', label: 'Formazione' },
    { path: 'guide', ico: '☰', label: 'Guida BotFather' },
  ] },
  { group: 'Sistema', items: [{ path: 'mobile', ico: '▯', label: 'Usa sul telefono' }, { path: 'settings', ico: '⚙', label: 'Impostazioni' }] },
];

const VIEWS = {
  '': () => import('./views/home.js'),
  generator: () => import('./views/generator.js'),
  projects: () => import('./views/projects.js'),
  project: () => import('./views/project.js'),
  assistant: () => import('./views/assistant.js'),
  commands: () => import('./views/commands.js'),
  debug: () => import('./views/debug.js'),
  test: () => import('./views/test.js'),
  knowledge: () => import('./views/knowledge.js'),
  learn: () => import('./views/learn.js'),
  guide: () => import('./views/guide.js'),
  settings: () => import('./views/settings.js'),
  mobile: () => import('./views/mobile.js'),
};

export const app = { settings: null, cleanup: null, main: null, refreshStatus: () => {} };

function setMode(mode) {
  document.body.classList.toggle('simple', mode !== 'advanced');
  const b = document.getElementById('mode-btn');
  if (b) b.textContent = mode === 'advanced' ? 'Modalità: avanzata' : 'Modalità: semplice';
}

async function boot() {
  let st;
  try { st = await GET('/api/auth/status'); } catch (e) {
    // server non raggiungibile (es. telefono fuori dalla rete Wi-Fi, server spento): nuovo tentativo automatico
    clear(document.getElementById('root'), h('div.login-wrap', h('div.login', h('div.panel.danger',
      h('h2', 'Server non raggiungibile'),
      h('p', 'Controlla che il server RETRO BOT LAB sia acceso e che questo dispositivo sia connesso alla stessa rete (o a Internet, per un server online).'),
      h('p.dim', { style: { fontSize: '0.85rem' } }, `Dettaglio: ${e.message} · nuovo tentativo automatico ogni 5 secondi`),
      h('button.btn.primary', { onclick: () => location.reload() }, '⟳ Riprova ora')))));
    setTimeout(() => location.reload(), 5000);
    window.addEventListener('online', () => location.reload(), { once: true });
    return;
  }
  if (!st.authenticated) return loginScreen(st.configured);
  try { app.settings = await GET('/api/settings'); } catch (e) { toastErr(e); return; }
  shell();
  setMode(app.settings.uiMode);
  window.addEventListener('hashchange', route);
  route();
}

function loginScreen(configured) {
  location.hash = '';
  const pw = h('input', { type: 'password', autocomplete: configured ? 'current-password' : 'new-password', id: 'pw' });
  const pw2 = h('input', { type: 'password', autocomplete: 'new-password', id: 'pw2' });
  const btn = h('button.btn.primary', { type: 'submit' }, configured ? 'Accedi' : 'Imposta password ed entra');
  const form = h('form', {
    onsubmit: (e) => {
      e.preventDefault();
      if (!configured && pw.value !== pw2.value) return toast('Le password non coincidono', 'err');
      run(btn, async () => {
        await POST(configured ? '/api/auth/login' : '/api/auth/setup', { password: pw.value });
        location.reload();
      });
    },
  },
  h('div.field', h('label', { for: 'pw' }, configured ? 'Password' : 'Nuova password (almeno 8 caratteri)'), pw),
  configured ? null : h('div.field', h('label', { for: 'pw2' }, 'Ripeti la password'), pw2),
  btn);
  clear(document.getElementById('root'), h('div.login-wrap', h('div.login',
    h('div.boot', 'RETRO BOT LAB v1.0\nPiattaforma di sviluppo bot Telegram\n> ' + (configured ? 'Autenticazione richiesta' : 'Primo avvio: proteggi l\'accesso con una password')),
    h('div.panel', h('h1', 'RETRO BOT LAB'), form,
      configured ? null : h('p.dim', { style: { marginTop: '12px', fontSize: '0.85rem' } }, 'La password protegge progetti, token e chiavi API salvati in questa installazione. Viene conservata solo come hash (scrypt).')))));
  // focus solo se l'utente non ha già iniziato a scrivere in un campo
  setTimeout(() => { if (!document.activeElement || document.activeElement === document.body) pw.focus(); }, 50);
}

function shell() {
  const nav = h('nav.nav', { 'aria-label': 'Navigazione principale' }, NAV.map((g) => h('div.nav-group', h('div', g.group),
    g.items.map((it) => h('a', { href: '#/' + it.path, 'data-path': it.path }, h('span.ico', it.ico), it.label)))));
  const sidebar = h('aside.sidebar#sidebar', nav);
  const searchInput = h('input', { type: 'search', placeholder: 'Cerca progetti, lezioni, errori, fonti…', 'aria-label': 'Ricerca interna' });
  const results = h('div.search-results.hidden');
  let st;
  searchInput.addEventListener('input', () => {
    clearTimeout(st);
    const q = searchInput.value.trim();
    if (q.length < 2) { results.classList.add('hidden'); return; }
    st = setTimeout(async () => {
      try {
        const r = await GET('/api/search?q=' + encodeURIComponent(q));
        clear(results, r.results.length ? r.results.slice(0, 14).map((x) => h('a', { href: x.url, target: x.url.startsWith('#') ? null : '_blank', rel: 'noopener noreferrer', onclick: () => { results.classList.add('hidden'); searchInput.value = ''; } },
          h('div', x.title), h('small', `${x.source} · ${(x.snippet || '').slice(0, 90)}`))) : h('div.dim', { style: { padding: '10px' } }, 'Nessun risultato'));
        results.classList.remove('hidden');
      } catch (e) { toastErr(e); }
    }, 250);
  });
  searchInput.addEventListener('keydown', (e) => { if (e.key === 'Escape') results.classList.add('hidden'); });
  document.addEventListener('click', (e) => { if (!results.contains(e.target) && e.target !== searchInput) results.classList.add('hidden'); });

  const leds = h('div.leds#leds');
  const modeBtn = h('button.btn.small#mode-btn', {
    title: 'Semplice: guida passo-passo. Avanzata: mostra log, parametri e strumenti di sviluppo.',
    onclick: async () => {
      const next = document.body.classList.contains('simple') ? 'advanced' : 'simple';
      setMode(next);
      app.settings.uiMode = next;
      try { await PUT('/api/settings', { uiMode: next }); } catch (e) { toastErr(e); }
    },
  }, 'Modalità');
  const top = h('header.topbar',
    h('button.btn.small.menu-toggle', { 'aria-label': 'Apri menu', onclick: () => sidebar.classList.toggle('open') }, '☰'),
    h('a.brand', { href: '#/' }, h('span', '▓ '), h('span.brand-text', 'RETRO BOT LAB'), h('span.cursor')),
    h('div.search', searchInput, results),
    h('div.spacer'), leds, modeBtn,
    h('button.btn.small.ghost', { title: 'Esci', onclick: async () => { await POST('/api/auth/logout'); location.reload(); } }, '⏻'));
  app.main = h('main#main', { tabindex: '-1' });
  // barra di navigazione in basso (solo schermi piccoli)
  const BOTTOM = [['', '⌂', 'Home'], ['projects', '▤', 'Progetti'], ['assistant', '◉', 'AI'], ['test', '▶', 'Test']];
  const bottom = h('nav.bottom-nav', { 'aria-label': 'Navigazione rapida' },
    BOTTOM.map(([path, ico, label]) => h('a', { href: '#/' + path, 'data-path': path }, h('span.ico', ico), h('span', label))),
    h('button', { type: 'button', onclick: () => sidebar.classList.toggle('open') }, h('span.ico', '☰'), h('span', 'Menu')));
  const backdrop = h('div.backdrop', { onclick: () => sidebar.classList.remove('open') });
  clear(document.getElementById('root'), h('div.app', top, sidebar, backdrop, app.main, bottom));
  app.refreshStatus = refreshStatus;
  refreshStatus();
  setInterval(refreshStatus, 60000);
}

async function refreshStatus() {
  try {
    const d = await GET('/api/dashboard');
    const api = d.knowledge.botApi;
    clear(document.getElementById('leds'),
      h('span', { title: d.ai.configured ? 'Fornitori AI configurati' : 'Nessun fornitore AI configurato' }, h('span.led', { class: d.ai.configured ? 'on' : 'warn' }), h('span.led-label', 'AI')),
      h('span', { title: api?.version ? `Bot API ${api.version} (verificata ${new Date(api.verifiedAt || api.lastAttempt).toLocaleDateString('it-IT')})` : 'Bot API non verificata' }, h('span.led', { class: api?.status === 'verificato' ? 'on' : 'warn' }), h('span.led-label', 'API ' + (api?.version || '?'))),
      h('span', { title: 'Sessioni del simulatore attive' }, h('span.led', { class: d.simulator.sessions ? 'blue' : '' }), h('span.led-label', 'SIM')));
    return d;
  } catch { return null; }
}

async function route() {
  const hash = location.hash.replace(/^#\/?/, '');
  if (hash === 'login') return boot();
  const [name, ...params] = hash.split('/');
  const loader = VIEWS[name] || VIEWS[''];
  document.querySelectorAll('.nav a, .bottom-nav a').forEach((a) => a.classList.toggle('active', a.dataset.path === (name === 'project' ? 'projects' : name)));
  document.getElementById('sidebar')?.classList.remove('open');
  if (typeof app.cleanup === 'function') { try { app.cleanup(); } catch { /* ignorato */ } }
  app.cleanup = null;
  clear(app.main, h('div.dim.mono', 'Caricamento…'));
  try {
    const mod = await loader();
    clear(app.main);
    app.cleanup = await mod.render(app.main, params.map(decodeURIComponent), app);
    app.main.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  } catch (e) {
    clear(app.main, h('div.panel.danger', h('h2', 'Errore'), h('p', e.message)));
    console.error(e);
  }
}

export function viewHead(title, desc, ...actions) {
  return h('div.view-head', h('div', h('h1', title), desc ? h('p', desc) : null), actions.length ? h('div.row', ...actions) : null);
}

// ---------- app installabile (PWA) ----------
// Il service worker funziona solo in contesto sicuro (HTTPS o localhost); in rete locale HTTP
// si può comunque aggiungere l'app alla schermata Home dal menu del browser.
export const pwa = { prompt: null, installed: matchMedia('(display-mode: standalone)').matches || navigator.standalone === true };
if ('serviceWorker' in navigator && window.isSecureContext) {
  navigator.serviceWorker.register('/sw.js').catch((e) => console.warn('Service worker non registrato:', e.message));
}
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  pwa.prompt = e;
  document.querySelectorAll('[data-install]').forEach((b) => b.classList.remove('hidden'));
});
window.addEventListener('appinstalled', () => { pwa.installed = true; pwa.prompt = null; toast('App installata'); });
export async function installApp() {
  if (!pwa.prompt) return false;
  pwa.prompt.prompt();
  const r = await pwa.prompt.userChoice;
  pwa.prompt = null;
  return r.outcome === 'accepted';
}

boot();
