/* ═══════════════════════════════════════════════════════
   menu.js — Menu page logic with Recommendations, Compare & Allergy Alerts
   ═══════════════════════════════════════════════════════ */

// Category emoji map
const CAT_EMOJI = {
  Breakfast: '🌅', Lunch: '🍱', Snacks: '🍟',
  Beverages: '☕', Desserts: '🍰', Specials: '⭐',
  'Healthy Indian': '🥗',
};
const DEFAULT_EMOJI = '🍽️';

// ── State ─────────────────────────────────────────────────
let allItems       = [];
let filtered       = [];
let activeCategory = '';
let activeSearch   = '';
let vegOnly        = false;
let availOnly      = true;
let sortBy         = 'default';
let modalItem      = null;
let modalQty       = 1;
let compareItems   = []; // In-memory selection (max 3 items)
let recommendations = [];

// ── DOM refs ──────────────────────────────────────────────
const menuGrid      = document.getElementById('menuGrid');
const resultCount   = document.getElementById('resultCount');
const emptyState    = document.getElementById('emptyState');
const activeFilters = document.getElementById('activeFilters');
const floatingCart  = document.getElementById('floatingCart');
const compareBar    = document.getElementById('compareBar');
const compareCount  = document.getElementById('compareCount');
const compareChips  = document.getElementById('compareChips');
const openCompareBtn= document.getElementById('openCompareBtn');
const clearCompareBtn= document.getElementById('clearCompareBtn');

// ── Fetch menu ────────────────────────────────────────────
async function loadMenu() {
  try {
    const data = await api.get('/menu?available=true');
    allItems = data.items || [];
    applyFilters();
    loadRecommendations();
  } catch (err) {
    menuGrid.innerHTML = `<div class="alert alert-error" style="grid-column:1/-1">Failed to load menu. Please refresh.</div>`;
  }
}

// ── Feature 2: Personalised Recommendations by Age ────────
async function loadRecommendations() {
  const recsSection = document.getElementById('recommendationsSection');
  const recsGridEl  = document.getElementById('recsGrid') || document.getElementById('recsCarousel');
  const recsAgeBadge = document.getElementById('recsAgeBadge');
  if (!recsSection || !recsGridEl) return;

  if (!Auth.isLoggedIn()) {
    recsSection.classList.add('hidden');
    return;
  }

  try {
    const data = await api.get('/menu/recommendations');
    recommendations = data.recommendations || [];
    if (recommendations.length === 0) {
      recsSection.classList.add('hidden');
      return;
    }

    if (recsAgeBadge && data.ageGroup) {
      recsAgeBadge.textContent = data.ageGroup;
      recsAgeBadge.className = `recs-age-badge badge-age ${data.ageGroup}`;
    }

    recsGridEl.innerHTML = recommendations.slice(0, 8).map(recCard).join('');
    recsSection.classList.remove('hidden');

    // Attach listeners on recommendation cards
    recsGridEl.querySelectorAll('.add-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        const item = recommendations.find(i => i._id === id) || allItems.find(i => i._id === id);
        if (item) {
          if (!confirmAllergyIfNeeded(item)) return;
          Cart.add(item, 1);
          updateFloatingCart();
          btn.textContent = '✓';
          btn.style.background = 'var(--accent)';
          setTimeout(() => { btn.textContent = '+'; btn.style.background = ''; }, 1000);
        }
      });
    });

    recsGridEl.querySelectorAll('.compare-card-cb').forEach(cb => {
      cb.addEventListener('change', (e) => {
        e.stopPropagation();
        const id = cb.dataset.id;
        const item = recommendations.find(i => i._id === id) || allItems.find(i => i._id === id);
        if (!item) return;
        handleCompareToggle(item, cb);
      });
    });

    recsGridEl.querySelectorAll('.rec-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('.add-btn') || e.target.closest('.food-card-compare-label')) return;
        const id = card.dataset.id;
        const item = recommendations.find(i => i._id === id) || allItems.find(i => i._id === id);
        if (item) openItemModal(item);
      });
    });

  } catch (err) {
    recsSection.classList.add('hidden');
  }
}

function recCard(item) {
  const emoji = CAT_EMOJI[item.category] || DEFAULT_EMOJI;
  const isCompared = compareItems.some(i => i._id === item._id);
  const user = Auth.getUser();
  const userAllergies = (user && Array.isArray(user.allergies)) ? user.allergies : [];
  const conflicts = (Array.isArray(item.allergens)) ? item.allergens.filter(a => userAllergies.includes(a)) : [];

  return `
    <div class="rec-card" data-id="${item._id}">
      <div class="rec-card-top">
        <div class="rec-card-img">
          ${item.image && item.image !== '/images/default-food.png'
            ? `<img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}" loading="lazy" onerror="this.onerror=null;this.src='/images/default-food.png'" />`
            : `<span>${emoji}</span>`}
        </div>
        <div class="rec-card-info">
          <div class="rec-card-name" title="${escapeHtml(item.name)}">${escapeHtml(item.name)} ${vegDot(item.isVeg)}</div>
          <div class="rec-card-category">${escapeHtml(item.category)}</div>
        </div>
      </div>
      ${conflicts.length > 0 ? `<div class="card-allergy-badge">⚠️ Contains: ${conflicts.map(escapeHtml).join(', ')}</div>` : ''}
      ${item.reason ? `<div class="rec-reason" title="${escapeHtml(item.reason)}">💡 ${escapeHtml(item.reason)}</div>` : ''}
      <div class="rec-card-bottom">
        <span class="rec-card-price">${fmt.currency(item.price)}</span>
        <div class="rec-card-actions">
          <label class="food-card-compare-label" onclick="event.stopPropagation()">
            <input type="checkbox" class="compare-card-cb" data-id="${item._id}" ${isCompared ? 'checked' : ''} />
            <span>Compare</span>
          </label>
          <button class="add-btn add-btn-sm" data-id="${item._id}" title="Add to cart">+</button>
        </div>
      </div>
    </div>`;
}

// ── Feature 5: Allergy Alert Helper ───────────────────────
function confirmAllergyIfNeeded(item) {
  const user = Auth.getUser();
  const userAllergies = (user && Array.isArray(user.allergies)) ? user.allergies : [];
  const conflicts = (Array.isArray(item.allergens)) ? item.allergens.filter(a => userAllergies.includes(a)) : [];

  if (conflicts.length > 0) {
    return confirm(`⚠️ Allergy Warning: "${item.name}" contains ${conflicts.join(', ')}, which you have marked in your allergy preferences.\n\nDo you want to add this item to your cart anyway?`);
  }
  return true;
}

// ── Feature 4: Smart Food Comparison Logic ────────────────
function handleCompareToggle(item, checkboxEl) {
  const exists = compareItems.some(i => i._id === item._id);

  if (checkboxEl && checkboxEl.checked) {
    if (!exists) {
      if (compareItems.length >= 3) {
        checkboxEl.checked = false;
        Toast.error('You can compare a maximum of 3 items at a time.');
        return;
      }
      compareItems.push(item);
    }
  } else {
    compareItems = compareItems.filter(i => i._id !== item._id);
  }

  updateCompareUI();
}

function updateCompareUI() {
  if (compareCount) compareCount.textContent = compareItems.length;

  if (compareItems.length > 0) {
    compareBar.classList.remove('hidden');
    openCompareBtn.disabled = false;
    openCompareBtn.textContent = `Compare (${compareItems.length}) →`;
  } else {
    compareBar.classList.add('hidden');
  }

  // Update compare chips
  if (compareChips) {
    compareChips.innerHTML = compareItems.map(item => `
      <span class="compare-chip">
        ${escapeHtml(item.name.length > 16 ? item.name.slice(0, 14) + '…' : item.name)}
        <span class="compare-chip-remove" data-id="${item._id}">✕</span>
      </span>
    `).join('');

    compareChips.querySelectorAll('.compare-chip-remove').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = el.dataset.id;
        compareItems = compareItems.filter(i => i._id !== id);
        updateCompareUI();
      });
    });
  }

  // Sync checkboxes across the document
  document.querySelectorAll('.compare-card-cb').forEach(cb => {
    cb.checked = compareItems.some(i => i._id === cb.dataset.id);
  });

  // Sync modal compare button
  const modalCompBtn = document.getElementById('modalCompareBtn');
  if (modalCompBtn && modalItem) {
    const isCompared = compareItems.some(i => i._id === modalItem._id);
    modalCompBtn.textContent = isCompared ? '✓ Comparing' : '⚖️ Compare';
    modalCompBtn.className = isCompared ? 'btn btn-primary' : 'btn btn-outline';
  }
}

function clearComparison() {
  compareItems = [];
  updateCompareUI();
}

if (clearCompareBtn) clearCompareBtn.addEventListener('click', clearComparison);
const modalClearBtn = document.getElementById('compareModalClearBtn');
if (modalClearBtn) modalClearBtn.addEventListener('click', () => {
  clearComparison();
  Modal.close('compareModal');
});

if (openCompareBtn) {
  openCompareBtn.addEventListener('click', openCompareModal);
}

// Build side-by-side table & dynamic summary line
function openCompareModal() {
  if (compareItems.length === 0) {
    Toast.info('Please select at least one item to compare.');
    return;
  }

  const tableWrapper = document.getElementById('compareTableWrapper');
  const summaryText  = document.getElementById('compareSummaryText');

  // Summary line generator
  summaryText.innerHTML = buildCompareSummary(compareItems);

  // Table rendering with Best-Value Highlights
  tableWrapper.innerHTML = renderCompareTable(compareItems);

  Modal.open('compareModal');
}

function buildCompareSummary(items) {
  if (items.length < 2) {
    return `Showing nutrition facts for <strong>${escapeHtml(items[0].name)}</strong>. Add 1 or 2 more dishes to view side-by-side comparison.`;
  }

  const summaries = [];

  // Protein (highest is best)
  const proteins = items.map(i => i.nutrition?.protein || 0);
  const maxProtein = Math.max(...proteins);
  const minProtein = Math.min(...proteins);
  if (maxProtein > 0 && maxProtein > minProtein) {
    const highestP = items.filter(i => (i.nutrition?.protein || 0) === maxProtein);
    if (highestP.length === 1) {
      summaries.push(`<strong>${escapeHtml(highestP[0].name)}</strong> has more protein (${maxProtein}g)`);
    }
  }

  // Calories (lowest is best)
  const cals = items.map(i => i.nutrition?.calories || 0);
  const minCal = Math.min(...cals);
  const maxCal = Math.max(...cals);
  if (minCal > 0 && minCal < maxCal) {
    const lowestCal = items.filter(i => (i.nutrition?.calories || 0) === minCal);
    if (lowestCal.length === 1) {
      summaries.push(`<strong>${escapeHtml(lowestCal[0].name)}</strong> has fewer calories (${minCal} kcal)`);
    }
  }

  // Sugar (lowest is best)
  const sugars = items.map(i => i.nutrition?.sugar || 0);
  const minSugar = Math.min(...sugars);
  const maxSugar = Math.max(...sugars);
  if (minSugar < maxSugar) {
    const lowestSugar = items.filter(i => (i.nutrition?.sugar || 0) === minSugar);
    if (lowestSugar.length === 1) {
      summaries.push(`<strong>${escapeHtml(lowestSugar[0].name)}</strong> has less sugar (${minSugar}g)`);
    }
  }

  // Fat (lowest is best)
  const fats = items.map(i => i.nutrition?.fat || 0);
  const minFat = Math.min(...fats);
  const maxFat = Math.max(...fats);
  if (minFat < maxFat) {
    const lowestFat = items.filter(i => (i.nutrition?.fat || 0) === minFat);
    if (lowestFat.length === 1 && !summaries.some(s => s.includes(lowestFat[0].name))) {
      summaries.push(`<strong>${escapeHtml(lowestFat[0].name)}</strong> has lower fat (${minFat}g)`);
    }
  }

  // Healthy certification
  const healthyItems = items.filter(i => i.isHealthy);
  if (healthyItems.length > 0 && healthyItems.length < items.length) {
    summaries.push(`${healthyItems.map(i => `<strong>${escapeHtml(i.name)}</strong>`).join(' & ')} is certified Healthy Choice 🌱`);
  }

  if (summaries.length === 0) {
    return 'These items provide balanced, comparable nutritional values.';
  }

  if (summaries.length === 1) return summaries[0] + '.';
  if (summaries.length === 2) return `${summaries[0]}, while ${summaries[1]}.`;
  return `${summaries.slice(0, -1).join(', ')}, and ${summaries[summaries.length - 1]}.`;
}

function renderCompareTable(items) {
  // Metric configurations
  // dir: 'min' -> lowest is best, 'max' -> highest is best, null -> no highlight
  const metrics = [
    { label: 'Price', unit: '₹', fn: i => i.price, dir: 'min', fmt: v => fmt.currency(v) },
    { label: 'Serving Size', unit: '', fn: i => i.nutrition?.servingSize || '—', dir: null, fmt: v => escapeHtml(String(v)) },
    { label: 'Calories', unit: ' kcal', fn: i => i.nutrition?.calories ?? 0, dir: 'min', fmt: v => `${v} kcal` },
    { label: 'Protein', unit: 'g', fn: i => i.nutrition?.protein ?? 0, dir: 'max', fmt: v => `${v}g` },
    { label: 'Carbs', unit: 'g', fn: i => i.nutrition?.carbs ?? 0, dir: null, fmt: v => `${v}g` },
    { label: 'Total Fat', unit: 'g', fn: i => i.nutrition?.fat ?? 0, dir: 'min', fmt: v => `${v}g` },
    { label: 'Sugar', unit: 'g', fn: i => i.nutrition?.sugar ?? 0, dir: 'min', fmt: v => `${v}g` },
    { label: 'Fiber', unit: 'g', fn: i => i.nutrition?.fiber ?? 0, dir: 'max', fmt: v => `${v}g` },
    { label: 'Sodium', unit: 'mg', fn: i => i.nutrition?.sodium ?? 0, dir: 'min', fmt: v => `${v}mg` },
    { label: 'Healthy Choice', unit: '', fn: i => i.isHealthy ? '🌱 Yes' : 'No', dir: null, fmt: v => v }
  ];

  let headHtml = `
    <thead>
      <tr>
        <th class="compare-metric-name">Nutritional Fact</th>
        ${items.map(item => {
          const emoji = CAT_EMOJI[item.category] || DEFAULT_EMOJI;
          return `
            <th>
              <div class="compare-col-head">
                <div class="compare-col-img">
                  ${item.image && item.image !== '/images/default-food.png'
                    ? `<img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}" onerror="this.onerror=null;this.src='/images/default-food.png'" />`
                    : `<span>${emoji}</span>`}
                </div>
                <div class="compare-col-name">${escapeHtml(item.name)} ${vegDot(item.isVeg)}</div>
                <div style="font-size:.72rem;color:var(--text-muted)">${escapeHtml(item.category)}</div>
              </div>
            </th>`;
        }).join('')}
      </tr>
    </thead>`;

  let bodyHtml = '<tbody>';

  metrics.forEach(m => {
    const rawValues = items.map(m.fn);
    let bestVal = null;

    if (m.dir && items.length >= 2) {
      const numVals = rawValues.map(v => Number(v)).filter(v => !isNaN(v));
      if (numVals.length === items.length) {
        const min = Math.min(...numVals);
        const max = Math.max(...numVals);
        if (min !== max) {
          bestVal = m.dir === 'min' ? min : max;
        }
      }
    }

    bodyHtml += `
      <tr>
        <td class="compare-metric-name">${m.label}</td>
        ${items.map(item => {
          const raw = m.fn(item);
          const isBest = bestVal !== null && Number(raw) === bestVal;
          const formatted = m.fmt(raw);
          return `
            <td class="${isBest ? 'best-val' : ''}">
              ${formatted}
              ${isBest ? '<span class="best-badge">Best</span>' : ''}
            </td>`;
        }).join('')}
      </tr>`;
  });

  bodyHtml += '</tbody>';

  return `<table class="compare-table">${headHtml}${bodyHtml}</table>`;
}

// ── Filter + Sort ─────────────────────────────────────────
function applyFilters() {
  filtered = allItems.filter(item => {
    if (activeCategory && item.category !== activeCategory) return false;
    if (vegOnly && !item.isVeg) return false;
    if (availOnly && !item.isAvailable) return false;
    if (activeSearch) {
      const q = activeSearch.toLowerCase();
      if (!item.name.toLowerCase().includes(q) &&
          !(item.description || '').toLowerCase().includes(q) &&
          !item.category.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  // Sort
  switch (sortBy) {
    case 'price-asc':  filtered.sort((a, b) => a.price - b.price); break;
    case 'price-desc': filtered.sort((a, b) => b.price - a.price); break;
    case 'name-asc':   filtered.sort((a, b) => a.name.localeCompare(b.name)); break;
    case 'rating':     filtered.sort((a, b) => (b.ratings?.average || 0) - (a.ratings?.average || 0)); break;
    default: break;
  }

  renderGrid();
  renderActiveFilters();
  updateFloatingCart();
}

// ── Render grid ───────────────────────────────────────────
function renderGrid() {
  resultCount.textContent = `${filtered.length} item${filtered.length !== 1 ? 's' : ''}`;

  if (filtered.length === 0) {
    menuGrid.innerHTML = '';
    emptyState.classList.remove('hidden');
    return;
  }
  emptyState.classList.add('hidden');

  // Group by category if no category filter applied
  if (!activeCategory && !activeSearch) {
    const groups = {};
    filtered.forEach(item => {
      if (!groups[item.category]) groups[item.category] = [];
      groups[item.category].push(item);
    });

    let html = '';
    for (const [cat, items] of Object.entries(groups)) {
      html += `
        <div class="category-group" style="grid-column:1/-1">
          <h2 class="category-group-title">
            <span>${CAT_EMOJI[cat] || DEFAULT_EMOJI}</span> ${cat}
          </h2>
        </div>
        ${items.map(foodCard).join('')}
      `;
    }
    menuGrid.innerHTML = html;
  } else {
    menuGrid.innerHTML = filtered.map(foodCard).join('');
  }

  // Attach add-to-cart listeners
  menuGrid.querySelectorAll('.add-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      const item = allItems.find(i => i._id === id);
      if (item) {
        if (!confirmAllergyIfNeeded(item)) return;
        Cart.add(item, 1);
        updateFloatingCart();
        btn.textContent = '✓';
        btn.style.background = 'var(--accent)';
        setTimeout(() => { btn.textContent = '+'; btn.style.background = ''; }, 1000);
      }
    });
  });

  // Attach info button listeners
  menuGrid.querySelectorAll('.btn-card-info').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.info;
      openItemModal(allItems.find(i => i._id === id));
    });
  });

  // Attach compare checkbox listeners
  menuGrid.querySelectorAll('.compare-card-cb').forEach(cb => {
    cb.addEventListener('change', (e) => {
      e.stopPropagation();
      const id = cb.dataset.id;
      const item = allItems.find(i => i._id === id);
      if (!item) return;
      handleCompareToggle(item, cb);
    });
  });

  // Attach card click for modal
  menuGrid.querySelectorAll('.food-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.add-btn') || e.target.closest('.food-card-compare-label')) return;
      const id = card.dataset.id;
      openItemModal(allItems.find(i => i._id === id));
    });
  });
}

// ── Nutrition helper ─────────────────────────────────────
function hasNutrition(n) {
  if (!n || typeof n !== 'object') return false;
  return Boolean(
    (n.servingSize && String(n.servingSize).trim() !== '') ||
    (n.calories !== undefined && n.calories !== null && Number(n.calories) > 0) ||
    (n.protein !== undefined && n.protein !== null && Number(n.protein) > 0) ||
    (n.carbs !== undefined && n.carbs !== null && Number(n.carbs) > 0) ||
    (n.sugar !== undefined && n.sugar !== null && Number(n.sugar) > 0) ||
    (n.fat !== undefined && n.fat !== null && Number(n.fat) > 0) ||
    (n.saturatedFat !== undefined && n.saturatedFat !== null && Number(n.saturatedFat) > 0) ||
    (n.fiber !== undefined && n.fiber !== null && Number(n.fiber) > 0) ||
    (n.sodium !== undefined && n.sodium !== null && Number(n.sodium) > 0)
  );
}

// ── Modal popup renderers ─────────────────────────────────
function renderModalNutrition(n) {
  if (!hasNutrition(n)) {
    return `
      <div class="modal-nutrition-empty">
        <span class="nutrition-na">Nutrition info not available</span>
      </div>`;
  }

  const calories = n.calories !== undefined && n.calories !== null ? Number(n.calories) : 0;
  const protein = n.protein !== undefined && n.protein !== null ? Number(n.protein) : 0;
  const carbs = n.carbs !== undefined && n.carbs !== null ? Number(n.carbs) : 0;
  const fat = n.fat !== undefined && n.fat !== null ? Number(n.fat) : 0;
  const saturatedFat = n.saturatedFat !== undefined && n.saturatedFat !== null ? Number(n.saturatedFat) : 0;
  const sugar = n.sugar !== undefined && n.sugar !== null ? Number(n.sugar) : 0;
  const fiber = n.fiber !== undefined && n.fiber !== null ? Number(n.fiber) : 0;
  const sodium = n.sodium !== undefined && n.sodium !== null ? Number(n.sodium) : 0;
  const serving = n.servingSize ? escapeHtml(n.servingSize) : '';

  return `
    <div class="modal-nutrition-card">
      <div class="modal-nutrition-header">
        <div class="modal-cal-pill">🔥 <strong>${calories}</strong> kcal</div>
        ${serving ? `<div class="modal-serving-pill">Serving: <strong>${serving}</strong></div>` : ''}
      </div>
      <div class="modal-nutri-grid">
        <div class="modal-nutri-item"><span class="mni-label">Protein</span><span class="mni-val">${protein}g</span></div>
        <div class="modal-nutri-item"><span class="mni-label">Carbs</span><span class="mni-val">${carbs}g</span></div>
        <div class="modal-nutri-item"><span class="mni-label">Fat</span><span class="mni-val">${fat}g</span></div>
        <div class="modal-nutri-item"><span class="mni-label">Sat. Fat</span><span class="mni-val">${saturatedFat}g</span></div>
        <div class="modal-nutri-item"><span class="mni-label">Sugar</span><span class="mni-val">${sugar}g</span></div>
        <div class="modal-nutri-item"><span class="mni-label">Fiber</span><span class="mni-val">${fiber}g</span></div>
        <div class="modal-nutri-item"><span class="mni-label">Sodium</span><span class="mni-val">${sodium}mg</span></div>
      </div>
    </div>`;
}

function renderModalIngredients(ingredients) {
  if (!Array.isArray(ingredients) || ingredients.length === 0) return '';
  return `
    <div class="modal-ingredients-section">
      <h4 class="modal-section-title">🥘 Ingredients</h4>
      <p class="modal-ingredients-text">${ingredients.map(i => escapeHtml(i)).join(', ')}</p>
    </div>`;
}

function renderModalAllergens(allergens) {
  const user = Auth.getUser();
  const userAllergies = (user && Array.isArray(user.allergies)) ? user.allergies : [];
  const conflicts = (Array.isArray(allergens)) ? allergens.filter(a => userAllergies.includes(a)) : [];

  if (!Array.isArray(allergens) || allergens.length === 0) {
    return `
      <div class="modal-allergens-section safe">
        <span class="allergen-safe-icon">✅</span>
        <span class="allergen-safe-text">No common allergens declared</span>
      </div>`;
  }

  if (conflicts.length > 0) {
    return `
      <div class="modal-allergens-section allergy-conflict">
        <span class="allergen-warn-icon">⚠️</span>
        <div class="allergen-warn-body">
          <strong>Allergy Alert:</strong> Contains <u>${conflicts.map(escapeHtml).join(', ')}</u> which matches your profile allergy!
          <div class="allergen-pills" style="margin-top:.45rem">
            ${allergens.map(a => `<span class="allergen-pill ${userAllergies.includes(a) ? 'conflict' : ''}">${escapeHtml(a)}</span>`).join('')}
          </div>
        </div>
      </div>`;
  }

  return `
    <div class="modal-allergens-section warning">
      <span class="allergen-warn-icon">⚠️</span>
      <div class="allergen-warn-body">
        <strong>Contains Allergens:</strong>
        <div class="allergen-pills">
          ${allergens.map(a => `<span class="allergen-pill">${escapeHtml(a)}</span>`).join('')}
        </div>
      </div>
    </div>`;
}

function renderModalHealthTags(tags) {
  if (!Array.isArray(tags) || tags.length === 0) return '';
  return `
    <div class="modal-healthtags-section">
      <div class="health-tags-list">
        ${tags.map(t => `<span class="health-tag-pill">#${escapeHtml(t)}</span>`).join('')}
      </div>
    </div>`;
}

// ── Food card HTML ────────────────────────────────────────
function foodCard(item) {
  const emoji   = CAT_EMOJI[item.category] || DEFAULT_EMOJI;
  const stars   = renderStars(item.ratings?.average || 0, item.ratings?.count || 0);
  const unavail = !item.isAvailable;
  const safeName = escapeHtml(item.name);
  const safeDesc = item.description ? escapeHtml(item.description) : '';
  const safeCategory = escapeHtml(item.category);

  // Calorie badge on the card
  const calBadge = (hasNutrition(item.nutrition) && item.nutrition.calories !== undefined && item.nutrition.calories !== null)
    ? `<span class="card-cal-badge">🔥 ${item.nutrition.calories} kcal</span>`
    : `<span class="card-cal-badge empty" title="Nutrition info not available">No nutrition info</span>`;

  // Allergy warning badge
  const user = Auth.getUser();
  const userAllergies = (user && Array.isArray(user.allergies)) ? user.allergies : [];
  const conflicts = (Array.isArray(item.allergens)) ? item.allergens.filter(a => userAllergies.includes(a)) : [];
  const allergyWarningBadge = conflicts.length > 0
    ? `<div class="card-allergy-badge">⚠️ Contains: ${conflicts.map(escapeHtml).join(', ')}</div>`
    : '';

  const isCompared = compareItems.some(i => i._id === item._id);

  return `
    <div class="food-card ${unavail ? 'unavailable' : ''}" data-id="${item._id}">
      <div class="food-card-image">
        ${item.image && item.image !== '/images/default-food.png'
          ? `<img src="${escapeHtml(item.image)}" alt="${safeName}" loading="lazy" onerror="this.onerror=null;this.src='/images/default-food.png'" />`
          : `<span>${emoji}</span>`}
        ${unavail ? '<span class="unavail-badge">Unavailable</span>' : ''}
        <span class="food-card-category">${safeCategory}</span>
        ${calBadge}
      </div>
      <div class="food-card-body">
        <div class="food-card-top">
          <span class="food-card-name">${safeName}</span>
          ${vegDot(item.isVeg)}
        </div>
        ${allergyWarningBadge}
        ${safeDesc ? `<p class="food-card-desc">${safeDesc}</p>` : ''}
        ${item.isHealthy ? `<div class="food-card-healthy"><span class="badge-healthy">🌱 Healthy Choice</span></div>` : ''}
        <div class="food-card-footer">
          <div class="food-card-row1">
            <div class="food-card-price">${fmt.currency(item.price)}</div>
            <div class="food-card-meta">
              ${stars}
              <span class="prep-time">⏱ ${item.preparationTime}m</span>
            </div>
          </div>
          <div class="food-card-row2">
            <label class="food-card-compare-label" onclick="event.stopPropagation()">
              <input type="checkbox" class="compare-card-cb" data-id="${item._id}" ${isCompared ? 'checked' : ''} />
              <span>Compare</span>
            </label>
            <div class="card-btn-group">
              <button class="btn-card-info" data-info="${item._id}" title="Nutrition & Ingredients">ℹ️ Info</button>
              <button class="add-btn" data-id="${item._id}" title="Add to cart"
                ${unavail ? 'disabled' : ''}>+</button>
            </div>
          </div>
        </div>
      </div>
    </div>`;
}

function renderStars(avg, count) {
  if (!avg) return '';
  const full = Math.round(avg);
  return `<span class="stars">${'★'.repeat(full)}${'☆'.repeat(5 - full)} <span>(${count})</span></span>`;
}

// ── Active filter chips ───────────────────────────────────
function renderActiveFilters() {
  const chips = [];
  if (activeCategory) chips.push(`<span class="filter-chip">${activeCategory} <button onclick="clearCategory()">✕</button></span>`);
  if (activeSearch)   chips.push(`<span class="filter-chip">Search: "${activeSearch}" <button onclick="clearSearch()">✕</button></span>`);
  if (vegOnly)        chips.push(`<span class="filter-chip">Veg only <button onclick="clearVeg()">✕</button></span>`);
  activeFilters.innerHTML = chips.join('');
}

// ── Floating cart ─────────────────────────────────────────
function updateFloatingCart() {
  const { count, total } = Cart.getTotals();
  if (count > 0) {
    floatingCart.classList.remove('hidden');
    document.getElementById('fcCount').textContent = `${count} item${count !== 1 ? 's' : ''}`;
    document.getElementById('fcTotal').textContent = fmt.currency(total);
  } else {
    floatingCart.classList.add('hidden');
  }
}

// ── Item modal ────────────────────────────────────────────
function openItemModal(item) {
  if (!item) return;
  modalItem = item;
  modalQty  = 1;

  document.getElementById('modalItemName').textContent = item.name;
  document.getElementById('modalItemDesc').textContent = item.description || 'No description available.';

  const imgEl = document.getElementById('modalItemImage');
  const emoji = CAT_EMOJI[item.category] || DEFAULT_EMOJI;
  imgEl.innerHTML = item.image && item.image !== '/images/default-food.png'
    ? `<img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}" onerror="this.onerror=null;this.src='/images/default-food.png'" />`
    : `<span>${emoji}</span>`;

  document.getElementById('modalItemMeta').innerHTML = `
    <span class="badge ${item.isVeg ? 'badge-green' : 'badge-red'}">
      ${vegDot(item.isVeg)} ${item.isVeg ? 'Vegetarian' : 'Non-Vegetarian'}
    </span>
    <span class="badge badge-orange">${escapeHtml(item.category)}</span>
    <span class="badge badge-gray">⏱ ${item.preparationTime} min</span>
    ${item.isHealthy ? '<span class="badge badge-green">🌱 Healthy Choice</span>' : ''}
    ${!item.isAvailable ? '<span class="badge badge-red">Unavailable</span>' : '<span class="badge badge-green">Available</span>'}
  `;

  // Render nutrition, ingredients, allergens, health tags in modal
  const modalNutriEl = document.getElementById('modalItemNutrition');
  if (modalNutriEl) modalNutriEl.innerHTML = renderModalNutrition(item.nutrition);

  const modalIngEl = document.getElementById('modalItemIngredients');
  if (modalIngEl) modalIngEl.innerHTML = renderModalIngredients(item.ingredients);

  const modalAllerEl = document.getElementById('modalItemAllergens');
  if (modalAllerEl) modalAllerEl.innerHTML = renderModalAllergens(item.allergens);

  const modalTagsEl = document.getElementById('modalItemHealthTags');
  if (modalTagsEl) modalTagsEl.innerHTML = renderModalHealthTags(item.healthTags);

  updateModalPrice();
  document.getElementById('modalQty').textContent = modalQty;
  document.getElementById('modalAddToCart').disabled = !item.isAvailable;

  // Sync modal compare button state
  const modalCompBtn = document.getElementById('modalCompareBtn');
  if (modalCompBtn) {
    const isCompared = compareItems.some(i => i._id === item._id);
    modalCompBtn.textContent = isCompared ? '✓ Comparing' : '⚖️ Compare';
    modalCompBtn.className = isCompared ? 'btn btn-primary' : 'btn btn-outline';
  }

  Modal.open('itemModal');
}

function updateModalPrice() {
  if (!modalItem) return;
  document.getElementById('modalQty').textContent = modalQty;
  document.getElementById('modalPrice').textContent = fmt.currency(modalItem.price * modalQty);
}

document.getElementById('modalQtyMinus').addEventListener('click', () => {
  if (modalQty > 1) { modalQty--; updateModalPrice(); }
});
document.getElementById('modalQtyPlus').addEventListener('click', () => {
  if (modalQty < 20) { modalQty++; updateModalPrice(); }
});
document.getElementById('modalAddToCart').addEventListener('click', () => {
  if (!modalItem) return;
  if (!confirmAllergyIfNeeded(modalItem)) return;
  Cart.add(modalItem, modalQty);
  updateFloatingCart();
  Modal.close('itemModal');
});

// Modal compare button listener
const modalCompBtn = document.getElementById('modalCompareBtn');
if (modalCompBtn) {
  modalCompBtn.addEventListener('click', () => {
    if (!modalItem) return;
    const isCompared = compareItems.some(i => i._id === modalItem._id);
    if (!isCompared) {
      if (compareItems.length >= 3) {
        Toast.error('You can compare a maximum of 3 items at a time.');
        return;
      }
      compareItems.push(modalItem);
    } else {
      compareItems = compareItems.filter(i => i._id !== modalItem._id);
    }
    updateCompareUI();
  });
}

// ── Category buttons ──────────────────────────────────────
document.querySelectorAll('.cat-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    activeCategory = btn.dataset.category;
    document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    applyFilters();
    if (window.innerWidth < 960) {
      document.getElementById('menuSidebar').classList.remove('open');
    }
  });
});

// ── Search ─────────────────────────────────────────────────
const searchInput = document.getElementById('searchInput');
const searchClear = document.getElementById('searchClear');

searchInput.addEventListener('input', debounce(() => {
  activeSearch = searchInput.value.trim();
  searchClear.classList.toggle('hidden', !activeSearch);
  applyFilters();
}, 300));

searchClear.addEventListener('click', () => { clearSearch(); searchInput.value = ''; });

// ── Filter toggles ─────────────────────────────────────────
document.getElementById('vegOnly').addEventListener('change', (e) => {
  vegOnly = e.target.checked; applyFilters();
});
document.getElementById('availOnly').addEventListener('change', (e) => {
  availOnly = e.target.checked; applyFilters();
});

// ── Sort ────────────────────────────────────────────────────
document.getElementById('sortSelect').addEventListener('change', (e) => {
  sortBy = e.target.value; applyFilters();
});

// ── Clear filters ──────────────────────────────────────────
document.getElementById('clearFiltersBtn').addEventListener('click', () => {
  clearCategory(); clearSearch(); clearVeg();
});

function clearCategory() {
  activeCategory = '';
  document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
  document.querySelector('.cat-btn[data-category=""]').classList.add('active');
  applyFilters();
}
function clearSearch() {
  activeSearch = '';
  searchInput.value = '';
  searchClear.classList.add('hidden');
  applyFilters();
}
function clearVeg() {
  vegOnly = false;
  document.getElementById('vegOnly').checked = false;
  applyFilters();
}

window.clearCategory = clearCategory;
window.clearSearch   = clearSearch;
window.clearVeg      = clearVeg;

// ── Sidebar toggle (mobile) ────────────────────────────────
document.getElementById('sidebarToggle').addEventListener('click', () => {
  document.getElementById('menuSidebar').classList.toggle('open');
});

// ── URL query param: pre-select category ──────────────────
document.addEventListener('DOMContentLoaded', () => {
  const params = urlParams();
  if (params.category) {
    activeCategory = params.category;
    const btn = document.querySelector(`.cat-btn[data-category="${params.category}"]`);
    if (btn) {
      document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    }
  }
  loadMenu();
  updateFloatingCart();
});