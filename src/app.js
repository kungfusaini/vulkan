const { setupEtherealCredentials } = require('./utils/setup-ethereal');

/* ---------- setup ethereal credentials if needed ---------- */
async function initializeApp() {
  // Setup ethereal credentials BEFORE validation (only when mail enabled)
  if (process.env.NODE_ENV === 'dev' && process.env.MAIL_ENABLED === 'true') {
    await setupEtherealCredentials().catch(err => {
      console.error('[app] Failed to setup Ethereal credentials:', err.message);
      process.exit(1);
    });
  }

  // Validate environment after credentials are set up
  require('./utils/validate-env');

  const express       = require('express');
  const helmet        = require('helmet');
  const rateLimit     = require('express-rate-limit');

  const app = express();

  /* ---------- global middleware ---------- */
  app.use(helmet());
  app.use(express.json({ limit: '20kb' }));
  app.use(express.urlencoded({ extended: false }));

  /* ---------- shared rate-limiter ---------- */
  const contactLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: { error: 'Too many requests, try again later.' }
  });


  
  /* ---------- routes ---------- */
  app.use('/status', require('./routes/status'));
  
  if (process.env.NODE_ENV === 'dev') {
    app.use('/web_contact', require('./routes/web_contact'));
  } else {
    app.use('/web_contact', contactLimiter, require('./routes/web_contact'));
  }

  /* ---------- error handling ---------- */
  process.on('uncaughtException', err => {
    console.error('Uncaught exception:', err);
    process.exit(1);
  });

  process.on('unhandledRejection', err => {
    console.error('Unhandled rejection:', err);
    process.exit(1);
  });

  const PORT = process.env.PORT || 3000;
  const HOST = process.env.HOST || '0.0.0.0';

  app.listen(PORT, HOST, () => {
    console.log(`🚀 Server running on http://${HOST}:${PORT}`);
  });
}

// Initialize the application
initializeApp().catch(err => {
  console.error('[app] Failed to initialize application:', err.message);
  process.exit(1);
});
