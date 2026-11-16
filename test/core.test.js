'use strict';
// Test automatici dei moduli principali (node --test). Usano una cartella dati temporanea.
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rbl-test-'));
process.env.KNOWLEDGE_UPDATE_HOURS = '0';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { generateProject, TEMPLATES } = require('../server/generator');
const { normalizeSpec } = require('../server/generator/spec');
const analyzer = require('../server/analyzer');
const { createZip, readZip } = require('../server/zip');
const { redact } = require('../server/redact');
const { diffLines } = require('../server/diff');
const { parseChangelog } = require('../server/knowledge/updater');
const { extractFiles, extractJson } = require('../server/ai');
const secrets = require('../server/secrets');
const mock = require('../server/mockapi');
const { syntaxCheck } = require('../server/sandbox');

const FAKE_TOKEN = '123456789:' + 'A'.repeat(35);

test('il generatore produce tutti i file per ogni modello e linguaggio', () => {
  for (const t of TEMPLATES) {
    for (const language of ['python', 'javascript', 'typescript']) {
      const r = generateProject({ template: t.id, language });
      assert.ok(r.files['config.json'] && r.files['README.md'] && r.files['.env.example'] && r.files.Dockerfile, `${t.id}/${language}`);
      assert.ok(r.files[r.entry], 'file principale presente');
      const cfg = JSON.parse(r.files['config.json']);
      for (const c of cfg.bot_commands) assert.match(c.command, /^[a-z0-9_]{1,32}$/);
      assert.doesNotMatch(Object.values(r.files).join('\n'), /\d{6,12}:[A-Za-z0-9_-]{30,}/, 'nessun token nei file');
    }
  }
});

test('il codice generato supera il controllo di sintassi', async () => {
  const all = ['commands', 'autoreply', 'menu', 'admin', 'notify', 'booking', 'tasks', 'files', 'group', 'form', 'ai', 'shop', 'api'];
  for (const language of ['python', 'javascript', 'typescript']) {
    const r = generateProject({ template: 'custom', language, features: all });
    const res = await syntaxCheck(r.entry, r.files[r.entry]);
    if (res.ok === null) continue; // strumento non disponibile su questo sistema
    assert.equal(res.ok, true, `${language}: ${res.error}`);
  }
});

test('normalizeSpec filtra comandi riservati e valori non validi', () => {
  const { spec, warnings } = normalizeSpec({ features: ['commands', 'xyz'], commands: [{ command: '/Start', reply: 'x' }, { command: 'Info!', description: '', reply: 'ok' }], notify: { time: '99:00' } });
  assert.deepEqual(spec.features, ['commands']);
  assert.equal(spec.commands.length, 1);
  assert.equal(spec.commands[0].command, 'info');
  assert.equal(spec.notify.time, '09:00');
  assert.ok(warnings.some((w) => w.includes('/start')));
});

test('l\'analizzatore rileva token, aiogram 2, SQL injection e sintassi', async () => {
  const code = `from aiogram import Bot, Dispatcher, executor\nbot = Bot(token="${FAKE_TOKEN}")\ndp = Dispatcher(bot)\n\n@dp.message_handler()\nasync def h(m):\n    cur.execute(f"SELECT * FROM u WHERE id = {m.text}")\n`;
  const r = await analyzer.analyze({ files: { 'bot.py': code, 'broken.py': 'def x(:\n  pass\n' }, logs: 'telegram.error.Conflict: 409 Conflict: terminated by other getUpdates request' });
  const ids = r.findings.map((f) => f.id);
  for (const id of ['hardcoded-token', 'aiogram2', 'sql-injection', 'syntax', 'tg-409']) assert.ok(ids.includes(id), `manca ${id}`);
  const tok = r.findings.find((f) => f.id === 'hardcoded-token');
  assert.ok(tok.fixedCode.includes('os.getenv("BOT_TOKEN"'));
  assert.ok(!tok.snippet.includes(FAKE_TOKEN), 'il token non compare nel report');
});

test('i progetti generati non producono segnalazioni', async () => {
  for (const t of ['booking', 'shop', 'ai']) {
    for (const language of ['python', 'javascript']) {
      const r = generateProject({ template: t, language });
      const out = await analyzer.analyze({ files: r.files });
      assert.deepEqual(out.findings.filter((f) => f.severity !== 'info').map((f) => f.title), [], `${t}/${language}`);
    }
  }
});

test('ZIP: scrittura e lettura con percorsi sicuri', () => {
  const zip = createZip([{ name: 'p/a.txt', data: 'ciao' }, { name: 'p/dir/b.py', data: 'x = 1\n'.repeat(500) }]);
  const out = readZip(zip);
  assert.equal(out.length, 2);
  assert.equal(out[0].data.toString(), 'ciao');
  assert.equal(out[1].data.toString(), 'x = 1\n'.repeat(500));
});

test('redact rimuove credenziali', () => {
  const r = redact(`BOT_TOKEN=${FAKE_TOKEN}\nkey sk-ant-abcdefghijklmnopqrstuv\nOPENAI_API_KEY=abc123456789\nAuthorization: Bearer abcdefghijklmnopqrstuvwxyz`);
  assert.doesNotMatch(r.text, /AAAAAAAAAA|abcdefghijklmnopqrstuv|abc123456789/);
  assert.ok(r.found.length >= 3);
});

test('diffLines calcola aggiunte e rimozioni', () => {
  const d = diffLines('a\nb\nc', 'a\nB\nc\nd');
  assert.equal(d.stats.added, 2);
  assert.equal(d.stats.removed, 1);
});

test('parseChangelog estrae versione e data', () => {
  const html = '<h3>Recent changes</h3><h4><a class="anchor"></a>August 15, 2026</h4><p><strong>Bot API 9.9</strong></p><ul><li>Added the method <em>doThing</em>.</li></ul><h4>July 1, 2026</h4><p><strong>Bot API 9.8</strong></p>';
  const r = parseChangelog(html);
  assert.equal(r.version, '9.9');
  assert.equal(r.date, '2026-08-15');
  assert.equal(r.highlights[0], 'Added the method doThing.');
});

test('estrazione di file e JSON dalle risposte AI', () => {
  const md = 'Testo\n\n### File: src/bot.py\n```python\nprint(1)\n```\n\n### File: ../evil\n```\nx\n```';
  assert.deepEqual(Object.keys(extractFiles(md)), ['src/bot.py']);
  assert.equal(extractJson('```json\n{"a": 1}\n```').a, 1);
});

test('cassaforte: cifratura e decifratura', () => {
  secrets.setSecret('t1', FAKE_TOKEN);
  assert.equal(secrets.getSecret('t1'), FAKE_TOKEN);
  const raw = fs.readFileSync(path.join(process.env.DATA_DIR, 'db.json'), 'utf8');
  assert.ok(!raw.includes(FAKE_TOKEN), 'il token non è salvato in chiaro');
});

test('simulatore: messaggi, comandi con entity, pulsanti, validazioni', async () => {
  const s = mock.createSession({ userId: 42 });
  const msg = mock.userSendText(s, { text: '/start' });
  assert.deepEqual(msg.entities, [{ type: 'bot_command', offset: 0, length: 6 }]);
  assert.equal(s.updates.length, 1);
  assert.match(mock.checkHtml('<b>ok</b> &amp;') || 'ok', /ok/);
  assert.ok(mock.checkHtml('<b>aperto'));
  mock.deleteSession(s.id);
});

test('rete locale: solo indirizzi privati sono ammessi', () => {
  const { isPrivateAddress } = require('../server/index.js');
  for (const ip of ['127.0.0.1', '::1', '::ffff:192.168.1.20', '10.1.2.3', '172.20.10.2', '100.72.1.1', 'fe80::1']) assert.ok(isPrivateAddress(ip), ip);
  for (const ip of ['8.8.8.8', '::ffff:93.184.216.34', '172.32.0.1', '2001:4860::8888']) assert.ok(!isPrivateAddress(ip), ip);
});

test('QR code: dimensioni corrette per la versione', async () => {
  const { qrMatrix } = await import('../public/js/qr.js');
  assert.equal(qrMatrix('http://192.168.1.20:8080').length, 25); // 24 byte: versione 2 (25×25)
  assert.throws(() => qrMatrix('x'.repeat(200)));
});
