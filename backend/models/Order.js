// backend/models/Order.js
const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
  product:  { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  name:     { type: String, required: true },  // snapshot, in case product is edited later
  image:    { type: String, required: true },
  price:    { type: Number, required: true },
  quantity: { type: Number, required: true, min: 1 },
}, { _id: false });

const STATUS_STEPS = ['confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered'];

const orderSchema = new mongoose.Schema({
  user:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  items:       { type: [orderItemSchema], required: true },
  customer:    {
    name: String, phone: String, email: String,
  },
  address: {
    house: String, street: String, city: String, state: String, pincode: String,
  },
  deliveryOption: { type: String, enum: ['standard', 'express', 'pickup'], default: 'standard' },
  paymentMethod:  { type: String, enum: ['upi', 'card', 'cod', 'pay_at_cafe'], default: 'cod' },
  subtotal:  { type: Number, required: true },
  deliveryFee: { type: Number, required: true, default: 0 },
  discount:  { type: Number, required: true, default: 0 },
  gst:       { type: Number, required: true, default: 0 },
  total:     { type: Number, required: true },
  status:    { type: String, enum: STATUS_STEPS, default: 'confirmed' },
}, { timestamps: true });

orderSchema.statics.STATUS_STEPS = STATUS_STEPS;

module.exports = mongoose.model('Order', orderSchema);
