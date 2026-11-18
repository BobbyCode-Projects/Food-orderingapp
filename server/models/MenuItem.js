const mongoose = require('mongoose');
const { CATEGORIES, ALLERGENS, HEALTHY_THRESHOLDS } = require('../config/constants');

const nutritionSchema = new mongoose.Schema(
  {
    calories: {
      type: Number,
      min: [0, 'Calories cannot be negative'],
      default: 0,
    },
    protein: {
      type: Number,
      min: [0, 'Protein cannot be negative'],
      default: 0,
    },
    carbs: {
      type: Number,
      min: [0, 'Carbs cannot be negative'],
      default: 0,
    },
    sugar: {
      type: Number,
      min: [0, 'Sugar cannot be negative'],
      default: 0,
    },
    fat: {
      type: Number,
      min: [0, 'Fat cannot be negative'],
      default: 0,
    },
    saturatedFat: {
      type: Number,
      min: [0, 'Saturated fat cannot be negative'],
      default: 0,
    },
    fiber: {
      type: Number,
      min: [0, 'Fiber cannot be negative'],
      default: 0,
    },
    sodium: {
      type: Number,
      min: [0, 'Sodium cannot be negative'],
      default: 0,
    },
    servingSize: {
      type: String,
      trim: true,
      default: '',
    },
  },
  { _id: false }
);

const menuItemSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Item name is required'],
      trim: true,
      maxlength: [100, 'Item name cannot exceed 100 characters'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [500, 'Description cannot exceed 500 characters'],
    },
    category: {
      type: String,
      required: [true, 'Category is required'],
      enum: CATEGORIES,
    },
    price: {
      type: Number,
      required: [true, 'Price is required'],
      min: [0, 'Price cannot be negative'],
    },
    image: {
      type: String,
      default: '/images/default-food.png',
    },
    isAvailable: {
      type: Boolean,
      default: true,
    },
    isVeg: {
      type: Boolean,
      default: true,
    },
    preparationTime: {
      type: Number, // in minutes
      default: 10,
      min: [1, 'Preparation time must be at least 1 minute'],
    },
    tags: [
      {
        type: String,
        trim: true,
      },
    ],
    nutrition: {
      type: nutritionSchema,
    },
    ingredients: [
      {
        type: String,
        trim: true,
      },
    ],
    allergens: [
      {
        type: String,
        trim: true,
        lowercase: true,
        enum: ALLERGENS,
      },
    ],
    healthTags: [
      {
        type: String,
        trim: true,
        lowercase: true,
      },
    ],
    isHealthy: {
      type: Boolean,
      default: false,
    },
    healthyOverride: {
      type: Boolean,
      default: null,
    },
    ratings: {
      average: { type: Number, default: 0, min: 0, max: 5 },
      count: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
);

// Auto-calculate isHealthy before saving
menuItemSchema.pre('save', function (next) {
  if (this.healthyOverride !== null && this.healthyOverride !== undefined) {
    this.isHealthy = Boolean(this.healthyOverride);
  } else {
    const n = this.nutrition || {};
    const cal = n.calories !== undefined && n.calories !== null ? Number(n.calories) : 0;
    const sugar = n.sugar !== undefined && n.sugar !== null ? Number(n.sugar) : 0;
    const satFat = n.saturatedFat !== undefined && n.saturatedFat !== null ? Number(n.saturatedFat) : 0;
    const sodium = n.sodium !== undefined && n.sodium !== null ? Number(n.sodium) : 0;

    const isGeneralHealthy =
      cal <= HEALTHY_THRESHOLDS.CALORIES_MAX &&
      sugar <= HEALTHY_THRESHOLDS.SUGAR_MAX &&
      satFat <= HEALTHY_THRESHOLDS.SATURATED_FAT_MAX &&
      sodium <= HEALTHY_THRESHOLDS.SODIUM_MAX;

    const isHealthyIndian =
      this.category === 'Healthy Indian' &&
      cal <= HEALTHY_THRESHOLDS.HEALTHY_INDIAN_CALORIES_MAX;

    this.isHealthy = Boolean(isGeneralHealthy || isHealthyIndian);
  }
  next();
});

// Index for fast category + availability queries
menuItemSchema.index({ category: 1, isAvailable: 1 });
menuItemSchema.index({ name: 'text', description: 'text' });

module.exports = mongoose.model('MenuItem', menuItemSchema);
