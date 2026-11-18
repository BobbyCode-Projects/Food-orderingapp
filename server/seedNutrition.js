/**
 * seedNutrition.js — Update nutrition information for existing dishes by matching name.
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { seedNutritionOnly } = require('./seed');

seedNutritionOnly(false)
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Nutrition update failed:', err.message);
    process.exit(1);
  });
