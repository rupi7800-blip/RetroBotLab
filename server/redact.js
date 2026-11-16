'use strict';
// Rimozione di credenziali dai testi prima di inviarli a servizi AI esterni o di salvarli nei log.
const PATTERNS = [
  { name: 'token Telegram', re: /\b\d{6,12}:[A-Za-z0-9_-]{30,}\b/g, repl: '<TELEGRAM_BOT_TOKEN>' },
  { name: 'chiave Anthropic', re: /\bsk-ant-[A-Za-z0-9_-]{10,}\b/g, repl: '<API_KEY>' },
  { name: 'chiave API sk-', re: /\bsk-[A-Za-z0-9_-]{16,}\b/g, repl: '<API_KEY>' },
  { name: 'token GitHub', re: /\b(?:ghp|gho|ghu|ghs|github_pat)_[A-Za-z0-9_]{20,}\b/g, repl: '<GITHUB_TOKEN>' },
  { name: 'chiave Google', re: /\bAIza[0-9A-Za-z_-]{30,}\b/g, repl: '<API_KEY>' },
  { name: 'chiave AWS', re: /\bAKIA[0-9A-Z]{16}\b/g, repl: '<AWS_KEY>' },
  { name: 'header Bearer', re: /(Bearer\s+)[A-Za-z0-9._~+/=-]{16,}/g, repl: '$1<REDACTED>' },
  { name: 'password in URL', re: /(\b[a-z][a-z0-9+.-]*:\/\/[^:\s/@]+:)[^@\s/]+@/gi, repl: '$1<PASSWORD>@' },
];
// Assegnazioni del tipo SECRET_KEY=valore, password: "valore"
const ASSIGN = /^(\s*(?:export\s+)?[A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|PASSWD|API_KEY|APIKEY|PRIVATE_KEY)[A-Z0-9_]*\s*[=:]\s*)(["']?)([^\s"'#]{6,})\2/gim;

function redact(text) {
  if (typeof text !== 'string' || !text) return { text: text || '', found: [] };
  const found = new Set();
  let out = text;
  for (const p of PATTERNS) {
    out = out.replace(p.re, (...m) => { found.add(p.name); return p.repl.replace('$1', m[1] || ''); });
  }
  out = out.replace(ASSIGN, (m, pre, q, val) => {
    if (/^<.*>$/.test(val) || /^(your|tuo|il_tuo|xxx|changeme|example)/i.test(val)) return m;
    // espressioni di codice (os.getenv(...), process.env.X, config.y) non sono segreti
    if (/[()[\]{}]/.test(val) || /^(os|process|config|settings|self|this|env|environ|ENV|cfg)\b/.test(val) || /^(None|null|undefined|true|false)$/i.test(val)) return m;
    found.add('valore di variabile segreta');
    return `${pre}${q}<REDACTED>${q}`;
  });
  return { text: out, found: [...found] };
}

module.exports = { redact };
