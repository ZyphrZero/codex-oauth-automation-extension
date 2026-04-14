(() => {
  const HOOK_FLAG = '__MULTIPAGE_STEP5_CREATE_ACCOUNT_HOOK_READY__';
  const EVENT_NAME = 'multipage:step5-create-account-error';
  const CREATE_ACCOUNT_PATH_PATTERN = /\/api\/accounts\/create_account(?:[/?#]|$)/i;

  if (window[HOOK_FLAG]) {
    return;
  }
  window[HOOK_FLAG] = true;

  function matchesCreateAccountUrl(url) {
    return CREATE_ACCOUNT_PATH_PATTERN.test(String(url || ''));
  }

  function emitCreateAccountError(detail = {}) {
    try {
      window.dispatchEvent(new CustomEvent(EVENT_NAME, {
        detail: JSON.stringify({
          status: Number(detail.status) || 0,
          url: String(detail.url || ''),
          bodyText: typeof detail.bodyText === 'string' ? detail.bodyText : '',
          source: String(detail.source || ''),
          timestamp: Date.now(),
        }),
      }));
    } catch (err) {
      console.warn('[MultiPage:signup-page-network-hook] Failed to emit error event:', err);
    }
  }

  function maybeReportCreateAccountError({ status, url, bodyText = '', source = '' } = {}) {
    if (Number(status) < 400 || !matchesCreateAccountUrl(url)) {
      return;
    }

    emitCreateAccountError({ status, url, bodyText, source });
  }

  const originalFetch = window.fetch;
  if (typeof originalFetch === 'function') {
    window.fetch = async function multipageHookedFetch(input, init) {
      const response = await originalFetch.apply(this, arguments);

      try {
        const requestUrl = response?.url || (typeof input === 'string' ? input : input?.url) || '';
        if (matchesCreateAccountUrl(requestUrl) && Number(response?.status) >= 400) {
          const bodyText = await response.clone().text().catch(() => '');
          maybeReportCreateAccountError({
            status: response.status,
            url: requestUrl,
            bodyText,
            source: 'fetch',
          });
        }
      } catch (err) {
        console.warn('[MultiPage:signup-page-network-hook] Failed to inspect fetch response:', err);
      }

      return response;
    };
  }

  const originalXhrOpen = XMLHttpRequest.prototype.open;
  const originalXhrSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function multipageHookedOpen(method, url) {
    this.__MULTIPAGE_CREATE_ACCOUNT_URL__ = url;
    return originalXhrOpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function multipageHookedSend() {
    const requestUrl = this.__MULTIPAGE_CREATE_ACCOUNT_URL__;

    if (matchesCreateAccountUrl(requestUrl)) {
      this.addEventListener('loadend', () => {
        maybeReportCreateAccountError({
          status: this.status,
          url: this.responseURL || requestUrl,
          bodyText: typeof this.responseText === 'string' ? this.responseText : '',
          source: 'xhr',
        });
      }, { once: true });
    }

    return originalXhrSend.apply(this, arguments);
  };
})();
