(() => {
  'use strict';

  const DEFAULT_RENDER_API = 'https://nishan-fish-meat-shop-uk.onrender.com';

  function getApiBase() {
    const meta = document.querySelector('meta[name="nishan-api-base"]')?.content?.trim();
    const host = window.location.hostname;

    if (host === 'localhost' || host === '127.0.0.1') {
      return '';
    }

    if (host.includes('onrender.com')) {
      return '';
    }

    if (meta) {
      return meta.replace(/\/$/, '');
    }

    if (host.includes('netlify.app')) {
      return DEFAULT_RENDER_API;
    }

    return '';
  }

  function assetUrl(path) {
    if (!path || /^https?:\/\//i.test(path)) return path;
    const cleanPath = String(path).replace(/^\/+/, '');
    const base = getApiBase();
    if (base) return `${base}/${cleanPath}`;
    return `/${cleanPath}`;
  }

  window.nishanApi = function nishanApi(path) {
    const base = getApiBase();
    return `${base}${path}`;
  };

  window.nishanAsset = assetUrl;

  window.nishanFetchJson = async function nishanFetchJson(path, options = {}) {
    const url = nishanApi(path);
    let res;

    try {
      res = await fetch(url, options);
    } catch {
      throw new Error('Cannot reach the server. Check your connection and try again.');
    }

    const text = await res.text();
    let data = {};

    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        if (getApiBase()) {
          throw new Error(
            'Server is starting up or unavailable. Wait 30 seconds, then try Sign In again.'
          );
        }
        throw new Error('Invalid server response. Run npm start locally or check deployment.');
      }
    } else if (!res.ok) {
      throw new Error(`Request failed (${res.status}). The server returned an empty response.`);
    }

    if (!res.ok) {
      throw new Error(data.error || `Request failed (${res.status})`);
    }

    return data;
  };
})();
