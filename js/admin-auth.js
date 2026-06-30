(() => {
  'use strict';

  const TOKEN_KEY = 'nishan_admin_token';

  const form = document.getElementById('loginForm');
  const errorEl = document.getElementById('loginError');

  if (sessionStorage.getItem(TOKEN_KEY)) {
    window.location.href = '/admin/dashboard';
    return;
  }

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.hidden = true;

    const data = new FormData(form);
    const username = data.get('username');
    const password = data.get('password');

    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.error || 'Sign in failed');
      }

      sessionStorage.setItem(TOKEN_KEY, body.token);
      window.location.href = '/admin/dashboard';
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.hidden = false;
    }
  });
})();
