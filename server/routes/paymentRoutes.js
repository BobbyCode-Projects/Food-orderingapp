const express = require('express');
const router = express.Router();
const {
  initiatePayment,
  getPayment,
  getPaymentByOrder,
} = require('../controllers/paymentController');
const { protect } = require('../middleware/auth');

router.post('/', protect, initiatePayment);
router.get('/order/:orderId', protect, getPaymentByOrder);
router.get('/:id', protect, getPayment);

module.exports = router;
