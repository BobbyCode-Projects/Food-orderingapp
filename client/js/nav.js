/* ═══════════════════════════════════════════════════════
   nav.js — Navbar state (auth-aware links, hamburger)
   ═══════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {
  const user = Auth.getUser();

  // Auth link visibility
  const guestLinks = document.getElementById('authLinksGuest');
  const userLinks  = document.getElementById('authLinksUser');
  const adminLinks = document.getElementById('authLinksAdmin');

  // Dynamically ensure Rewards link is in navLinks
  const navLinksEl = document.getElementById('navLinks');
  if (navLinksEl && !navLinksEl.querySelector('a[href*="rewards"]')) {
    const trackItem = navLinksEl.querySelector('a[href*="track"]')?.parentElement;
    const rewardsLi = document.createElement('li');
    rewardsLi.id = 'navLinkRewards';
    rewardsLi.innerHTML = '<a href="/pages/rewards.html">🎁 Rewards</a>';
    if (trackItem && trackItem.nextElementSibling) {
      navLinksEl.insertBefore(rewardsLi, trackItem.nextElementSibling);
    } else {
      const firstAuth = navLinksEl.querySelector('.auth-links');
      if (firstAuth) navLinksEl.insertBefore(rewardsLi, firstAuth);
      else navLinksEl.appendChild(rewardsLi);
    }
  }

  if (user) {
    if (guestLinks) guestLinks.classList.add('hidden');

    if (user.role === 'admin') {
      if (userLinks)  userLinks.classList.add('hidden');
      if (adminLinks) adminLinks.classList.remove('hidden');
    } else {
      if (userLinks)  userLinks.classList.remove('hidden');
      if (adminLinks) adminLinks.classList.add('hidden');

      // Populate name / avatar
      const nameEl   = document.getElementById('userName');
      const avatarEl = document.getElementById('userAvatar');
      if (nameEl)   nameEl.textContent = user.name.split(' ')[0];
      if (avatarEl) avatarEl.textContent = user.name.charAt(0).toUpperCase();

      // Points balance badge in navbar
      let pointsBadge = document.getElementById('navPointsBadge');
      if (!pointsBadge && userLinks) {
        pointsBadge = document.createElement('a');
        pointsBadge.href = '/pages/rewards.html';
        pointsBadge.id = 'navPointsBadge';
        pointsBadge.className = 'nav-points-badge';
        pointsBadge.title = 'Your Reward Points';
        pointsBadge.innerHTML = '⭐ <span id="navPointsVal">0</span> pts';
        userLinks.insertBefore(pointsBadge, userLinks.firstChild);
      }

      // Fetch live points from server
      if (window.api && Auth.getToken()) {
        api.get('/rewards')
          .then(data => {
            const valEl = document.getElementById('navPointsVal');
            if (valEl && data && data.points !== undefined) {
              valEl.textContent = data.points;
            }
          })
          .catch(() => {});
      }
    }
  } else {
    if (guestLinks) guestLinks.classList.remove('hidden');
    if (userLinks)  userLinks.classList.add('hidden');
    if (adminLinks) adminLinks.classList.add('hidden');
  }

  // Logout buttons
  ['logoutBtn', 'logoutBtnAdmin'].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) btn.addEventListener('click', (e) => { e.preventDefault(); Auth.logout(); });
  });

  // User dropdown toggle
  const menuBtn  = document.getElementById('userMenuBtn');
  const dropdown = document.getElementById('userDropdown');
  if (menuBtn && dropdown) {
    if (!dropdown.querySelector('a[href*="profile"]')) {
      const profileDropLink = document.createElement('a');
      profileDropLink.href = '/pages/profile.html';
      profileDropLink.innerHTML = '👤 Profile & Allergies';
      dropdown.insertBefore(profileDropLink, dropdown.firstChild);
    }

    if (!dropdown.querySelector('a[href*="rewards"]')) {
      const rewardsDropLink = document.createElement('a');
      rewardsDropLink.href = '/pages/rewards.html';
      rewardsDropLink.innerHTML = '🎁 Rewards & Offers';
      const profileLink = dropdown.querySelector('a[href*="profile"]');
      if (profileLink && profileLink.nextSibling) {
        dropdown.insertBefore(rewardsDropLink, profileLink.nextSibling);
      } else {
        dropdown.appendChild(rewardsDropLink);
      }
    }

    menuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdown.classList.toggle('open');
    });
    document.addEventListener('click', () => dropdown.classList.remove('open'));
  }

  // DOB Missing Banner prompt for existing users without dateOfBirth
  if (user && user.role !== 'admin' && !user.dateOfBirth && !window.location.pathname.includes('profile')) {
    let dobBanner = document.getElementById('dobMissingBanner');
    if (!dobBanner) {
      dobBanner = document.createElement('div');
      dobBanner.id = 'dobMissingBanner';
      dobBanner.className = 'dob-missing-banner';
      dobBanner.innerHTML = `
        <div class="container dob-banner-inner">
          <span>🎂 Add your <strong>Date of Birth</strong> to get personalized food recommendations and age-tailored meals!</span>
          <a href="/pages/profile.html" class="btn btn-sm btn-primary">Add Birthday</a>
        </div>
      `;
      const navbar = document.getElementById('navbar');
      if (navbar && navbar.nextSibling) {
        navbar.parentNode.insertBefore(dobBanner, navbar.nextSibling);
      } else {
        document.body.prepend(dobBanner);
      }
    }
  }

  // Hamburger toggle
  const hamburger = document.getElementById('hamburger');
  const navLinks  = document.getElementById('navLinks');
  if (hamburger && navLinks) {
    hamburger.addEventListener('click', () => {
      navLinks.classList.toggle('open');
    });
  }

  // Mark active nav link
  const currentPath = window.location.pathname;
  document.querySelectorAll('.nav-links a').forEach(a => {
    if (a.getAttribute('href') === currentPath ||
        (currentPath !== '/' && a.getAttribute('href') !== '/' && currentPath.startsWith(a.getAttribute('href')))) {
      a.classList.add('active');
    } else {
      a.classList.remove('active');
    }
  });

  // Scroll shadow on navbar
  const navbar = document.getElementById('navbar');
  if (navbar) {
    window.addEventListener('scroll', () => {
      navbar.style.boxShadow = window.scrollY > 10 ? 'var(--shadow)' : 'var(--shadow-sm)';
    }, { passive: true });
  }
});
