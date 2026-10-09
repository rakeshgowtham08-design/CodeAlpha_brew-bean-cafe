// backend/middleware/auth.js
// Verifies the JWT sent in the Authorization header ("Bearer <token>")
// and attaches the decoded payload (id, role) to req.user.
const jwt = require('jsonwebtoken');
const User = require('../models/User');

module.exports = async function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Not logged in.' });
  }
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(payload.id).select('_id role');
    if (!user) return res.status(401).json({ error: 'Account no longer exists.' });
    req.user = { id: String(user._id), role: user.role };
    next();
  } catch (err) {
    if (err.name !== 'JsonWebTokenError' && err.name !== 'TokenExpiredError') {
      return res.status(500).json({ error: 'Could not verify your account.' });
    }
    return res.status(401).json({ error: 'Invalid or expired session, please log in again.' });
  }
};
