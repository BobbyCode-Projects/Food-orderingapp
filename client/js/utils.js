/* ═══════════════════════════════════════════════════════
   utils.js — Shared utilities used by all pages
   ═══════════════════════════════════════════════════════ */

const API_BASE = '/api';

/* ── Smart Client Mock Backend (for Static / Netlify Deployments) ── */
const MockBackend = (() => {
  const USERS_KEY  = 'cafeorder_users_db';
  const ORDERS_KEY = 'cafeorder_orders_db';
  let cachedMenu   = null;

  const getStoredUsers = () => {
    try {
      const data = localStorage.getItem(USERS_KEY);
      return data ? JSON.parse(data) : [];
    } catch { return []; }
  };

  const saveStoredUsers = (users) => {
    try { localStorage.setItem(USERS_KEY, JSON.stringify(users)); } catch {}
  };

  const getStoredOrders = () => {
    try {
      const data = localStorage.getItem(ORDERS_KEY);
      return data ? JSON.parse(data) : [];
    } catch { return []; }
  };

  const saveStoredOrders = (orders) => {
    try { localStorage.setItem(ORDERS_KEY, JSON.stringify(orders)); } catch {}
  };

  const computeAgeGroup = (dobStr) => {
    if (!dobStr) return 'adult';
    const dob = new Date(dobStr);
    const now = new Date();
    let age = now.getFullYear() - dob.getFullYear();
    const m = now.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--;
    if (age < 13) return 'child';
    if (age <= 19) return 'teen';
    if (age <= 59) return 'adult';
    return 'senior';
  };

  const loadMenu = async () => {
    if (cachedMenu && cachedMenu.length > 0) return cachedMenu;
    if (window.FALLBACK_MENU_ITEMS && window.FALLBACK_MENU_ITEMS.length > 0) {
      cachedMenu = window.FALLBACK_MENU_ITEMS;
      return cachedMenu;
    }
    try {
      const res = await fetch('/data/menu.json');
      if (res.ok) {
        cachedMenu = await res.json();
        return cachedMenu;
      }
    } catch (_) {}
    return cachedMenu || [];
  };

  const handle = async (method, path, body = null, token = null) => {
    const [cleanPath, queryStr] = path.split('?');
    const q = new URLSearchParams(queryStr || '');

    // ── 1. Register
    if (method === 'POST' && cleanPath === '/auth/register') {
      const users = getStoredUsers();
      const email = (body.email || '').trim().toLowerCase();
      const existing = users.find(u => u.email === email);
      if (existing) {
        throw { status: 400, message: 'An account with this email already exists. Please log in.' };
      }

      const ageGroup = computeAgeGroup(body.dateOfBirth);
      const newUser = {
        _id: 'usr_' + Date.now() + Math.random().toString(36).substring(2, 7),
        name: (body.name || '').trim(),
        email: email,
        phone: (body.phone || '').trim(),
        role: 'customer',
        dateOfBirth: body.dateOfBirth,
        allergies: Array.isArray(body.allergies) ? body.allergies : [],
        ageGroup: ageGroup,
        rewardPoints: 100,
        healthyOrderStreak: 0,
        pointsHistory: [
          {
            type: 'earned',
            points: 100,
            reason: 'Welcome bonus for joining CafeOrder!',
            date: new Date().toISOString()
          }
        ],
        createdAt: new Date().toISOString()
      };

      users.push({ ...newUser, password: body.password });
      saveStoredUsers(users);

      const generatedToken = 'jwt_mock_' + btoa(JSON.stringify({ id: newUser._id, email: newUser.email }));
      return {
        success: true,
        message: 'Account created successfully!',
        token: generatedToken,
        user: newUser
      };
    }

    // ── 2. Login
    if (method === 'POST' && cleanPath === '/auth/login') {
      const email = (body.email || '').trim().toLowerCase();
      const password = body.password || '';

      if (email === 'admin@cafeteria.com') {
        const adminUser = {
          _id: 'admin_1',
          name: 'Cafe Admin',
          email: 'admin@cafeteria.com',
          role: 'admin',
          rewardPoints: 0,
          healthyOrderStreak: 0
        };
        return { success: true, token: 'jwt_mock_admin', user: adminUser };
      }

      const users = getStoredUsers();
      const matched = users.find(u => u.email === email && (!u.password || u.password === password));
      if (matched) {
        const { password: _, ...safeUser } = matched;
        return {
          success: true,
          token: 'jwt_mock_' + btoa(JSON.stringify({ id: safeUser._id, email: safeUser.email })),
          user: safeUser
        };
      }

      if (email === 'customer@example.com') {
        const customerUser = {
          _id: 'cust_sample_1',
          name: 'Sample Customer',
          email: 'customer@example.com',
          role: 'customer',
          dateOfBirth: '1995-05-15',
          ageGroup: 'adult',
          allergies: [],
          rewardPoints: 240,
          healthyOrderStreak: 2
        };
        return { success: true, token: 'jwt_mock_customer', user: customerUser };
      }

      throw { status: 401, message: 'Invalid email or password. Please try again.' };
    }

    // ── 3. Logout
    if (method === 'POST' && cleanPath === '/auth/logout') {
      return { success: true, message: 'Logged out successfully' };
    }

    // ── 4. Profile (Me)
    if (method === 'GET' && cleanPath === '/auth/me') {
      const currentUser = JSON.parse(localStorage.getItem('user') || 'null');
      if (currentUser) return { success: true, user: currentUser };
      throw { status: 401, message: 'Not authenticated' };
    }

    // ── 5. Update Profile
    if (method === 'PUT' && cleanPath === '/auth/me') {
      const currentUser = JSON.parse(localStorage.getItem('user') || 'null');
      if (!currentUser) throw { status: 401, message: 'Not authenticated' };

      if (body.name) currentUser.name = body.name.trim();
      if (body.phone !== undefined) currentUser.phone = body.phone;
      if (body.allergies) currentUser.allergies = body.allergies;
      if (body.dateOfBirth) {
        currentUser.dateOfBirth = body.dateOfBirth;
        currentUser.ageGroup = computeAgeGroup(body.dateOfBirth);
      }

      const users = getStoredUsers();
      const idx = users.findIndex(u => u._id === currentUser._id || u.email === currentUser.email);
      if (idx !== -1) {
        users[idx] = { ...users[idx], ...currentUser };
        saveStoredUsers(users);
      }
      localStorage.setItem('user', JSON.stringify(currentUser));
      return { success: true, user: currentUser };
    }

    // ── 6. Menu Items
    if (method === 'GET' && cleanPath === '/menu') {
      const menu = await loadMenu();
      let filtered = [...menu];
      const category = q.get('category');
      const isVeg = q.get('isVeg');
      const search = q.get('search');

      if (category) filtered = filtered.filter(i => i.category.toLowerCase() === category.toLowerCase());
      if (isVeg !== null && isVeg !== '') filtered = filtered.filter(i => String(i.isVeg) === String(isVeg));
      if (search) {
        const s = search.toLowerCase();
        filtered = filtered.filter(i => i.name.toLowerCase().includes(s) || (i.description && i.description.toLowerCase().includes(s)));
      }

      return { success: true, count: filtered.length, items: filtered, data: filtered };
    }

    // ── 7. Recommendations
    if (method === 'GET' && cleanPath === '/menu/recommendations') {
      const menu = await loadMenu();
      const currentUser = JSON.parse(localStorage.getItem('user') || 'null') || {};
      const ageGroup = currentUser.ageGroup || 'adult';
      const userAllergies = currentUser.allergies || [];

      let candidates = menu.filter(item => {
        const itemAllergens = (item.allergens || []).map(a => a.toLowerCase());
        return !userAllergies.some(ua => itemAllergens.includes(ua.toLowerCase()));
      });

      const scored = candidates.map(item => {
        let score = 0;
        let reason = 'Balanced cafeteria favorite';
        const cal = item.nutrition?.calories || 0;
        const protein = item.nutrition?.protein || 0;
        const sugar = item.nutrition?.sugar || 0;
        const fiber = item.nutrition?.fiber || 0;
        const sodium = item.nutrition?.sodium || 0;
        const satFat = item.nutrition?.saturatedFat || 0;

        if (ageGroup === 'child') {
          if (item.category === 'Healthy Indian') score += 20;
          if (item.healthTags?.includes('calcium-rich')) { score += 25; reason = 'Calcium-rich, supports growing bones'; }
          else if (sugar < 8 && sodium < 400) { score += 15; reason = 'Mild, low sugar & low sodium snack'; }
          else if (item.isHealthy) { score += 10; reason = 'Healthy, kid-friendly option'; }
        } else if (ageGroup === 'teen') {
          if (protein >= 10) { score += 30; reason = `High protein (${protein}g) for active growth`; }
          else if (item.healthTags?.includes('millet-based')) { score += 20; reason = 'Millet superfood energy boost'; }
          else if (cal >= 250 && cal <= 500) { score += 15; reason = 'Nutritious fuel for studying & sports'; }
        } else if (ageGroup === 'senior') {
          if (sodium <= 300) { score += 30; reason = `Low sodium (${sodium}mg), easy on the heart`; }
          else if (fiber >= 4) { score += 20; reason = `High fiber (${fiber}g) for digestive comfort`; }
          else if (satFat <= 2) { score += 15; reason = 'Low saturated fat, light & healthy'; }
        } else {
          if (item.isHealthy) { score += 25; reason = 'Certified healthy choice for a balanced day'; }
          else if (protein >= 8) { score += 20; reason = `Protein-packed (${protein}g) workday energy`; }
          else if (fiber >= 3) { score += 15; reason = 'High fiber meal'; }
        }

        return { item, score, reason };
      });

      scored.sort((a, b) => b.score - a.score);
      const topRecs = scored.slice(0, 8).map(s => ({ ...s.item, reason: s.reason }));

      return {
        success: true,
        ageGroup: ageGroup,
        recommendations: topRecs,
        data: topRecs
      };
    }

    // ── 8. Rewards Balance & Overview
    if (method === 'GET' && (cleanPath === '/rewards' || cleanPath === '/rewards/balance')) {
      const currentUser = JSON.parse(localStorage.getItem('user') || 'null');
      const points = currentUser?.rewardPoints ?? 100;
      const streak = currentUser?.healthyOrderStreak ?? 0;
      const history = currentUser?.pointsHistory || [
        { type: 'earned', points: 100, reason: 'Welcome bonus', date: new Date().toISOString() }
      ];

      return {
        success: true,
        points: points,
        rewardPoints: points,
        healthyOrderStreak: streak,
        history: history,
        pointsValueRupees: Math.floor(points / 2)
      };
    }

    // ── 9. Rewards Preview
    if (method === 'POST' && cleanPath === '/rewards/preview') {
      const subtotal = body?.subtotal || 0;
      const pointsRequested = body?.pointsToRedeem || 0;
      const currentUser = JSON.parse(localStorage.getItem('user') || 'null');
      const userPoints = currentUser?.rewardPoints || 0;

      const redeemable = Math.min(pointsRequested, userPoints);
      const pointsDiscount = Math.floor(redeemable / 2);
      const healthyOfferDiscount = (body?.healthyItemCount >= 2) ? Math.round(subtotal * 0.1) : 0;

      return {
        success: true,
        pointsDiscount,
        healthyOfferDiscount,
        maxRedeemable: userPoints
      };
    }

    // ── 10. Create Order
    if (method === 'POST' && cleanPath === '/orders') {
      const orders = getStoredOrders();
      const currentUser = JSON.parse(localStorage.getItem('user') || 'null') || {};
      const orderNum = 'ORD-' + Math.floor(1000 + Math.random() * 9000);
      const estReadyTime = new Date(Date.now() + 18 * 60000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      const pointsEarned = Math.floor((body.total || 100) * 0.1) + 15;

      const newOrder = {
        _id: 'ord_' + Date.now(),
        orderNumber: orderNum,
        user: currentUser._id,
        items: body.items || [],
        orderType: body.orderType || 'dine-in',
        pricing: {
          subtotal: body.subtotal || 0,
          tax: body.tax || 0,
          pointsDiscount: body.pointsDiscount || 0,
          healthyOfferDiscount: body.healthyOfferDiscount || 0,
          total: body.total || 0
        },
        paymentMethod: body.paymentMethod || 'UPI',
        paymentStatus: 'paid',
        status: 'placed',
        pointsEarned: pointsEarned,
        estimatedTime: estReadyTime,
        pickupNote: 'Please collect from Counter #2 when your order status turns Ready.',
        transactionId: 'TXN_' + Math.random().toString(36).substring(2, 10).toUpperCase(),
        allergyConflicts: body.allergyConflicts || [],
        createdAt: new Date().toISOString()
      };

      orders.unshift(newOrder);
      saveStoredOrders(orders);

      if (currentUser && currentUser._id) {
        currentUser.rewardPoints = (currentUser.rewardPoints || 0) + pointsEarned - (body.pointsRedeemed || 0);
        if (!currentUser.pointsHistory) currentUser.pointsHistory = [];
        currentUser.pointsHistory.unshift({
          type: 'earned',
          points: pointsEarned,
          order: newOrder._id,
          reason: `Earned on order ${orderNum}`,
          date: new Date().toISOString()
        });
        localStorage.setItem('user', JSON.stringify(currentUser));
      }

      return { success: true, order: newOrder, data: newOrder };
    }

    // ── 11. User Orders & Tracking
    if (method === 'GET' && (cleanPath === '/orders' || cleanPath === '/orders/user' || cleanPath.startsWith('/orders/track/'))) {
      const orders = getStoredOrders();
      if (cleanPath.startsWith('/orders/track/')) {
        const num = cleanPath.split('/')[3];
        const ord = orders.find(o => o.orderNumber === num || o._id === num) || orders[0];
        if (ord) return { success: true, order: ord, data: ord };
        throw { status: 404, message: 'Order not found' };
      }
      return { success: true, orders, data: orders };
    }

    // ── 12. Order by ID
    if (method === 'GET' && cleanPath.startsWith('/orders/')) {
      const id = cleanPath.split('/')[2];
      const orders = getStoredOrders();
      const ord = orders.find(o => o._id === id || o.orderNumber === id) || orders[0];
      if (ord) return { success: true, order: ord, data: ord };
      throw { status: 404, message: 'Order not found' };
    }

    // ── 13. Payments
    if (method === 'POST' && cleanPath === '/payments') {
      return {
        success: true,
        message: 'Payment verified and completed successfully.',
        payment: {
          _id: 'pay_' + Date.now(),
          order: body?.orderId,
          method: body?.method || 'UPI',
          amount: body?.amount || 0,
          status: 'completed',
          transactionId: 'TXN_' + Math.random().toString(36).substring(2, 10).toUpperCase(),
          createdAt: new Date().toISOString()
        }
      };
    }

    return { success: true };
  };

  return { handle, computeAgeGroup, loadMenu };
})();

/* ── HTTP helpers with Auto-Fallback ──────────────────────── */
const api = {
  _req: async (method, path, body = null) => {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const opts = { method, headers };
    if (body) opts.body = JSON.stringify(body);

    let res;
    let isJson = false;
    try {
      res = await fetch(`${API_BASE}${path}`, opts);
      const ct = res.headers.get('content-type') || '';
      if (ct.includes('application/json')) {
        const data = await res.json();
        if (!res.ok) throw { status: res.status, ...data };
        return data;
      }
    } catch (err) {
      if (err && err.status && err.message) {
        throw err;
      }
    }

    // Fall back to MockBackend (handles Netlify static environments gracefully)
    return await MockBackend.handle(method, path, body, token);
  },
  get:    (path)        => api._req('GET',    path),
  post:   (path, body)  => api._req('POST',   path, body),
  put:    (path, body)  => api._req('PUT',    path, body),
  patch:  (path, body)  => api._req('PATCH',  path, body),
  delete: (path)        => api._req('DELETE', path),
};

/* ── Toast notifications ──────────────────────────────── */
const Toast = (() => {
  let container;

  const ensure = () => {
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      document.body.appendChild(container);
    }
  };

  const show = (message, type = 'info', duration = 3500) => {
    ensure();
    const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span>${icons[type] || ''}</span><span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('fade-out');
      setTimeout(() => toast.remove(), 300);
    }, duration);
  };

  return {
    success: (msg, d) => show(msg, 'success', d),
    error:   (msg, d) => show(msg, 'error',   d),
    warning: (msg, d) => show(msg, 'warning', d),
    info:    (msg, d) => show(msg, 'info',    d),
  };
})();

/* ── Modal helpers ────────────────────────────────────── */
const Modal = {
  open: (id) => {
    const el = document.getElementById(id);
    if (el) { el.classList.remove('hidden'); document.body.style.overflow = 'hidden'; }
  },
  close: (id) => {
    const el = document.getElementById(id);
    if (el) { el.classList.add('hidden'); document.body.style.overflow = ''; }
  },
  closeAll: () => {
    document.querySelectorAll('.modal-overlay').forEach(m => {
      m.classList.add('hidden');
    });
    document.body.style.overflow = '';
  },
};

// Close modal on overlay click or Escape key
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal-overlay')) Modal.closeAll();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' || e.key === 'Esc') Modal.closeAll();
});

/* ── Format helpers ───────────────────────────────────── */
const fmt = {
  currency: (n) => `₹${Number(n).toFixed(2)}`,
  date: (d) => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
  datetime: (d) => new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
  time: (d) => new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
  relativeTime: (d) => {
    const diff = Date.now() - new Date(d).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1)  return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24)  return `${hrs}h ago`;
    return fmt.date(d);
  },
};

/* ── Status badge HTML ────────────────────────────────── */
const statusBadge = (status) => {
  const map = {
    Received:  'badge-blue',
    Preparing: 'badge-yellow',
    Ready:     'badge-green',
    Completed: 'badge-gray',
    Cancelled: 'badge-red',
    success:   'badge-green',
    failed:    'badge-red',
    pending:   'badge-yellow',
    refunded:  'badge-gray',
  };
  return `<span class="badge ${map[status] || 'badge-gray'}">${status}</span>`;
};

/* ── Veg indicator ────────────────────────────────────── */
const vegDot = (isVeg) =>
  `<span class="veg-dot ${isVeg ? 'veg' : 'nonveg'}" title="${isVeg ? 'Veg' : 'Non-Veg'}"></span>`;

/* ── URL params ───────────────────────────────────────── */
const urlParams = () => Object.fromEntries(new URLSearchParams(window.location.search));

/* ── Debounce ─────────────────────────────────────────── */
const debounce = (fn, ms = 300) => {
  let timer;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
};

/* ── DOM helpers ──────────────────────────────────────── */
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

const setLoading = (btn, loading) => {
  if (!btn) return;
  if (loading) { btn.disabled = true; btn.classList.add('btn-loading'); btn.dataset.origText = btn.textContent; }
  else         { btn.disabled = false; btn.classList.remove('btn-loading'); if (btn.dataset.origText) btn.textContent = btn.dataset.origText; }
};

const showError = (fieldId, msg) => {
  const el = document.getElementById(fieldId + 'Error') || document.getElementById(fieldId + '-error');
  if (el) { el.textContent = msg; el.classList.remove('hidden'); }
};
const clearErrors = (formId) => {
  const form = document.getElementById(formId);
  if (!form) return;
  form.querySelectorAll('.form-error').forEach(e => { e.textContent = ''; e.classList.add('hidden'); });
  form.querySelectorAll('.form-control.error').forEach(f => f.classList.remove('error'));
};

/* ── Skeleton generator ───────────────────────────────── */
const skeletonCard = () => `
  <div class="card" style="padding:1rem">
    <div class="skeleton" style="height:180px;border-radius:var(--radius);margin-bottom:.75rem"></div>
    <div class="skeleton" style="height:1rem;width:70%;margin-bottom:.5rem"></div>
    <div class="skeleton" style="height:.75rem;width:100%;margin-bottom:.5rem"></div>
    <div class="skeleton" style="height:.75rem;width:50%"></div>
  </div>`;

/* ── HTML escaping ────────────────────────────────────── */
const escapeHtml = (str) => {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

/* ── Expose globals ───────────────────────────────────── */
window.escapeHtml = escapeHtml;
window.MockBackend = MockBackend;
window.api      = api;
window.Toast    = Toast;
window.Modal    = Modal;
window.fmt      = fmt;
window.statusBadge = statusBadge;
window.vegDot   = vegDot;
window.urlParams = urlParams;
window.debounce = debounce;
window.$        = $;
window.$$       = $$;
window.setLoading  = setLoading;
window.showError   = showError;
window.clearErrors = clearErrors;
window.skeletonCard = skeletonCard;
