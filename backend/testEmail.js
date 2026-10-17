require('dotenv').config();
const { sendMail } = require('./mailer');

async function sendTestEmail() {
  const recipient = String(process.argv[2] || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
    throw new Error('Usage: npm run email:test -- recipient@example.com');
  }
  const result = await sendMail({
    to: recipient,
    subject: 'Brew & Bean SMTP test',
    text: 'SMTP is configured and Brew & Bean can send email.',
  });
  console.log(`Test email accepted by the SMTP server for ${recipient}. Message ID: ${result.messageId}`);
}

sendTestEmail().catch(error => {
  console.error(`Test email failed: ${error.message}`);
  process.exitCode = 1;
});