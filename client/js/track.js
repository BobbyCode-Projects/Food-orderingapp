/* ═══════════════════════════════════════════════════════
   track.js — Order tracking page logic
   Polling: fetches /api/orders/track/:orderNumber every 15s
   ═══════════════════════════════════════════════════════ */

const POLL_INTERVAL   = 15000; // ms
const TERMINAL_STATUS = ['Completed', 'Cancelled'];

const STATUS_CONFIG = {
  Received:  { emoji: '📋', label: 'Order Received',  sub: 'Your order has been received by the cafeteria.' },
  Preparing: { emoji: '👨‍🍳', label: 'Preparing',       sub: 'Our team is preparing your food.' },
  Ready:     { emoji: '✅', label: 'Ready for Pickup', sub: 'Your order is ready! Head to the counter.' },
  Completed: { emoji: '🎉', label: 'Completed',        sub: 'Order completed. Enjoy your meal!' },
  Cancelled: { emoji: '❌', label: 'Cancelled',        sub: 'This order has been cancelled.' },
};

const ALL_STEPS = ['Received', 'Preparing', 'Ready', 'Completed'];

let pollingTimer  = null;
let currentOrder  = null;
let pollingActive = false;

// ── Init ──────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const params = urlParams();

  // Auto-track if order number is in URL
  const autoOrder = params.order || sessionStorage.getItem('lastOrderNumber');
  if (autoOrder) {
    document.getElementById('orderInput').value = autoOrder;
    trackOrder(autoOrder);
  }

  // Load recent orders for logged-in users
  if (Auth.isLoggedIn() && !Auth.isAdmin()) {
    loadRecentOrders();
  }
});

// ── Track button click ────────────────────────────────────
document.getElementById('trackBtn').addEventListener('click', () => {
  const input = document.getElementById('orderInput').value.trim().toUpperCase();
  document.getElementById('trackError').classList.add('hidden');
  if (!input) {
    document.getElementById('trackError').textContent = 'Please enter an order number.';
    document.getElementById('trackError').classList.remove('hidden');
    return;
  }
  stopPolling();
  trackOrder(input);
});

document.getElementById('orderInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('trackBtn').click();
});

document.getElementById('refreshBtn').addEventListener('click', () => {
  if (currentOrder) trackOrder(currentOrder.orderNumber);
});

// ── Fetch + render ────────────────────────────────────────
async function trackOrder(orderNumber) {
  showSection('loading');

  try {
    const data = await api.get(`/orders/track/${orderNumber}`);
    currentOrder = data.order;
    renderTrackResult(data.order);
    showSection('result');

    // Start polling if order is still active
    if (!TERMINAL_STATUS.includes(data.order.status)) {
      startPolling(orderNumber);
    } else {
      stopPolling();
      document.getElementById('pollingBar').style.display = 'none';
    }
  } catch (err) {
    if (err.status === 404) {
      showSection('notFound');
    } else {
      showSection('notFound');
      Toast.error('Failed to fetch order. Please try again.');
    }
    stopPolling();
  }
}

// ── Polling ───────────────────────────────────────────────
function startPolling(orderNumber) {
  if (pollingActive) return;
  pollingActive = true;
  pollingTimer = setInterval(async () => {
    try {
      const data = await api.get(`/orders/track/${orderNumber}`);
      const prev = currentOrder?.status;
      currentOrder = data.order;
      renderTrackResult(data.order);

      // If status changed, notify user
      if (prev && prev !== data.order.status) {
        const cfg = STATUS_CONFIG[data.order.status] || {};
        Toast.success(`Order status: ${cfg.label || data.order.status}`);
      }

      // Stop polling on terminal status
      if (TERMINAL_STATUS.includes(data.order.status)) {
        stopPolling();
        document.getElementById('pollingBar').style.display = 'none';
      }
    } catch (_) {}
  }, POLL_INTERVAL);
}

function stopPolling() {
  if (pollingTimer) clearInterval(pollingTimer);
  pollingTimer  = null;
  pollingActive = false;
}

// ── Render ────────────────────────────────────────────────
function renderTrackResult(order) {
  const cfg     = STATUS_CONFIG[order.status] || { emoji: '⏳', label: order.status, sub: '' };
  const isTerminal = TERMINAL_STATUS.includes(order.status);

  // Status hero
  const emojiEl = document.getElementById('statusEmoji');
  emojiEl.textContent = cfg.emoji;
  emojiEl.className   = `status-emoji${isTerminal ? ' done' : ''}`;

  document.getElementById('statusOrderNum').textContent = order.orderNumber;
  document.getElementById('statusLabel').textContent    = cfg.label;
  document.getElementById('statusBadgeWrap').innerHTML  = statusBadge(order.status);

  // ETA
  const etaEl = document.getElementById('statusEta');
  if (order.status === 'Ready') {
    etaEl.innerHTML = `<strong class="text-success">🔔 Your order is ready at the counter!</strong>`;
  } else if (order.status === 'Completed') {
    etaEl.textContent = `Completed on ${fmt.datetime(order.statusHistory?.slice(-1)[0]?.timestamp || order.updatedAt)}`;
  } else if (order.status === 'Cancelled') {
    etaEl.textContent = 'This order was cancelled.';
  } else if (order.estimatedReadyTime) {
    const eta = new Date(order.estimatedReadyTime);
    const now = new Date();
    const mins = Math.max(0, Math.round((eta - now) / 60000));
    etaEl.textContent = mins > 0
      ? `⏱ Est. ready in ~${mins} minute${mins !== 1 ? 's' : ''}`
      : `⏱ Ready soon!`;
  } else {
    etaEl.textContent = cfg.sub;
  }

  // Stepper
  renderStepper(order.status);

  // History log
  renderHistory(order.statusHistory || []);

  // Order details sidebar
  renderOrderDetails(order);

  // Items sidebar
  renderOrderItems(order);
}

// ── Status Stepper ────────────────────────────────────────
function renderStepper(currentStatus) {
  const isCancelled = currentStatus === 'Cancelled';
  const currentIdx  = ALL_STEPS.indexOf(currentStatus);

  const steps = isCancelled
    ? [
        { key: 'Received',  label: 'Order Received',  sub: 'Order was placed',       icon: '📋' },
        { key: 'Cancelled', label: 'Cancelled',        sub: 'Order was cancelled',    icon: '❌' },
      ]
    : ALL_STEPS.map((key, i) => ({
        key,
        label: STATUS_CONFIG[key]?.label || key,
        sub:   STATUS_CONFIG[key]?.sub   || '',
        icon:  STATUS_CONFIG[key]?.emoji || '•',
      }));

  document.getElementById('stepperBody').innerHTML = `
    <div class="stepper">
      ${steps.map((step, i) => {
        let state = 'pending';
        if (!isCancelled) {
          const stepIdx = ALL_STEPS.indexOf(step.key);
          if (stepIdx < currentIdx)  state = 'done';
          if (stepIdx === currentIdx) state = 'active';
        } else {
          if (step.key === 'Received')  state = 'done';
          if (step.key === 'Cancelled') state = 'cancelled';
        }
        const isLast = i === steps.length - 1;
        return `
          <div class="stepper-item ${state}${isLast ? ' last' : ''}">
            <div class="stepper-circle">
              ${state === 'done' ? '✓' : state === 'cancelled' ? '✕' : step.icon}
            </div>
            <div class="stepper-content">
              <div class="stepper-title">${step.label}</div>
              <div class="stepper-sub">${step.sub}</div>
            </div>
          </div>`;
      }).join('')}
    </div>`;
}

// ── History log ───────────────────────────────────────────
function renderHistory(history) {
  if (!history.length) {
    document.getElementById('historyBody').innerHTML = '<p class="text-muted">No activity yet.</p>';
    return;
  }

  document.getElementById('historyBody').innerHTML = [...history].reverse().map(h => `
    <div class="history-item">
      <div class="history-dot"></div>
      <div>
        <div class="history-status">${h.status}</div>
        ${h.note ? `<div class="history-note">${h.note}</div>` : ''}
        <div class="history-time">${fmt.datetime(h.timestamp)}</div>
      </div>
    </div>`).join('');
}

// ── Order Details sidebar ─────────────────────────────────
function renderOrderDetails(order) {
  document.getElementById('orderDetailBody').innerHTML = `
    <div class="detail-row">
      <span>Customer</span>
      <span>${order.customerName}</span>
    </div>
    <div class="detail-row">
      <span>Order Type</span>
      <span>${order.orderType === 'dine-in' ? '🍽️ Dine-in' : '🥡 Pickup'}</span>
    </div>
    <div class="detail-row">
      <span>Placed at</span>
      <span>${fmt.datetime(order.createdAt)}</span>
    </div>
    <div class="detail-row">
      <span>Status</span>
      <span>${statusBadge(order.status)}</span>
    </div>
    ${order.specialInstructions ? `
    <div class="detail-row" style="flex-direction:column;gap:.25rem">
      <span>Special Instructions</span>
      <span style="text-align:left;font-style:italic;color:var(--text-muted)">${order.specialInstructions}</span>
    </div>` : ''}`;
}

// ── Order Items sidebar ───────────────────────────────────
function renderOrderItems(order) {
  const { items, pricing } = order;

  document.getElementById('orderItemsBody').innerHTML = (items || []).map(item => `
    <div class="track-item-row">
      <span class="track-item-name">${item.name}</span>
      <span class="track-item-qty">×${item.quantity}</span>
      <span class="track-item-price">${fmt.currency(item.subtotal)}</span>
    </div>`).join('');

  document.getElementById('orderItemsFooter').innerHTML = `
    <div class="track-totals">
      <div class="track-total-row"><span>Subtotal</span><span>${fmt.currency(pricing.subtotal)}</span></div>
      <div class="track-total-row"><span>Tax (5%)</span><span>${fmt.currency(pricing.tax)}</span></div>
      <div class="track-total-row grand"><span>Total</span><span>${fmt.currency(pricing.total)}</span></div>
    </div>`;
}

// ── Recent Orders (logged-in) ─────────────────────────────
async function loadRecentOrders() {
  try {
    const data = await api.get('/orders?limit=5');
    const orders = data.orders || [];
    if (!orders.length) return;

    document.getElementById('recentOrdersSection').classList.remove('hidden');
    document.getElementById('recentOrdersList').innerHTML = orders.map(o => `
      <div class="recent-order-card" data-num="${o.orderNumber}">
        <div class="recent-order-num">${o.orderNumber}</div>
        <div class="recent-order-meta">
          <span>${statusBadge(o.status)}</span>
          <span>${fmt.relativeTime(o.createdAt)}</span>
          <span>${fmt.currency(o.pricing.total)} · ${o.items.length} item${o.items.length !== 1 ? 's' : ''}</span>
        </div>
      </div>`).join('');

    document.querySelectorAll('.recent-order-card').forEach(card => {
      card.addEventListener('click', () => {
        const num = card.dataset.num;
        document.getElementById('orderInput').value = num;
        stopPolling();
        trackOrder(num);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    });
  } catch (_) {}
}

// ── Show/hide sections ────────────────────────────────────
function showSection(which) {
  ['trackLoading', 'trackResult', 'trackNotFound'].forEach(id => {
    document.getElementById(id).classList.toggle('hidden', id !== `track${capitalize(which)}`);
  });
}
function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

// Cleanup on page unload
window.addEventListener('beforeunload', stopPolling);
