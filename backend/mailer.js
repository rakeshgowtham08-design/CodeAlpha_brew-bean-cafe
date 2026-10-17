const nodemailer = require('nodemailer');

function getSmtpConfig() {
  const host = String(process.env.SMTP_HOST || '').trim();
  const user = String(process.env.SMTP_USER || '').trim();
  const pass = process.env.SMTP_PASS || '';
  const port = Number(process.env.SMTP_PORT || 587);
  const secureValue = String(process.env.SMTP_SECURE || '').trim().toLowerCase();
  const secure = secureValue ? secureValue === 'true' : port === 465;
  const missing = [];
  if (!host) missing.push('SMTP_HOST');
  if (!user) missing.push('SMTP_USER');
  if (!pass) missing.push('SMTP_PASS');
  if (!Number.isInteger(port) || port < 1 || port > 65535) missing.push('valid SMTP_PORT');
  if (secureValue && !['true', 'false'].includes(secureValue)) missing.push('SMTP_SECURE must be true or false');
  return { host, user, pass, port, secure, missing };
}

function createTransporter() {
  const config = getSmtpConfig();
  if (config.missing.length) {
    throw new Error(`SMTP is not configured. Set: ${config.missing.join(', ')}.`);
  }
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.pass },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
  });
}

async function sendMail(message) {
  const config = getSmtpConfig();
  const transporter = createTransporter();
  return transporter.sendMail({
    from: process.env.SMTP_FROM || config.user,
    ...message,
  });
}

module.exports = { getSmtpConfig, createTransporter, sendMail };