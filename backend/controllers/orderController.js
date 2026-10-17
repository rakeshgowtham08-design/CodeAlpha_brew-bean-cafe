// backend/controllers/orderController.js
const Order = require('../models/Order');
const Product = require('../models/Product');
const User = require('../models/User');

const NEXT_STATUS = {
  confirmed: ['preparing'],
  preparing: ['ready'],
  ready: ['out_for_delivery'],
  out_for_delivery: ['delivered'],
  delivered: [],
};

function parseDateRange(query, defaultDays = 7) {
  const today = new Date();
  const to = query.to ? new Date(`${query.to}T23:59:59.999Z`) : new Date(today);
  const from = query.from ? new Date(`${query.from}T00:00:00.000Z`) : new Date(today);
  if (!query.from) from.setUTCDate(from.getUTCDate() - (defaultDays - 1));
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

// POST /api/orders  (requires auth)
// Body: { items: [{productId, quantity}], customer, address, deliveryOption, paymentMethod, discount? }
exports.create = async (req, res) => {
  try {
    const { items, customer, address, deliveryOption = 'standard', paymentMethod = 'cod' } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Your cart is empty.' });
    }

    let subtotal = 0;
    const resolvedItems = [];
    for (const { productId, quantity } of items) {
      const qty = Number(quantity);
      const product = await Product.findById(productId);
      if (!product) return res.status(400).json({ error: `A product in your cart no longer exists.` });
      if (!Number.isInteger(qty) || qty < 1) return res.status(400).json({ error: `Invalid quantity for ${product.name}.` });

      subtotal += product.price * qty;
      resolvedItems.push({
        product: product._id, name: product.name, image: product.image, price: product.price, quantity: qty,
      });
    }

    const deliveryFee = deliveryOption === 'pickup' ? 0 : (DELIVERY_FEES[deliveryOption] ?? DELIVERY_FEES.standard);
    const discountAmount = 0;
    const taxable = subtotal - discountAmount;
    const gst = Math.round(taxable * GST_RATE);
    const total = taxable + gst + deliveryFee;

    const order = await Order.create({
      user: req.user.id,
      items: resolvedItems,
      customer,
      address: deliveryOption === 'pickup' ? undefined : address,
      deliveryOption,
      paymentMethod,
      subtotal,
      deliveryFee,
      discount: discountAmount,
      gst,
      total,
    });

    res.status(201).json({ order });
  } catch (err) {
    res.status(500).json({ error: 'Could not place order.', detail: err.message });
  }
};

// GET /api/orders/mine  (requires auth) — current user's order history
exports.mine = async (req, res) => {
  const orders = await Order.find({ user: req.user.id }).sort({ createdAt: -1 });
  res.json({ orders });
};

// GET /api/orders/:id  (requires auth; owner or admin)
exports.getOne = async (req, res) => {
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
  const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
  const range = parseDateRange(req.query, 7);
  if (!range) return res.status(400).json({ error: 'Choose a valid date range of no more than 366 days.' });
  const rangeMatch = { createdAt: { $gte: range.from, $lte: range.to } };

  const [totalOrders, todayOrders, todayRevenueAgg, customers, pendingOrders, completedOrders, lowStockProducts, topProducts, statusAgg, recentOrders] = await Promise.all([
    Order.countDocuments(),
    Order.countDocuments({ createdAt: { $gte: startOfToday } }),
    Order.aggregate([{ $match: { createdAt: { $gte: startOfToday } } }, { $group: { _id: null, revenue: { $sum: '$total' } } }]),
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
