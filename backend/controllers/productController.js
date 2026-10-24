// backend/controllers/productController.js
const Product = require('../models/Product');

const BADGES = ['', 'bestseller', 'favorite', 'new'];
const PRODUCT_FIELDS = ['name', 'description', 'price', 'category', 'image', 'rating', 'isVeg', 'badge', 'stock'];

function pagination(query) {
  return {
    page: Math.max(1, Number.parseInt(query.page, 10) || 1),
    limit: Math.min(100, Math.max(1, Number.parseInt(query.limit, 10) || 50)),
  };
}

function validateProduct(body, partial = false) {
  const data = {};
  for (const field of PRODUCT_FIELDS) {
    if (body[field] !== undefined) data[field] = body[field];
  }
  const required = ['name', 'description', 'price', 'category', 'image'];
  if (!partial && required.some(field => data[field] === undefined)) return 'Name, description, price, category, and image are required.';
  for (const field of ['name', 'description', 'category', 'image']) {
    if (data[field] !== undefined && (typeof data[field] !== 'string' || !data[field].trim())) return `${field} must be a non-empty string.`;
    if (typeof data[field] === 'string') data[field] = data[field].trim();
  }
  if (data.name?.length > 120) return 'Name must be 120 characters or fewer.';
  if (data.description?.length > 2000) return 'Description must be 2000 characters or fewer.';
  if (data.category?.length > 60) return 'Category must be 60 characters or fewer.';
  if (data.image && data.image.length > 1000) return 'Image URL must be 1000 characters or fewer.';
  if (data.image && !data.image.startsWith('/images/')) {
    try {
      if (!['http:', 'https:'].includes(new URL(data.image).protocol)) return 'Image must be a local /images/ path or an HTTP(S) URL.';
    } catch { return 'Image must be a local /images/ path or an HTTP(S) URL.'; }
  }
  if (data.price !== undefined && (!Number.isFinite(Number(data.price)) || Number(data.price) < 0)) return 'Price must be a non-negative number.';
  if (data.rating !== undefined && (!Number.isFinite(Number(data.rating)) || Number(data.rating) < 0 || Number(data.rating) > 5)) return 'Rating must be between 0 and 5.';
  if (data.stock !== undefined && (!Number.isInteger(Number(data.stock)) || Number(data.stock) < 0)) return 'Stock must be a non-negative whole number.';
  if (data.badge !== undefined && !BADGES.includes(data.badge)) return 'Badge is invalid.';
  if (data.isVeg !== undefined && typeof data.isVeg !== 'boolean') return 'isVeg must be a boolean.';
  if (data.price !== undefined) data.price = Number(data.price);
  if (data.rating !== undefined) data.rating = Number(data.rating);
  if (data.stock !== undefined) data.stock = Number(data.stock);
  return data;
}

// GET /api/products?category=&search=
exports.list = async (req, res) => {
  try {
    const { page, limit } = pagination(req.query);
    const filter = {};
    const category = String(req.query.category || '').trim();
    const search = String(req.query.search || '').trim().slice(0, 100);
    const stock = String(req.query.stock || '').trim();
    if (category) filter.category = category;
    if (stock === 'low') filter.stock = { $gt: 0, $lt: 10 };
    if (stock === 'out') filter.stock = 0;
    if (stock && !['low', 'out'].includes(stock)) return res.status(400).json({ error: 'Unknown stock filter.' });
    if (search) {
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = ['name', 'description', 'category'].map(field => ({ [field]: { $regex: escaped, $options: 'i' } }));
    }
    const [products, total] = await Promise.all([
      Product.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
      Product.countDocuments(filter),
    ]);
    res.json({ products, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (err) {
    res.status(400).json({ error: 'Could not load products.', detail: err.message });
  }
};

// GET /api/products/categories
exports.categories = async (req, res) => {
  const [categories, counts] = await Promise.all([
    Product.distinct('category'),
    Product.aggregate([{ $group: { _id: '$category', count: { $sum: 1 } } }]),
  ]);
  res.json({ categories, counts: Object.fromEntries(counts.map(item => [item._id, item.count])) });
};

exports.inventorySummary = async (req, res) => {
  const threshold = Number(process.env.LOW_STOCK_THRESHOLD || 10);
  const [total, lowStock, outOfStock] = await Promise.all([
    Product.countDocuments(),
    Product.countDocuments({ stock: { $gt: 0, $lt: threshold } }),
    Product.countDocuments({ stock: 0 }),
  ]);
  res.json({ total, lowStock, outOfStock, lowStockThreshold: threshold });
};

exports.renameCategory = async (req, res) => {
  const from = String(req.body.from || '').trim();
  const to = String(req.body.to || '').trim();
  if (!from || !to || from.length > 60 || to.length > 60) {
    return res.status(400).json({ error: 'Provide category names between 1 and 60 characters.' });
  }
  if (from === to) return res.status(400).json({ error: 'Choose a different category name.' });
  try {
    const result = await Product.updateMany({ category: from }, { $set: { category: to } }, { runValidators: true });
    res.json({ renamed: result.modifiedCount, from, to });
  } catch (err) {
    res.status(400).json({ error: 'Could not rename category.', detail: err.message });
  }
};

// GET /api/products/:id
exports.getOne = async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (!product) return res.status(404).json({ error: 'Product not found.' });
  res.json({ product });
};

// POST /api/products  (admin only)
exports.create = async (req, res) => {
  try {
    const data = validateProduct(req.body);
    if (typeof data === 'string') return res.status(400).json({ error: data });
    const product = await Product.create(data);
    res.status(201).json({ product });
  } catch (err) {
    res.status(400).json({ error: 'Could not create product.', detail: err.message });
  }
};

// PUT /api/products/:id  (admin only)
exports.update = async (req, res) => {
  try {
    const data = validateProduct(req.body, true);
    if (typeof data === 'string') return res.status(400).json({ error: data });
    if (Object.keys(data).length === 0) return res.status(400).json({ error: 'Provide at least one product field to update.' });
    const product = await Product.findByIdAndUpdate(req.params.id, { $set: data }, { new: true, runValidators: true, strict: 'throw' });
    if (!product) return res.status(404).json({ error: 'Product not found.' });
    res.json({ product });
  } catch (err) {
    res.status(err.name === 'CastError' ? 404 : 400).json({ error: 'Could not update product.', detail: err.message });
  }
};

exports.updateStock = async (req, res) => {
  const stock = Number(req.body.stock);
  if (!Number.isInteger(stock) || stock < 0) return res.status(400).json({ error: 'Stock must be a non-negative whole number.' });
  try {
    const product = await Product.findByIdAndUpdate(req.params.id, { $set: { stock } }, { new: true, runValidators: true });
    if (!product) return res.status(404).json({ error: 'Product not found.' });
    res.json({ product });
  } catch (err) {
    res.status(400).json({ error: 'Could not update stock.', detail: err.message });
  }
};

// DELETE /api/products/:id  (admin only)
exports.remove = async (req, res) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) return res.status(404).json({ error: 'Product not found.' });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: 'Could not delete product.', detail: err.message });
  }
};
