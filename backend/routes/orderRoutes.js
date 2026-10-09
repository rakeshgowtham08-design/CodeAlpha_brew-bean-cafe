// backend/routes/orderRoutes.js
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const adminOnly = require('../middleware/adminOnly');
const ctrl = require('../controllers/orderController');
const asyncHandler = require('../middleware/asyncHandler');

// IMPORTANT: specific paths before "/:id" so they aren't swallowed by the param route
router.get('/stats/summary', auth, adminOnly, asyncHandler(ctrl.stats));
router.get('/mine', auth, asyncHandler(ctrl.mine));
router.get('/', auth, adminOnly, asyncHandler(ctrl.all));
router.post('/', auth, asyncHandler(ctrl.create));
router.get('/:id', auth, asyncHandler(ctrl.getOne));
router.put('/:id/status', auth, adminOnly, asyncHandler(ctrl.updateStatus));

module.exports = router;
