/* ═══════════════════════════════════════════════════════
   rewards.js — Rewards & Offers page logic
   ═══════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {
  const user = Auth.getUser();
  const guestNotice = document.getElementById('rewardsGuestNotice');
  const content = document.getElementById('rewardsContent');

  if (!user) {
    if (guestNotice) guestNotice.classList.remove('hidden');
    if (content) content.classList.add('hidden');
    return;
  }

  if (guestNotice) guestNotice.classList.add('hidden');
  if (content) content.classList.remove('hidden');

  loadRewards();
});

async function loadRewards() {
  try {
    const data = await api.get('/rewards');

    // 1. Balance & Streak
    const points = data.points || 0;
    const streak = data.streak || 0;
    const awardedMilestones = data.streakMilestonesAwarded || [];

    document.getElementById('pointsVal').textContent = points.toLocaleString();
    document.getElementById('rupeesVal').textContent = fmt.currency(points / 10);
    document.getElementById('streakVal').textContent = streak;

    // Navbar balance update
    const navVal = document.getElementById('navPointsVal');
    if (navVal) navVal.textContent = points;

    // 2. Milestones
    updateMilestone(3, streak, awardedMilestones);
    updateMilestone(5, streak, awardedMilestones);
    updateMilestone(10, streak, awardedMilestones);

    // 3. Offers
    renderOffers(data.offers || []);

    // 4. Points History
    renderHistory(data.history || []);

  } catch (err) {
    Toast.error(err.message || 'Failed to load rewards data.');
  }
}

function updateMilestone(target, currentStreak, awardedList) {
  const box = document.getElementById(`milestone-${target}`);
  const statusEl = document.getElementById(`msStatus-${target}`);
  if (!box || !statusEl) return;

  const isClaimed = awardedList.includes(target);

  if (isClaimed) {
    box.className = 'milestone-box achieved';
    statusEl.className = 'milestone-status badge badge-green';
    statusEl.textContent = 'Claimed ✓';
  } else if (currentStreak >= target) {
    box.className = 'milestone-box in-progress';
    statusEl.className = 'milestone-status badge badge-orange';
    statusEl.textContent = 'Ready on next paid order!';
  } else {
    box.className = 'milestone-box';
    statusEl.className = 'milestone-status badge badge-gray';
    statusEl.textContent = `${currentStreak}/${target} orders`;
  }
}

function renderOffers(offers) {
  const grid = document.getElementById('offersGrid');
  if (!grid) return;

  if (offers.length === 0) {
    grid.innerHTML = '<p class="text-muted text-center">No active offers right now.</p>';
    return;
  }

  grid.innerHTML = offers.map(o => `
    <div class="offer-card">
      <div class="offer-header">
        <h4 class="offer-title">${escapeHtml(o.title)}</h4>
        <span class="offer-badge">${escapeHtml(o.badge)}</span>
      </div>
      <p class="offer-desc">${escapeHtml(o.description)}</p>
    </div>
  `).join('');
}

function renderHistory(history) {
  const tbody = document.getElementById('historyTableBody');
  const countBadge = document.getElementById('historyCount');
  if (!tbody) return;

  if (countBadge) countBadge.textContent = `${history.length} entr${history.length === 1 ? 'y' : 'ies'}`;

  if (history.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="4" class="text-center text-muted" style="padding:2.5rem 1rem">
          No points activity recorded yet. Place an order to start earning!
        </td>
      </tr>`;
    return;
  }

  tbody.innerHTML = history.map(item => {
    let typeBadge = '';
    let ptsClass = '';
    let prefix = '';

    if (item.type === 'earned') {
      typeBadge = '<span class="badge badge-green">Earned</span>';
      ptsClass = 'pts-earned';
      prefix = '+';
    } else if (item.type === 'redeemed') {
      typeBadge = '<span class="badge badge-red">Redeemed</span>';
      ptsClass = 'pts-redeemed';
      prefix = '-';
    } else if (item.type === 'refunded') {
      typeBadge = '<span class="badge badge-orange">Refunded</span>';
      ptsClass = 'pts-refunded';
      prefix = '+';
    } else {
      typeBadge = `<span class="badge badge-gray">${escapeHtml(item.type)}</span>`;
    }

    const dateStr = item.date ? fmt.date(item.date) : '—';
    const reasonStr = item.reason ? escapeHtml(item.reason) : 'Reward adjustment';

    return `
      <tr>
        <td style="white-space:nowrap;color:var(--text-muted)">${dateStr}</td>
        <td>${typeBadge}</td>
        <td class="${ptsClass}">${prefix}${item.points} pts</td>
        <td>${reasonStr}</td>
      </tr>
    `;
  }).join('');
}
