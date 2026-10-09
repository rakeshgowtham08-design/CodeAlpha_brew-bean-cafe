require('dotenv').config();
const { createTransporter, getSmtpConfig } = require('./mailer');

async function checkSmtp() {
  const config = getSmtpConfig();
  if (config.missing.length) {
    throw new Error(`SMTP is not ready. Configure ${config.missing.join(', ')} in .env, then rerun npm run email:check.`);
  }
  await createTransporter().verify();
  console.log(`SMTP connection and authentication verified for ${config.host}:${config.port}. No email was sent.`);
}

checkSmtp().catch(error => {
  console.error(`SMTP check failed: ${error.message}`);
  process.exitCode = 1;
});