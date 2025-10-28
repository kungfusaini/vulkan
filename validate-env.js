const fs = require('fs');

const errors = [];

// Check if NODE_ENV exists
if (!process.env.NODE_ENV) {
  errors.push('NODE_ENV is required');
} else if (process.env.NODE_ENV !== 'prod' && process.env.NODE_ENV !== 'dev') {
  errors.push('NODE_ENV must be "prod" or "dev"');
}

// Common required variables
const commonRequired = ['PORT', 'TO_EMAIL', 'FROM_EMAIL', 'HOST', 'MAIL_ENABLED'];
commonRequired.forEach(key => {
  if (!process.env[key]) {
    errors.push(`${key} is required`);
  }
});

// Validate MAIL_ENABLED format
if (process.env.MAIL_ENABLED !== 'true' && process.env.MAIL_ENABLED !== 'false') {
  errors.push('MAIL_ENABLED must be "true" or "false"');
}

// Production specific
if (process.env.NODE_ENV === 'prod') {
  if (process.env.MAIL_ENABLED !== 'true') {
    errors.push('MAIL_ENABLED must be "true" in production');
  }
  if (!process.env.MAILCOW_HOST) {
    errors.push('MAILCOW_HOST is required in production');
  }
}

// Development specific
if (process.env.NODE_ENV === 'dev') {
  if (process.env.MAIL_ENABLED === 'true'){
	if (!process.env.ETHEREAL_USER || !process.env.ETHEREAL_PASS) {
    errors.push('ETHEREAL_USER and ETHEREAL_PASS are required if MAIL_ENABLED=true');
  }
  }
}

if (errors.length > 0) {
  console.error('❌ Environment validation failed:');
  errors.forEach(error => console.error(`  - ${error}`));
  process.exit(1);
}

console.log('✅ Environment validation passed');
