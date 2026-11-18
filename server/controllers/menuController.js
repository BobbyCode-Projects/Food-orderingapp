const MenuItem = require('../models/MenuItem');
const User = require('../models/User');
const { validateMenuItem } = require('../middleware/validate');
const { CATEGORIES } = require('../config/constants');

// ── Helper to build concise, dish-specific recommendation reasons ────────
function buildRecommendationReason(item, ageGroup, usedTemplates, lastTemplate) {
  const n = item.nutrition || {};
  const cal = Number(n.calories) || 0;
  const pro = Number(n.protein) || 0;
  const sug = Number(n.sugar) || 0;
  const fat = Number(n.fat) || 0;
  const fib = Number(n.fiber) || 0;
  const sod = Number(n.sodium) || 0;
  const tags = (item.healthTags || []).map((t) => String(t).toLowerCase());

  const candidates = [];

  switch (ageGroup) {
    case 'child':
      if (tags.includes('calcium-rich')) {
        candidates.push({ type: 'calcium', text: 'Calcium-rich, supports growing bones' });
      }
      if (sug <= 4 && cal > 0 && cal <= 280) {
        candidates.push({ type: 'sugar_cal', text: `Low in sugar (${sug}g) and only ${cal} kcal` });
      }
      if (pro >= 7) {
        candidates.push({ type: 'protein', text: `Wholesome protein (${pro}g) for growing kids` });
      }
      if (fib >= 4) {
        candidates.push({ type: 'fiber', text: `High in fiber (${fib}g) for steady energy` });
      }
      if (tags.includes('millet-based')) {
        candidates.push({ type: 'millet', text: 'Gentle millet grain, easy on young tummies' });
      }
      if (tags.includes('raw-superfood') || tags.includes('natural-vitamins')) {
        candidates.push({ type: 'vitamins', text: 'Fresh natural vitamins for growing children' });
      }
      if (sod > 0 && sod <= 250) {
        candidates.push({ type: 'sodium', text: `Low sodium (${sod}mg), mild and wholesome` });
      }
      if (fat <= 4 && cal <= 240) {
        candidates.push({ type: 'fat', text: `Light and low in fat (${fat}g) for active kids` });
      }
      candidates.push({ type: 'category', text: `Mild, wholesome ${item.category.toLowerCase()} for children` });
      break;

    case 'teen':
      if (pro >= 12) {
        candidates.push({ type: 'protein', text: `High in protein (${pro}g) for active teens` });
      }
      if (fib >= 5) {
        candidates.push({ type: 'fiber', text: `High in fiber (${fib}g), good for steady energy` });
      }
      if (tags.includes('millet-based')) {
        candidates.push({ type: 'millet', text: 'Complex millet carbs for sports stamina' });
      }
      if (pro >= 8 && pro < 12) {
        candidates.push({ type: 'protein_alt', text: `Good protein (${pro}g) to power your busy day` });
      }
      if (cal >= 280 && cal <= 550) {
        candidates.push({ type: 'calories', text: `Balanced ${cal} kcal fuel for study & sports` });
      }
      if (fat <= 8 && sug <= 5) {
        candidates.push({ type: 'sugar_fat', text: `Low sugar (${sug}g) and clean sustained fuel` });
      }
      candidates.push({ type: 'category', text: `Energizing ${item.category.toLowerCase()} dish for teens` });
      break;

    case 'senior':
      if (sod > 0 && sod <= 200) {
        candidates.push({ type: 'sodium', text: `Low sodium (${sod}mg), easy on the heart` });
      }
      if (tags.includes('calcium-rich')) {
        candidates.push({ type: 'calcium', text: 'Calcium-rich, supports bone and joint health' });
      }
      if (fat <= 4 && cal <= 250) {
        candidates.push({ type: 'fat', text: `Very low fat (${fat}g) and light on digestion` });
      }
      if (fib >= 5) {
        candidates.push({ type: 'fiber', text: `Rich in fiber (${fib}g) for smooth digestion` });
      }
      if (tags.includes('millet-based')) {
        candidates.push({ type: 'millet', text: 'Millet whole grains, soothing and easy to digest' });
      }
      if (tags.includes('probiotic')) {
        candidates.push({ type: 'probiotic', text: 'Natural probiotic, aids senior gut health' });
      }
      if (sod > 200 && sod <= 350) {
        candidates.push({ type: 'sodium_alt', text: `Controlled sodium (${sod}mg), heart-friendly` });
      }
      candidates.push({ type: 'category', text: `Gentle, easy-to-digest ${item.category.toLowerCase()} meal` });
      break;

    case 'adult':
    default:
      if (fib >= 5) {
        candidates.push({ type: 'fiber', text: `High in fiber (${fib}g), good for steady energy` });
      }
      if (sug <= 4 && cal > 0 && cal <= 300) {
        candidates.push({ type: 'sugar_cal', text: `Low in sugar (${sug}g) and only ${cal} kcal` });
      }
      if (pro >= 12) {
        candidates.push({ type: 'protein', text: `High in protein (${pro}g) for sustained satiety` });
      }
      if (sod > 0 && sod <= 250) {
        candidates.push({ type: 'sodium', text: `Low sodium (${sod}mg), easy on the heart` });
      }
      if (tags.includes('millet-based')) {
        candidates.push({ type: 'millet', text: 'Millet whole grain for steady energy release' });
      }
      if (item.isHealthy && fat <= 5) {
        candidates.push({ type: 'fat', text: `Healthy choice with only ${fat}g total fat` });
      }
      if (tags.includes('calcium-rich')) {
        candidates.push({ type: 'calcium', text: 'Calcium-rich, supports active bone health' });
      }
      candidates.push({ type: 'category', text: `Balanced and wholesome ${item.category.toLowerCase()} choice` });
      break;
  }

  // Pick candidate that differs from previous item and hasn't been overused
  let best = candidates.find((c) => c.type !== lastTemplate && !usedTemplates.has(c.type));
  if (!best) {
    best = candidates.find((c) => c.type !== lastTemplate);
  }
  if (!best) {
    best = candidates[0];
  }

  usedTemplates.add(best.type);
  return best;
}

// GET /api/menu/recommendations — customer auth
exports.getRecommendations = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

    const ageGroup = user.ageGroup || 'adult';
    const userAllergies = Array.isArray(user.allergies)
      ? user.allergies.map((a) => String(a).toLowerCase().trim())
      : [];

    // Fetch all available menu items
    const allAvailable = await MenuItem.find({ isAvailable: true });

    // Filter out items that contain ANY allergen declared by the customer
    const safeItems = allAvailable.filter((item) => {
      if (userAllergies.length > 0 && Array.isArray(item.allergens)) {
        const hasAllergenConflict = item.allergens.some((a) =>
          userAllergies.includes(String(a).toLowerCase())
        );
        if (hasAllergenConflict) return false;
      }
      return true;
    });

    // Score items according to user's age group requirements
    const scored = safeItems.map((item) => {
      const n = item.nutrition || {};
      const cal = Number(n.calories) || 0;
      const pro = Number(n.protein) || 0;
      const sug = Number(n.sugar) || 0;
      const fat = Number(n.fat) || 0;
      const satFat = Number(n.saturatedFat) || 0;
      const fib = Number(n.fiber) || 0;
      const sod = Number(n.sodium) || 0;
      const tags = (item.healthTags || []).map((t) => String(t).toLowerCase());

      let score = 10;

      switch (ageGroup) {
        case 'child':
          // Child: mild items, milk and fruit based, avoid high sugar and high sodium
          if (tags.some((t) => ['calcium-rich', 'raw-superfood', 'natural-vitamins'].includes(t)) ||
              /fruit|bowl|milk|idli|poha|buttermilk/i.test(item.name + ' ' + (item.description || ''))) {
            score += 20;
          }
          if (['Breakfast', 'Healthy Indian'].includes(item.category)) score += 10;
          if (item.isHealthy) score += 10;
          if (sug > 15) score -= 30; // avoid high sugar
          if (sod > 450) score -= 25; // avoid high sodium
          if (satFat > 4) score -= 15;
          if (/spicy|chilli|chai|coffee/i.test(item.name)) score -= 25; // avoid stimulants/spicy
          break;

        case 'teen':
          // Teen: high-protein and energy, balanced meals
          if (pro >= 12) score += 25;
          else if (pro >= 8) score += 15;
          if (tags.includes('high-protein')) score += 18;
          if (cal >= 280 && cal <= 650) score += 15;
          if (tags.includes('energy') || tags.includes('balanced') || tags.includes('traditional')) score += 10;
          if (fib >= 4) score += 8;
          break;

        case 'senior':
          // Senior: low-sodium, low-fat, high-fiber, calcium-rich, easy to digest
          if (sod <= 200) score += 25;
          else if (sod <= 380) score += 15;
          if (fat <= 5) score += 20;
          else if (fat <= 8) score += 10;
          if (fib >= 5) score += 18;
          else if (fib >= 3) score += 10;
          if (tags.some((t) => ['calcium-rich', 'millet-based', 'high-fiber', 'traditional'].includes(t))) score += 15;
          if (sod > 450) score -= 35; // strict low sodium
          if (fat > 12) score -= 25;  // avoid high fat
          if (satFat > 3) score -= 25;
          break;

        case 'adult':
        default:
          // Adult: balanced, high-fiber, low-sugar, isHealthy items
          if (item.isHealthy) score += 25;
          if (fib >= 5) score += 18;
          else if (fib >= 3) score += 10;
          if (sug <= 6) score += 15;
          else if (sug <= 10) score += 8;
          if (tags.some((t) => ['high-fiber', 'low-sugar', 'balanced', 'traditional'].includes(t))) score += 12;
          if (sug > 15) score -= 20;
          if (satFat > 5) score -= 20;
          break;
      }

      return {
        item,
        score,
      };
    });

    // Sort descending by score and pick top 8
    scored.sort((a, b) => b.score - a.score);
    const topScored = scored.slice(0, 8);

    // Build unique, data-driven reasons ensuring neighbouring items show distinct, data-driven reasons
    const usedTemplates = new Set();
    let lastTemplate = null;
    const top8 = topScored.map((entry) => {
      const best = buildRecommendationReason(entry.item, ageGroup, usedTemplates, lastTemplate);
      lastTemplate = best.type;
      return {
        ...entry.item.toObject(),
        reason: best.text,
        score: entry.score,
      };
    });

    res.json({
      success: true,
      ageGroup,
      count: top8.length,
      recommendations: top8,
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/menu  — public
exports.getMenu = async (req, res, next) => {
  try {
    const { category, available, search, veg } = req.query;
    const filter = {};

    if (category && CATEGORIES.includes(category)) filter.category = category;
    if (available !== undefined) filter.isAvailable = available === 'true';
    if (veg !== undefined) filter.isVeg = veg === 'true';
    if (search) filter.$text = { $search: search };

    const items = await MenuItem.find(filter).sort({ category: 1, name: 1 });
    res.json({ success: true, count: items.length, items });
  } catch (err) {
    next(err);
  }
};

// GET /api/menu/:id  — public
exports.getMenuItemById = async (req, res, next) => {
  try {
    const item = await MenuItem.findById(req.params.id);
    if (!item) return res.status(404).json({ success: false, message: 'Menu item not found.' });
    res.json({ success: true, item });
  } catch (err) {
    next(err);
  }
};

// GET /api/menu/categories  — public
exports.getCategories = async (req, res) => {
  res.json({ success: true, categories: CATEGORIES });
};

// POST /api/menu  — admin only
exports.createMenuItem = async (req, res, next) => {
  try {
    const { isValid, errors } = validateMenuItem(req.body, false);
    if (!isValid) return res.status(400).json({ success: false, errors });

    const item = await MenuItem.create(req.body);
    res.status(201).json({ success: true, item });
  } catch (err) {
    next(err);
  }
};

// PUT /api/menu/:id  — admin only
exports.updateMenuItem = async (req, res, next) => {
  try {
    const { isValid, errors } = validateMenuItem(req.body, true);
    if (!isValid) return res.status(400).json({ success: false, errors });

    const item = await MenuItem.findById(req.params.id);
    if (!item) return res.status(404).json({ success: false, message: 'Menu item not found.' });

    Object.assign(item, req.body);
    await item.save();
    res.json({ success: true, item });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/menu/:id  — admin only
exports.deleteMenuItem = async (req, res, next) => {
  try {
    const item = await MenuItem.findByIdAndDelete(req.params.id);
    if (!item) return res.status(404).json({ success: false, message: 'Menu item not found.' });
    res.json({ success: true, message: 'Menu item deleted.' });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/menu/:id/toggle  — admin only (toggle availability)
exports.toggleAvailability = async (req, res, next) => {
  try {
    const item = await MenuItem.findById(req.params.id);
    if (!item) return res.status(404).json({ success: false, message: 'Menu item not found.' });

    item.isAvailable = !item.isAvailable;
    await item.save();
    res.json({ success: true, item });
  } catch (err) {
    next(err);
  }
};
