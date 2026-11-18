const Order = require('../models/Order');
const MenuItem = require('../models/MenuItem');
const User = require('../models/User');
const { validateOrder } = require('../middleware/validate');
const { DEFAULT_PREP_BUFFER, ORDER_STATUSES } = require('../config/constants');
const { calculateOrderPricing, refundOrderPoints } = require('../services/rewardService');

// POST /api/orders  — authenticated customer
exports.createOrder = async (req, res, next) => {
  try {
    const { isValid, errors } = validateOrder(req.body);
    if (!isValid) return res.status(400).json({ success: false, errors });

    const {
      items,
      orderType,
      tableNumber,
      specialInstructions,
      customerName,
      customerPhone,
      redeemPoints,
      promoCode,
    } = req.body;

    const user = await User.findById(req.user._id);
    const userPoints = user ? user.rewardPoints || 0 : 0;
    const userAllergies = Array.isArray(user?.allergies)
      ? user.allergies.map((a) => String(a).toLowerCase().trim())
      : [];

    // Resolve each item from DB to snapshot price, name & isHealthy
    const resolvedItems = [];
    const allergyConflicts = [];
    let maxPrepTime = 0;

    for (const reqItem of items) {
      const menuItem = await MenuItem.findById(reqItem.menuItem);
      if (!menuItem)
        return res.status(404).json({ success: false, message: `Menu item not found: ${reqItem.menuItem}` });
      if (!menuItem.isAvailable)
        return res.status(400).json({ success: false, message: `"${menuItem.name}" is currently unavailable.` });

      // Check for user allergy conflicts (advisory)
      if (userAllergies.length > 0 && Array.isArray(menuItem.allergens)) {
        const matching = menuItem.allergens.filter((a) => userAllergies.includes(String(a).toLowerCase()));
        if (matching.length > 0) {
          allergyConflicts.push({
            menuItemId: menuItem._id,
            name: menuItem.name,
            conflictingAllergens: matching,
          });
        }
      }

      const qty = Math.max(1, parseInt(reqItem.quantity) || 1);
      resolvedItems.push({
        menuItem: menuItem._id,
        name: menuItem.name,
        price: menuItem.price,
        isHealthy: Boolean(menuItem.isHealthy),
        quantity: qty,
        subtotal: +(menuItem.price * qty).toFixed(2),
      });
      if (menuItem.preparationTime > maxPrepTime) maxPrepTime = menuItem.preparationTime;
    }

    // Server-side calculation of subtotal, tax, healthy discount, points discount, and total
    const pricingCalc = calculateOrderPricing({
      resolvedItems,
      redeemPoints,
      promoCode,
      userPoints,
    });

    const estimatedReadyTime = new Date(Date.now() + (maxPrepTime + DEFAULT_PREP_BUFFER) * 60 * 1000);

    const order = new Order({
      customer: req.user._id,
      customerName,
      customerPhone,
      items: resolvedItems,
      orderType,
      tableNumber,
      specialInstructions,
      pricing: {
        subtotal: pricingCalc.subtotal,
        tax: pricingCalc.tax,
        discount: pricingCalc.discountTotal,
        promoDiscount: pricingCalc.promoDiscount,
        pointsRedeemed: pricingCalc.pointsRedeemed,
        pointsDiscount: pricingCalc.pointsDiscount,
        healthyOfferDiscount: pricingCalc.healthyOfferDiscount,
        total: pricingCalc.total,
      },
      healthyItemCount: pricingCalc.healthyItemCount,
      pointsEarned: 0,
      pointsRefunded: false,
      estimatedReadyTime,
    });

    await order.save();

    // If points were redeemed, deduct from user and record history
    if (pricingCalc.pointsRedeemed > 0 && user) {
      user.rewardPoints = Math.max(0, (user.rewardPoints || 0) - pricingCalc.pointsRedeemed);
      user.pointsHistory.push({
        type: 'redeemed',
        points: pricingCalc.pointsRedeemed,
        order: order._id,
        reason: `Redeemed on order ${order.orderNumber}`,
        date: new Date(),
      });
      await user.save();
    }

    res.status(201).json({ success: true, order, allergyConflicts });
  } catch (err) {
    next(err);
  }
};

// GET /api/orders  — customer sees own orders; admin sees all
exports.getOrders = async (req, res, next) => {
  try {
    const filter = req.user.role === 'admin' ? {} : { customer: req.user._id };
    const { status, page = 1, limit = 20 } = req.query;

    if (status && ORDER_STATUSES.includes(status)) filter.status = status;

    const total = await Order.countDocuments(filter);
    const orders = await Order.find(filter)
      .populate('customer', 'name email')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    res.json({
      success: true,
      total,
      page: Number(page),
      pages: Math.ceil(total / limit),
      orders,
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/orders/:id
exports.getOrderById = async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('customer', 'name email phone')
      .populate('payment');

    if (!order) return res.status(404).json({ success: false, message: 'Order not found.' });

    // Customers can only see their own orders
    if (req.user.role !== 'admin' && order.customer._id.toString() !== req.user._id.toString())
      return res.status(403).json({ success: false, message: 'Not authorised to view this order.' });

    res.json({ success: true, order });
  } catch (err) {
    next(err);
  }
};

// GET /api/orders/track/:orderNumber  — public (customer tracks by order number)
exports.trackOrder = async (req, res, next) => {
  try {
    const order = await Order.findOne({ orderNumber: req.params.orderNumber })
      .select('orderNumber status statusHistory estimatedReadyTime items pricing orderType customerName createdAt');

    if (!order) return res.status(404).json({ success: false, message: 'Order not found.' });
    res.json({ success: true, order });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/orders/:id/status  — admin only
exports.updateOrderStatus = async (req, res, next) => {
  try {
    const { status, note } = req.body;
    if (!ORDER_STATUSES.includes(status))
      return res.status(400).json({ success: false, message: `Status must be one of: ${ORDER_STATUSES.join(', ')}.` });

    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found.' });

    order.status = status;
    order.statusHistory.push({ status, note: note || '' });
    await order.save();

    if (status === 'Cancelled' && order.pricing?.pointsRedeemed > 0 && !order.pointsRefunded) {
      const customer = await User.findById(order.customer);
      if (customer) await refundOrderPoints(customer, order, 'Order cancelled by admin');
    }

    res.json({ success: true, order });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/orders/:id  — admin only (cancel)
exports.cancelOrder = async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found.' });

    if (['Completed', 'Cancelled'].includes(order.status))
      return res.status(400).json({ success: false, message: `Cannot cancel an order that is already ${order.status}.` });

    order.status = 'Cancelled';
    order.statusHistory.push({ status: 'Cancelled', note: req.body.note || 'Cancelled by admin' });
    await order.save();

    if (order.pricing?.pointsRedeemed > 0 && !order.pointsRefunded) {
      const customer = await User.findById(order.customer);
      if (customer) await refundOrderPoints(customer, order, 'Order cancelled');
    }

    res.json({ success: true, message: 'Order cancelled.', order });
  } catch (err) {
    next(err);
  }
};
