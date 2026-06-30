(() => {
  'use strict';

  let clientId = '';

  async function loadConfig() {
    const res = await fetch('/api/auth/config');
    const data = await res.json();
    clientId = data.googleClientId || '';
    return clientId;
  }

  function renderButton(container, callback) {
    if (!clientId || !window.google?.accounts?.id) {
      return false;
    }

    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: async (response) => {
        try {
          const res = await fetch('/api/auth/google', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ credential: response.credential }),
          });
          const body = await res.json();
          if (!res.ok) {
            throw new Error(body.error || 'Sign in failed');
          }
          callback(body);
        } catch (err) {
          callback(null, err);
        }
      },
    });

    const width = Math.min(container.offsetWidth || 320, 360);
    window.google.accounts.id.renderButton(container, {
      type: 'standard',
      theme: 'outline',
      size: 'large',
      text: 'signin_with',
      shape: 'pill',
      width,
    });
    return true;
  }

  async function mount(containerId, callback) {
    const container = document.getElementById(containerId);
    if (!container) return;

    await loadConfig();
    if (!clientId) {
      container.innerHTML =
        '<p class="admin-auth__error">Google sign-in is not set up yet. Copy <code>data/google-auth.example.json</code> to <code>data/google-auth.json</code> and add your Google Client ID.</p>';
      return;
    }

    const tryRender = () => {
      if (!renderButton(container, callback)) {
        window.setTimeout(tryRender, 120);
      }
    };
    tryRender();
  }

  window.NishanGoogleAuth = { mount };
})();
