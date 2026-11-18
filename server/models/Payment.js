const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const paymentSchema = new mongoose.Schema(
  {
    paymentId: {
      type: String,
      unique: true,
      default: () => `PAY-${uuidv4().slice(0, 10).toUpperCase()}`,
    },
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      required: true,
    },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    amount: {
      type: Number,
      required: [true, 'Payment amount is required'],
      min: [0, 'Amount cannot be negative'],
    },
    method: {
      type: String,
      enum: ['card', 'upi', 'cash'],
      required: [true, 'Payment method is required'],
    },
    status: {
      type: String,
      enum: ['pending', 'success', 'failed', 'refunded'],
      default: 'pending',
    },
    // Mock gateway fields — replace with real gateway data in production
    transactionId: {
      type: String,
      default: () => `TXN-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    },
    gatewayResponse: {
      type: mongoose.Schema.Types.Mixed, // store raw gateway payload
      default: {},
    },
    paidAt: {
      type: Date,
    },
    receiptUrl: {
      type: String,
    },
  },
  { timestamps: true }
);

// Mark paidAt when status flips to success
paymentSchema.pre('save', function (next) {
  if (this.isModified('status') && this.status === 'success' && !this.paidAt) {
    this.paidAt = new Date();
  }
  next();
});

paymentSchema.index({ order: 1 });
paymentSchema.index({ customer: 1 });

module.exports = mongoose.model('Payment', paymentSchema);
