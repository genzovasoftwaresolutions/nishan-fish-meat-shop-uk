(() => {
  'use strict';

  const MEMBER_TOKEN_KEY = 'nishan_member_token';
  const ADMIN_TOKEN_KEY = 'nishan_admin_token';

  const signInPanel = document.getElementById('signInPanel');
  const memberWelcome = document.getElementById('memberWelcome');
  const memberName = document.getElementById('memberName');
  const accountError = document.getElementById('accountError');
  const signOutBtn = document.getElementById('signOutBtn');
  const signOutBtnTop = document.getElementById('signOutBtnTop');
  const accountCard = document.getElementById('accountCard');
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  const tabSignIn = document.getElementById('tabSignIn');
  const tabRegister = document.getElementById('tabRegister');

  function showError(message) {
    if (!accountError) return;
    accountError.textContent = message;
    accountError.hidden = false;
  }

  function hideError() {
    if (accountError) accountError.hidden = true;
  }

  function showWelcome(user) {
    hideError();
    if (signInPanel) signInPanel.hidden = true;
    if (memberWelcome) memberWelcome.hidden = false;
    if (signOutBtnTop) signOutBtnTop.hidden = false;
    accountCard?.classList.add('is-logged-in');
    if (memberName) {
      memberName.textContent = user.name ? `Welcome, ${user.name}` : `Signed in as ${user.email}`;
    }
  }

  function showSignIn() {
    if (signInPanel) signInPanel.hidden = false;
    if (memberWelcome) memberWelcome.hidden = true;
    if (signOutBtnTop) signOutBtnTop.hidden = true;
    accountCard?.classList.remove('is-logged-in');
  }

  function setActiveTab(mode) {
    const isSignIn = mode === 'signin';
    tabSignIn?.classList.toggle('active', isSignIn);
    tabRegister?.classList.toggle('active', !isSignIn);
    tabSignIn?.setAttribute('aria-selected', String(isSignIn));
    tabRegister?.setAttribute('aria-selected', String(!isSignIn));
    if (loginForm) loginForm.hidden = !isSignIn;
    if (registerForm) registerForm.hidden = isSignIn;
    hideError();
  }

  async function checkExistingSession() {
    const adminToken = sessionStorage.getItem(ADMIN_TOKEN_KEY);
    if (adminToken) {
      window.location.href = '/admin/dashboard';
      return true;
    }

    const memberToken = sessionStorage.getItem(MEMBER_TOKEN_KEY);
    if (!memberToken) return false;

    try {
      const res = await fetch('/api/member/me', {
        headers: { Authorization: `Bearer ${memberToken}` },
      });
      if (!res.ok) {
        sessionStorage.removeItem(MEMBER_TOKEN_KEY);
        return false;
      }
      const user = await res.json();
      showWelcome(user);
      return true;
    } catch {
      sessionStorage.removeItem(MEMBER_TOKEN_KEY);
      return false;
    }
  }

  function saveMemberSession(data) {
    sessionStorage.setItem(MEMBER_TOKEN_KEY, data.token);
    sessionStorage.removeItem(ADMIN_TOKEN_KEY);
    showWelcome(data.user);
  }

  tabSignIn?.addEventListener('click', () => setActiveTab('signin'));
  tabRegister?.addEventListener('click', () => setActiveTab('register'));

  loginForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError();

    const data = new FormData(loginForm);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: data.get('email'),
          password: data.get('password'),
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Sign in failed');

      if (body.role === 'admin') {
        sessionStorage.setItem(ADMIN_TOKEN_KEY, body.token);
        sessionStorage.removeItem(MEMBER_TOKEN_KEY);
        window.location.href = '/admin/dashboard';
        return;
      }

      saveMemberSession(body);
    } catch (err) {
      showError(err.message);
    }
  });

  registerForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError();

    const data = new FormData(registerForm);
    const password = String(data.get('password') || '');
    const confirmPassword = String(data.get('confirmPassword') || '');

    if (password !== confirmPassword) {
      showError('Passwords do not match');
      return;
    }

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: data.get('name'),
          email: data.get('email'),
          password,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Could not create account');
      saveMemberSession(body);
    } catch (err) {
      showError(err.message);
    }
  });

  async function signOut() {
    const token = sessionStorage.getItem(MEMBER_TOKEN_KEY);
    if (token) {
      await fetch('/api/member/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
    }
    sessionStorage.removeItem(MEMBER_TOKEN_KEY);
    loginForm?.reset();
    registerForm?.reset();
    setActiveTab('signin');
    showSignIn();
  }

  signOutBtn?.addEventListener('click', signOut);
  signOutBtnTop?.addEventListener('click', signOut);

  checkExistingSession();
})();
