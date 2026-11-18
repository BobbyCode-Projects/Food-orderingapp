/* ═══════════════════════════════════════════════════════
   profile.js — Customer Profile & Dietary Allergy Management
   ═══════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', async () => {
  const guestNotice = document.getElementById('profileGuestNotice');
  const contentEl   = document.getElementById('profileContent');

  if (!Auth.isLoggedIn()) {
    if (guestNotice) guestNotice.classList.remove('hidden');
    if (contentEl)   contentEl.classList.add('hidden');
    return;
  }

  if (guestNotice) guestNotice.classList.add('hidden');
  if (contentEl)   contentEl.classList.remove('hidden');

  let currentUser = Auth.getUser();

  // Age group explanations
  const AGE_GROUP_META = {
    child: {
      title: '👶 Child Nutrition Focus',
      desc: 'Mild items, fruit and milk-based foods; avoiding high sugar and high sodium.',
      cls: 'child'
    },
    teen: {
      title: '⚡ Teen Nutrition Focus',
      desc: 'High-protein, energy-rich meals and balanced foods to support active growth.',
      cls: 'teen'
    },
    adult: {
      title: '🥗 Adult Nutrition Focus',
      desc: 'Balanced nutrition, high-fiber, low-sugar, and healthy wholesome choices.',
      cls: 'adult'
    },
    senior: {
      title: '🌿 Senior Nutrition Focus',
      desc: 'Low-sodium, low-fat, high-fiber, calcium-rich, and easy-to-digest wholesome meals.',
      cls: 'senior'
    }
  };

  function updateOverview(u) {
    const avatarEl = document.getElementById('overviewAvatar');
    const nameEl   = document.getElementById('overviewName');
    const emailEl  = document.getElementById('overviewEmail');
    const ageGrpEl = document.getElementById('overviewAgeGroup');
    const pointsEl = document.getElementById('overviewPoints');
    const streakEl = document.getElementById('overviewStreak');
    const titleEl  = document.getElementById('ageGroupTitle');
    const descEl   = document.getElementById('ageGroupDesc');

    if (avatarEl) avatarEl.textContent = (u.name || 'U').charAt(0).toUpperCase();
    if (nameEl)   nameEl.textContent = u.name || 'User';
    if (emailEl)  emailEl.textContent = u.email || '';
    if (pointsEl) pointsEl.textContent = `${u.rewardPoints || 0} pts`;
    if (streakEl) streakEl.textContent = `${u.healthyOrderStreak || 0} 🔥`;

    const grp = u.ageGroup || 'adult';
    const meta = AGE_GROUP_META[grp] || AGE_GROUP_META.adult;

    if (ageGrpEl) {
      ageGrpEl.textContent = grp;
      ageGrpEl.className = `stat-val badge-age ${meta.cls}`;
    }
    if (titleEl) titleEl.textContent = meta.title;
    if (descEl)  descEl.textContent = meta.desc;
  }

  function populateForm(u) {
    const nameInput = document.getElementById('profileName');
    const phoneInput = document.getElementById('profilePhone');
    const dobInput = document.getElementById('profileDob');

    if (nameInput) nameInput.value = u.name || '';
    if (phoneInput) phoneInput.value = u.phone || '';

    if (dobInput && u.dateOfBirth) {
      const d = new Date(u.dateOfBirth);
      if (!isNaN(d.getTime())) {
        dobInput.value = d.toISOString().split('T')[0];
      }
    }

    const userAllergies = Array.isArray(u.allergies) ? u.allergies : [];
    document.querySelectorAll('#allergiesPicker input[type="checkbox"]').forEach(cb => {
      cb.checked = userAllergies.includes(cb.value);
    });
  }

  // Initial render from local cache
  if (currentUser) {
    updateOverview(currentUser);
    populateForm(currentUser);
  }

  // Fetch freshest user data from API
  try {
    const res = await api.get('/auth/me');
    if (res && res.user) {
      currentUser = res.user;
      Auth.updateUser(res.user);
      updateOverview(res.user);
      populateForm(res.user);
    }
  } catch (err) {
    console.error('Could not load profile from server:', err);
  }

  // Handle form submission
  const form = document.getElementById('profileForm');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearErrors('profileForm');

      const name     = document.getElementById('profileName').value.trim();
      const phone    = document.getElementById('profilePhone').value.trim();
      const dobStr   = document.getElementById('profileDob').value;
      let valid = true;

      if (!name || name.length < 2) {
        showError('profileName', 'Name must be at least 2 characters.');
        document.getElementById('profileName').classList.add('error');
        valid = false;
      }

      if (phone && !/^[0-9]{10}$/.test(phone)) {
        showError('profilePhone', 'Phone number must be exactly 10 digits.');
        document.getElementById('profilePhone').classList.add('error');
        valid = false;
      }

      if (!dobStr) {
        showError('profileDob', 'Date of birth is required.');
        document.getElementById('profileDob').classList.add('error');
        valid = false;
      } else {
        const dob = new Date(dobStr);
        const now = new Date();
        if (isNaN(dob.getTime())) {
          showError('profileDob', 'Invalid date of birth.');
          document.getElementById('profileDob').classList.add('error');
          valid = false;
        } else if (dob > now) {
          showError('profileDob', 'Date of birth cannot be in the future.');
          document.getElementById('profileDob').classList.add('error');
          valid = false;
        } else {
          let age = now.getFullYear() - dob.getFullYear();
          const m = now.getMonth() - dob.getMonth();
          if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) {
            age--;
          }
          if (age < 3 || age > 100) {
            showError('profileDob', 'Age must be between 3 and 100 years.');
            document.getElementById('profileDob').classList.add('error');
            valid = false;
          }
        }
      }

      if (!valid) return;

      const selectedAllergies = Array.from(document.querySelectorAll('#allergiesPicker input[type="checkbox"]:checked'))
        .map(cb => cb.value);

      const btn = document.getElementById('saveProfileBtn');
      setLoading(btn, true);
      const alertEl = document.getElementById('profileAlert');
      alertEl.innerHTML = '';

      try {
        const result = await api.put('/auth/me', {
          name,
          phone: phone || undefined,
          dateOfBirth: dobStr,
          allergies: selectedAllergies
        });

        if (result && result.user) {
          currentUser = result.user;
          Auth.updateUser(result.user);
          updateOverview(result.user);

          // Update navbar name if changed
          const navName = document.getElementById('userName');
          if (navName && result.user.name) navName.textContent = result.user.name.split(' ')[0];

          // Remove missing DOB banner if present
          const missingBanner = document.getElementById('dobMissingBanner');
          if (missingBanner) missingBanner.remove();

          Toast.success('Profile and allergy preferences saved successfully!');
          alertEl.innerHTML = '<div class="alert alert-success">Preferences updated successfully! Menu recommendations will now reflect your age group and allergy settings.</div>';
        }
      } catch (err) {
        alertEl.innerHTML = `<div class="alert alert-error">${err.message || 'Failed to update profile.'}</div>`;
      } finally {
        setLoading(btn, false);
      }
    });
  }
});