const Order = require('../models/Order');
const MenuItem = require('../models/MenuItem');
const User = require('../models/User');
const Payment = require('../models/Payment');

// GET /api/admin/dashboard  — summary stats
exports.getDashboard = async (req, res, next) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      totalOrders,
      todayOrders,
      activeOrders,
      totalRevenue,
      todayRevenue,
      totalMenuItems,
      availableMenuItems,
      totalCustomers,
      recentOrders,
      ordersByStatus,
    ] = await Promise.all([
      Order.countDocuments(),
      Order.countDocuments({ createdAt: { $gte: today } }),
      Order.countDocuments({ status: { $in: ['Received', 'Preparing', 'Ready'] } }),

      Payment.aggregate([
        { $match: { status: 'success' } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      Payment.aggregate([
        { $match: { status: 'success', createdAt: { $gte: today } } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),

      MenuItem.countDocuments(),
      MenuItem.countDocuments({ isAvailable: true }),
      User.countDocuments({ role: 'customer' }),

      Order.find()
        .populate('customer', 'name email')
        .sort({ createdAt: -1 })
        .limit(10),

      Order.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
    ]);

    // Revenue by day for the past 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const revenueByDay = await Payment.aggregate([
      { $match: { status: 'success', createdAt: { $gte: sevenDaysAgo } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          revenue: { $sum: '$amount' },
          orders: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // Top-selling items
    const topItems = await Order.aggregate([
      { $match: { status: { $ne: 'Cancelled' } } },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.menuItem',
          name: { $first: '$items.name' },
          totalQty: { $sum: '$items.quantity' },
          totalRevenue: { $sum: '$items.subtotal' },
        },
      },
      { $sort: { totalQty: -1 } },
      { $limit: 5 },
    ]);

    res.json({
      success: true,
      stats: {
        totalOrders,
        todayOrders,
        activeOrders,
        totalRevenue: totalRevenue[0]?.total || 0,
        todayRevenue: todayRevenue[0]?.total || 0,
        totalMenuItems,
        availableMenuItems,
        totalCustomers,
      },
      recentOrders,
      ordersByStatus,
      revenueByDay,
      topItems,
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/admin/orders  — all orders with filters
exports.getAllOrders = async (req, res, next) => {
  try {
    const { status, date, page = 1, limit = 25 } = req.query;
    const filter = {};

    if (status) filter.status = status;
    if (date) {
      const start = new Date(date);
      start.setHours(0, 0, 0, 0);
      const end = new Date(date);
      end.setHours(23, 59, 59, 999);
      filter.createdAt = { $gte: start, $lte: end };
    }

    const total = await Order.countDocuments(filter);
    const orders = await Order.find(filter)
      .populate('customer', 'name email phone')
      .populate('payment', 'status method amount transactionId')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    res.json({ success: true, total, page: Number(page), pages: Math.ceil(total / limit), orders });
  } catch (err) {
    next(err);
  }
};

// GET /api/admin/users
exports.getAllUsers = async (req, res, next) => {
  try {
    const users = await User.find({ role: 'customer' }).sort({ createdAt: -1 });
    res.json({ success: true, count: users.length, users });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/admin/users/:id/toggle  — activate / deactivate
exports.toggleUser = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
    if (user.role === 'admin')
      return res.status(400).json({ success: false, message: 'Cannot deactivate admin accounts here.' });

    user.isActive = !user.isActive;
    await user.save();
    res.json({ success: true, user });
  } catch (err) {
    next(err);
  }
};

// GET /api/admin/analytics/sales
exports.getSalesAnalytics = async (req, res, next) => {
  try {
    const { from, to } = req.query;
    const match = { status: 'success' };

    if (from || to) {
      match.createdAt = {};
      if (from) match.createdAt.$gte = new Date(from);
      if (to) match.createdAt.$lte = new Date(to);
    }

    const salesByDay = await Payment.aggregate([
      { $match: match },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          revenue: { $sum: '$amount' },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const salesByMethod = await Payment.aggregate([
      { $match: match },
      { $group: { _id: '$method', revenue: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]);

    res.json({ success: true, salesByDay, salesByMethod });
  } catch (err) {
    next(err);
  }
};
