// models/User.js
const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  telegramId: { type: Number, required: true, unique: true },
  username: { type: String, required: true },
  firstName: { type: String },
  lastName: { type: String },
  balance: { type: Number, default: 0 },
  miningActive: { type: Boolean, default: false },
  premium: { type: Boolean, default: false },
  lastUpdated: { type: Date, default: Date.now },
  joinedAt: { type: Date, default: Date.now },
  // Daily bonus fields
  dailyCode: { type: String, default: null },
  dailyCodeGeneratedAt: { type: Date, default: null },
  codeSubmissions: { type: Number, default: 0 },  // Bonus from others submitting this user’s code (+0.1 each)
  hasSubmittedBonus: { type: Boolean, default: false }  // Bonus flag if the user has submitted someone else’s code (+0.5)
});

module.exports = mongoose.model('User', UserSchema);
