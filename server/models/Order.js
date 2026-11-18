const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const orderItemSchema = new mongoose.Schema(
  {
    menuItem: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MenuItem',
      required: true,
    },
    name: { type: String, required: true },   // snapshot at order time
    price: { type: Number, required: true },  // snapshot at order time
    quantity: {
      type: Number,
      required: true,
      min: [1, 'Quantity must be at least 1'],
    },
    subtotal: { type: Number, required: true },
  },
  { _id: false }
);

const statusHistorySchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: ['Received', 'Preparing', 'Ready', 'Completed', 'Cancelled'],
      required: true,
    },
    timestamp: { type: Date, default: Date.now },
    note: { type: String, trim: true },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    orderNumber: {
      type: String,
      unique: true,
      default: () => `ORD-${uuidv4().slice(0, 8).toUpperCase()}`,
    },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    customerName: { type: String, required: true },
    customerPhone: { type: String },
    items: {
      type: [orderItemSchema],
      validate: {
        validator: (v) => Array.isArray(v) && v.length > 0,
        message: 'Order must have at least one item',
      },
    },
    orderType: {
      type: String,
      enum: ['dine-in', 'pickup'],
      required: [true, 'Order type is required'],
    },
    tableNumber: {
      type: String,
      trim: true,
    },
    specialInstructions: {
      type: String,
      trim: true,
      maxlength: [300, 'Special instructions cannot exceed 300 characters'],
    },
    status: {
      type: String,
      enum: ['Received', 'Preparing', 'Ready', 'Completed', 'Cancelled'],
      default: 'Received',
    },
    statusHistory: [statusHistorySchema],
    pricing: {
      subtotal: { type: Number, required: true },
      tax: { type: Number, required: true },       // 5% GST
      discount: { type: Number, default: 0 },
      promoDiscount: { type: Number, default: 0 },
      pointsRedeemed: { type: Number, default: 0 },
      pointsDiscount: { type: Number, default: 0 },
      healthyOfferDiscount: { type: Number, default: 0 },
      total: { type: Number, required: true, min: 0 },
    },
    pointsEarned: {
      type: Number,
      default: 0,
      min: 0,
    },
    healthyItemCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    pointsRefunded: {
      type: Boolean,
      default: false,
    },
    payment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Payment',
    },
    estimatedReadyTime: {
      type: Date,
    },
  },
  { timestamps: true }
);

// Auto-push initial status to history on creation
orderSchema.pre('save', function (next) {
  if (this.isNew) {
    this.statusHistory.push({ status: 'Received', note: 'Order placed' });
  }
  next();
});

// Index for fast lookups by customer and status
orderSchema.index({ customer: 1, createdAt: -1 });
orderSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('Order', orderSchema);
