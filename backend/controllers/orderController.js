// backend/controllers/orderController.js
const Order = require('../models/Order');
const Product = require('../models/Product');
const User = require('../models/User');
const mongoose = require('mongoose');

const NEXT_STATUS = {
  confirmed: ['preparing'],
  preparing: ['ready'],
  ready: ['out_for_delivery'],
  out_for_delivery: ['delivered'],
  delivered: [],
};

function parseDateRange(query, defaultDays = 7) {
  const today = new Date();
  const todayKey = today.toISOString().slice(0, 10);
  const fromKey = query.from || (() => { const start = new Date(`${todayKey}T00:00:00.000Z`); start.setUTCDate(start.getUTCDate() - (defaultDays - 1)); return start.toISOString().slice(0, 10); })();
  const toKey = query.to || todayKey;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromKey) || !/^\d{4}-\d{2}-\d{2}$/.test(toKey)) return null;
  const from = new Date(`${fromKey}T00:00:00.000Z`);
  const to = new Date(`${toKey}T23:59:59.999Z`);
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || from.toISOString().slice(0, 10) !== fromKey || to.toISOString().slice(0, 10) !== toKey) return null;
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || from > to) return null;
  const days = Math.ceil((to - from) / 86400000) + 1;
  if (days > 366) return null;
  return { from, to, days };
}

async function adminOrderFilter(query) {
  const filter = {};
  const status = String(query.status || '').trim();
  if (status) {
    if (!Order.STATUS_STEPS.includes(status)) return { error: 'Unknown order status.' };
    filter.status = status;
  }
  if (query.from || query.to) {
    const range = parseDateRange(query, 7);
    if (!range) return { error: 'Choose a valid date range of no more than 366 days.' };
    filter.createdAt = { $gte: range.from, $lte: range.to };
  }
  const search = String(query.search || '').trim().slice(0, 100);
  if (search) {
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const matchedUsers = await User.find({ $or: [
      { name: { $regex: escaped, $options: 'i' } },
      { email: { $regex: escaped, $options: 'i' } },
    ] }).select('_id').limit(1000).lean();
    const ids = matchedUsers.map(user => user._id);
    const idSearch = /^[a-f\d]{24}$/i.test(search) ? search : null;
    filter.$or = [
      { 'customer.name': { $regex: escaped, $options: 'i' } },
      { 'customer.email': { $regex: escaped, $options: 'i' } },
      ...(ids.length ? [{ user: { $in: ids } }] : []),
      ...(idSearch ? [{ _id: idSearch }] : []),
    ];
  }
  return { filter };
}

const DELIVERY_FEES = { standard: 40, express: 90, pickup: 0 };
const GST_RATE = 0.05; // 5%

async function restoreStock(reservations) {
  if (!reservations.length) return;
  try {
    await Product.bulkWrite(reservations.map(({ productId, quantity }) => ({
      updateOne: { filter: { _id: productId }, update: { $inc: { stock: quantity } } },
    })));
  } catch (error) {
    console.error('Could not restore inventory after failed order creation:', error.message);
  }
}

// POST /api/orders  (requires auth)
// Body: { items: [{productId, quantity}], customer, address, deliveryOption, paymentMethod, discount? }
exports.create = async (req, res) => {
  try {
    const { items, customer, address, deliveryOption = 'standard', paymentMethod = 'cod' } = req.body || {};
    const deliveryOptions = Object.keys(DELIVERY_FEES);
    const paymentMethods = ['upi', 'card', 'cod', 'pay_at_cafe'];
    if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'Your cart is empty.' });
    if (items.length > 50) return res.status(400).json({ error: 'An order can contain at most 50 product lines.' });
    if (!deliveryOptions.includes(deliveryOption)) return res.status(400).json({ error: 'Choose a valid delivery option.' });
    if (!paymentMethods.includes(paymentMethod)) return res.status(400).json({ error: 'Choose a valid payment method.' });

    if (!customer || typeof customer !== 'object' || Array.isArray(customer)) {
      return res.status(400).json({ error: 'Customer details are required.' });
    }
    const customerName = typeof customer.name === 'string' ? customer.name.trim() : '';
    const customerEmail = typeof customer.email === 'string' ? customer.email.trim().toLowerCase() : '';
    const customerPhone = typeof customer.phone === 'string' ? customer.phone.trim() : '';
    if (!customerName || customerName.length > 120) return res.status(400).json({ error: 'Enter a customer name (up to 120 characters).' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail) || customerEmail.length > 254) return res.status(400).json({ error: 'Enter a valid customer email.' });
    if (customerPhone.length > 40) return res.status(400).json({ error: 'Phone number must be 40 characters or fewer.' });
    const cleanCustomer = { name: customerName, email: customerEmail, phone: customerPhone };

    let cleanAddress;
    if (deliveryOption !== 'pickup') {
      if (!address || typeof address !== 'object' || Array.isArray(address)) return res.status(400).json({ error: 'A delivery address is required.' });
      cleanAddress = {};
      for (const field of ['house', 'street', 'city', 'state', 'pincode']) {
        const value = typeof address[field] === 'string' ? address[field].trim() : '';
        if (!value || value.length > 120) return res.status(400).json({ error: `Enter a valid ${field} (up to 120 characters).` });
        cleanAddress[field] = value;
      }
    }

    const quantities = new Map();
    for (const item of items) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return res.status(400).json({ error: 'Each cart line must contain a product and quantity.' });
      const productId = String(item.productId || '');
      const quantity = Number(item.quantity);
      if (!/^[a-f\d]{24}$/i.test(productId)) return res.status(400).json({ error: 'A cart item has an invalid product ID.' });
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) return res.status(400).json({ error: 'Each product quantity must be a whole number from 1 to 99.' });
      const combined = (quantities.get(productId) || 0) + quantity;
      if (combined > 99) return res.status(400).json({ error: 'A product quantity cannot exceed 99.' });
      quantities.set(productId, combined);
    }

    const products = await Product.find({ _id: { $in: [...quantities.keys()] } });
    const productMap = new Map(products.map(product => [String(product._id), product]));
    if (productMap.size !== quantities.size) return res.status(400).json({ error: 'A product in your cart no longer exists.' });
    let subtotal = 0;
    const resolvedItems = [...quantities].map(([productId, quantity]) => {
      const product = productMap.get(productId);
      subtotal += product.price * quantity;
      return { product: product._id, name: product.name, image: product.image, price: product.price, quantity };
    });

    const deliveryFee = DELIVERY_FEES[deliveryOption];
    const discountAmount = 0;
    const taxable = subtotal - discountAmount;
    const gst = Math.round(taxable * GST_RATE);
    const total = taxable + gst + deliveryFee;

    const reservations = [];
    let order;
    try {
      for (const item of resolvedItems) {
        const reserved = await Product.findOneAndUpdate(
          { _id: item.product, stock: { $gte: item.quantity } },
          { $inc: { stock: -item.quantity } },
          { new: true, projection: { _id: 1 } }
        );
        if (!reserved) {
          await restoreStock(reservations);
          return res.status(409).json({ error: `Not enough stock remains for ${item.name}.` });
        }
        reservations.push({ productId: item.product, quantity: item.quantity });
      }

      order = await Order.create({
        user: req.user.id,
        items: resolvedItems,
        customer: cleanCustomer,
        address: cleanAddress,
        deliveryOption,
        paymentMethod,
        subtotal,
        deliveryFee,
        discount: discountAmount,
        gst,
        total,
      });
    } catch (error) {
      await restoreStock(reservations);
      throw error;
    }

    res.status(201).json({ order });
  } catch (err) {
    res.status(500).json({ error: 'Could not place order.', detail: err.message });
  }
};

// GET /api/orders/mine  (requires auth) — current user's order history
exports.mine = async (req, res) => {
  try {
    const orders = await Order.find({ user: req.user.id }).sort({ createdAt: -1 });
    res.json({ orders });
  } catch (err) {
    res.status(500).json({ error: 'Could not load your orders.' });
  }
};

// GET /api/orders/:id  (requires auth; owner or admin)
exports.getOne = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'Invalid order ID.' });
  const order = await Order.findById(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found.' });
  if (String(order.user) !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Not your order.' });
  }
  res.json({ order, steps: Order.STATUS_STEPS });
};

// --- Admin ---

// GET /api/orders  (admin only) — all orders
exports.all = async (req, res) => {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 25));
    const result = await adminOrderFilter(req.query);
    if (result.error) return res.status(400).json({ error: result.error });
    const [orders, total] = await Promise.all([
      Order.find(result.filter).populate('user', 'name email').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
      Order.countDocuments(result.filter),
    ]);
    res.json({ orders, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (err) {
    res.status(400).json({ error: 'Could not load orders.', detail: err.message });
  }
};

// PUT /api/orders/:id/status  (admin only)  Body: { status }
exports.updateStatus = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'Invalid order ID.' });
  const { status } = req.body;
  if (!Order.STATUS_STEPS.includes(status)) {
    return res.status(400).json({ error: `Status must be one of: ${Order.STATUS_STEPS.join(', ')}` });
  }
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found.' });
    const permittedNext = order.status === 'ready' && order.deliveryOption === 'pickup'
      ? ['delivered']
      : NEXT_STATUS[order.status] || [];
    if (order.status !== status && !permittedNext.includes(status)) {
      return res.status(409).json({ error: `Order cannot move from ${order.status} to ${status}.` });
    }
    if (order.status !== status) {
      order.status = status;
      await order.save();
    }
    res.json({ order });
  } catch (err) {
    res.status(err.name === 'CastError' ? 404 : 400).json({ error: 'Could not update order status.', detail: err.message });
  }
};

// GET /api/orders/stats/summary  (admin only) — dashboard numbers
exports.stats = async (req, res) => {
  const todayKey = new Date().toISOString().slice(0, 10);
  const startOfToday = new Date(`${todayKey}T00:00:00.000Z`);
  const endOfToday = new Date(`${todayKey}T23:59:59.999Z`);
  const range = parseDateRange(req.query, 7);
  if (!range) return res.status(400).json({ error: 'Choose a valid date range of no more than 366 days.' });
  const rangeMatch = { createdAt: { $gte: range.from, $lte: range.to } };

  const [totalOrders, todayOrders, todayRevenueAgg, customers, pendingOrders, completedOrders, lowStockProducts, topProducts, statusAgg, recentOrders] = await Promise.all([
    Order.countDocuments(),
    Order.countDocuments({ createdAt: { $gte: startOfToday, $lte: endOfToday } }),
    Order.aggregate([{ $match: { createdAt: { $gte: startOfToday, $lte: endOfToday } } }, { $group: { _id: null, revenue: { $sum: '$total' } } }]),
    User.countDocuments({ role: 'customer' }),
    Order.countDocuments({ status: { $ne: 'delivered' } }),
    Order.countDocuments({ status: 'delivered' }),
    Product.countDocuments({ stock: { $lt: 10 } }),
    Order.aggregate([
      { $match: rangeMatch },
      { $unwind: '$items' },
      { $group: { _id: '$items.name', qty: { $sum: '$items.quantity' } } },
      { $sort: { qty: -1 } },
      { $limit: 5 },
    ]),
    Order.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    Order.find().populate('user', 'name email').sort({ createdAt: -1 }).limit(8),
  ]);

  const [revenueAgg, dailyAgg] = await Promise.all([
    Order.aggregate([{ $match: rangeMatch }, { $group: { _id: null, revenue: { $sum: '$total' }, orders: { $sum: 1 } } }]),
    Order.aggregate([
      { $match: rangeMatch },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'UTC' } }, count: { $sum: 1 }, revenue: { $sum: '$total' } } },
      { $sort: { _id: 1 } },
    ]),
  ]);
  const dailyMap = Object.fromEntries(dailyAgg.map(day => [day._id, day]));
  const daily = [];
  for (let date = new Date(range.from); date <= range.to; date.setUTCDate(date.getUTCDate() + 1)) {
    const key = date.toISOString().slice(0, 10);
    daily.push({ date: key, count: dailyMap[key]?.count || 0, revenue: dailyMap[key]?.revenue || 0 });
  }

  res.json({
    totalOrders,
    todayOrders,
    revenue: revenueAgg[0]?.revenue || 0,
    todayRevenue: todayRevenueAgg[0]?.revenue || 0,
    customers,
    pendingOrders,
    completedOrders,
    lowStockProducts,
    topProducts,
    statusCounts: Object.fromEntries(statusAgg.map(s => [s._id, s.count])),
    daily,
    range: { from: range.from.toISOString().slice(0, 10), to: range.to.toISOString().slice(0, 10), orders: revenueAgg[0]?.orders || 0 },
    revenueNote: 'Revenue sums stored order totals for the selected period. This schema has no cancelled or refunded statuses.',
    recentOrders,
  });
};
