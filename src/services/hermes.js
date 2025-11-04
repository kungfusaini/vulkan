const nodemailer = require('nodemailer');

/* ---------- mail status ---------- */
const isMailEnabled = () => process.env.MAIL_ENABLED === 'true';

/* ---------- mail transport ---------- */
const transporter = nodemailer.createTransport({
  host: process.env.NODE_ENV === 'prod'
    ? (process.env.MAILCOW_HOST)
    : process.env.NODE_ENV === 'dev' ? process.env.ETHEREAL_HOST : null,

  port: process.env.NODE_ENV === 'prod' ? 25 : process.env.NODE_ENV === 'dev' ? process.env.ETHEREAL_PORT : null,
  
  ...(process.env.NODE_ENV === 'dev' && process.env.ETHEREAL_USER && {
    auth: {
      user: process.env.ETHEREAL_USER,
      pass: process.env.ETHEREAL_PASS
    }
  }),
  
  secure: false,
  tls: { rejectUnauthorized: false }
});

/* ---------- send contact mail ---------- */
async function sendContactMail(name, email, message) {
  if (!isMailEnabled()) {
    console.log(`[hermes] Mail is disabled - skipping email send for ${name} (${email})`);
    return { success: true, skipped: true };
  }

  const mail = {
    from: `"${name}" <${process.env.FROM_EMAIL}>`,
    to: process.env.CONTACT_EMAIL,
    replyTo: email,
    subject: `Via Web Contact Form: ${name}`,
    text: message
  };

  try {
    console.log(`[hermes] Attempting to send email to ${process.env.CONTACT_EMAIL} from ${name} (${email})`);
    const result = await transporter.sendMail(mail);
    console.log(`[hermes] Email sent successfully - Message ID: ${result.messageId}`);
    return { success: true, messageId: result.messageId };
  } catch (e) {
    console.error(`[hermes] Email send failed - Error: ${e.message}`, { 
      error: e, 
      from: name, 
      email: email, 
      to: process.env.CONTACT_EMAIL 
    });
    throw new Error('send failed');
  }
}

/* ---------- initialization logging ---------- */
console.log('[hermes] Mail handler initialized');
console.log(`[hermes] Mail enabled: ${isMailEnabled()}`);
if (isMailEnabled()) {
  console.log(`[hermes] Mail transport configured - Environment: ${process.env.NODE_ENV}, Host: ${transporter.options.host || 'N/A'}`);
  
  // Log Ethereal credentials in development
  if (process.env.NODE_ENV === 'dev' && process.env.ETHEREAL_USER && process.env.ETHEREAL_PASS) {
    console.log(`[hermes] Ethereal web interface: https://ethereal.email/login`);
    console.log(`[hermes] Ethereal credentials - User: ${process.env.ETHEREAL_USER}, Pass: ${process.env.ETHEREAL_PASS}`);
  }
} else {
  console.log(`[hermes] Mail is disabled - no emails will be sent`);
}

module.exports = {
  sendContactMail,
  isMailEnabled
};
