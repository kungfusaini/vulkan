const fs = require('fs');
const nodemailer = require('nodemailer');

nodemailer.createTestAccount().then(account => {
  // Read existing .env
  let envContent = '';
  try {
    envContent = fs.readFileSync('.env', 'utf8');
  } catch (e) {
    console.log('Creating new .env file');
  }

  // Remove old Ethereal credentials and timestamp
  const lines = envContent.split('\n');
  const filteredLines = lines.filter(line => 
    !line.startsWith('ETHEREAL_USER=') && 
    !line.startsWith('ETHEREAL_PASS=') &&
    !line.startsWith('ETHEREAL_UPDATED=')
  );

  // Add new credentials with timestamp
  const timestamp = new Date().toISOString();
  filteredLines.push(`ETHEREAL_UPDATED=${timestamp}`);
  filteredLines.push(`ETHEREAL_USER=${account.user}`);
  filteredLines.push(`ETHEREAL_PASS=${account.pass}`);

  fs.writeFileSync('.env', filteredLines.join('\n'));
  console.log('✅ Ethereal credentials refreshed');
  console.log('📧 View emails at:', account.web);
  console.log(`👤 Username: ${account.user}`);
  console.log(`🔑 Password: ${account.pass}`);
});
