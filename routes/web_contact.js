const express = require('express');
const router  = express.Router();
const hermes  = require('../hermes');

/* ---------- honeypot ---------- */
function honeypot(req, res, next) {
  if (req.body.botcheck) {
    console.log(`[web_contact] Bot detected via honeypot - IP: ${req.ip}`);
    return res.status(400).json({ error: 'bad' });
  }
  next();
}

/* ---------- POST  ---------- */
router.post('/', honeypot, async (req, res) => {
  const { name, email, message } = req.body;

  console.log(`[web_contact] POST request received from ${req.ip} - Name: ${name}, Email: ${email}`);

  if (!name || !email || !message) {
    console.log(`[web_contact] Validation failed - missing fields. Name: ${name}, Email: ${email}, Message: ${message ? 'present' : 'missing'}`);
    return res.status(400).json({ error: 'missing fields' });
  }
  
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    console.log(`[web_contact] Validation failed - invalid email format: ${email}`);
    return res.status(400).json({ error: 'bad email' });
  }

  try {
    const result = await hermes.sendContactMail(name, email, message);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

console.log('[web_contact] router loaded');

module.exports = router;

