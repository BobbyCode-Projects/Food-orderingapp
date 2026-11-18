/* ═══════════════════════════════════════════════════════
   utils.js — Shared utilities used by all pages
   ═══════════════════════════════════════════════════════ */

const API_BASE = '/api';

/* ── HTTP helpers ─────────────────────────────────────── */
const api = {
  _req: async (method, path, body = null) => {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const opts = { method, headers };
    if (body) opts.body = JSON.stringify(body);

    const res = await fetch(`${API_BASE}${path}`, opts);
    const data = await res.json();

    if (!res.ok) throw { status: res.status, ...data };
    return data;
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
