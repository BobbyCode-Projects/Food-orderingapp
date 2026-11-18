/* ═══════════════════════════════════════════════════════
   auth.js — Auth state management (login/logout/session)
   ═══════════════════════════════════════════════════════ */

const Auth = (() => {
  const TOKEN_KEY = 'token';
  const USER_KEY  = 'user';

  const save = (token, user) => {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  };

  const clear = () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  };

  const getToken = () => localStorage.getItem(TOKEN_KEY);

  const getUser = () => {
    try { return JSON.parse(localStorage.getItem(USER_KEY)); }
    catch { return null; }
  };

  const isLoggedIn = () => !!getToken() && !!getUser();
  const isAdmin    = () => getUser()?.role === 'admin';

  const logout = async () => {
    try { if (isLoggedIn()) await api.post('/auth/logout'); } catch (_) {}
    clear();
    Cart.clear();
    window.location.href = '/pages/login.html';
  };

  const requireAuth = (redirectTo = '/pages/login.html') => {
    if (!isLoggedIn()) {
      window.location.href = redirectTo;
      return false;
    }
    return true;
  };

  const requireAdmin = () => {
    if (!isLoggedIn() || !isAdmin()) {
      window.location.href = '/pages/login.html';
      return false;
    }
    return true;
  };

  const updateUser = (user) => {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  };

  return { save, clear, getToken, getUser, isLoggedIn, isAdmin, logout, requireAuth, requireAdmin, updateUser };
})();

window.Auth = Auth;
