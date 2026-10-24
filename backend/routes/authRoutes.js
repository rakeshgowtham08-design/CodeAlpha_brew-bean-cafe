// backend/routes/authRoutes.js
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const ctrl = require('../controllers/authController');
const adminOnly = require('../middleware/adminOnly');

router.post('/register', ctrl.register);
router.post('/login', ctrl.login);
router.post('/forgot-password', ctrl.forgotPassword);
router.post('/reset-password', ctrl.resetPassword);
router.get('/me', auth, ctrl.me);
router.post('/logout', auth, ctrl.logout);
router.get('/customers', auth, adminOnly, ctrl.customers);

module.exports = router;
