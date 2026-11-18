/* ═══════════════════════════════════════════════════════
   cart-page.js — Cart page logic with Server-side Rewards Preview
   ═══════════════════════════════════════════════════════ */

const CAT_EMOJI_CART = {
  Breakfast: '🌅', Lunch: '🍱', Snacks: '🍟',
  Beverages: '☕', Desserts: '🍰', Specials: '⭐', 'Healthy Indian': '🥗', default: '🍽️',
};

const PROMO_CODES = {
  'CAFE10': 10,
  'FIRST20': 20,
  'STUDENT5': 5,
};

let appliedPromo = sessionStorage.getItem('promoCode') || null;
let requestedRedeemPoints = parseInt(sessionStorage.getItem('redeemPoints')) || 0;
let userRewardBalance = 0;
let previewData = null;

// ── Render ────────────────────────────────────────────────
async function renderCart() {
  const items = Cart.getItems();
  const loading  = document.getElementById('cartLoading');
  const empty    = document.getElementById('cartEmpty');
  const content  = document.getElementById('cartContent');
  const checkoutBtn = document.getElementById('checkoutBtn');
  const orderTypeCard = document.getElementById('orderTypeCard');
  const promoCard     = document.getElementById('promoCard');
  const pointsCard    = document.getElementById('pointsCard');

  if (loading) loading.classList.add('hidden');

  if (items.length === 0) {
    empty.classList.remove('hidden');
    content.classList.add('hidden');
    if (orderTypeCard) orderTypeCard.classList.add('hidden');
    if (promoCard)     promoCard.classList.add('hidden');
    if (pointsCard)    pointsCard.classList.add('hidden');
    checkoutBtn.disabled = true;
    updateSummaryFallback();
    return;
  }

  empty.classList.add('hidden');
  content.classList.remove('hidden');
  if (orderTypeCard) orderTypeCard.classList.remove('hidden');
  if (promoCard)     promoCard.classList.remove('hidden');

  const isLoggedIn = Auth.isLoggedIn();
  if (pointsCard) {
    if (isLoggedIn) pointsCard.classList.remove('hidden');
    else pointsCard.classList.add('hidden');
  }

  // Item count label
  const totalQty = items.reduce((s, i) => s + i.quantity, 0);
  document.getElementById('itemCountLabel').textContent =
    `(${totalQty} item${totalQty !== 1 ? 's' : ''})`;

  // Check for allergy conflicts
  const user = Auth.getUser();
  const userAllergies = (user && Array.isArray(user.allergies)) ? user.allergies : [];
  const conflictingItems = items.filter(i =>
    Array.isArray(i.allergens) && i.allergens.some(a => userAllergies.includes(a))
  );

  let bannerHtml = '';
  if (conflictingItems.length > 0) {
    bannerHtml = `
      <div class="alert alert-warning" style="margin-bottom:1rem;display:flex;align-items:center;gap:.6rem;background:#fffbeb;border:1px solid #fde68a;color:#92400e;padding:.75rem 1rem;border-radius:var(--radius)">
        <span style="font-size:1.2rem">⚠️</span>
        <span style="font-size:.85rem"><strong>Allergy Advisory:</strong> Some items in your cart contain allergens listed in your profile. Please check the warnings below.</span>
      </div>`;
  }

  // Render rows
  document.getElementById('cartItemsList').innerHTML = bannerHtml + items.map(cartItemRow).join('');

  // Qty buttons
  document.querySelectorAll('.cart-qty-btn[data-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id     = btn.dataset.id;
      const action = btn.dataset.action;
      const item   = items.find(i => i._id === id);
      if (!item) return;
      if (action === 'inc') Cart.updateQty(id, item.quantity + 1);
      if (action === 'dec') Cart.updateQty(id, item.quantity - 1);
      renderCart();
    });
  });

  // Remove buttons
  document.querySelectorAll('.cart-item-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      Cart.remove(btn.dataset.id);
      renderCart();
      Toast.info('Item removed');
    });
  });

  // Update summary via server preview
  await fetchRewardsPreview();

  // Checkout button state
  checkoutBtn.disabled = !isLoggedIn;
  document.getElementById('checkoutHint').textContent = isLoggedIn
    ? `You'll review your details on the next page`
    : 'Login to place your order';

  if (isLoggedIn) {
    document.getElementById('checkoutHint').innerHTML =
      `<span class="text-success">✓</span> Logged in as <strong>${Auth.getUser().name.split(' ')[0]}</strong>`;
  }
}

// ── Item row HTML ─────────────────────────────────────────
function cartItemRow(item) {
  const emoji = CAT_EMOJI_CART[item.category] || CAT_EMOJI_CART.default;
  const user = Auth.getUser();
  const userAllergies = (user && Array.isArray(user.allergies)) ? user.allergies : [];
  const conflicts = (Array.isArray(item.allergens)) ? item.allergens.filter(a => userAllergies.includes(a)) : [];

  return `
    <div class="cart-item" data-id="${item._id}">
      <div class="cart-item-img">
        ${item.image && item.image !== '/images/default-food.png'
          ? `<img src="${item.image}" alt="${escapeHtml(item.name)}" loading="lazy" onerror="this.onerror=null;this.src='/images/default-food.png'" />`
          : `<span>${emoji}</span>`}
      </div>
      <div class="cart-item-info">
        <div class="cart-item-name">${escapeHtml(item.name)}</div>
        <div class="cart-item-unit">${fmt.currency(item.price)} each ${item.isHealthy ? '<span class="badge badge-green" style="font-size:.65rem;margin-left:.3rem">🌱 Healthy</span>' : ''}</div>
        ${conflicts.length > 0 ? `<div class="cart-item-allergy-warn" style="font-size:.72rem;color:#b91c1c;background:#fef2f2;border:1px solid #fecaca;padding:.15rem .45rem;border-radius:4px;margin-top:.25rem;display:inline-block;font-weight:600">⚠️ Contains: ${conflicts.map(escapeHtml).join(', ')}</div>` : ''}
      </div>
      <div class="cart-item-controls">
        <button class="cart-qty-btn" data-action="dec" data-id="${item._id}" aria-label="Decrease">−</button>
        <span class="cart-qty-val">${item.quantity}</span>
        <button class="cart-qty-btn" data-action="inc" data-id="${item._id}" aria-label="Increase">+</button>
      </div>
      <div class="cart-item-price">${fmt.currency(item.price * item.quantity)}</div>
      <button class="cart-item-remove" data-id="${item._id}" aria-label="Remove item">✕</button>
    </div>`;
}

// ── Fetch Preview from Server ─────────────────────────────
async function fetchRewardsPreview() {
  const items = Cart.toOrderItems();
  if (items.length === 0) {
    updateSummaryFallback();
    return;
  }

  if (Auth.isLoggedIn()) {
    try {
      const res = await api.post('/rewards/preview', {
        items,
        redeemPoints: requestedRedeemPoints,
        promoCode: appliedPromo || undefined,
      });

      previewData = res;
      userRewardBalance = res.userPoints || 0;
      applyPreviewToUI(res);
      return;
    } catch (_) {
      // Fallback to local calculation if server preview encounters an issue
    }
  }

  updateSummaryFallback();
}

// ── Apply Server Preview to UI ────────────────────────────
function applyPreviewToUI(data) {
  const pricing = data.pricing;
  const pEarn = data.pointsToEarn;

  document.getElementById('summarySubtotal').textContent = fmt.currency(pricing.subtotal);
  document.getElementById('summaryTax').textContent      = fmt.currency(pricing.tax);
  document.getElementById('summaryTotal').textContent    = fmt.currency(pricing.total);

  // Healthy offer discount
  const healthyRow = document.getElementById('healthyDiscountRow');
  if (healthyRow) {
    if (pricing.healthyOfferDiscount > 0) {
      healthyRow.classList.remove('hidden');
      document.getElementById('summaryHealthyDiscount').textContent = `-${fmt.currency(pricing.healthyOfferDiscount)}`;
    } else {
      healthyRow.classList.add('hidden');
    }
  }

  // Points discount
  const pointsRow = document.getElementById('pointsDiscountRow');
  if (pointsRow) {
    if (pricing.pointsDiscount > 0) {
      pointsRow.classList.remove('hidden');
      document.getElementById('summaryPointsDiscount').textContent = `-${fmt.currency(pricing.pointsDiscount)}`;
      const ptsUsedLabel = document.getElementById('summaryPointsUsed');
      if (ptsUsedLabel) ptsUsedLabel.textContent = pricing.pointsRedeemed;
    } else {
      pointsRow.classList.add('hidden');
    }
  }

  // Promo discount
  const promoRow = document.getElementById('discountRow');
  if (promoRow) {
    if (pricing.promoDiscount > 0) {
      promoRow.classList.remove('hidden');
      document.getElementById('summaryDiscount').textContent = `-${fmt.currency(pricing.promoDiscount)}`;
    } else {
      promoRow.classList.add('hidden');
    }
  }

  // Points to earn note
  const earnText = document.getElementById('pointsEarnText');
  if (earnText && pEarn) {
    let note = `Earn ~${pEarn.minEarn}–${pEarn.maxEarn} reward points on this order`;
    if (pEarn.healthyBonus > 0) {
      note += ` (includes +${pEarn.healthyBonus} healthy bonus!)`;
    }
    earnText.textContent = note;
  }

  // User points balance in Points card
  const balEl = document.getElementById('userPointsBalance');
  if (balEl) balEl.textContent = data.userPoints !== undefined ? data.userPoints : 0;

  const hintEl = document.getElementById('pointsHint');
  if (hintEl) {
    hintEl.textContent = `10 pts = ₹1 (max redeemable: ${pricing.maxRedeemablePoints} pts = ${fmt.currency(pricing.maxPointsDiscount)})`;
  }

  // Savings note
  const savings = pricing.promoDiscount + pricing.pointsDiscount + pricing.healthyOfferDiscount;
  const savingsEl = document.getElementById('savingsNote');
  if (savings > 0 && savingsEl) {
    savingsEl.classList.remove('hidden');
    document.getElementById('savingsText').textContent = `You save ${fmt.currency(savings)} on this order!`;
  } else if (savingsEl) {
    savingsEl.classList.add('hidden');
  }
}

// ── Fallback local summary when offline or guest ──────────
function updateSummaryFallback() {
  const { subtotal, tax } = Cart.getTotals();
  let discount = 0;
  if (appliedPromo && PROMO_CODES[appliedPromo]) {
    discount = +(subtotal * (PROMO_CODES[appliedPromo] / 100)).toFixed(2);
  }
  const total = Math.max(0, +(subtotal + tax - discount).toFixed(2));

  document.getElementById('summarySubtotal').textContent = fmt.currency(subtotal);
  document.getElementById('summaryTax').textContent      = fmt.currency(tax);
  document.getElementById('summaryTotal').textContent    = fmt.currency(total);

  const healthyRow = document.getElementById('healthyDiscountRow');
  if (healthyRow) healthyRow.classList.add('hidden');

  const pointsRow = document.getElementById('pointsDiscountRow');
  if (pointsRow) pointsRow.classList.add('hidden');

  const discountRow = document.getElementById('discountRow');
  if (discount > 0 && discountRow) {
    discountRow.classList.remove('hidden');
    document.getElementById('summaryDiscount').textContent = `-${fmt.currency(discount)}`;
  } else if (discountRow) {
    discountRow.classList.add('hidden');
  }

  const earnText = document.getElementById('pointsEarnText');
  if (earnText) {
    earnText.textContent = 'Earn reward points with every order';
  }
}

// ── Checkout button ───────────────────────────────────────
document.getElementById('checkoutBtn').addEventListener('click', () => {
  if (!Auth.isLoggedIn()) {
    window.location.href = '/pages/login.html';
    return;
  }
  const orderType = document.querySelector('input[name="orderType"]:checked')?.value || 'dine-in';
  sessionStorage.setItem('selectedOrderType', orderType);
  if (appliedPromo) sessionStorage.setItem('promoCode', appliedPromo);
  else sessionStorage.removeItem('promoCode');

  if (requestedRedeemPoints > 0) {
    sessionStorage.setItem('redeemPoints', String(requestedRedeemPoints));
  } else {
    sessionStorage.removeItem('redeemPoints');
  }

  window.location.href = '/pages/checkout.html';
});

// ── Clear cart ────────────────────────────────────────────
document.getElementById('clearCartBtn').addEventListener('click', () => {
  Modal.open('clearModal');
});
document.getElementById('confirmClearBtn').addEventListener('click', () => {
  Cart.clear();
  appliedPromo = null;
  requestedRedeemPoints = 0;
  sessionStorage.removeItem('promoCode');
  sessionStorage.removeItem('redeemPoints');
  Modal.close('clearModal');
  renderCart();
  Toast.info('Cart cleared');
});

// ── Promo code ────────────────────────────────────────────
document.getElementById('applyPromoBtn').addEventListener('click', async () => {
  const code = document.getElementById('promoInput').value.trim().toUpperCase();
  const errEl = document.getElementById('promoError');

  if (!code) {
    errEl.textContent = 'Please enter a promo code.';
    errEl.classList.remove('hidden');
    return;
  }

  if (PROMO_CODES[code]) {
    appliedPromo = code;
    errEl.classList.add('hidden');
    document.getElementById('promoInput').disabled = true;
    document.getElementById('applyPromoBtn').textContent = '✓ Applied';
    document.getElementById('applyPromoBtn').disabled = true;
    await fetchRewardsPreview();
    Toast.success(`Promo "${code}" applied — ${PROMO_CODES[code]}% off!`);
  } else {
    errEl.textContent = 'Invalid promo code. Try CAFE10, FIRST20, or STUDENT5.';
    errEl.classList.remove('hidden');
    appliedPromo = null;
    await fetchRewardsPreview();
  }
});

// ── Points Redemption ─────────────────────────────────────
document.getElementById('applyPointsBtn')?.addEventListener('click', async () => {
  const input = document.getElementById('redeemPointsInput');
  const errEl = document.getElementById('pointsError');
  const rawVal = input ? input.value.trim() : '0';
  const val = parseInt(rawVal, 10);

  if (isNaN(val) || val < 0) {
    if (errEl) {
      errEl.textContent = 'Please enter a valid number of points.';
      errEl.classList.remove('hidden');
    }
    return;
  }

  if (val > userRewardBalance) {
    if (errEl) {
      errEl.textContent = `You only have ${userRewardBalance} points available.`;
      errEl.classList.remove('hidden');
    }
    return;
  }

  requestedRedeemPoints = val;
  sessionStorage.setItem('redeemPoints', String(requestedRedeemPoints));
  if (errEl) errEl.classList.add('hidden');

  await fetchRewardsPreview();

  if (val > 0) {
    Toast.success(`${val} points applied for discount!`);
  } else {
    Toast.info('Points redemption cleared.');
  }
});

// ── Init ──────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const savedRedeem = sessionStorage.getItem('redeemPoints');
  if (savedRedeem) {
    requestedRedeemPoints = parseInt(savedRedeem, 10) || 0;
    const input = document.getElementById('redeemPointsInput');
    if (input && requestedRedeemPoints > 0) input.value = requestedRedeemPoints;
  }

  setTimeout(renderCart, 50);
});
