/* ═══════════════════════════════════════════════════════
   admin.js — Admin panel SPA logic
   ═══════════════════════════════════════════════════════ */

// ── Auth guard ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  if (!Auth.requireAdmin()) return;
  initAdmin();
});

// ── State ──────────────────────────────────────────────────
let currentView    = 'dashboard';
let ordersPage     = 1;
let allMenuItems   = [];
let pendingStatusOrder = null;
let pendingDeleteId    = null;
let editingItemId      = null;

const CAT_EMOJI = {
  Breakfast:'🌅', Lunch:'🍱', Snacks:'🍟',
  Beverages:'☕', Desserts:'🍰', Specials:'⭐', default:'🍽️'
};
const STATUS_COLORS = {
  Received:'#3b82f6', Preparing:'#f59e0b',
  Ready:'#10b981', Completed:'#6b7280', Cancelled:'#ef4444',
};

// ── Init ───────────────────────────────────────────────────
function initAdmin() {
  const user = Auth.getUser();
  document.getElementById('adminName').textContent   = user?.name || 'Admin';
  document.getElementById('adminAvatar').textContent = (user?.name || 'A').charAt(0).toUpperCase();

  // Nav
  document.querySelectorAll('.admin-nav-item').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });

  // Top bar actions
  document.getElementById('topbarRefreshBtn').addEventListener('click', () => loadCurrentView());
  document.getElementById('adminLogout').addEventListener('click', () => Auth.logout());
  document.getElementById('sidebarToggleBtn').addEventListener('click', () => {
    document.getElementById('adminSidebar').classList.toggle('open');
  });

  // Clock
  updateClock();
  setInterval(updateClock, 1000);

  // Load dashboard
  loadDashboard();

  // Delegate modals & forms
  attachModalListeners();
}

function updateClock() {
  const el = document.getElementById('topbarTime');
  if (el) el.textContent = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// ── View switching ──────────────────────────────────────────
function switchView(view) {
  currentView = view;
  document.querySelectorAll('.admin-view').forEach(v => {
    v.classList.toggle('hidden', !v.id.endsWith(view));
    v.classList.toggle('active', v.id.endsWith(view));
  });
  document.querySelectorAll('.admin-nav-item').forEach(b => {
    b.classList.toggle('active', b.dataset.view === view);
  });
  const titles = { dashboard:'Dashboard', orders:'Orders', menu:'Menu Items', users:'Customers', analytics:'Analytics' };
  document.getElementById('adminPageTitle').textContent = titles[view] || 'Admin';
  loadCurrentView();
}
window.switchView = switchView;

function loadCurrentView() {
  switch (currentView) {
    case 'dashboard': loadDashboard(); break;
    case 'orders':    loadOrders();    break;
    case 'menu':      loadMenu();      break;
    case 'users':     loadUsers();     break;
    case 'analytics': loadAnalytics(); break;
  }
}

// ════════════════ DASHBOARD ════════════════
async function loadDashboard() {
  try {
    const data = await api.get('/admin/dashboard');
    const { stats, recentOrders, ordersByStatus, topItems } = data;

    // Stat cards
    document.getElementById('stTotalOrders').textContent  = stats.totalOrders;
    document.getElementById('stTodayOrders').textContent  = stats.todayOrders;
    document.getElementById('stActiveOrders').textContent = stats.activeOrders;
    document.getElementById('stTodayRevenue').textContent = fmt.currency(stats.todayRevenue);
    document.getElementById('stMenuItems').textContent    = `${stats.availableMenuItems}/${stats.totalMenuItems}`;
    document.getElementById('stCustomers').textContent    = stats.totalCustomers;

    // Active order count badge
    const badge = document.getElementById('activeOrderCount');
    if (stats.activeOrders > 0) {
      badge.textContent = stats.activeOrders;
      badge.classList.remove('hidden');
    }

    // Recent orders table
    document.getElementById('dashRecentBody').innerHTML = recentOrders.length
      ? recentOrders.map(o => `
          <tr>
            <td><strong>${o.orderNumber}</strong></td>
            <td>${o.customer?.name || o.customerName || '—'}</td>
            <td>${o.items.length} item${o.items.length !== 1 ? 's' : ''}</td>
            <td>${fmt.currency(o.pricing.total)}</td>
            <td>${statusBadge(o.status)}</td>
            <td>${fmt.relativeTime(o.createdAt)}</td>
          </tr>`).join('')
      : '<tr><td colspan="6" class="text-center text-muted" style="padding:1.5rem">No orders yet</td></tr>';

    // Top items
    document.getElementById('topItemsList').innerHTML = topItems.length
      ? topItems.map((item, i) => `
          <div class="top-item-row">
            <div class="top-item-rank">${i + 1}</div>
            <div class="top-item-name">${item.name}</div>
            <div class="top-item-qty">${item.totalQty} sold</div>
            <div class="top-item-rev">${fmt.currency(item.totalRevenue)}</div>
          </div>`).join('')
      : '<p class="text-muted text-center">No data yet</p>';

    // Orders by status
    const total = ordersByStatus.reduce((s, o) => s + o.count, 0) || 1;
    document.getElementById('ordersByStatusList').innerHTML = ordersByStatus.map(s => `
      <div class="status-bar-row">
        <div class="status-bar-label">${s._id}</div>
        <div class="status-bar-track">
          <div class="status-bar-fill" style="width:${(s.count/total*100).toFixed(1)}%;background:${STATUS_COLORS[s._id]||'#94a3b8'}"></div>
        </div>
        <div class="status-bar-count">${s.count}</div>
      </div>`).join('') || '<p class="text-muted text-center">No data yet</p>';

  } catch (err) {
    Toast.error('Failed to load dashboard.');
  }
}

// ════════════════ ORDERS ════════════════
async function loadOrders(page = 1) {
  ordersPage = page;
  const status = document.getElementById('orderStatusFilter')?.value || '';
  const date   = document.getElementById('orderDateFilter')?.value   || '';
  const params = new URLSearchParams({ page, limit: 15 });
  if (status) params.set('status', status);
  if (date)   params.set('date', date);

  try {
    const data = await api.get(`/admin/orders?${params}`);
    document.getElementById('ordersResultCount').textContent = `${data.total} order${data.total !== 1 ? 's' : ''}`;
    renderOrdersTable(data.orders);
    renderPagination(data.pages, page);
  } catch (err) {
    Toast.error('Failed to load orders.');
  }
}

function renderOrdersTable(orders) {
  if (!orders.length) {
    document.getElementById('ordersTableBody').innerHTML =
      '<tr><td colspan="9" class="text-center text-muted" style="padding:2rem">No orders found</td></tr>';
    return;
  }
  document.getElementById('ordersTableBody').innerHTML = orders.map(o => `
    <tr>
      <td><strong>${o.orderNumber}</strong></td>
      <td>${o.customer?.name || '—'}<br><small class="text-muted">${o.customer?.email || ''}</small></td>
      <td>${o.orderType === 'dine-in' ? '🍽️' : '🥡'} ${o.orderType}</td>
      <td>${o.items.length} item${o.items.length !== 1 ? 's' : ''}</td>
      <td>${fmt.currency(o.pricing.total)}</td>
      <td>${o.payment ? statusBadge(o.payment.status) : '<span class="badge badge-gray">Unpaid</span>'}</td>
      <td>${statusBadge(o.status)}</td>
      <td>${fmt.relativeTime(o.createdAt)}</td>
      <td>
        <div class="action-btns">
          <button class="action-btn action-btn-status" data-id="${o._id}" data-num="${o.orderNumber}" data-status="${o.status}">
            Update
          </button>
          ${!['Completed','Cancelled'].includes(o.status) ? `
          <button class="action-btn action-btn-cancel" data-cancel-id="${o._id}" data-cancel-num="${o.orderNumber}">
            Cancel
          </button>` : ''}
        </div>
      </td>
    </tr>`).join('');

  // Status update buttons
  document.querySelectorAll('.action-btn-status').forEach(btn => {
    btn.addEventListener('click', () => openStatusModal(btn.dataset.id, btn.dataset.num, btn.dataset.status));
  });
  // Cancel buttons
  document.querySelectorAll('.action-btn-cancel').forEach(btn => {
    btn.addEventListener('click', () => cancelOrder(btn.dataset.cancelId, btn.dataset.cancelNum));
  });
}

function renderPagination(pages, current) {
  if (pages <= 1) { document.getElementById('ordersPagination').innerHTML = ''; return; }
  let html = `<button class="page-btn" ${current === 1 ? 'disabled' : ''} onclick="loadOrders(${current-1})">‹</button>`;
  for (let i = 1; i <= pages; i++) {
    if (pages > 7 && Math.abs(i - current) > 2 && i !== 1 && i !== pages) {
      if (i === 2 || i === pages - 1) html += '<span style="padding:.4rem">…</span>';
      continue;
    }
    html += `<button class="page-btn ${i === current ? 'active' : ''}" onclick="loadOrders(${i})">${i}</button>`;
  }
  html += `<button class="page-btn" ${current === pages ? 'disabled' : ''} onclick="loadOrders(${current+1})">›</button>`;
  document.getElementById('ordersPagination').innerHTML = html;
}

// Status modal
function openStatusModal(id, num, currentStatus) {
  pendingStatusOrder = id;
  document.getElementById('modalOrderNum').textContent = num;
  document.getElementById('modalNewStatus').value = currentStatus;
  document.getElementById('modalStatusNote').value = '';
  Modal.open('updateStatusModal');
}

async function cancelOrder(id, num) {
  if (!confirm(`Cancel order ${num}?`)) return;
  try {
    await api.patch(`/orders/${id}/cancel`, { note: 'Cancelled by admin' });
    Toast.success('Order cancelled.');
    loadOrders(ordersPage);
  } catch (err) {
    Toast.error(err.message || 'Failed to cancel order.');
  }
}

// Order filter listeners
document.getElementById('orderStatusFilter')?.addEventListener('change', () => loadOrders(1));
document.getElementById('orderDateFilter')?.addEventListener('change', () => loadOrders(1));
document.getElementById('clearOrderFilters')?.addEventListener('click', () => {
  document.getElementById('orderStatusFilter').value = '';
  document.getElementById('orderDateFilter').value   = '';
  loadOrders(1);
});

// ════════════════ MENU ════════════════
async function loadMenu() {
  const cat    = document.getElementById('menuCatFilter')?.value    || '';
  const search = document.getElementById('menuSearchFilter')?.value || '';

  try {
    const data = await api.get('/menu');
    allMenuItems = data.items || [];

    let filtered = allMenuItems;
    if (cat)    filtered = filtered.filter(i => i.category === cat);
    if (search) filtered = filtered.filter(i => i.name.toLowerCase().includes(search.toLowerCase()));

    renderMenuGrid(filtered);
  } catch (err) {
    Toast.error('Failed to load menu.');
  }
}

function renderMenuGrid(items) {
  if (!items.length) {
    document.getElementById('menuAdminGrid').innerHTML =
      '<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">🍽️</div><h3>No items found</h3></div>';
    return;
  }
  document.getElementById('menuAdminGrid').innerHTML = items.map(item => `
    <div class="menu-admin-card ${item.isAvailable ? '' : 'unavailable'}">
      <div class="mac-image">
        ${item.image && item.image !== '/images/default-food.png'
          ? `<img src="${item.image}" alt="${item.name}" loading="lazy" onerror="this.onerror=null;this.src='/images/default-food.png'" />`
          : `<span>${CAT_EMOJI[item.category] || CAT_EMOJI.default}</span>`}
        <span class="mac-avail-badge ${item.isAvailable ? 'badge-green' : 'badge-red'}">
          ${item.isAvailable ? 'Available' : 'Hidden'}
        </span>
      </div>
      <div class="mac-body">
        <div class="mac-top">
          <span class="mac-name">${item.name}</span>
          ${vegDot(item.isVeg)}
        </div>
        <div class="mac-cat">${item.category} · ⏱ ${item.preparationTime}min${item.nutrition && item.nutrition.calories ? ` · 🔥 ${item.nutrition.calories} kcal` : ''}</div>
        <div class="mac-price">${fmt.currency(item.price)}</div>
      </div>
      <div class="mac-actions">
        <button class="btn btn-outline btn-sm" data-edit="${item._id}">✏️ Edit</button>
        <button class="btn btn-ghost btn-sm" data-toggle="${item._id}">
          ${item.isAvailable ? '🚫 Hide' : '✅ Show'}
        </button>
        <button class="btn btn-danger btn-sm" data-delete="${item._id}" data-name="${item.name}">🗑</button>
      </div>
    </div>`).join('');

  document.querySelectorAll('[data-edit]').forEach(btn => openEditModal(btn.dataset.edit));
  document.querySelectorAll('[data-toggle]').forEach(btn => {
    btn.addEventListener('click', () => toggleItem(btn.dataset.toggle));
  });
  document.querySelectorAll('[data-delete]').forEach(btn => {
    btn.addEventListener('click', () => openDeleteModal(btn.dataset.delete, btn.dataset.name));
  });
}

function openEditModal(id) {
  const el = document.querySelector(`[data-edit="${id}"]`);
  if (el) el.addEventListener('click', () => {
    const item = allMenuItems.find(i => i._id === id);
    if (!item) return;
    editingItemId = id;
    document.getElementById('menuModalTitle').textContent = 'Edit Menu Item';
    document.getElementById('editItemId').value      = id;
    document.getElementById('itemName').value        = item.name;
    document.getElementById('itemCategory').value    = item.category;
    document.getElementById('itemDescription').value = item.description || '';
    document.getElementById('itemPrice').value       = item.price;
    document.getElementById('itemPrepTime').value    = item.preparationTime;
    document.getElementById('itemImage').value       = item.image && item.image !== '/images/default-food.png' ? item.image : '';
    document.getElementById('itemIsVeg').checked     = item.isVeg;
    document.getElementById('itemIsAvailable').checked = item.isAvailable;

    const n = item.nutrition || {};
    document.getElementById('itemServingSize').value  = n.servingSize || '';
    document.getElementById('itemCalories').value     = n.calories !== undefined && n.calories !== null ? n.calories : '';
    document.getElementById('itemProtein').value      = n.protein !== undefined && n.protein !== null ? n.protein : '';
    document.getElementById('itemCarbs').value        = n.carbs !== undefined && n.carbs !== null ? n.carbs : '';
    document.getElementById('itemSugar').value        = n.sugar !== undefined && n.sugar !== null ? n.sugar : '';
    document.getElementById('itemFat').value          = n.fat !== undefined && n.fat !== null ? n.fat : '';
    document.getElementById('itemSaturatedFat').value = n.saturatedFat !== undefined && n.saturatedFat !== null ? n.saturatedFat : '';
    document.getElementById('itemFiber').value        = n.fiber !== undefined && n.fiber !== null ? n.fiber : '';
    document.getElementById('itemSodium').value       = n.sodium !== undefined && n.sodium !== null ? n.sodium : '';

    document.getElementById('itemIngredients').value = Array.isArray(item.ingredients) ? item.ingredients.join(', ') : '';
    document.getElementById('itemHealthTags').value  = Array.isArray(item.healthTags) ? item.healthTags.join(', ') : '';
    const overrideVal = item.healthyOverride === true ? 'true' : (item.healthyOverride === false ? 'false' : '');
    document.getElementById('itemHealthyOverride').value = overrideVal;

    const allergenSet = new Set(Array.isArray(item.allergens) ? item.allergens.map(a => String(a).toLowerCase()) : []);
    document.querySelectorAll('#itemAllergensContainer input[type="checkbox"]').forEach(cb => {
      cb.checked = allergenSet.has(cb.value.toLowerCase());
    });

    clearErrors('menuItemForm');
    Modal.open('menuItemModal');
  });
}

async function toggleItem(id) {
  try {
    const data = await api.patch(`/menu/${id}/toggle`);
    Toast.success(`"${data.item.name}" is now ${data.item.isAvailable ? 'available' : 'hidden'}.`);
    loadMenu();
  } catch (err) { Toast.error(err.message || 'Failed to toggle item.'); }
}

function openDeleteModal(id, name) {
  pendingDeleteId = id;
  document.getElementById('deleteItemName').textContent = name;
  Modal.open('deleteItemModal');
}

// Menu search/filter listeners
document.getElementById('menuCatFilter')?.addEventListener('change', loadMenu);
document.getElementById('menuSearchFilter')?.addEventListener('input', debounce(loadMenu, 300));

// Add item button
document.getElementById('addMenuItemBtn')?.addEventListener('click', () => {
  editingItemId = null;
  document.getElementById('menuModalTitle').textContent = 'Add Menu Item';
  document.getElementById('menuItemForm').reset();
  document.getElementById('editItemId').value = '';
  document.getElementById('itemIsVeg').checked = true;
  document.getElementById('itemIsAvailable').checked = true;

  document.getElementById('itemServingSize').value  = '';
  document.getElementById('itemCalories').value     = '';
  document.getElementById('itemProtein').value      = '';
  document.getElementById('itemCarbs').value        = '';
  document.getElementById('itemSugar').value        = '';
  document.getElementById('itemFat').value          = '';
  document.getElementById('itemSaturatedFat').value = '';
  document.getElementById('itemFiber').value        = '';
  document.getElementById('itemSodium').value       = '';

  document.getElementById('itemIngredients').value = '';
  document.getElementById('itemHealthTags').value  = '';
  document.getElementById('itemHealthyOverride').value = '';
  document.querySelectorAll('#itemAllergensContainer input[type="checkbox"]').forEach(cb => {
    cb.checked = false;
  });

  clearErrors('menuItemForm');
  Modal.open('menuItemModal');
});

// ════════════════ USERS ════════════════
async function loadUsers() {
  try {
    const data = await api.get('/admin/users');
    const users = data.users || [];
    if (!users.length) {
      document.getElementById('usersTableBody').innerHTML =
        '<tr><td colspan="6" class="text-center text-muted" style="padding:2rem">No customers yet</td></tr>';
      return;
    }
    document.getElementById('usersTableBody').innerHTML = users.map(u => `
      <tr>
        <td><strong>${u.name}</strong></td>
        <td>${u.email}</td>
        <td>${u.phone || '—'}</td>
        <td>${fmt.date(u.createdAt)}</td>
        <td>${u.isActive
          ? '<span class="badge badge-green">Active</span>'
          : '<span class="badge badge-red">Inactive</span>'}</td>
        <td>
          <button class="action-btn ${u.isActive ? 'action-btn-cancel' : 'action-btn-status'}" data-user-id="${u._id}">
            ${u.isActive ? 'Deactivate' : 'Activate'}
          </button>
        </td>
      </tr>`).join('');

    document.querySelectorAll('[data-user-id]').forEach(btn => {
      btn.addEventListener('click', async () => {
        try {
          await api.patch(`/admin/users/${btn.dataset.userId}/toggle`);
          Toast.success('User status updated.');
          loadUsers();
        } catch (err) { Toast.error(err.message || 'Failed to update user.'); }
      });
    });
  } catch (err) { Toast.error('Failed to load users.'); }
}

// ════════════════ ANALYTICS ════════════════
async function loadAnalytics() {
  const from = document.getElementById('analyticsFrom')?.value;
  const to   = document.getElementById('analyticsTo')?.value;
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to)   params.set('to', to);

  try {
    const data = await api.get(`/admin/analytics/sales?${params}`);
    renderBarChart(data.salesByDay);
    renderMethodChart(data.salesByMethod);
  } catch (err) { Toast.error('Failed to load analytics.'); }
}

function renderBarChart(salesByDay) {
  if (!salesByDay.length) {
    document.getElementById('revenueChartBody').innerHTML = '<p class="text-muted text-center">No data for this period</p>';
    return;
  }
  const maxRev = Math.max(...salesByDay.map(d => d.revenue), 1);
  document.getElementById('revenueChartBody').innerHTML = `
    <div class="bar-chart">
      ${salesByDay.map(d => `
        <div class="bar-chart-row">
          <div class="bar-chart-label">${d._id.slice(5)}</div>
          <div class="bar-chart-track">
            <div class="bar-chart-fill" style="width:${(d.revenue/maxRev*100).toFixed(1)}%">
              ${d.count}
            </div>
          </div>
          <div class="bar-chart-val">${fmt.currency(d.revenue)}</div>
        </div>`).join('')}
    </div>`;
}

function renderMethodChart(methods) {
  const icons = { card:'💳', upi:'📱', cash:'💵' };
  document.getElementById('methodChartBody').innerHTML = `
    <div class="method-list">
      ${methods.map(m => `
        <div class="method-row">
          <span class="method-icon">${icons[m._id] || '💰'}</span>
          <span class="method-label">${m._id?.toUpperCase() || '—'}</span>
          <span class="method-val">${fmt.currency(m.revenue)}</span>
          <span class="badge badge-gray">${m.count} txn</span>
        </div>`).join('')}
    </div>`;
}

document.getElementById('analyticsFilterBtn')?.addEventListener('click', loadAnalytics);

// ════════════════ MODAL LISTENERS ════════════════
function attachModalListeners() {
  // ── Update status confirm ──
  document.getElementById('confirmStatusBtn').addEventListener('click', async () => {
    const newStatus = document.getElementById('modalNewStatus').value;
    const note      = document.getElementById('modalStatusNote').value.trim();
    const btn       = document.getElementById('confirmStatusBtn');
    setLoading(btn, true);
    try {
      await api.patch(`/orders/${pendingStatusOrder}/status`, { status: newStatus, note });
      Toast.success(`Order status updated to ${newStatus}.`);
      Modal.close('updateStatusModal');
      if (currentView === 'orders') loadOrders(ordersPage);
      else loadDashboard();
    } catch (err) {
      Toast.error(err.message || 'Failed to update status.');
    } finally {
      setLoading(btn, false);
    }
  });

  // ── Save menu item ──
  document.getElementById('saveMenuItemBtn').addEventListener('click', async () => {
    clearErrors('menuItemForm');
    const name        = document.getElementById('itemName').value.trim();
    const category    = document.getElementById('itemCategory').value;
    const description = document.getElementById('itemDescription').value.trim();
    const price       = parseFloat(document.getElementById('itemPrice').value);
    const prepTime    = parseInt(document.getElementById('itemPrepTime').value) || 10;
    const image       = document.getElementById('itemImage').value.trim();
    const isVeg       = document.getElementById('itemIsVeg').checked;
    const isAvailable = document.getElementById('itemIsAvailable').checked;

    const servingSize = document.getElementById('itemServingSize').value.trim();
    const calRaw      = document.getElementById('itemCalories').value.trim();
    const proRaw      = document.getElementById('itemProtein').value.trim();
    const carbsRaw    = document.getElementById('itemCarbs').value.trim();
    const sugarRaw    = document.getElementById('itemSugar').value.trim();
    const fatRaw      = document.getElementById('itemFat').value.trim();
    const satFatRaw   = document.getElementById('itemSaturatedFat').value.trim();
    const fiberRaw    = document.getElementById('itemFiber').value.trim();
    const sodiumRaw   = document.getElementById('itemSodium').value.trim();

    let valid = true;
    if (!name || name.length < 2) { showError('itemName', 'Name required (min 2 chars).'); valid = false; }
    if (!category)                 { showError('itemCategory', 'Category required.');       valid = false; }
    if (isNaN(price) || price < 0) { showError('itemPrice', 'Valid price required.');       valid = false; }

    const parseNutriNum = (val, fieldId, label) => {
      if (val === '') return 0;
      const num = Number(val);
      if (isNaN(num) || num < 0) {
        showError(fieldId, `${label} must be a non-negative number.`);
        valid = false;
        return 0;
      }
      return num;
    };

    const calories     = parseNutriNum(calRaw, 'itemCalories', 'Calories');
    const protein      = parseNutriNum(proRaw, 'itemProtein', 'Protein');
    const carbs        = parseNutriNum(carbsRaw, 'itemCarbs', 'Carbs');
    const sugar        = parseNutriNum(sugarRaw, 'itemSugar', 'Sugar');
    const fat          = parseNutriNum(fatRaw, 'itemFat', 'Fat');
    const saturatedFat = parseNutriNum(satFatRaw, 'itemSaturatedFat', 'Saturated fat');
    const fiber        = parseNutriNum(fiberRaw, 'itemFiber', 'Fiber');
    const sodium       = parseNutriNum(sodiumRaw, 'itemSodium', 'Sodium');

    if (!valid) return;

    const nutrition = {
      calories,
      protein,
      carbs,
      sugar,
      fat,
      saturatedFat,
      fiber,
      sodium,
      servingSize,
    };

    const ingredientsRaw = document.getElementById('itemIngredients').value.trim();
    const ingredients = ingredientsRaw
      ? ingredientsRaw.split(',').map(s => s.trim()).filter(Boolean)
      : [];

    const allergens = Array.from(document.querySelectorAll('#itemAllergensContainer input[type="checkbox"]:checked'))
      .map(cb => cb.value.trim().toLowerCase());

    const healthTagsRaw = document.getElementById('itemHealthTags').value.trim();
    const healthTags = healthTagsRaw
      ? healthTagsRaw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
      : [];

    const overrideRaw = document.getElementById('itemHealthyOverride').value;
    let healthyOverride = null;
    if (overrideRaw === 'true') healthyOverride = true;
    else if (overrideRaw === 'false') healthyOverride = false;

    const payload = {
      name,
      category,
      description,
      price,
      preparationTime: prepTime,
      image: image || '/images/default-food.png',
      isVeg,
      isAvailable,
      nutrition,
      ingredients,
      allergens,
      healthTags,
      healthyOverride,
    };

    const btn = document.getElementById('saveMenuItemBtn');
    setLoading(btn, true);
    try {
      if (editingItemId) {
        await api.put(`/menu/${editingItemId}`, payload);
        Toast.success('Menu item updated.');
      } else {
        await api.post('/menu', payload);
        Toast.success('Menu item added.');
      }
      Modal.close('menuItemModal');
      loadMenu();
    } catch (err) {
      Toast.error(err.message || 'Failed to save item.');
    } finally {
      setLoading(btn, false);
    }
  });

  // ── Confirm delete ──
  document.getElementById('confirmDeleteBtn').addEventListener('click', async () => {
    const btn = document.getElementById('confirmDeleteBtn');
    setLoading(btn, true);
    try {
      await api.delete(`/menu/${pendingDeleteId}`);
      Toast.success('Menu item deleted.');
      Modal.close('deleteItemModal');
      loadMenu();
    } catch (err) {
      Toast.error(err.message || 'Failed to delete item.');
    } finally {
      setLoading(btn, false);
    }
  });
}
