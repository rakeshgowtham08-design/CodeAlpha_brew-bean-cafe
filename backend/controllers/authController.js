// backend/controllers/authController.js
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { getSmtpConfig, sendMail } = require('../mailer');
const User = require('../models/User');

const passwordResetMessage = 'If an account exists for that email, password reset instructions will be sent shortly.';

function signToken(user) {
  return jwt.sign(
    { id: user._id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}
function publicUser(u) {
  return { id: u._id, name: u.name, email: u.email, phone: u.phone, role: u.role };
}

// POST /api/auth/register
exports.register = async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }
    const exists = await User.findOne({ email: email.toLowerCase() });
    if (exists) return res.status(409).json({ error: 'An account with that email already exists.' });

    const password_hash = await bcrypt.hash(password, 10);
    const user = await User.create({ name, email: email.toLowerCase(), password: password_hash, phone });

    res.status(201).json({ token: signToken(user), user: publicUser(user) });
  } catch (err) {
    res.status(500).json({ error: 'Registration failed.', detail: err.message });
  }
};

// POST /api/auth/login
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });

    const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'Incorrect email or password.' });
    }
    res.json({ token: signToken(user), user: publicUser(user) });
  } catch (err) {
    res.status(500).json({ error: 'Login failed.', detail: err.message });
  }
};

// POST /api/auth/forgot-password
exports.forgotPassword = async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    if (!email) return res.status(400).json({ error: 'Email is required.' });

    const user = await User.findOne({ email });
    if (user) {
      const token = crypto.randomBytes(32).toString('hex');
      user.passwordResetToken = crypto.createHash('sha256').update(token).digest('hex');
      user.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000);
      await user.save();

      const baseUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
      const resetUrl = new URL('/reset-password.html', baseUrl);
      resetUrl.searchParams.set('token', token);

      const smtp = getSmtpConfig();
      if (!smtp.missing.length) {
        try {
          await sendMail({
            to: user.email,
            subject: 'Reset your Brew & Bean password',
            text: `Use this link to reset your password within one hour: ${resetUrl}`,
            html: `<p>We received a request to reset your Brew &amp; Bean password.</p><p><a href="${resetUrl}">Choose a new password</a></p><p>This link expires in one hour. If you did not request this, you can ignore this email.</p>`,
          });
        } catch (mailError) {
          console.error('Password reset email could not be sent:', mailError.message);
          return res.status(503).json({ error: 'Password reset email could not be sent. Check SMTP configuration and try again.' });
        }
      } else if (process.env.NODE_ENV !== 'production') {
        console.warn(`Password reset link (development only): ${resetUrl}`);
      } else {
        console.error(`Password reset email is not configured. Set ${smtp.missing.join(', ')}.`);
        return res.status(503).json({ error: 'Password reset email is temporarily unavailable. Contact the café administrator.' });
      }
    }

    res.json({ message: passwordResetMessage });
  } catch (err) {
    console.error('Password reset request failed:', err.message);
    res.status(500).json({ error: 'Could not process the password reset request.' });
  }
};

// POST /api/auth/reset-password
exports.resetPassword = async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) return res.status(400).json({ error: 'Reset token and new password are required.' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });

    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: new Date() },
    });
    if (!user) return res.status(400).json({ error: 'This password reset link is invalid or has expired. Request a new one.' });

    user.password = await bcrypt.hash(password, 10);
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save();
    res.json({ message: 'Your password has been reset. You can now log in.' });
  } catch (err) {
    console.error('Password reset failed:', err.message);
    res.status(500).json({ error: 'Could not reset the password.' });
  }
};

// GET /api/auth/me  (requires auth middleware)
exports.me = async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  res.json({ user: publicUser(user) });
};

// GET /api/auth/customers (admin only)
exports.customers = async (req, res) => {
  try {
    const Order = require('../models/Order');
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 50));
    const search = String(req.query.search || '').trim().slice(0, 100);
    const filter = { role: 'customer' };
    if (search) {
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
        { name: { $regex: escaped, $options: 'i' } },
        { email: { $regex: escaped, $options: 'i' } },
      ];
    }

    const [customers, total] = await Promise.all([
      User.find(filter).select('name email phone createdAt').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      User.countDocuments(filter),
    ]);
    const stats = await Order.aggregate([
      { $match: { user: { $in: customers.map(customer => customer._id) } } },
      { $group: { _id: '$user', orderCount: { $sum: 1 }, totalSpent: { $sum: '$total' }, lastOrderAt: { $max: '$createdAt' } } },
    ]);
    const byUser = Object.fromEntries(stats.map(stat => [String(stat._id), stat]));
    res.json({
      customers: customers.map(c => ({
        ...c,
        orderCount: byUser[String(c._id)]?.orderCount || 0,
        totalSpent: byUser[String(c._id)]?.totalSpent || 0,
        lastOrderAt: byUser[String(c._id)]?.lastOrderAt || null,
      })),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    res.status(500).json({ error: 'Could not load customers.', detail: err.message });
  }
};
