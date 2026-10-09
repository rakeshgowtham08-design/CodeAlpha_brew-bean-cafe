// backend/middleware/adminOnly.js
// Must run AFTER the auth middleware (needs req.user already set).
module.exports = function adminOnly(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required.' });
  }
  next();
};
