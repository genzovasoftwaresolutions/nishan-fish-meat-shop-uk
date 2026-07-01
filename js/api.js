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

  function normalizeImagePath(path) {
    if (!path || typeof path !== 'string') return '';
    const trimmed = path.trim();
    if (!trimmed || /^https?:\/\//i.test(trimmed)) return trimmed;
    return trimmed.replace(/^\/+/, '');
  }

  function assetUrl(path) {
    const normalized = normalizeImagePath(path);
    if (!normalized) return '';
    if (/^https?:\/\//i.test(normalized)) return normalized;
    return `/${normalized}`;
  }

  function assetUrlWithKey(path, cacheKey) {
    const url = assetUrl(path);
    if (!url || !cacheKey) return url;
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}v=${encodeURIComponent(String(cacheKey))}`;
  }

  function sortProductImages(paths) {
    const list = [...new Set((paths || []).map(normalizeImagePath).filter(Boolean))];
    const uploaded = list.filter((p) => p.startsWith('api/images/'));
    const other = list.filter((p) => !p.startsWith('api/images/'));
    return [...uploaded, ...other];
  }

  window.nishanApi = function nishanApi(path) {
    const base = getApiBase();
    return `${base}${path}`;
  };

  window.nishanAsset = assetUrl;
  window.nishanAssetWithKey = assetUrlWithKey;
  window.nishanSortProductImages = sortProductImages;
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
