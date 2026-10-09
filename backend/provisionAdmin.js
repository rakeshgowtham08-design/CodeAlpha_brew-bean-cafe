require('dotenv').config();
const bcrypt = require('bcryptjs');
const connectDB = require('./config/db');
const User = require('./models/User');

async function provisionAdmin() {
  const email = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || '';
  const name = String(process.env.ADMIN_NAME || 'Café Admin').trim();
  if (!email || !password || password.length < 12) {
    throw new Error('Set ADMIN_EMAIL and ADMIN_PASSWORD (at least 12 characters) in .env before provisioning.');
  }

  await connectDB();
  const existing = await User.findOne({ email }).select('_id role');
  if (existing) {
    if (existing.role !== 'admin') {
      throw new Error('That email already belongs to a non-admin account. Choose a different ADMIN_EMAIL; no role was changed.');
    }
    console.log(`Administrator account already exists: ${email}. No account or password changes were made.`);
    return;
  }

  await User.create({ name, email, password: await bcrypt.hash(password, 12), role: 'admin' });
  console.log(`Administrator account created: ${email}`);
}

provisionAdmin()
  .then(() => require('mongoose').disconnect())
  .catch(async error => {
    console.error(error.message);
    await require('mongoose').disconnect();
    process.exitCode = 1;
  });