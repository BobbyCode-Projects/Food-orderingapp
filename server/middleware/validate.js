/**
 * Lightweight input validation helpers used by controllers.
 * Returns { isValid, errors } — no third-party library required.
 */
const { CATEGORIES, ALLERGENS } = require('../config/constants');

const validateRegister = (data) => {
  const errors = [];
  const { name, email, password, phone, dateOfBirth, allergies } = data;

  if (!name || name.trim().length < 2)
    errors.push('Name must be at least 2 characters.');

  if (!email || !/^\S+@\S+\.\S+$/.test(email))
    errors.push('Please provide a valid email address.');

  if (!password || password.length < 6)
    errors.push('Password must be at least 6 characters.');

  if (phone && !/^[0-9]{10}$/.test(phone))
    errors.push('Phone must be a 10-digit number.');

  if (!dateOfBirth) {
    errors.push('Date of birth is required.');
  } else {
    const dob = new Date(dateOfBirth);
    if (isNaN(dob.getTime())) {
      errors.push('Please provide a valid date of birth.');
    } else {
      const today = new Date();
      if (dob > today) {
        errors.push('Date of birth cannot be in the future.');
      } else {
        let age = today.getFullYear() - dob.getFullYear();
        const m = today.getMonth() - dob.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) {
          age--;
        }
        if (age < 3 || age > 100) {
          errors.push('Age must be between 3 and 100 years.');
        }
      }
    }
  }

  if (allergies !== undefined && allergies !== null) {
    if (!Array.isArray(allergies)) {
      errors.push('Allergies must be an array.');
    } else {
      for (const a of allergies) {
        if (!ALLERGENS.includes(String(a).toLowerCase())) {
          errors.push(`Invalid allergen "${a}". Allowed: ${ALLERGENS.join(', ')}.`);
        }
      }
    }
  }

  return { isValid: errors.length === 0, errors };
};

const validateProfileUpdate = (data) => {
  const errors = [];
  const { name, phone, dateOfBirth, allergies } = data;

  if (name !== undefined) {
    if (!name || name.trim().length < 2) errors.push('Name must be at least 2 characters.');
  }

  if (phone !== undefined && phone !== null && phone !== '') {
    if (!/^[0-9]{10}$/.test(phone)) errors.push('Phone must be a 10-digit number.');
  }

  if (dateOfBirth !== undefined && dateOfBirth !== null && dateOfBirth !== '') {
    const dob = new Date(dateOfBirth);
    if (isNaN(dob.getTime())) {
      errors.push('Please provide a valid date of birth.');
    } else {
      const today = new Date();
      if (dob > today) {
        errors.push('Date of birth cannot be in the future.');
      } else {
        let age = today.getFullYear() - dob.getFullYear();
        const m = today.getMonth() - dob.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) {
          age--;
        }
        if (age < 3 || age > 100) {
          errors.push('Age must be between 3 and 100 years.');
        }
      }
    }
  }

  if (allergies !== undefined && allergies !== null) {
    if (!Array.isArray(allergies)) {
      errors.push('Allergies must be an array.');
    } else {
      for (const a of allergies) {
        if (!ALLERGENS.includes(String(a).toLowerCase())) {
          errors.push(`Invalid allergen "${a}". Allowed: ${ALLERGENS.join(', ')}.`);
        }
      }
    }
  }

  return { isValid: errors.length === 0, errors };
};

const validateLogin = (data) => {
  const errors = [];
  const { email, password } = data;

  if (!email || !/^\S+@\S+\.\S+$/.test(email))
    errors.push('Please provide a valid email address.');

  if (!password) errors.push('Password is required.');

  return { isValid: errors.length === 0, errors };
};

const validateOrder = (data) => {
  const errors = [];
  const { items, orderType, customerName } = data;

  if (!customerName || customerName.trim().length < 2)
    errors.push('Customer name is required.');

  if (!['dine-in', 'pickup'].includes(orderType))
    errors.push('Order type must be dine-in or pickup.');

  if (!Array.isArray(items) || items.length === 0)
    errors.push('Order must contain at least one item.');

  (items || []).forEach((item, i) => {
    if (!item.menuItem) errors.push(`Item ${i + 1}: menuItem ID is required.`);
    if (!item.quantity || item.quantity < 1)
      errors.push(`Item ${i + 1}: quantity must be at least 1.`);
  });

  if (data.redeemPoints !== undefined && data.redeemPoints !== null && data.redeemPoints !== '') {
    const pts = Number(data.redeemPoints);
    if (isNaN(pts) || pts < 0) {
      errors.push('redeemPoints must be a non-negative number.');
    }
  }

  return { isValid: errors.length === 0, errors };
};

const validateMenuItem = (data, isUpdate = false) => {
  const errors = [];
  const { name, category, price, nutrition, allergens, ingredients, healthTags, healthyOverride } = data;

  if (!isUpdate || name !== undefined) {
    if (!name || name.trim().length < 2)
      errors.push('Item name must be at least 2 characters.');
  }

  if (!isUpdate || category !== undefined) {
    if (!category || !CATEGORIES.includes(category))
      errors.push(`Category must be one of: ${CATEGORIES.join(', ')}.`);
  }

  if (!isUpdate || price !== undefined) {
    if (price === undefined || price === null || isNaN(Number(price)) || Number(price) < 0)
      errors.push('Price must be a non-negative number.');
  }

  if (nutrition !== undefined && nutrition !== null) {
    if (typeof nutrition !== 'object' || Array.isArray(nutrition)) {
      errors.push('Nutrition must be an object.');
    } else {
      const numericFields = [
        { field: 'calories', label: 'Calories' },
        { field: 'protein', label: 'Protein' },
        { field: 'carbs', label: 'Carbs' },
        { field: 'sugar', label: 'Sugar' },
        { field: 'fat', label: 'Fat' },
        { field: 'saturatedFat', label: 'Saturated fat' },
        { field: 'fiber', label: 'Fiber' },
        { field: 'sodium', label: 'Sodium' },
      ];

      for (const { field, label } of numericFields) {
        if (nutrition[field] !== undefined && nutrition[field] !== null && nutrition[field] !== '') {
          const val = Number(nutrition[field]);
          if (isNaN(val) || val < 0) {
            errors.push(`${label} must be a non-negative number.`);
          }
        }
      }

      if (nutrition.servingSize !== undefined && nutrition.servingSize !== null) {
        if (typeof nutrition.servingSize !== 'string') {
          errors.push('Serving size must be a string.');
        }
      }
    }
  }

  if (allergens !== undefined && allergens !== null) {
    if (!Array.isArray(allergens)) {
      errors.push('Allergens must be an array.');
    } else {
      for (const allergen of allergens) {
        if (typeof allergen !== 'string' || !ALLERGENS.includes(allergen.toLowerCase())) {
          errors.push(`Invalid allergen "${allergen}". Allowed allergens: ${ALLERGENS.join(', ')}.`);
        }
      }
    }
  }

  if (ingredients !== undefined && ingredients !== null) {
    if (!Array.isArray(ingredients)) {
      errors.push('Ingredients must be an array.');
    }
  }

  if (healthTags !== undefined && healthTags !== null) {
    if (!Array.isArray(healthTags)) {
      errors.push('Health tags must be an array.');
    }
  }

  if (healthyOverride !== undefined && healthyOverride !== null) {
    if (typeof healthyOverride !== 'boolean') {
      errors.push('healthyOverride must be a boolean or null.');
    }
  }

  return { isValid: errors.length === 0, errors };
};

const validatePayment = (data) => {
  const errors = [];
  const { orderId, method } = data;
  const METHODS = ['card', 'upi', 'cash'];

  if (!orderId) errors.push('Order ID is required.');
  if (!method || !METHODS.includes(method))
    errors.push(`Payment method must be one of: ${METHODS.join(', ')}.`);

  return { isValid: errors.length === 0, errors };
};

module.exports = {
  validateRegister,
  validateLogin,
  validateProfileUpdate,
  validateOrder,
  validateMenuItem,
  validatePayment,
};
