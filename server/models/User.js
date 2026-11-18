const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { ALLERGENS, AGE_GROUPS } = require('../config/constants');

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      maxlength: [50, 'Name cannot exceed 50 characters'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email'],
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [6, 'Password must be at least 6 characters'],
      select: false, // never returned in queries by default
    },
    phone: {
      type: String,
      trim: true,
      match: [/^[0-9]{10}$/, 'Please enter a valid 10-digit phone number'],
    },
    dateOfBirth: {
      type: Date,
    },
    allergies: [
      {
        type: String,
        trim: true,
        lowercase: true,
        enum: ALLERGENS,
      },
    ],
    role: {
      type: String,
      enum: ['customer', 'admin'],
      default: 'customer',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    rewardPoints: {
      type: Number,
      default: 0,
      min: [0, 'Reward points cannot be negative'],
    },
    pointsHistory: [
      {
        type: {
          type: String,
          enum: ['earned', 'redeemed', 'refunded'],
          required: true,
        },
        points: {
          type: Number,
          required: true,
        },
        order: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Order',
        },
        reason: {
          type: String,
          trim: true,
        },
        date: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    healthyOrderStreak: {
      type: Number,
      default: 0,
      min: 0,
    },
    streakMilestonesAwarded: [
      {
        type: Number,
      },
    ],
  },
  { timestamps: true }
);

// Compute user age in years
userSchema.methods.getAge = function () {
  if (!this.dateOfBirth) return null;
  const birthDate = new Date(this.dateOfBirth);
  if (isNaN(birthDate.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
};

// Compute age group: child (<13), teen (13-19), adult (20-59), senior (60+)
userSchema.virtual('ageGroup').get(function () {
  const age = this.getAge();
  if (age === null) return 'adult'; // default
  if (age <= AGE_GROUPS.CHILD_MAX) return 'child';
  if (age <= AGE_GROUPS.TEEN_MAX) return 'teen';
  if (age <= AGE_GROUPS.ADULT_MAX) return 'adult';
  return 'senior';
});

userSchema.set('toJSON', { virtuals: true });
userSchema.set('toObject', { virtuals: true });

// Hash password before saving
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Compare entered password with hashed password
userSchema.methods.comparePassword = async function (enteredPassword) {
  return bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
