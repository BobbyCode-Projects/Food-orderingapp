const express = require('express');
const router = express.Router();
const {
  createOrder,
  getOrders,
  getOrderById,
  trackOrder,
  updateOrderStatus,
  cancelOrder,
} = require('../controllers/orderController');
const { protect, adminOnly } = require('../middleware/auth');

// Public tracking by order number (no auth needed)
router.get('/track/:orderNumber', trackOrder);

// Authenticated routes
router.post('/', protect, createOrder);
router.get('/', protect, getOrders);
router.get('/:id', protect, getOrderById);

// Admin-only
router.patch('/:id/status', protect, adminOnly, updateOrderStatus);
router.patch('/:id/cancel', protect, adminOnly, cancelOrder);

module.exports = router;
