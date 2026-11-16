'use strict';
// Ambiente di verifica ed esecuzione isolata.
// 1) syntaxCheck: controlli di sintassi senza esecuzione del programma.
// 2) run: esecuzione di un progetto contro il simulatore Bot API, in un processo separato con:
//    cartella temporanea fuori dai dati dell'app, variabili d'ambiente ripulite, limiti CPU/memoria/tempo,
//    e — dove il sistema lo consente (namespace utente Linux) — cartelle dell'applicazione rese invisibili.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn, spawnSync } = require('node:child_process');
const config = require('./config');
const { redact } = require('./redact');

const RUNTIME_DIR = path.join(os.tmpdir(), 'retro-bot-lab-runtime');
fs.mkdirSync(RUNTIME_DIR, { recursive: true });

function which(cmd) {
  const r = spawnSync(process.platform === 'win32' ? 'where' : 'which', [cmd], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.split('\n')[0].trim() : null;
}

const TOOLS = {
  python: which('python3') || which('python'),
  php: which('php'),
  gofmt: which('gofmt'),
  prlimit: process.platform === 'linux' ? which('prlimit') : null,
  unshare: process.platform === 'linux' ? which('unshare') : null,
  npm: which('npm'),
};
let NS_OK = null;
function namespacesAvailable() {
  if (NS_OK !== null) return NS_OK;
  if (!TOOLS.unshare) return (NS_OK = false);
  const r = spawnSync(TOOLS.unshare, ['-r', '-m', 'sh', '-c', 'mount -t tmpfs tmpfs /mnt && echo ok'], { encoding: 'utf8', timeout: 5000 });
  return (NS_OK = r.status === 0 && r.stdout.includes('ok'));
}

function runCapture(cmd, args, { input, cwd, timeout = 15000, env } = {}) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { cwd, env: env || { PATH: process.env.PATH }, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '', errOut = '';
    const t = setTimeout(() => p.kill('SIGKILL'), timeout);
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { errOut += d; });
    p.on('error', (e) => { clearTimeout(t); resolve({ code: -1, out, err: String(e) }); });
    p.on('close', (code) => { clearTimeout(t); resolve({ code, out, err: errOut }); });
    if (input !== undefined) p.stdin.end(input); else p.stdin.end();
  });
}

const PY_CHECK = `import ast, json, sys
src = sys.stdin.read()
try:
    ast.parse(src, sys.argv[1])
    print(json.dumps({"ok": True}))
except SyntaxError as e:
    print(json.dumps({"ok": False, "error": f"{type(e).__name__}: {e.msg}", "line": e.lineno, "col": e.offset, "snippet": (e.text or "").rstrip()}))
`;

/** Controllo di sintassi senza esecuzione. Restituisce null per i tipi di file non controllabili. */
async function syntaxCheck(file, content) {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.json') {
    try { JSON.parse(content); return { file, ok: true, tool: 'JSON.parse' }; } catch (e) {
      const pos = Number((String(e.message).match(/position (\d+)/) || [])[1]);
      return { file, ok: false, tool: 'JSON.parse', error: e.message, line: Number.isFinite(pos) ? content.slice(0, pos).split('\n').length : null };
    }
  }
  if (ext === '.py') {
    if (!TOOLS.python) return { file, ok: null, tool: 'python non disponibile sul server' };
    const r = await runCapture(TOOLS.python, ['-I', '-c', PY_CHECK, path.basename(file)], { input: content });
    try { return { file, tool: 'python ast.parse', ...JSON.parse(r.out.trim().split('\n').pop()) }; } catch { return { file, ok: null, tool: 'python', error: r.err.slice(0, 300) }; }
  }
  if (['.js', '.mjs', '.cjs', '.ts', '.mts'].includes(ext)) {
    const dir = fs.mkdtempSync(path.join(RUNTIME_DIR, 'chk-'));
    const isEsm = /^\s*(import|export)\s/m.test(content);
    const name = ext === '.ts' || ext === '.mts' ? 'check.mts' : isEsm && ext === '.js' ? 'check.mjs' : 'check' + ext;
    const f = path.join(dir, name);
    fs.writeFileSync(f, content);
    const r = await runCapture(process.execPath, ['--check', f], { timeout: 15000 });
    fs.rmSync(dir, { recursive: true, force: true });
    if (r.code === 0) return { file, ok: true, tool: ext.includes('ts') ? 'node --check (type stripping: sintassi, non tipi)' : 'node --check' };
    if (/ERR_UNKNOWN_FILE_EXTENSION|strip-types|TypeScript/i.test(r.err) && ext.includes('ts')) return { file, ok: null, tool: 'controllo TypeScript non disponibile: usa npx tsc --noEmit' };
    const line = Number((r.err.match(new RegExp(name.replace('.', '\\.') + ':(\\d+)')) || [])[1]) || null;
    const msg = (r.err.match(/(SyntaxError[^\n]*)/) || [r.err.split('\n').filter(Boolean).slice(-1)[0] || 'errore'])[0];
    const snippet = line ? content.split('\n')[line - 1] : null;
    return { file, ok: false, tool: 'node --check', error: msg.slice(0, 300), line, snippet };
  }
  if (ext === '.php') {
    if (!TOOLS.php) return { file, ok: null, tool: 'php non installato sul server (php -l)' };
    const r = await runCapture(TOOLS.php, ['-l'], { input: content });
    if (r.code === 0) return { file, ok: true, tool: 'php -l' };
    return { file, ok: false, tool: 'php -l', error: (r.out + r.err).trim().split('\n')[0], line: Number(((r.out + r.err).match(/on line (\d+)/) || [])[1]) || null };
  }
  if (ext === '.go') {
    if (!TOOLS.gofmt) return { file, ok: null, tool: 'gofmt non installato sul server' };
    const r = await runCapture(TOOLS.gofmt, ['-e'], { input: content });
    if (r.code === 0) return { file, ok: true, tool: 'gofmt -e' };
    return { file, ok: false, tool: 'gofmt -e', error: r.err.trim().split('\n')[0], line: Number((r.err.match(/:(\d+):\d+/) || [])[1]) || null };
  }
  return null;
}

// --------------------------------------------------------------- esecuzione
const runs = new Map(); // projectId -> run

function capabilities() {
  return {
    enabled: config.SANDBOX_EXEC,
    python: !!TOOLS.python, node: true, npm: !!TOOLS.npm,
    namespaces: namespacesAvailable(), prlimit: !!TOOLS.prlimit,
    maxSeconds: config.SANDBOX_MAX_SECONDS, maxMemoryMb: config.SANDBOX_MAX_MEMORY_MB,
  };
}

function pushLog(run, stream, text) {
  for (const line of String(text).split(/\r?\n/)) {
    if (!line) continue;
    run.logs.push({ seq: ++run.seq, at: new Date().toISOString(), stream, text: redact(line).text.slice(0, 2000) });
  }
  if (run.logs.length > 3000) run.logs.splice(0, run.logs.length - 3000);
}

function hash(s) { return crypto.createHash('sha256').update(s).digest('hex').slice(0, 16); }

async function prepare(run, files, language) {
  const dir = run.dir;
  for (const [name, content] of Object.entries(files)) {
    if (name.startsWith('/') || name.split('/').includes('..')) continue;
    const f = path.join(dir, name);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, content);
  }
  if (language === 'python') {
    const req = files['requirements.txt'] || '';
    const venv = path.join(RUNTIME_DIR, 'venv-' + hash(req));
    const py = path.join(venv, 'bin', 'python');
    if (!fs.existsSync(py)) {
      pushLog(run, 'system', 'Creazione ambiente virtuale Python (solo la prima volta)…');
      let r = await runCapture(TOOLS.python, ['-m', 'venv', venv], { timeout: 120000, env: { PATH: process.env.PATH } });
      if (r.code !== 0) throw new Error('Creazione venv non riuscita: ' + r.err.slice(0, 300));
      if (req.trim()) {
        pushLog(run, 'system', 'Installazione dipendenze (pip install -r requirements.txt)…');
        r = await runCapture(py, ['-m', 'pip', 'install', '-q', '-r', path.join(dir, 'requirements.txt')], { timeout: 600000, env: proxyEnv({ PATH: process.env.PATH }) });
        pushLog(run, 'system', (r.out + r.err).slice(-1500));
        if (r.code !== 0) { fs.rmSync(venv, { recursive: true, force: true }); throw new Error('Installazione dipendenze non riuscita'); }
      }
    }
    const entry = files['main.py'] ? 'main.py' : Object.keys(files).find((n) => n.endsWith('.py') && !n.startsWith('tests/'));
    if (!entry) throw new Error('Nessun file Python da eseguire');
    return { cmd: py, args: ['-u', entry] };
  }
  // Node.js
  if (files['package.json']) {
    const pkg = JSON.parse(files['package.json']);
    const cache = path.join(RUNTIME_DIR, 'node-' + hash(files['package.json']));
    if (!fs.existsSync(path.join(cache, 'node_modules'))) {
      pushLog(run, 'system', 'Installazione dipendenze (npm install)…');
      fs.mkdirSync(cache, { recursive: true });
      fs.writeFileSync(path.join(cache, 'package.json'), files['package.json']);
      const r = await runCapture(TOOLS.npm, ['install', '--no-audit', '--no-fund', '--ignore-scripts'], { cwd: cache, timeout: 600000, env: proxyEnv({ PATH: process.env.PATH, HOME: cache }) });
      pushLog(run, 'system', (r.out + r.err).slice(-1500));
      if (r.code !== 0) { fs.rmSync(cache, { recursive: true, force: true }); throw new Error('npm install non riuscito'); }
    }
    fs.symlinkSync(path.join(cache, 'node_modules'), path.join(dir, 'node_modules'), 'dir');
    if (language === 'typescript') {
      const tsc = path.join(cache, 'node_modules', '.bin', 'tsc');
      pushLog(run, 'system', 'Compilazione TypeScript (tsc)…');
      const r = await runCapture(tsc, ['-p', dir], { cwd: dir, timeout: 180000 });
      if (r.code !== 0) { pushLog(run, 'stderr', r.out + r.err); throw new Error('Compilazione TypeScript non riuscita'); }
      return { cmd: process.execPath, args: [pkg.main || 'dist/bot.js'] };
    }
    return { cmd: process.execPath, args: [pkg.main || 'bot.js'] };
  }
  const entry = Object.keys(files).find((n) => /\.(m?js)$/.test(n));
  if (!entry) throw new Error('Nessun file JavaScript da eseguire');
  return { cmd: process.execPath, args: [entry] };
}

function proxyEnv(env) {
  for (const k of ['HTTPS_PROXY', 'HTTP_PROXY', 'NO_PROXY', 'https_proxy', 'http_proxy', 'no_proxy', 'SSL_CERT_FILE', 'NODE_EXTRA_CA_CERTS', 'REQUESTS_CA_BUNDLE', 'PIP_INDEX_URL', 'npm_config_registry']) {
    if (process.env[k]) env[k] = process.env[k];
  }
  return env;
}

/** Avvia un progetto nel sandbox collegato al simulatore. */
async function start(project, { token, apiBase, adminId, extraEnv = {} }) {
  if (!config.SANDBOX_EXEC) throw Object.assign(new Error('Esecuzione nel sandbox disattivata (SANDBOX_EXEC=off)'), { status: 403 });
  stop(project.id);
  const dir = fs.mkdtempSync(path.join(RUNTIME_DIR, 'run-'));
  const run = { projectId: project.id, dir, status: 'preparing', logs: [], seq: 0, startedAt: Date.now(), exitCode: null, isolation: [] };
  runs.set(project.id, run);
  try {
    if (project.language === 'python' && !TOOLS.python) throw new Error('Python 3 non è installato sul server');
    const { cmd, args } = await prepare(run, project.files, project.language);
    if (runs.get(project.id) !== run) return run; // fermato durante la preparazione
    const env = {
      PATH: process.env.PATH, HOME: dir, LANG: 'C.UTF-8', PYTHONUNBUFFERED: '1', NODE_NO_WARNINGS: '1',
      BOT_TOKEN: token, TELEGRAM_API_BASE: apiBase, MODE: 'polling', ADMIN_IDS: String(adminId || ''), DB_PATH: path.join(dir, 'bot.db'),
      LOG_LEVEL: 'INFO',
    };
    for (const [k, v] of Object.entries(extraEnv)) if (/^[A-Z][A-Z0-9_]*$/.test(k) && !['PATH', 'HOME', 'BOT_TOKEN', 'TELEGRAM_API_BASE', 'NODE_OPTIONS', 'LD_PRELOAD', 'PYTHONPATH'].includes(k)) env[k] = String(v);
    let finalCmd = cmd, finalArgs = args;
    const mem = config.SANDBOX_MAX_MEMORY_MB * 1024 * 1024;
    if (TOOLS.prlimit) {
      finalArgs = [`--as=${project.language === 'python' ? mem : mem * 8}`, `--cpu=${config.SANDBOX_MAX_SECONDS}`, '--nproc=256', '--fsize=104857600', '--', finalCmd, ...finalArgs];
      finalCmd = TOOLS.prlimit;
      run.isolation.push('limiti di risorse (prlimit: memoria, CPU, file)');
    }
    if (namespacesAvailable()) {
      const hide = [...new Set([config.ROOT, config.DATA_DIR])].map((d) => `mount -t tmpfs tmpfs ${shq(d)}`).join(' && ');
      finalArgs = ['-r', '-m', 'sh', '-c', `${hide} && cd ${shq(dir)} && exec "$@"`, 'sh', finalCmd, ...finalArgs];
      finalCmd = TOOLS.unshare;
      run.isolation.push('cartelle dell\'applicazione invisibili al bot (namespace di mount)');
    }
    run.isolation.push('cartella temporanea dedicata', 'variabili d\'ambiente ripulite (nessun segreto dell\'app)', `tempo massimo ${config.SANDBOX_MAX_SECONDS}s`);
    pushLog(run, 'system', `Avvio: ${path.basename(cmd)} ${args.join(' ')}`);
    pushLog(run, 'system', 'Isolamento: ' + run.isolation.join('; '));
    const p = spawn(finalCmd, finalArgs, { cwd: dir, env, stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32' });
    run.proc = p;
    run.status = 'running';
    p.stdout.on('data', (d) => pushLog(run, 'stdout', d));
    p.stderr.on('data', (d) => pushLog(run, 'stderr', d));
    p.on('error', (e) => { run.status = 'failed'; pushLog(run, 'system', 'Errore di avvio: ' + e.message); });
    p.on('close', (code, sig) => {
      clearTimeout(run.timer);
      run.exitCode = code;
      if (run.status === 'running') run.status = code === 0 ? 'stopped' : 'failed';
      pushLog(run, 'system', `Processo terminato (codice ${code}${sig ? ', segnale ' + sig : ''})`);
      cleanup(run);
    });
    run.timer = setTimeout(() => { pushLog(run, 'system', 'Tempo massimo raggiunto: arresto.'); stop(project.id); }, config.SANDBOX_MAX_SECONDS * 1000);
  } catch (e) {
    run.status = 'failed';
    pushLog(run, 'system', 'Errore: ' + e.message);
    cleanup(run);
  }
  return run;
}

function shq(s) { return "'" + String(s).replace(/'/g, "'\\''") + "'"; }

function cleanup(run) {
  setTimeout(() => fs.rm(run.dir, { recursive: true, force: true }, () => {}), 2000);
}

function stop(projectId) {
  const run = runs.get(projectId);
  if (!run) return false;
  if (run.proc && run.exitCode === null) {
    run.status = 'stopped';
    try { process.kill(-run.proc.pid, 'SIGTERM'); } catch { try { run.proc.kill('SIGTERM'); } catch { /* già terminato */ } }
    setTimeout(() => { try { process.kill(-run.proc.pid, 'SIGKILL'); } catch { /* terminato */ } }, 3000);
  } else if (run.status === 'preparing') {
    run.status = 'stopped';
  }
  clearTimeout(run.timer);
  return true;
}

function status(projectId, since = 0) {
  const run = runs.get(projectId);
  if (!run) return { status: 'idle', logs: [] };
  return { status: run.status, exitCode: run.exitCode, startedAt: run.startedAt, isolation: run.isolation, logs: run.logs.filter((l) => l.seq > since) };
}

process.on('exit', () => { for (const id of runs.keys()) stop(id); });

module.exports = { syntaxCheck, start, stop, status, capabilities, TOOLS };
