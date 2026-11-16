import { h, clear, GET, copyText, toast } from '../ui.js';
import { viewHead, pwa, installApp } from '../app.js';
import { qrSvg } from '../qr.js';

// Come usare RETRO BOT LAB dal telefono: rete locale (QR code), app installabile, Termux, server online.
export async function render(main) {
  const acc = await GET('/api/system/access');
  const ua = navigator.userAgent;
  const isIOS = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/.test(ua);
  const onPhone = isIOS || isAndroid;

  main.append(viewHead('Usa sul telefono', 'RETRO BOT LAB funziona nel browser del telefono e si può installare come app. Il server gira su un computer di casa, su un server online oppure — su Android — direttamente sul telefono.'));

  // ---------------- installazione come app ----------------
  const installBtn = h('button.btn.primary', { 'data-install': '', class: pwa.prompt ? '' : 'hidden', onclick: async () => { if (await installApp()) toast('Installazione avviata'); } }, '⇩ Installa come app');
  main.append(h('div.panel.ok.install-hint', h('div.panel-title', 'Installa come app'),
    pwa.installed ? h('p', '✓ Stai già usando l\'app installata.') : [
      h('p', 'Aggiunge l\'icona RetroBotLab alla schermata Home e apre l\'app a schermo intero, senza barra del browser.'),
      installBtn,
      h('div.grid.cols-2', { style: { marginTop: '10px' } },
        h('div', h('h4', 'iPhone / iPad (Safari)'), h('ol', h('li', 'Apri questa pagina con Safari.'), h('li', 'Tocca il pulsante Condividi (quadrato con freccia ↑).'), h('li', 'Scegli "Aggiungi alla schermata Home" e conferma.'))),
        h('div', h('h4', 'Android (Chrome)'), h('ol', h('li', 'Tocca il menu ⋮ in alto a destra.'), h('li', 'Scegli "Installa app" (o "Aggiungi a schermata Home").'), h('li', 'Conferma: l\'icona compare tra le app.')))),
      !window.isSecureContext ? h('p.dim', { style: { fontSize: '0.85rem' } }, 'Nota: con un indirizzo http:// della rete locale il browser crea un collegamento a schermo intero ma non abilita le funzioni offline. Con HTTPS (server online) l\'installazione è completa.') : null,
    ]));

  // ---------------- rete locale ----------------
  const lanBox = h('div.panel', h('div.panel-title', '1 · Dal computer di casa, sulla stessa rete Wi-Fi'));
  if (acc.lanEnabled && acc.lan.length) {
    lanBox.append(h('p', 'Inquadra il QR code con la fotocamera del telefono (connesso alla stessa rete Wi-Fi del computer):'),
      h('div.grid.auto', acc.lan.map((a) => h('div', { style: { textAlign: 'center' } },
        h('div', { html: qrSvg(a.url, 5), style: { display: 'inline-block', background: '#fff', padding: '4px', borderRadius: '6px' } }),
        h('div.mono', { style: { marginTop: '6px', fontSize: '15px', color: 'var(--green)' } }, a.url),
        h('div.dim', { style: { fontSize: '12px' } }, `interfaccia ${a.name}`),
        h('button.btn.small', { style: { marginTop: '6px' }, onclick: () => copyText(a.url, 'Indirizzo') }, '⧉ Copia')))),
      h('div.panel.warn', { style: { marginTop: '12px', marginBottom: 0 } }, 'In rete locale la connessione non è cifrata (HTTP): usala solo su reti di cui ti fidi (casa, ufficio). Il server rifiuta automaticamente i collegamenti che non provengono dalla rete locale.'));
  } else if (acc.lanEnabled) {
    lanBox.append(h('p', 'Il server accetta connessioni dalla rete, ma non è stata rilevata nessuna rete locale attiva su questo computer. Collegalo al Wi-Fi o a un cavo di rete e ricarica la pagina.'));
  } else {
    lanBox.append(
      h('p', 'Ora il server accetta solo connessioni da questo computer (indirizzo ', h('code', `${acc.host}:${acc.port}`), '). Per aprirlo dal telefono:'),
      h('ol',
        h('li', 'Ferma il server (Ctrl+C nel terminale).'),
        h('li', 'Riavvialo in modalità rete locale:', h('pre.log', 'npm run lan')),
        h('li', 'Torna su questa pagina: comparirà il QR code da inquadrare con il telefono.')),
      h('p.dim', { style: { fontSize: '0.85rem' } }, 'Se il telefono non riesce a collegarsi, consenti a Node.js le connessioni in ingresso sulle reti private nel firewall del computer (Windows lo chiede al primo avvio).'));
  }
  main.append(lanBox);

  // ---------------- Android con Termux ----------------
  const termux = `pkg update && pkg upgrade -y
pkg install -y nodejs-lts git python
git clone https://github.com/rupi7800-blip/retrobotlab
cd retrobotlab
npm start`;
  main.append(h('div.panel', h('div.panel-title', '2 · Tutto sul telefono Android (Termux)'),
    h('p', 'Su Android puoi eseguire l\'intera applicazione sul telefono, senza computer, con l\'app gratuita e open source Termux.'),
    h('ol',
      h('li', 'Installa Termux da F-Droid (', h('a', { href: 'https://f-droid.org/packages/com.termux/', target: '_blank', rel: 'noopener noreferrer' }, 'f-droid.org/packages/com.termux'), '). La versione del Play Store non è aggiornata.'),
      h('li', 'Apri Termux ed esegui:', h('pre.log', termux), h('button.btn.small', { onclick: () => copyText(termux, 'Comandi') }, '⧉ Copia comandi')),
      h('li', 'Apri Chrome sul telefono all\'indirizzo ', h('code', 'http://127.0.0.1:8080'), ' e installa l\'app dal menu ⋮.'),
      h('li', 'Per riavviarlo in seguito: apri Termux, ', h('code', 'cd retrobotlab && npm start'), '.')),
    h('p.dim', { style: { fontSize: '0.85rem' } }, 'Su Termux l\'esecuzione dei bot nel simulatore funziona senza i limiti di risorse e senza l\'isolamento delle cartelle (strumenti non disponibili su Android). La prima installazione delle dipendenze Python può richiedere diversi minuti. Per tenere attivo il server a schermo spento usa "Acquire wakelock" dalla notifica di Termux.')));

  // ---------------- server online ----------------
  main.append(h('div.panel', h('div.panel-title', '3 · Da ovunque (anche iPhone fuori casa): server online con HTTPS'),
    h('p', 'Installa l\'app su un server (VPS) con il file docker-compose incluso: Caddy ottiene automaticamente un certificato HTTPS gratuito (Let\'s Encrypt). Servono un dominio che punti al server e le porte 80 e 443 aperte.'),
    h('pre.log', 'git clone https://github.com/rupi7800-blip/retrobotlab\ncd retrobotlab\ncp .env.example .env      # imposta APP_SECRET e DOMAIN\ndocker compose up -d'),
    h('p.dim', { style: { fontSize: '0.85rem' } }, 'Poi apri https://tuo-dominio dal telefono e installa l\'app. Dettagli nel README del repository (sezione "Uso da telefono"). Un VPS è normalmente un servizio a pagamento.')));

  main.append(h('div.panel.explain', h('div.panel-title', 'Questo dispositivo'),
    h('table', h('tbody',
      h('tr', h('td.dim', 'Dispositivo rilevato'), h('td', isIOS ? 'iPhone / iPad' : isAndroid ? 'Android' : onPhone ? 'telefono' : 'computer')),
      h('tr', h('td.dim', 'Connessione'), h('td', acc.secure ? 'HTTPS (cifrata)' : location.hostname === '127.0.0.1' || location.hostname === 'localhost' ? 'locale (stesso dispositivo)' : 'HTTP in rete locale (non cifrata)')),
      h('tr', h('td.dim', 'App installata'), h('td', pwa.installed ? 'sì' : 'no')),
      h('tr', h('td.dim', 'Indirizzo del server'), h('td.mono', location.origin))))));
  void clear;
}
