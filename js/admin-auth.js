(() => {
  'use strict';

  const TOKEN_KEY = 'nishan_admin_token';
  const MEMBER_TOKEN_KEY = 'nishan_member_token';

  const form = document.getElementById('loginForm');
  const errorEl = document.getElementById('loginError');

  function showError(message) {
    if (!errorEl) return;
    errorEl.textContent = message;
    errorEl.hidden = false;
  }

  if (sessionStorage.getItem(TOKEN_KEY)) {
    window.location.href = '/admin/dashboard';
  }

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (errorEl) errorEl.hidden = true;

    const data = new FormData(form);

    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: data.get('login'),
          password: data.get('password'),
        }),
      });

      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.error || 'Sign in failed');
      }

      sessionStorage.setItem(TOKEN_KEY, body.token);
      sessionStorage.removeItem(MEMBER_TOKEN_KEY);
      window.location.href = '/admin/dashboard';
    } catch (err) {
      showError(err.message);
    }
  });
})();
