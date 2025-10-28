const express   = require('express');
const router    = express.Router();
const nodemailer= require('nodemailer');

/* ---------- honeypot ---------- */
function honeypot(req, res, next) {
  if (req.body.botcheck) {
    console.log(`[web_contact] Bot detected via honeypot - IP: ${req.ip}`);
    return res.status(400).json({ error: 'bad' });
  }
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

  console.log(`[web_contact] POST request received from ${req.ip} - Name: ${name}, Email: ${email}`);

  if (!name || !email || !message) {
    console.log(`[web_contact] Validation failed - missing fields. Name: ${name}, Email: ${email}, Message: ${message ? 'present' : 'missing'}`);
    return res.status(400).json({ error: 'missing fields' });
  }
  
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    console.log(`[web_contact] Validation failed - invalid email format: ${email}`);
    return res.status(400).json({ error: 'bad email' });
  }

  // Check if mail is enabled
  if (process.env.MAIL_ENABLED !== 'true') {
    console.log(`[web_contact] Mail is disabled - skipping email send for ${name} (${email})`);
    return res.json({ ok: true });
  }

  const mail = {
    from: `"${name}" <${process.env.FROM_EMAIL}>`,
    to: process.env.TO_EMAIL,
    replyTo: email,
    subject: `Via Web Contact Form: ${name}`,
    text: message
  };

  try {
    console.log(`[web_contact] Attempting to send email to ${process.env.TO_EMAIL} from ${name} (${email})`);
    const result = await transporter.sendMail(mail);
    console.log(`[web_contact] Email sent successfully - Message ID: ${result.messageId}`);
    res.json({ ok: true });
  } catch (e) {
    console.error(`[web_contact] Email send failed - Error: ${e.message}`, { 
      error: e, 
      from: name, 
      email: email, 
      to: process.env.TO_EMAIL 
    });
    res.status(500).json({ error: 'send failed' });
  }
});

console.log('[web_contact] router loaded');
console.log(`[web_contact] Mail enabled: ${process.env.MAIL_ENABLED}`);
if (process.env.MAIL_ENABLED === 'true') {
  console.log(`[web_contact] Mail transport configured - Environment: ${process.env.NODE_ENV}, Host: ${transporter.options.host || 'N/A'}`);
} else {
  console.log(`[web_contact] Mail is disabled - no emails will be sent`);
}

module.exports = router;

