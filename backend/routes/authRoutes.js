// backend/routes/authRoutes.js
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const ctrl = require('../controllers/authController');
const adminOnly = require('../middleware/adminOnly');
const asyncHandler = require('../middleware/asyncHandler');
const authRateLimit = require('../middleware/authRateLimit');

router.post('/register', authRateLimit, asyncHandler(ctrl.register));
router.post('/login', authRateLimit, asyncHandler(ctrl.login));
router.post('/forgot-password', authRateLimit, asyncHandler(ctrl.forgotPassword));
router.post('/reset-password', authRateLimit, asyncHandler(ctrl.resetPassword));
router.get('/me', auth, asyncHandler(ctrl.me));
router.get('/customers', auth, adminOnly, asyncHandler(ctrl.customers));

module.exports = router;
