const fs = require('fs');
const nodemailer = require('nodemailer');

const DEFAULT_PORT = '3001';

// Parse command line arguments
const args = process.argv.slice(2);
const envFlagIndex = args.indexOf('-env');
const envType = envFlagIndex !== -1 ? args[envFlagIndex + 1] : null;

// Check if .env exists
const envExists = fs.existsSync('.env');

// Validate arguments
if (!envExists && (!envType || (envType !== 'prod' && envType !== 'dev'))) {
  console.error('.env file not found. Use -env prod or -env dev to create one:');
  console.error('   node gen-env.js -env dev   # Create development environment');
  console.error('   node gen-env.js -env prod  # Create production environment');
  process.exit(1);
}

// Generate fresh Ethereal credentials and update .env
function generateEtherealAndUpdateEnv(envContent = '') {
  return nodemailer.createTestAccount().then(account => {
    // Remove old Ethereal credentials
    const lines = envContent.split('\n');
    const filteredLines = lines.filter(line => 
      !line.startsWith('ETHEREAL_USER=') && 
      !line.startsWith('ETHEREAL_PASS=')
    );

    // Add new credentials
    filteredLines.push(`ETHEREAL_USER=${account.user}`);
    filteredLines.push(`ETHEREAL_PASS=${account.pass}`);

    const newContent = filteredLines.join('\n');
    fs.writeFileSync('.env', newContent);
    
    console.log('Ethereal credentials generated');
    console.log('View emails at:', account.web);
    console.log(`Username: ${account.user}`);
    console.log(`Password: ${account.pass}`);
    
    return account;
  });
}

// Handle different scenarios
if (!envExists) {
  if (envType === 'dev') {
    // Create dev .env template with blank values
    const devTemplate = `#THIS IS A SECRET SHHHHHH

NODE_ENV=dev

PORT=${DEFAULT_PORT}
TO_EMAIL=
FROM_EMAIL=
`;
    fs.writeFileSync('.env', devTemplate);
    console.log('Development .env file generated');
    // Generate fresh Ethereal credentials for dev
    generateEtherealAndUpdateEnv(devTemplate);
    
  } else if (envType === 'prod') {
    // Create prod .env template with blank values (NO Ethereal generation)
    const prodTemplate = `#THIS IS A SECRET SHHHHHH

# Environment
NODE_ENV=prod

# Postfix container IP inside mailcow network
MAILCOW_HOST=

PORT=${DEFAULT_PORT}
TO_EMAIL=
FROM_EMAIL=
`;
    fs.writeFileSync('.env', prodTemplate);
    console.log('Production .env file generated');
    console.log('Configure your settings in .env');
  }
} else {
  // .env exists - always generate fresh Ethereal credentials
  const existingContent = fs.readFileSync('.env', 'utf8');
  generateEtherealAndUpdateEnv(existingContent);
}
