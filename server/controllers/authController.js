const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { validateRegister, validateLogin, validateProfileUpdate } = require('../middleware/validate');

// Generate signed JWT
const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });

// Send token in response body (frontend stores in localStorage)
const sendToken = (user, statusCode, res) => {
  const token = signToken(user._id);
  user.password = undefined;

  res.status(statusCode).json({
    success: true,
    token,
    user: {
      _id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      dateOfBirth: user.dateOfBirth,
      allergies: user.allergies || [],
      ageGroup: user.ageGroup,
      rewardPoints: user.rewardPoints || 0,
      healthyOrderStreak: user.healthyOrderStreak || 0,
    },
  });
};

// POST /api/auth/register
exports.register = async (req, res, next) => {
  try {
    const { isValid, errors } = validateRegister(req.body);
    if (!isValid) return res.status(400).json({ success: false, errors });

    const { name, email, password, phone, dateOfBirth, allergies } = req.body;

    const existing = await User.findOne({ email });
    if (existing)
      return res.status(409).json({ success: false, message: 'Email already registered.' });

    const user = await User.create({
      name,
      email,
      password,
      phone,
      dateOfBirth: new Date(dateOfBirth),
      allergies: Array.isArray(allergies) ? allergies.map(a => String(a).toLowerCase().trim()) : [],
    });
    sendToken(user, 201, res);
  } catch (err) {
    next(err);
  }
};

// POST /api/auth/login
exports.login = async (req, res, next) => {
  try {
    const { isValid, errors } = validateLogin(req.body);
    if (!isValid) return res.status(400).json({ success: false, errors });

    const { email, password } = req.body;
    const user = await User.findOne({ email }).select('+password');

    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    if (!user.isActive)
      return res.status(403).json({ success: false, message: 'Account deactivated.' });

    sendToken(user, 200, res);
  } catch (err) {
    next(err);
  }
};

// GET /api/auth/me
exports.getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    res.json({ success: true, user });
  } catch (err) {
    next(err);
  }
};

// PUT /api/auth/me
exports.updateMe = async (req, res, next) => {
  try {
    const { isValid, errors } = validateProfileUpdate(req.body);
    if (!isValid) return res.status(400).json({ success: false, errors });

    const { name, phone, dateOfBirth, allergies } = req.body;

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

    if (name !== undefined) user.name = name.trim();
    if (phone !== undefined) user.phone = phone ? phone.trim() : undefined;
    if (dateOfBirth !== undefined) user.dateOfBirth = dateOfBirth ? new Date(dateOfBirth) : undefined;
    if (allergies !== undefined) {
      user.allergies = Array.isArray(allergies)
        ? allergies.map((a) => String(a).toLowerCase().trim())
        : [];
    }

    await user.save();
    res.json({ success: true, user });
  } catch (err) {
    next(err);
  }
};

// POST /api/auth/logout  (client-side token discard; server-side stub)
exports.logout = (req, res) => {
  res.json({ success: true, message: 'Logged out successfully.' });
};
