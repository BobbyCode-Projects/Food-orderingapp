const MenuItem = require('../models/MenuItem');
const User = require('../models/User');
const {
  calculateOrderPricing,
  getPointsPreview,
  getActiveOffers,
} = require('../services/rewardService');

// GET /api/rewards  — customer auth required
exports.getRewards = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select(
      'name email rewardPoints healthyOrderStreak streakMilestonesAwarded pointsHistory'
    );
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    const history = (user.pointsHistory || []).slice().sort((a, b) => new Date(b.date) - new Date(a.date));

    res.json({
      success: true,
      points: user.rewardPoints || 0,
      streak: user.healthyOrderStreak || 0,
      streakMilestonesAwarded: user.streakMilestonesAwarded || [],
      history,
      offers: getActiveOffers(),
    });
  } catch (err) {
    next(err);
  }
};

// POST /api/rewards/preview  — customer auth required
exports.previewOrderRewards = async (req, res, next) => {
  try {
    const { items = [], redeemPoints = 0, promoCode = '' } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Cart items are required for rewards preview.',
      });
    }

    const user = await User.findById(req.user._id);
    const userPoints = user ? user.rewardPoints || 0 : 0;

    // Resolve items from database to snapshot verified prices and isHealthy flags
    const resolvedItems = [];
    for (const reqItem of items) {
      const id = reqItem.menuItem || reqItem._id;
      if (!id) continue;
      const menuItem = await MenuItem.findById(id);
      if (!menuItem) continue;

      const qty = Math.max(1, parseInt(reqItem.quantity) || 1);
      resolvedItems.push({
        menuItem: menuItem._id,
        name: menuItem.name,
        price: menuItem.price,
        isHealthy: Boolean(menuItem.isHealthy),
        quantity: qty,
        subtotal: +(menuItem.price * qty).toFixed(2),
      });
    }

    if (resolvedItems.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid menu items provided.',
      });
    }

    // Calculate server-side pricing and discounts
    const pricing = calculateOrderPricing({
      resolvedItems,
      redeemPoints,
      promoCode,
      userPoints,
    });

    // Estimate points to be earned upon payment
    const pointsToEarn = getPointsPreview(pricing.total, pricing.healthyItemCount);

    res.json({
      success: true,
      userPoints,
      currentStreak: user ? user.healthyOrderStreak || 0 : 0,
      pricing,
      pointsToEarn,
      offers: getActiveOffers(),
    });
  } catch (err) {
    next(err);
  }
};
