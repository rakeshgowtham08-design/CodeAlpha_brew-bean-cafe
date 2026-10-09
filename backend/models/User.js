// backend/models/User.js
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name:     { type: String, required: true, trim: true },
  email:    { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true, select: false }, // bcrypt hash, never returned by default
  passwordResetToken: { type: String, select: false },
  passwordResetExpires: { type: Date, select: false },
  phone:    { type: String, default: '' },
  role:     { type: String, enum: ['customer', 'admin'], default: 'customer' },
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
