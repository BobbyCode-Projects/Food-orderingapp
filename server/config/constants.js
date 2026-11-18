module.exports = {
  TAX_RATE: 0.05,           // 5% GST
  MAX_CART_QUANTITY: 20,    // max units of a single item
  ORDER_STATUSES: ['Received', 'Preparing', 'Ready', 'Completed', 'Cancelled'],
  PAYMENT_METHODS: ['card', 'upi', 'cash'],
  CATEGORIES: [
    'Breakfast',
    'Lunch',
    'Snacks',
    'Beverages',
    'Desserts',
    'Specials',
    'Healthy Indian',
  ],
  // Fixed list of recognized allergens
  ALLERGENS: [
    'nuts',
    'peanuts',
    'dairy',
    'gluten',
    'soy',
    'eggs',
    'fish',
    'shellfish',
    'sesame',
  ],
  // Tunable nutritional thresholds for isHealthy calculation
  HEALTHY_THRESHOLDS: {
    CALORIES_MAX: 300,        // kcal
    SUGAR_MAX: 10,           // grams
    SATURATED_FAT_MAX: 5,    // grams
    SODIUM_MAX: 600,         // mg
    HEALTHY_INDIAN_CALORIES_MAX: 400, // kcal for "Healthy Indian" category
  },
  // Estimated prep time (minutes) added to now() for estimatedReadyTime
  DEFAULT_PREP_BUFFER: 5,

  // ── Reward Points & Offers Configuration ────────────────────────────────
  // Points earning tiers based on order total (higher total always gives higher range)
  REWARD_TIERS: [
    { min: 0, max: 199.99, pointsMin: 5, pointsMax: 15 },
    { min: 200, max: 499.99, pointsMin: 15, pointsMax: 35 },
    { min: 500, max: 999.99, pointsMin: 35, pointsMax: 70 },
    { min: 1000, max: Infinity, pointsMin: 70, pointsMax: 120 },
  ],

  // Redemption rate: 10 points = ₹1
  POINTS_PER_RUPEE: 10,

  // Maximum order subtotal percentage that can be discounted using reward points (50%)
  MAX_POINTS_DISCOUNT_PERCENT: 0.5,

  // Healthy eating bonus points: +5 points per healthy item (by unit quantity)
  BONUS_POINTS_PER_HEALTHY_ITEM: 5,

  // Healthy Choice offer: 5% discount if at least 60% of items (by quantity) are healthy
  HEALTHY_OFFER_MIN_RATIO: 0.6,
  HEALTHY_OFFER_DISCOUNT_PERCENT: 0.05,

  // Streak milestones and one-time bonus points awarded upon reaching them
  STREAK_MILESTONES: {
    3: 20,   // Streak 3 -> +20 bonus points
    5: 50,   // Streak 5 -> +50 bonus points
    10: 100, // Streak 10 -> +100 bonus points
  },

  // Recognized promotional coupon codes and percentage discounts
  PROMO_CODES: {
    'CAFE10': 10,
    'FIRST20': 20,
    'STUDENT5': 5,
  },

  // ── Age Group Boundaries for Personalised Recommendations ─────────────────
  AGE_GROUPS: {
    CHILD_MAX: 12,   // Child: < 13
    TEEN_MIN: 13,    // Teen: 13-19
    TEEN_MAX: 19,
    ADULT_MIN: 20,   // Adult: 20-59
    ADULT_MAX: 59,
    SENIOR_MIN: 60,  // Senior: 60+
  },
};
