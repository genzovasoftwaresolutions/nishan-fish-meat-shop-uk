(() => {
  'use strict';

  function getApiBase() {
    const meta = document.querySelector('meta[name="nishan-api-base"]')?.content?.trim();
    const host = window.location.hostname;

    if (host === 'localhost' || host === '127.0.0.1') {
      return '';
    }

    if (meta) {
      return meta.replace(/\/$/, '');
    }

    return '';
  }

  function assetUrl(path) {
    if (!path || /^https?:\/\//i.test(path)) return path;
    return `/${String(path).replace(/^\/+/, '')}`;
  }

  window.nishanApi = function nishanApi(path) {
    const base = getApiBase();
    return `${base}${path}`;
  };

  window.nishanAsset = assetUrl;
  window.nishanAssetFallback = function nishanAssetFallback() {
    return '';
  };

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
        throw new Error('Invalid server response. Please refresh the page and try again.');
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
