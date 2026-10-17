// backend/routes/orderRoutes.js
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const adminOnly = require('../middleware/adminOnly');
const ctrl = require('../controllers/orderController');

// IMPORTANT: specific paths before "/:id" so they aren't swallowed by the param route
router.get('/stats/summary', auth, adminOnly, ctrl.stats);
router.get('/mine', auth, ctrl.mine);
router.get('/', auth, adminOnly, ctrl.all);
router.post('/', auth, ctrl.create);
router.get('/:id', auth, ctrl.getOne);
router.put('/:id/status', auth, adminOnly, ctrl.updateStatus);

module.exports = router;
