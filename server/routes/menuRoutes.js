const express = require('express');
const router = express.Router();
const {
  getMenu,
  getMenuItemById,
  getCategories,
  getRecommendations,
  createMenuItem,
  updateMenuItem,
  deleteMenuItem,
  toggleAvailability,
} = require('../controllers/menuController');
const { protect, adminOnly } = require('../middleware/auth');

// Recommendations (must be mounted before /:id)
router.get('/recommendations', protect, getRecommendations);

// Public routes
router.get('/', getMenu);
router.get('/categories', getCategories);
router.get('/:id', getMenuItemById);

// Admin-only routes
router.post('/', protect, adminOnly, createMenuItem);
router.put('/:id', protect, adminOnly, updateMenuItem);
router.delete('/:id', protect, adminOnly, deleteMenuItem);
router.patch('/:id/toggle', protect, adminOnly, toggleAvailability);

module.exports = router;
