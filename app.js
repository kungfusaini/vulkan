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
app.use('/web_contact', contactLimiter, require('./routes/web_contact'));

/* ---------- error handling ---------- */
process.on('uncaughtException', err => {
  console.error('Uncaught exception:', err);
  process.exit(1);
});
process.on('unhandledRejection', err => {
  console.error('Unhandled rejection:', err);
  process.exit(1);
});

/* ---------- server ---------- */
const PORT = process.env.PORT; 
const HOST = process.env.HOST;

app.listen(PORT, '0.0.0.0', () =>
  console.log(`vulkan service running on localhost:${PORT}`)
);
