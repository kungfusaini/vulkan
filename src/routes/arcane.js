const express = require('express');
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

const router = express.Router();

const DATA_DIR = path.join(process.cwd(), 'data');
const SUBSCRIBERS_FILE = path.join(DATA_DIR, 'arcane-subscribers.json');
const EMAIL_RE = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i;

async function readSubscribers() {
  try {
    const raw = await fs.readFile(SUBSCRIBERS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

async function writeSubscribers(subscribers) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tempFile = `${SUBSCRIBERS_FILE}.tmp`;
  await fs.writeFile(tempFile, JSON.stringify(subscribers, null, 2) + '\n');
  await fs.rename(tempFile, SUBSCRIBERS_FILE);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}

function cleanSourcePage(value) {
  const source = String(value || '').trim().slice(0, 300);
  if (!source || /[\u0000-\u001f\u007f<>"'`\\]/.test(source)) return '';

  try {
    if (source.startsWith('/')) return source;

    const parsed = new URL(source);
    if (parsed.hostname === 'arcanecodex.dev' || parsed.hostname === 'arcanecodex.localhost') {
      return `${parsed.pathname}${parsed.search}`.slice(0, 300);
    }
  } catch (_) {
    return '';
  }

  return '';
}

function hashIp(ip) {
  const salt = process.env.ARCANE_IP_HASH_SALT || 'arcane-dev-salt';
  return crypto.createHash('sha256').update(`${salt}:${ip || ''}`).digest('hex');
}

function wantsJson(req) {
  return req.accepts(['html', 'json']) === 'json';
}

function success(res, json) {
  if (json) return res.json({ ok: true });

  return res.status(200).send(`<!doctype html>
<html lang="en" data-theme="dark">
<head>
  <meta charset="utf-8">
  <meta name="robots" content="noindex, nofollow">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Arcane Dispatch</title>
  <style>
    @font-face { font-family: ProFontIIx; src: url('/fonts/ProFontIIx-subset.woff2') format('woff2'); font-display: swap; }
    @font-face { font-family: Eagle Lake; src: url('/fonts/EagleLake-Regular.ttf') format('truetype'); font-display: block; }
    :root { --bg:#282828; --entry:#2e2e33; --red:#cc241d; --text:#c4c4c5; --muted:#9b9c9d; --border:#333; }
    body { background:var(--bg); color:var(--text); font-family: ProFontIIx, monospace; margin:0; }
    header { padding: 1.25rem 2rem .75rem; border-bottom:1px solid var(--border); }
    .brand { color:var(--red); font-family:'Eagle Lake', serif; font-size:1.7rem; line-height:1; }
    .tag { color:var(--muted); margin-top:.25rem; }
    main { max-width:720px; margin:3rem auto; padding:0 1.5rem; }
    .panel { border:1px solid rgba(204,36,29,.28); border-left:3px solid var(--red); border-radius:6px; background:rgba(204,36,29,.045); padding:1rem; }
    h1 { color:var(--red); font-family:'Eagle Lake', serif; font-size:1.35rem; margin:.2rem 0 .6rem; }
    p { line-height:1.5; color:var(--muted); }
    a { color:var(--red); }
  </style>
</head>
<body>
  <header><div class="brand">Arcane Codex</div><div class="tag">Compiled Texts for the Modern Mage</div></header>
  <main>
    <section class="panel">
      <h1>You're on the early list.</h1>
      <p>Thanks — Arcane Dispatch will wake when the Codex is ready.</p>
      <p><a href="/">Return to Arcane Codex</a></p>
    </section>
  </main>
</body>
</html>`);
}

function failure(res, status, message, json) {
  if (json) return res.status(status).json({ error: message });
  const safeMessage = escapeHtml(message);
  return res.status(status).send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex, nofollow"><title>Arcane Dispatch</title></head><body><h1>${safeMessage}</h1><p><a href="/">Go back</a></p></body></html>`);
}

router.post('/subscribe', async (req, res) => {
  const json = wantsJson(req);
  const email = String(req.body.email || '').trim().toLowerCase();
  const sourcePage = cleanSourcePage(req.body.source_page || req.body.source);
  const website = String(req.body.website || '').trim();
  const userAgent = String(req.get('user-agent') || '').slice(0, 300);

  if (website) {
    console.log(`[arcane] honeypot rejected from ${req.ip}`);
    return success(res, json);
  }

  if (!EMAIL_RE.test(email) || email.length > 254 || email.includes('..')) {
    return failure(res, 400, 'Please enter a valid email address.', json);
  }

  const now = new Date().toISOString();

  try {
    const subscribers = await readSubscribers();
    const existing = subscribers.find(subscriber => subscriber.email === email);

    if (existing) {
      existing.source_page = sourcePage || existing.source_page;
      existing.updated_at = now;
      existing.user_agent = userAgent || existing.user_agent || '';
      existing.ip_hash = hashIp(req.ip);
      existing.status = existing.status || 'active';
    } else {
      subscribers.push({
        email,
        source_page: sourcePage,
        created_at: now,
        updated_at: now,
        user_agent: userAgent,
        ip_hash: hashIp(req.ip),
        confirmed: false,
        status: 'active'
      });
    }

    await writeSubscribers(subscribers);
    console.log(`[arcane] subscriber captured from ${sourcePage || 'unknown source'}`);
    return success(res, json);
  } catch (err) {
    console.error('[arcane] failed to store subscriber:', err);
    return failure(res, 500, 'Something went wrong. Please try again later.', json);
  }
});

module.exports = router;
