
require('dotenv').config();
const bcrypt = require('bcryptjs');
const connectDB = require('./config/db');
const User = require('./models/User');

async function resetAdminPassword() {
  try {
    const email = String(process.env.ADMIN_EMAIL || '')
      .trim()
      .toLowerCase();
    const password = process.env.ADMIN_PASSWORD || '';

    if (!email || password.length < 12) {
      throw new Error(
        'Set ADMIN_EMAIL and a password of at least 12 characters in .env.'
      );
    }

    await connectDB();

    const user = await User.findOne({ email }).select('+password');

    if (!user) {
      throw new Error('No account found for ADMIN_EMAIL.');
    }

    if (user.role !== 'admin') {
      throw new Error(
        'This account is not an admin. No account role was changed.'
      );
    }

    user.password = await bcrypt.hash(password, 12);
    await user.save();

    console.log('Admin password reset successfully.');
  } catch (error) {
    console.error('Password reset failed:', error.message);
    process.exitCode = 1;
  } finally {
    const mongoose = require('mongoose');
    await mongoose.disconnect().catch(() => {});
  }
}

resetAdminPassword();
