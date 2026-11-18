const express = require('express');
const router = express.Router();
const { getRewards, previewOrderRewards } = require('../controllers/rewardController');
const { protect } = require('../middleware/auth');

// All reward endpoints require customer authentication
router.use(protect);

router.get('/', getRewards);
router.post('/preview', previewOrderRewards);

module.exports = router;
