const express = require('express');
const router  = express.Router();
const hermes  = require('../services/hermes');

/* ---------- email mapping by origin ---------- */
function getTargetEmail(origin) {
  const emails = {
    'sumeetsaini': process.env.MAIN_EMAIL,
    'reliqstudios': process.env.RELIQ_STUDIOS_EMAIL
  };
  
  // Default to MAIN_EMAIL if no origin provided
  if (!origin) {
    console.log(`[web_contact] No origin provided, defaulting to MAIN_EMAIL`);
    return process.env.MAIN_EMAIL;
  }
  
  const targetEmail = emails[origin];
  
  if (!targetEmail) {
    console.log(`[web_contact] Unknown origin: ${origin}, defaulting to MAIN_EMAIL`);
    return process.env.MAIN_EMAIL;
  }
  
  return targetEmail;
}

/* ---------- honeypot ---------- */
function honeypot(req, res, next) {
  if (req.body.botcheck) {
    console.log(`[web_contact] Bot detected via honeypot - IP: ${req.ip}`);
    return res.status(400).json({ error: 'You are a bot!' });
  }
  next();
}

/* ---------- POST  ---------- */
router.post('/', honeypot, async (req, res) => {
  const { name, email, message, origin } = req.body;

  console.log(`[web_contact] POST request received from ${req.ip} - Name: ${name}, Email: ${email}, Origin: ${origin}`);

  // Get target email based on origin (defaults to MAIN_EMAIL)
  const toEmail = getTargetEmail(origin);
  
  if (!toEmail) {
    console.log(`[web_contact] No target email configured`);
    return res.status(500).json({ error: 'Server configuration error' });
  }

  if (!name || !email || !message) {
    console.log(`[web_contact] Validation failed - missing fields. Name: ${name}, Email: ${email}, Message: ${message ? 'present' : 'missing'}`);
    return res.status(400).json({ error: 'Missing Fields' });
  }
  
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    console.log(`[web_contact] Validation failed - invalid email format: ${email}`);
    return res.status(400).json({ error: 'Badly Formed Email' });
  }

  try {
    const result = await hermes.sendContactMail(name, email, message, toEmail);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

console.log('[web_contact] router loaded');

module.exports = router;

