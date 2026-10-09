// backend/models/Product.js
const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name:        { type: String, required: true, trim: true },
  description: { type: String, required: true },
  price:       { type: Number, required: true, min: 0 }, // in rupees (whole number)
  category:    { type: String, required: true, trim: true },
  image:       { type: String, required: true }, // URL
  rating:      { type: Number, default: 4.5, min: 0, max: 5 },
  isVeg:       { type: Boolean, default: true },
  badge:       { type: String, enum: ['', 'bestseller', 'favorite', 'new'], default: '' },
  stock:       { type: Number, default: 50, min: 0 },
}, { timestamps: true });

productSchema.index({ name: 'text', description: 'text', category: 'text' });

module.exports = mongoose.model('Product', productSchema);
