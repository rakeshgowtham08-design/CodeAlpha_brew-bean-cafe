// backend/routes/productRoutes.js
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const adminOnly = require('../middleware/adminOnly');
const ctrl = require('../controllers/productController');

router.get('/', ctrl.list);
router.get('/categories', ctrl.categories);
router.get('/inventory/summary', auth, adminOnly, ctrl.inventorySummary);
router.patch('/categories', auth, adminOnly, ctrl.renameCategory);
router.patch('/:id/stock', auth, adminOnly, ctrl.updateStock);
router.get('/:id', ctrl.getOne);
router.post('/', auth, adminOnly, ctrl.create);
router.put('/:id', auth, adminOnly, ctrl.update);
router.delete('/:id', auth, adminOnly, ctrl.remove);

module.exports = router;
