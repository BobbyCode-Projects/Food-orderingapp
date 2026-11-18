const express = require('express');
const router = express.Router();
const {
  getDashboard,
  getAllOrders,
  getAllUsers,
  toggleUser,
  getSalesAnalytics,
} = require('../controllers/adminController');
const { protect, adminOnly } = require('../middleware/auth');

// All admin routes require auth + admin role
router.use(protect, adminOnly);

router.get('/dashboard', getDashboard);
router.get('/orders', getAllOrders);
router.get('/users', getAllUsers);
router.patch('/users/:id/toggle', toggleUser);
router.get('/analytics/sales', getSalesAnalytics);

module.exports = router;
