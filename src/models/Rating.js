const mongoose = require('mongoose');

const ratingSchema = new mongoose.Schema({
  delivery: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Delivery',
    required: true,
    unique: true,   // one rating per delivery
  },
  driver: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Driver',
    required: true,
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  rating: { type: Number, required: true, min: 1, max: 5 },
  comment: { type: String, default: '', trim: true, maxlength: 300 },
}, { timestamps: true });

module.exports = mongoose.model('Rating', ratingSchema);