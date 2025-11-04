const nodemailer = require('nodemailer');

// Credentials are valid for 1 hour (3600000 ms)
const CREDENTIALS_AGE_LIMIT = 60 * 60 * 1000;

/**
 * Sets up Ethereal credentials with caching - reuses existing credentials if they're less than 1 hour old
 * Called when NODE_ENV=dev and MAIL_ENABLED=true
 */
async function setupEtherealCredentials() {
  try {
    // Check if existing credentials are still valid (less than 1 hour old)
    if (process.env.ETHEREAL_USER && process.env.ETHEREAL_PASS && process.env.ETHEREAL_WEB_URL && process.env.ETHEREAL_TIMESTAMP) {
      const credentialAge = Date.now() - parseInt(process.env.ETHEREAL_TIMESTAMP);
      
      if (credentialAge < CREDENTIALS_AGE_LIMIT) {
        console.log('[setup-ethereal] ✅ Using existing Ethereal credentials (still valid)');
        console.log(`[setup-ethereal] View emails at: ${process.env.ETHEREAL_WEB_URL}`);
        console.log(`[setup-ethereal] Username: ${process.env.ETHEREAL_USER}`);
        console.log(`[setup-ethereal] Password: ${process.env.ETHEREAL_PASS}`);
        
        return {
          user: process.env.ETHEREAL_USER,
          pass: process.env.ETHEREAL_PASS,
          web: process.env.ETHEREAL_WEB_URL
        };
      }
    }
    
    console.log('[setup-ethereal] Generating new Ethereal credentials...');
    
    // Generate new Ethereal test account
    const account = await nodemailer.createTestAccount();
    
    // Set credentials as environment variables with timestamp
    process.env.ETHEREAL_USER = account.user;
    process.env.ETHEREAL_PASS = account.pass;
    process.env.ETHEREAL_WEB_URL = account.web;
    process.env.ETHEREAL_TIMESTAMP = Date.now().toString();
    
    console.log('[setup-ethereal] ✅ New Ethereal credentials generated successfully');
    console.log(`[setup-ethereal] View emails at: ${account.web}`);
    console.log(`[setup-ethereal] Username: ${account.user}`);
    console.log(`[setup-ethereal] Password: ${account.pass}`);
    
    return account;
    
  } catch (error) {
    console.error('[setup-ethereal] ❌ Failed to setup Ethereal credentials:', error.message);
    throw error;
  }
}

module.exports = { setupEtherealCredentials };