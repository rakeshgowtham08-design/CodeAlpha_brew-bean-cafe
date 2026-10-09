// backend/routes/productRoutes.js
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const adminOnly = require('../middleware/adminOnly');
const ctrl = require('../controllers/productController');
const asyncHandler = require('../middleware/asyncHandler');

router.get('/', asyncHandler(ctrl.list));
router.get('/categories', asyncHandler(ctrl.categories));
router.get('/inventory/summary', auth, adminOnly, asyncHandler(ctrl.inventorySummary));
router.patch('/categories', auth, adminOnly, asyncHandler(ctrl.renameCategory));
router.patch('/:id/stock', auth, adminOnly, asyncHandler(ctrl.updateStock));
router.get('/:id', asyncHandler(ctrl.getOne));
router.post('/', auth, adminOnly, asyncHandler(ctrl.create));
router.put('/:id', auth, adminOnly, asyncHandler(ctrl.update));
router.delete('/:id', auth, adminOnly, asyncHandler(ctrl.remove));

module.exports = router;
