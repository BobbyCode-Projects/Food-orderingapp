/* ═══════════════════════════════════════════════════════
   cart.js — Cart state (localStorage, per user session)
   ═══════════════════════════════════════════════════════ */

const Cart = (() => {
  const KEY = 'cart_items';
  const TAX_RATE = 0.05;

  const load = () => {
    try { return JSON.parse(localStorage.getItem(KEY)) || []; }
    catch { return []; }
  };

  const save = (items) => {
    localStorage.setItem(KEY, JSON.stringify(items));
    _updateBadge();
  };

  const getItems = () => load();

  const getCount = () => load().reduce((s, i) => s + i.quantity, 0);

  const add = (item, qty = 1) => {
    const items = load();
    const idx = items.findIndex(i => i._id === item._id);
    if (idx >= 0) {
      items[idx].quantity = Math.min(items[idx].quantity + qty, 20);
      if (item.allergens) items[idx].allergens = item.allergens;
      if (item.isHealthy !== undefined) items[idx].isHealthy = item.isHealthy;
    } else {
      items.push({
        _id: item._id,
        name: item.name,
        price: item.price,
        image: item.image,
        category: item.category,
        allergens: Array.isArray(item.allergens) ? item.allergens : [],
        isHealthy: item.isHealthy || false,
        quantity: qty
      });
    }
    save(items);
    Toast.success(`${item.name} added to cart`);
  };

  const remove = (itemId) => {
    save(load().filter(i => i._id !== itemId));
  };

  const updateQty = (itemId, qty) => {
    if (qty < 1) return remove(itemId);
    const items = load();
    const idx = items.findIndex(i => i._id === itemId);
    if (idx >= 0) { items[idx].quantity = Math.min(qty, 20); save(items); }
  };

  const clear = () => {
    localStorage.removeItem(KEY);
    _updateBadge();
  };

  const getTotals = () => {
    const items = load();
    const subtotal = +items.reduce((s, i) => s + i.price * i.quantity, 0).toFixed(2);
    const tax      = +(subtotal * TAX_RATE).toFixed(2);
    const total    = +(subtotal + tax).toFixed(2);
    return { subtotal, tax, total, count: items.reduce((s, i) => s + i.quantity, 0) };
  };

  const toOrderItems = () =>
    load().map(i => ({ menuItem: i._id, quantity: i.quantity }));

  const _updateBadge = () => {
    const badges = document.querySelectorAll('.cart-badge');
    const count  = getCount();
    badges.forEach(b => { b.textContent = count; b.style.display = count ? '' : 'none'; });
  };

  // Update badge on DOMContentLoaded
  document.addEventListener('DOMContentLoaded', _updateBadge);

  return { getItems, getCount, add, remove, updateQty, clear, getTotals, toOrderItems };
})();

window.Cart = Cart;
