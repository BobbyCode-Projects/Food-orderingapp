const {
  TAX_RATE,
  REWARD_TIERS,
  POINTS_PER_RUPEE,
  MAX_POINTS_DISCOUNT_PERCENT,
  BONUS_POINTS_PER_HEALTHY_ITEM,
  HEALTHY_OFFER_MIN_RATIO,
  HEALTHY_OFFER_DISCOUNT_PERCENT,
  STREAK_MILESTONES,
  PROMO_CODES,
} = require('../config/constants');

/**
 * Calculate all order pricing, discounts, and point redemptions server-side.
 */
function calculateOrderPricing({ resolvedItems, redeemPoints = 0, promoCode = '', userPoints = 0 }) {
  const subtotal = +resolvedItems.reduce((s, i) => s + i.subtotal, 0).toFixed(2);
  const totalItemCount = resolvedItems.reduce((s, i) => s + i.quantity, 0);

  // Count healthy units
  const healthyItemCount = resolvedItems.reduce((s, i) => {
    return s + (i.isHealthy ? i.quantity : 0);
  }, 0);

  // Healthy Choice 5% Offer: >= 60% of items (by quantity) are healthy
  const healthyRatio = totalItemCount > 0 ? healthyItemCount / totalItemCount : 0;
  const healthyOfferEligible = totalItemCount > 0 && healthyRatio >= HEALTHY_OFFER_MIN_RATIO;
  const healthyOfferDiscount = healthyOfferEligible
    ? +(subtotal * HEALTHY_OFFER_DISCOUNT_PERCENT).toFixed(2)
    : 0;

  // Promo code discount
  const cleanCode = String(promoCode || '').trim().toUpperCase();
  const promoPercent = PROMO_CODES[cleanCode] || 0;
  const promoDiscount = promoPercent > 0 ? +(subtotal * (promoPercent / 100)).toFixed(2) : 0;

  // Points redemption: 10 points = ₹1, max 50% of subtotal
  const maxPointsDiscount = +(subtotal * MAX_POINTS_DISCOUNT_PERCENT).toFixed(2);
  const maxRedeemablePoints = Math.floor(maxPointsDiscount * POINTS_PER_RUPEE);

  const requestedPoints = Math.max(0, Math.floor(Number(redeemPoints) || 0));
  const availableUserPoints = Math.max(0, Number(userPoints) || 0);

  const pointsRedeemed = Math.min(requestedPoints, availableUserPoints, maxRedeemablePoints);
  const pointsDiscount = +(pointsRedeemed / POINTS_PER_RUPEE).toFixed(2);

  // Tax and Total
  const tax = +(subtotal * TAX_RATE).toFixed(2);
  const discountTotal = +(promoDiscount + pointsDiscount + healthyOfferDiscount).toFixed(2);
  let total = +(subtotal + tax - promoDiscount - pointsDiscount - healthyOfferDiscount).toFixed(2);
  if (total < 0) total = 0;

  return {
    subtotal,
    tax,
    totalItemCount,
    healthyItemCount,
    healthyRatio,
    healthyOfferEligible,
    healthyOfferDiscount,
    promoCode: promoPercent > 0 ? cleanCode : null,
    promoDiscount,
    maxRedeemablePoints,
    maxPointsDiscount,
    pointsRedeemed,
    pointsDiscount,
    discountTotal,
    total,
  };
}

/**
 * Get range of reward points customer can earn on an order of given total & healthy items.
 */
function getPointsPreview(total, healthyItemCount = 0) {
  const safeTotal = Math.max(0, Number(total) || 0);
  const tier = REWARD_TIERS.find((t) => safeTotal >= t.min && safeTotal <= t.max) ||
    REWARD_TIERS[REWARD_TIERS.length - 1];

  const healthyBonus = (Number(healthyItemCount) || 0) * BONUS_POINTS_PER_HEALTHY_ITEM;

  return {
    tier: {
      minOrderTotal: tier.min,
      maxOrderTotal: tier.max === Infinity ? null : tier.max,
      pointsMin: tier.pointsMin,
      pointsMax: tier.pointsMax,
    },
    baseMin: tier.pointsMin,
    baseMax: tier.pointsMax,
    healthyBonus,
    minEarn: tier.pointsMin + healthyBonus,
    maxEarn: tier.pointsMax + healthyBonus,
  };
}

/**
 * Award reward points upon successful order payment.
 */
async function awardOrderPoints(user, order) {
  if (!user || !order) return 0;
  if (order.pointsEarned && order.pointsEarned > 0) {
    // Already awarded
    return order.pointsEarned;
  }

  const safeTotal = Math.max(0, Number(order.pricing?.total) || 0);
  const tier = REWARD_TIERS.find((t) => safeTotal >= t.min && safeTotal <= t.max) ||
    REWARD_TIERS[REWARD_TIERS.length - 1];

  // Random base points strictly within the tier range
  const basePoints = Math.floor(Math.random() * (tier.pointsMax - tier.pointsMin + 1)) + tier.pointsMin;

  // Bonus points for healthy items
  const healthyCount = Number(order.healthyItemCount) || 0;
  const healthyBonus = healthyCount * BONUS_POINTS_PER_HEALTHY_ITEM;

  // Streak update & milestone bonuses
  let milestoneBonus = 0;
  let milestoneHit = null;

  if (healthyCount > 0) {
    user.healthyOrderStreak = (user.healthyOrderStreak || 0) + 1;
    const currentStreak = user.healthyOrderStreak;

    if (!user.streakMilestonesAwarded) {
      user.streakMilestonesAwarded = [];
    }

    if (STREAK_MILESTONES[currentStreak] && !user.streakMilestonesAwarded.includes(currentStreak)) {
      milestoneBonus = STREAK_MILESTONES[currentStreak];
      user.streakMilestonesAwarded.push(currentStreak);
      milestoneHit = currentStreak;
    }
  } else {
    // No healthy items in order -> reset streak
    user.healthyOrderStreak = 0;
  }

  const totalPointsEarned = basePoints + healthyBonus + milestoneBonus;

  // Credit points to user
  user.rewardPoints = (user.rewardPoints || 0) + totalPointsEarned;

  let reasonDesc = `Earned ${basePoints} base pts`;
  if (healthyBonus > 0) reasonDesc += ` + ${healthyBonus} healthy bonus pts`;
  if (milestoneBonus > 0) reasonDesc += ` + ${milestoneBonus} milestone ${milestoneHit} bonus pts`;
  reasonDesc += ` for order ${order.orderNumber}`;

  user.pointsHistory.push({
    type: 'earned',
    points: totalPointsEarned,
    order: order._id,
    reason: reasonDesc,
    date: new Date(),
  });

  await user.save();

  // Save earned points on order
  order.pointsEarned = totalPointsEarned;
  await order.save();

  return totalPointsEarned;
}

/**
 * Refund redeemed points if payment fails or order is cancelled.
 */
async function refundOrderPoints(user, order, reason = 'Order cancelled / Payment failed') {
  if (!user || !order) return 0;
  const redeemed = Number(order.pricing?.pointsRedeemed) || 0;

  if (redeemed <= 0 || order.pointsRefunded) {
    return 0; // Nothing to refund or already refunded
  }

  user.rewardPoints = (user.rewardPoints || 0) + redeemed;
  user.pointsHistory.push({
    type: 'refunded',
    points: redeemed,
    order: order._id,
    reason: `${reason} (${order.orderNumber})`,
    date: new Date(),
  });

  order.pointsRefunded = true;

  await user.save();
  await order.save();

  return redeemed;
}

/**
 * Structured list of currently available promotions and offers.
 */
function getActiveOffers() {
  return [
    {
      id: 'healthy-choice-5',
      title: '🥗 Healthy Choice 5% Off',
      badge: 'Save 5%',
      description: 'Make at least 60% of the items in your cart healthy, and get an automatic 5% discount on your order subtotal!',
      type: 'healthy_cart',
    },
    {
      id: 'healthy-bonus-points',
      title: '🔥 +5 Healthy Bonus Points',
      badge: '+5 Pts / Item',
      description: 'Earn 5 extra reward points for every healthy dish or beverage ordered.',
      type: 'healthy_bonus',
    },
    {
      id: 'streak-milestones',
      title: '⚡ Healthy Eating Streaks',
      badge: 'Up to +100 Pts',
      description: 'Order healthy meals consecutively to build your streak! Unlock 20 bonus pts at 3 orders, 50 pts at 5 orders, and 100 pts at 10 orders.',
      type: 'streak',
    },
    {
      id: 'points-redemption',
      title: '💰 Redeem Points for Cash',
      badge: '10 pts = ₹1',
      description: 'Use your points at checkout to discount up to 50% of your order subtotal.',
      type: 'redemption',
    },
  ];
}

module.exports = {
  calculateOrderPricing,
  getPointsPreview,
  awardOrderPoints,
  refundOrderPoints,
  getActiveOffers,
};
