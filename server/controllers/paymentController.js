const Payment = require('../models/Payment');
const Order = require('../models/Order');
const User = require('../models/User');
const { validatePayment } = require('../middleware/validate');
const { awardOrderPoints, refundOrderPoints } = require('../services/rewardService');

/**
 * Mock payment gateway — simulates a real gateway flow.
 * In production replace this with Razorpay / Stripe SDK calls.
 */
const mockGateway = async (method, amount, forceFail = false) => {
  // Simulate gateway failure if forced (e.g. testing) or randomly (5%)
  const success = forceFail ? false : Math.random() > 0.05;
  return {
    success,
    transactionId: `TXN-${Date.now()}-${Math.floor(Math.random() * 90000 + 10000)}`,
    gatewayResponse: {
      method,
      amount,
      currency: 'INR',
      status: success ? 'captured' : 'failed',
      timestamp: new Date().toISOString(),
    },
  };
};

// POST /api/payments  — authenticated customer
exports.initiatePayment = async (req, res, next) => {
  try {
    const { isValid, errors } = validatePayment(req.body);
    if (!isValid) return res.status(400).json({ success: false, errors });

    const { orderId, method } = req.body;

    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found.' });

    // Only the order's customer can pay
    if (order.customer.toString() !== req.user._id.toString())
      return res.status(403).json({ success: false, message: 'Not authorised to pay for this order.' });

    // Prevent duplicate payment
    if (order.payment)
      return res.status(400).json({ success: false, message: 'This order has already been paid.' });

    // For cash payments skip gateway call
    let gatewayResult = { success: true, transactionId: `CASH-${Date.now()}`, gatewayResponse: { method: 'cash' } };
    if (method !== 'cash') {
      const forceFail = Boolean(req.body.simulateFailure || req.headers['x-simulate-failure']);
      gatewayResult = await mockGateway(method, order.pricing.total, forceFail);
    }

    const status = gatewayResult.success ? 'success' : 'failed';

    const payment = await Payment.create({
      order: order._id,
      customer: req.user._id,
      amount: order.pricing.total,
      method,
      status,
      transactionId: gatewayResult.transactionId,
      gatewayResponse: gatewayResult.gatewayResponse,
    });

    // Link payment to order
    order.payment = payment._id;
    await order.save();

    if (!gatewayResult.success) {
      // Payment failed — refund redeemed points if any were applied
      let pointsRefunded = 0;
      if (order.pricing?.pointsRedeemed > 0 && !order.pointsRefunded) {
        const user = await User.findById(order.customer);
        pointsRefunded = await refundOrderPoints(user, order, 'Payment failed');
      }

      return res.status(402).json({
        success: false,
        message: 'Payment failed. Please try again.',
        pointsRefunded,
        payment: { _id: payment._id, status: payment.status },
      });
    }

    // Payment succeeded — award reward points & streak progression
    const user = await User.findById(order.customer);
    const pointsEarned = await awardOrderPoints(user, order);

    res.status(201).json({
      success: true,
      message: 'Payment successful.',
      payment,
      pointsEarned,
      receipt: {
        orderNumber: order.orderNumber,
        amount: payment.amount,
        method: payment.method,
        transactionId: payment.transactionId,
        paidAt: payment.paidAt,
        pointsEarned,
        pointsRedeemed: order.pricing?.pointsRedeemed || 0,
      },
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/payments/:id  — customer (own) or admin
exports.getPayment = async (req, res, next) => {
  try {
    const payment = await Payment.findById(req.params.id)
      .populate('order', 'orderNumber items pricing orderType status')
      .populate('customer', 'name email');

    if (!payment) return res.status(404).json({ success: false, message: 'Payment not found.' });

    if (req.user.role !== 'admin' && payment.customer._id.toString() !== req.user._id.toString())
      return res.status(403).json({ success: false, message: 'Not authorised.' });

    res.json({ success: true, payment });
  } catch (err) {
    next(err);
  }
};

// GET /api/payments/order/:orderId
exports.getPaymentByOrder = async (req, res, next) => {
  try {
    const payment = await Payment.findOne({ order: req.params.orderId });
    if (!payment) return res.status(404).json({ success: false, message: 'No payment found for this order.' });

    if (req.user.role !== 'admin' && payment.customer.toString() !== req.user._id.toString())
      return res.status(403).json({ success: false, message: 'Not authorised.' });

    res.json({ success: true, payment });
  } catch (err) {
    next(err);
  }
};
