const errors = [];

// Check if NODE_ENV exists
if (!process.env.NODE_ENV) {
  errors.push('NODE_ENV is required');
} else if (process.env.NODE_ENV !== 'prod' && process.env.NODE_ENV !== 'dev') {
  errors.push('NODE_ENV must be "prod" or "dev"');
}

// Base variables (always required)
const baseRequired = ['PORT', 'HOST', 'MAIL_ENABLED', 'FROM_EMAIL'];
baseRequired.forEach(key => {
  if (!process.env[key]) {
    errors.push(`${key} is required`);
  }
});

// Validate MAIL_ENABLED format
if (process.env.MAIL_ENABLED !== 'true' && process.env.MAIL_ENABLED !== 'false') {
  errors.push('MAIL_ENABLED must be "true" or "false"');
}

// Mail-enabled validation (only when MAIL_ENABLED=true)
if (process.env.MAIL_ENABLED === 'true') {
  // Check MAIN_EMAIL exists and is valid (for sumeetsaini origin)
  if (!process.env.MAIN_EMAIL) {
    if (process.env.NODE_ENV === 'prod') {
      errors.push('MAIN_EMAIL is required in production - set via GitHub Secrets');
    } else {
      errors.push('MAIN_EMAIL is required in development - check docker-compose-dev.yml');
    }
  } else if (!process.env.MAIN_EMAIL.includes('@')) {
    errors.push('MAIN_EMAIL must be a valid email address');
  }
  
  // Check RELIQ_STUDIOS_EMAIL exists and is valid (for reliqstudios origin)
  if (!process.env.RELIQ_STUDIOS_EMAIL) {
    if (process.env.NODE_ENV === 'prod') {
      errors.push('RELIQ_STUDIOS_EMAIL is required in production - set via GitHub Secrets');
    } else {
      errors.push('RELIQ_STUDIOS_EMAIL is required in development - check docker-compose-dev.yml');
    }
  } else if (!process.env.RELIQ_STUDIOS_EMAIL.includes('@')) {
    errors.push('RELIQ_STUDIOS_EMAIL must be a valid email address');
  }
}

// Environment-specific requirements
if (process.env.NODE_ENV === 'prod') {
  if (process.env.MAIL_ENABLED !== 'true') {
    errors.push('MAIL_ENABLED must be "true" in production');
  }
  // MAILCOW_HOST is now set in docker-compose-prod.yml as public config
}

if (process.env.NODE_ENV === 'dev' && process.env.MAIL_ENABLED === 'true') {
  if (!process.env.ETHEREAL_USER || !process.env.ETHEREAL_PASS) {
    errors.push('Ethereal credentials missing - ensure setup-ethereal.js runs successfully');
  }
}

if (errors.length > 0) {
  console.error('❌ Environment validation failed:');
  errors.forEach(error => console.error(`  - ${error}`));
  process.exit(1);
}

console.log('✅ Environment validation passed');
