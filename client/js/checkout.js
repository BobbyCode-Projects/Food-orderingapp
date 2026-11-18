/* ═══════════════════════════════════════════════════════
   checkout.js — Checkout page logic with Rewards Integration
   ═══════════════════════════════════════════════════════ */

let currentRedeemPoints = parseInt(sessionStorage.getItem('redeemPoints')) || 0;
let appliedPromo = sessionStorage.getItem('promoCode') || '';
let userPointsBalance = 0;
let checkoutPreview = null;
let hasAllergyConflicts = false;

// ── Auth guard ────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  if (!Auth.requireAuth('/pages/login.html')) return;
  init();
});

async function init() {
  const items = Cart.getItems();
  if (items.length === 0) {
    document.getElementById('emptyCartGuard').classList.remove('hidden');
    document.getElementById('checkoutBody').classList.add('hidden');
    return;
  }

  // Pre-fill user details
  const user = Auth.getUser();
  if (user) {
    document.getElementById('custName').value  = user.name  || '';
    document.getElementById('custPhone').value = user.phone || '';
  }

  // Restore order type from cart page
  const savedType = sessionStorage.getItem('selectedOrderType') || 'dine-in';
  const radioEl = document.querySelector(`input[name="checkoutOrderType"][value="${savedType}"]`);
  if (radioEl) radioEl.checked = true;
  toggleTableGroup(savedType);

  const pointsInput = document.getElementById('coRedeemPointsInput');
  if (pointsInput && currentRedeemPoints > 0) {
    pointsInput.value = currentRedeemPoints;
  }

  renderCartItemsList();
  checkAllergyConflicts();
  await loadCheckoutPreview();
  attachListeners();
}

// ── Allergy Conflicts Check (Feature 5) ───────────────────
function checkAllergyConflicts() {
  const user = Auth.getUser();
  const userAllergies = (user && Array.isArray(user.allergies)) ? user.allergies : [];
  const items = Cart.getItems();
  const conflictCard = document.getElementById('allergyConflictCard');
  const conflictList = document.getElementById('allergyConflictList');
  const consentCheck = document.getElementById('allergyConsentCheck');
  const placeBtn     = document.getElementById('placeOrderBtn');

  if (!conflictCard || !conflictList) return;

  const conflicts = [];
  items.forEach(i => {
    const matching = (Array.isArray(i.allergens)) ? i.allergens.filter(a => userAllergies.includes(a)) : [];
    if (matching.length > 0) {
      conflicts.push({ name: i.name, allergens: matching });
    }
  });

  if (conflicts.length > 0) {
    hasAllergyConflicts = true;
    conflictCard.classList.remove('hidden');
    conflictList.innerHTML = conflicts.map(c =>
      `<li><strong>${escapeHtml(c.name)}</strong>: Contains <u>${c.allergens.map(escapeHtml).join(', ')}</u></li>`
    ).join('');

    // Require confirmation checkbox before placing order
    if (consentCheck) {
      placeBtn.disabled = !consentCheck.checked;
      consentCheck.addEventListener('change', () => {
        placeBtn.disabled = !consentCheck.checked;
      });
    }
  } else {
    hasAllergyConflicts = false;
    conflictCard.classList.add('hidden');
    if (placeBtn) placeBtn.disabled = false;
  }
}

// ── Render Items in Sidebar ───────────────────────────────
function renderCartItemsList() {
  const items = Cart.getItems();
  document.getElementById('checkoutItemsList').innerHTML =
    items.map(i => `
      <div class="co-item">
        <span class="co-item-name">${escapeHtml(i.name)} ${i.isHealthy ? '<span style="color:#059669;font-size:.7rem">🌱</span>' : ''}</span>
        <span class="co-item-qty">× ${i.quantity}</span>
        <span class="co-item-price">${fmt.currency(i.price * i.quantity)}</span>
      </div>`).join('');
}

// ── Load Server Preview ───────────────────────────────────
async function loadCheckoutPreview() {
  const items = Cart.toOrderItems();
  if (items.length === 0) return;

  try {
    const data = await api.post('/rewards/preview', {
      items,
      redeemPoints: currentRedeemPoints,
      promoCode: appliedPromo || undefined,
    });

    checkoutPreview = data;
    userPointsBalance = data.userPoints || 0;
    applyPreviewToCheckout(data);
  } catch (_) {
    // Fallback calculation if offline
    renderOrderSummaryFallback();
  }
}

function applyPreviewToCheckout(data) {
  const pricing = data.pricing;
  const pEarn   = data.pointsToEarn;

  document.getElementById('coSubtotal').textContent = fmt.currency(pricing.subtotal);
  document.getElementById('coTax').textContent      = fmt.currency(pricing.tax);
  document.getElementById('coTotal').textContent    = fmt.currency(pricing.total);

  // Healthy offer
  const hRow = document.getElementById('coHealthyRow');
  if (hRow) {
    if (pricing.healthyOfferDiscount > 0) {
      hRow.classList.remove('hidden');
      document.getElementById('coHealthyDiscount').textContent = `-${fmt.currency(pricing.healthyOfferDiscount)}`;
    } else {
      hRow.classList.add('hidden');
    }
  }

  // Points discount
  const ptsRow = document.getElementById('coPointsRow');
  if (ptsRow) {
    if (pricing.pointsDiscount > 0) {
      ptsRow.classList.remove('hidden');
      document.getElementById('coPointsDiscount').textContent = `-${fmt.currency(pricing.pointsDiscount)}`;
      const ptsUsed = document.getElementById('coPointsUsed');
      if (ptsUsed) ptsUsed.textContent = pricing.pointsRedeemed;
    } else {
      ptsRow.classList.add('hidden');
    }
  }

  // Promo discount
  const promoRow = document.getElementById('coPromoRow');
  if (promoRow) {
    if (pricing.promoDiscount > 0) {
      promoRow.classList.remove('hidden');
      document.getElementById('coPromoDiscount').textContent = `-${fmt.currency(pricing.promoDiscount)}`;
    } else {
      promoRow.classList.add('hidden');
    }
  }

  // Points to earn note
  const earnText = document.getElementById('coPointsEarnText');
  if (earnText && pEarn) {
    let note = `~${pEarn.minEarn}–${pEarn.maxEarn} pts`;
    if (pEarn.healthyBonus > 0) note += ` (+${pEarn.healthyBonus} healthy bonus)`;
    earnText.textContent = note;
  }

  // User points in card
  const coUserPts = document.getElementById('coUserPoints');
  if (coUserPts) coUserPts.textContent = userPointsBalance;
}

function renderOrderSummaryFallback() {
  const { subtotal, tax, total } = Cart.getTotals();
  document.getElementById('coSubtotal').textContent = fmt.currency(subtotal);
  document.getElementById('coTax').textContent      = fmt.currency(tax);
  document.getElementById('coTotal').textContent    = fmt.currency(total);
}

// ── Attach listeners ──────────────────────────────────────
function attachListeners() {
  // Order type toggle
  document.querySelectorAll('input[name="checkoutOrderType"]').forEach(r => {
    r.addEventListener('change', () => toggleTableGroup(r.value));
  });

  // Payment method toggle
  document.querySelectorAll('input[name="paymentMethod"]').forEach(r => {
    r.addEventListener('change', () => {
      document.getElementById('cardFields').classList.toggle('hidden', r.value !== 'card');
      document.getElementById('upiField').classList.toggle('hidden',   r.value !== 'upi');
    });
  });

  // Card number formatting
  document.getElementById('cardNumber').addEventListener('input', (e) => {
    let v = e.target.value.replace(/\D/g, '').slice(0, 16);
    e.target.value = v.replace(/(.{4})/g, '$1 ').trim();
  });

  // Expiry formatting
  document.getElementById('cardExpiry').addEventListener('input', (e) => {
    let v = e.target.value.replace(/\D/g, '').slice(0, 4);
    if (v.length >= 2) v = v.slice(0, 2) + '/' + v.slice(2);
    e.target.value = v;
  });

  // Points apply button on checkout
  document.getElementById('coApplyPointsBtn')?.addEventListener('click', async () => {
    const input = document.getElementById('coRedeemPointsInput');
    const errEl = document.getElementById('coPointsError');
    const val = parseInt(input ? input.value.trim() : '0', 10);

    if (isNaN(val) || val < 0) {
      if (errEl) { errEl.textContent = 'Enter valid points.'; errEl.classList.remove('hidden'); }
      return;
    }
    if (val > userPointsBalance) {
      if (errEl) { errEl.textContent = `Max balance is ${userPointsBalance} pts.`; errEl.classList.remove('hidden'); }
      return;
    }

    currentRedeemPoints = val;
    sessionStorage.setItem('redeemPoints', String(currentRedeemPoints));
    if (errEl) errEl.classList.add('hidden');
    await loadCheckoutPreview();
    if (val > 0) Toast.success(`${val} points applied!`);
  });

  // Place order
  document.getElementById('placeOrderBtn').addEventListener('click', placeOrder);
}

function toggleTableGroup(orderType) {
  document.getElementById('tableGroup').style.display = orderType === 'dine-in' ? '' : 'none';
}

// ── Validation ────────────────────────────────────────────
function validateCheckout() {
  let valid = true;
  const name = document.getElementById('custName').value.trim();
  const nameErr = document.getElementById('custNameError');
  if (!name || name.length < 2) {
    nameErr.textContent = 'Please enter your full name.';
    nameErr.classList.remove('hidden');
    document.getElementById('custName').classList.add('error');
    valid = false;
  } else {
    nameErr.classList.add('hidden');
    document.getElementById('custName').classList.remove('error');
  }

  const phone = document.getElementById('custPhone').value.trim();
  const phoneErr = document.getElementById('custPhoneError');
  if (!phone || !/^[0-9]{10}$/.test(phone)) {
    phoneErr.textContent = 'Please enter a valid 10-digit phone number.';
    phoneErr.classList.remove('hidden');
    document.getElementById('custPhone').classList.add('error');
    valid = false;
  } else {
    phoneErr.classList.add('hidden');
    document.getElementById('custPhone').classList.remove('error');
  }

  const method = document.querySelector('input[name="paymentMethod"]:checked')?.value;
  const payErr = document.getElementById('paymentError');
  if (!method) {
    payErr.textContent = 'Please select a payment method.';
    payErr.classList.remove('hidden');
    valid = false;
  } else {
    payErr.classList.add('hidden');
    if (method === 'card') {
      const cardNum = document.getElementById('cardNumber').value.replace(/\s/g, '');
      const expiry  = document.getElementById('cardExpiry').value;
      const cvv     = document.getElementById('cardCvv').value;
      if (cardNum.length !== 16 || !/^\d+$/.test(cardNum)) {
        payErr.textContent = 'Please enter a valid 16-digit card number.';
        payErr.classList.remove('hidden');
        valid = false;
      } else if (!/^\d{2}\/\d{2}$/.test(expiry)) {
        payErr.textContent = 'Please enter a valid expiry date (MM/YY).';
        payErr.classList.remove('hidden');
        valid = false;
      } else if (!/^\d{3}$/.test(cvv)) {
        payErr.textContent = 'Please enter a valid 3-digit CVV.';
        payErr.classList.remove('hidden');
        valid = false;
      }
    }
    if (method === 'upi') {
      const upiId = document.getElementById('upiId').value.trim();
      if (!upiId || !upiId.includes('@')) {
        payErr.textContent = 'Please enter a valid UPI ID (e.g. name@upi).';
        payErr.classList.remove('hidden');
        valid = false;
      }
    }
  }

  // Allergy consent validation
  if (hasAllergyConflicts) {
    const consentCheck = document.getElementById('allergyConsentCheck');
    if (!consentCheck || !consentCheck.checked) {
      const alertEl = document.getElementById('placeOrderAlert');
      if (alertEl) {
        alertEl.innerHTML = '<div class="alert alert-error">Please confirm that you understand the allergy risks before placing the order.</div>';
        alertEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
      valid = false;
    }
  }

  return valid;
}

// ── Place order flow ──────────────────────────────────────
async function placeOrder() {
  if (!validateCheckout()) return;

  const btn = document.getElementById('placeOrderBtn');
  const alertEl = document.getElementById('placeOrderAlert');
  alertEl.innerHTML = '';

  const customerName   = document.getElementById('custName').value.trim();
  const customerPhone  = document.getElementById('custPhone').value.trim();
  const orderType      = document.querySelector('input[name="checkoutOrderType"]:checked')?.value;
  const tableNumber    = document.getElementById('tableNumber').value.trim();
  const specialInstructions = document.getElementById('specialInstructions').value.trim();
  const paymentMethod  = document.querySelector('input[name="paymentMethod"]:checked')?.value;
  const items          = Cart.toOrderItems();

  setLoading(btn, true);
  const overlay = document.getElementById('processingOverlay');
  overlay.classList.remove('hidden');
  document.getElementById('processingTitle').textContent = 'Placing your order…';
  document.getElementById('processingText').textContent  = 'Please wait, do not close this page.';

  try {
    // 1. Create order on server with validated points and promo
    const orderRes = await api.post('/orders', {
      customerName,
      customerPhone,
      items,
      orderType,
      tableNumber: tableNumber || undefined,
      specialInstructions: specialInstructions || undefined,
      redeemPoints: currentRedeemPoints > 0 ? currentRedeemPoints : undefined,
      promoCode: appliedPromo || undefined,
    });
    const order = orderRes.order;

    // 2. Process payment
    document.getElementById('processingTitle').textContent = 'Processing payment…';
    let payRes;
    try {
      payRes = await api.post('/payments', {
        orderId: order._id,
        method: paymentMethod,
      });
    } catch (payErr) {
      // Payment request returned non-2xx
      overlay.classList.add('hidden');
      setLoading(btn, false);
      const pointsMsg = order.pricing?.pointsRedeemed > 0
        ? ' Any redeemed points have been refunded to your account.'
        : '';
      alertEl.innerHTML = `<div class="alert alert-error">Payment failed: ${payErr.message || 'Transaction could not be completed.'}${pointsMsg}</div>`;
      alertEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return;
    }

    overlay.classList.add('hidden');

    if (payRes.success) {
      Cart.clear();
      sessionStorage.removeItem('selectedOrderType');
      sessionStorage.removeItem('promoCode');
      sessionStorage.removeItem('redeemPoints');
      sessionStorage.setItem('lastOrderNumber', order.orderNumber);

      showConfirmation(order, payRes.payment, payRes.receipt, payRes.pointsEarned, orderRes.allergyConflicts);
    } else {
      setLoading(btn, false);
      const pointsMsg = (payRes.pointsRefunded || 0) > 0
        ? ` ${payRes.pointsRefunded} redeemed points have been refunded to your balance.`
        : '';
      alertEl.innerHTML = `<div class="alert alert-error">${payRes.message || 'Payment failed.'}${pointsMsg}</div>`;
    }

  } catch (err) {
    overlay.classList.add('hidden');
    setLoading(btn, false);
    const msg = err.message || 'Something went wrong. Please try again.';
    alertEl.innerHTML = `<div class="alert alert-error">${msg}</div>`;
    alertEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

// ── Show confirmation modal ───────────────────────────────
function showConfirmation(order, payment, receipt, pointsEarned, allergyConflicts) {
  const estimatedTime = order.estimatedReadyTime
    ? fmt.time(order.estimatedReadyTime)
    : '15–20 min';

  const earned = pointsEarned || receipt?.pointsEarned || order.pointsEarned || 0;
  const redeemed = order.pricing?.pointsRedeemed || receipt?.pointsRedeemed || 0;

  const allergyNote = Array.isArray(allergyConflicts) && allergyConflicts.length > 0
    ? `<div class="alert alert-warning" style="margin-top:.75rem;background:#fef2f2;border:1px solid #fecaca;color:#991b1b;font-size:.85rem">
        ⚠️ <strong>Allergy Advisory Recorded:</strong> Confirmed for ${allergyConflicts.map(c => `<strong>${escapeHtml(c.name)}</strong> (${c.conflictingAllergens.join(', ')})`).join(', ')}.
      </div>`
    : '';

  document.getElementById('confirmBody').innerHTML = `
    <div class="order-number-display">
      <div class="label">Order Number</div>
      <div class="number">${order.orderNumber}</div>
    </div>
    <div class="confirm-receipt">
      <div class="receipt-row"><span>Status</span>${statusBadge('Received')}</div>
      <div class="receipt-row"><span>Order Type</span><span>${order.orderType === 'dine-in' ? '🍽️ Dine-in' : '🥡 Pickup'}</span></div>
      <div class="receipt-row"><span>Est. Ready</span><span>⏱ ${estimatedTime}</span></div>
      <div class="receipt-row"><span>Amount Paid</span><span>${fmt.currency(receipt?.amount || payment.amount)}</span></div>
      <div class="receipt-row"><span>Payment</span><span>${payment.method?.toUpperCase()}</span></div>
      ${redeemed > 0 ? `<div class="receipt-row"><span>Points Redeemed</span><span style="color:var(--primary);font-weight:700">-${redeemed} pts</span></div>` : ''}
      <div class="receipt-row"><span>Points Earned</span><span style="color:#059669;font-weight:700">+${earned} pts ⭐</span></div>
      <div class="receipt-row"><span>Transaction ID</span><span style="font-size:.8rem">${payment.transactionId}</span></div>
    </div>
    ${allergyNote}
    <div class="alert alert-success" style="margin-top:.75rem">
      <span>🎉</span>
      <span>Show your order number at the counter when collecting your food. You earned <strong>+${earned} points</strong>!</span>
    </div>`;

  document.getElementById('trackOrderBtn').href =
    `/pages/track.html?order=${order.orderNumber}`;

  Modal.open('confirmModal');
}
