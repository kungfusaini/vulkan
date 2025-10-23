const express   = require('express');
const router    = express.Router();
const nodemailer= require('nodemailer');

/* ---------- honeypot ---------- */
function honeypot(req, res, next) {
  if (req.body.botcheck) return res.status(400).json({ error: 'bad' });
  next();
}

/* ---------- mail transport ---------- */
const transporter = nodemailer.createTransport({
  host: process.env.NODE_ENV === 'prod'
    ? (process.env.MAILCOW_HOST)
    : process.env.NODE_ENV === 'dev' ? 'smtp.ethereal.email' : null,

  port: process.env.NODE_ENV === 'prod' ? 25 : process.env.NODE_ENV === 'dev' ? 587 : null,
  
  ...(process.env.NODE_ENV === 'dev' && {
    auth: {
      user: process.env.ETHEREAL_USER,
      pass: process.env.ETHEREAL_PASS
    }
  }),
  
  secure: false,
  tls: { rejectUnauthorized: false }
});

/* ---------- POST  ---------- */
router.post('/', honeypot, async (req, res) => {
  const { name, email, message } = req.body;

  if (!name || !email || !message)
    return res.status(400).json({ error: 'missing fields' });
  if (!/^\S+@\S+\.\S+$/.test(email))
    return res.status(400).json({ error: 'bad email' });

  const mail = {
    from: `"${name}" <${process.env.FROM_EMAIL}>`,
    to: process.env.TO_EMAIL,
    replyTo: email,
    subject: `Via Web Contact Form: ${name}`,
    text: message
  };

  try {
    await transporter.sendMail(mail);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'send failed' });
  }
});

console.log('[web_contact] router loaded');
module.exports = router;

