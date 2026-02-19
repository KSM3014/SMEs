/**
 * Runtime API configuration — fetches /config.json once and caches.
 * This avoids hardcoding the backend URL at build time.
 * When the tunnel URL changes, just update config.json and re-upload to Pages.
 */

let _cachedUrl = null;
let _fetchPromise = null;

export async function getApiUrl() {
  if (_cachedUrl !== null) return _cachedUrl;

  if (!_fetchPromise) {
    _fetchPromise = fetch('/config.json')
      .then(r => r.ok ? r.json() : {})
      .then(config => {
        _cachedUrl = config.apiUrl || '';
        return _cachedUrl;
      })
      .catch(() => {
        _cachedUrl = '';
        return '';
      });
  }

  return _fetchPromise;
}

// Sync getter (returns '' until config is loaded)
export function getApiUrlSync() {
  return _cachedUrl ?? '';
}
