const fs = require('fs');
const nodemailer = require('nodemailer');

const DEV_SECRETS_FILE = '.env.dev-secrets';

/**
 * Reads the existing .env.dev-secrets file, strips old Ethereal credentials,
 * generates new ones, and writes the updated content back.
 */
function generateEtherealAndUpdateEnv() {
    const existingContent = fs.readFileSync(DEV_SECRETS_FILE, { encoding: 'utf8', flag: 'a+' });
    return nodemailer.createTestAccount()
        .then(account => {
            const lines = existingContent.split('\n');
            const filteredLines = lines.filter(line => 
                !line.startsWith('ETHEREAL_USER=') &&
                !line.startsWith('ETHEREAL_PASS=')
            );
            
            filteredLines.push(`ETHEREAL_USER=${account.user}`);
            filteredLines.push(`ETHEREAL_PASS=${account.pass}`);

            const newContent = filteredLines.join('\n');
            
            fs.writeFileSync(DEV_SECRETS_FILE, newContent);
            
            console.log(`Ethereal credentials (USER/PASS) updated in ${DEV_SECRETS_FILE}`);
            console.log('View emails at:', account.web);
            console.log('Username:', account.user);
            console.log('Password:', account.pass);
        })
        .catch(err => {
            console.error('Failed to generate Ethereal credentials. Check network connection.');
            console.error(err.message);
            process.exit(1);
        });
}

// ----------------- Execution -----------------

if (!fs.existsSync(DEV_SECRETS_FILE)) {
    console.error(`Error: ${DEV_SECRETS_FILE} not found.`);
    console.error(`Please create it first by copying .env.template.`);
    process.exit(1);
}

generateEtherealAndUpdateEnv();
