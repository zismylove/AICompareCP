// Chrome can omit SameSite=Lax/Strict cookies from a cross-site iframe's
// WebSocket handshake even when its HTTPS requests can use those cookies.
// Keep this workaround in session rules, scoped to our comparison tabs and
// Grok's own chat endpoint. Never expose cookie values to content scripts.
(() => {
  // iframe/* uses use_dynamic_url in the manifest. Chrome may return the
  // session UUID here while an already-open tab still uses the stable ID.
  const PAGE_URLS = new Set([
    chrome.runtime.getURL('iframe/iframe.html'),
    `chrome-extension://${chrome.runtime.id}/iframe/iframe.html`
  ]);
  const RULE_START = 1400;
  const RULE_END = 1499;
  const AUTH_NAMES = new Set(['sso', 'sso-rw', 'grok_device_id']);
  let comparisonTabIds = new Set();
  let updateQueue = Promise.resolve();

  function isComparisonPage(url) {
    return typeof url === 'string' && PAGE_URLS.has(url.split(/[?#]/, 1)[0]);
  }

  async function refreshRules() {
    const [tabs, currentRules] = await Promise.all([
      chrome.tabs.query({}),
      chrome.declarativeNetRequest.getSessionRules()
    ]);
    const comparisonTabs = tabs.filter(tab => isComparisonPage(tab.url));
    comparisonTabIds = new Set(comparisonTabs.map(tab => tab.id));
    const removeRuleIds = currentRules
      .filter(rule => rule.id >= RULE_START && rule.id <= RULE_END)
      .map(rule => rule.id);
    const addRules = [];

    if (comparisonTabs.length && chrome.cookies) {
      const stores = await chrome.cookies.getAllCookieStores();
      for (const store of stores) {
        const tabIds = store.tabIds.filter(id => comparisonTabIds.has(id));
        if (!tabIds.length) continue;
        const cookies = await chrome.cookies.getAll({
          url: 'https://grok.com/ws/mgw/',
          storeId: store.id
        });
        const authCookies = cookies.filter(cookie =>
          AUTH_NAMES.has(cookie.name) && !cookie.partitionKey && cookie.secure
        );
        // Clear the rule on logout. A device ID alone is not a login session.
        if (!authCookies.some(cookie => cookie.name === 'sso' && cookie.value)) continue;
        const id = RULE_START + addRules.length;
        if (id > RULE_END) break;
        addRules.push({
          id,
          priority: 100,
          action: {
            type: 'modifyHeaders',
            requestHeaders: [{
              header: 'cookie',
              operation: 'append',
              value: authCookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ')
            }]
          },
          condition: {
            regexFilter: '^wss://grok\\.com/ws/mgw/(\\?|$)',
            initiatorDomains: ['grok.com'],
            resourceTypes: ['websocket'],
            tabIds
          }
        });
      }
    }
    if (removeRuleIds.length || addRules.length) {
      await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds, addRules });
    }
  }

  function scheduleRefresh() {
    const update = updateQueue.then(refreshRules);
    updateQueue = update.catch(() => {
      // Do not log DNR rules or errors that might contain a Cookie header.
      console.warn('Could not prepare Grok chat authentication.');
    });
    return update;
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type !== 'PREPARE_GROK_CONNECTION') return;
    // Messages from extension pages do not always include sender.tab/frameId.
    if (sender.id !== chrome.runtime.id ||
        (sender.frameId !== undefined && sender.frameId !== 0) ||
        !isComparisonPage(sender.url)) {
      sendResponse({ success: false });
      return;
    }
    scheduleRefresh().then(
      () => sendResponse({ success: true }),
      () => sendResponse({ success: false })
    );
    return true;
  });

  chrome.cookies?.onChanged.addListener(({ cookie }) => {
    if (AUTH_NAMES.has(cookie.name) && cookie.domain.replace(/^\./, '') === 'grok.com') {
      scheduleRefresh();
    }
  });
  chrome.tabs.onUpdated.addListener((tabId, change, tab) => {
    if ((change.url || change.status === 'loading') &&
        (comparisonTabIds.has(tabId) || isComparisonPage(tab.url))) {
      scheduleRefresh();
    }
  });
  chrome.tabs.onRemoved.addListener(tabId => {
    if (comparisonTabIds.has(tabId)) scheduleRefresh();
  });
  // Rebuild after browser/worker restart, clearing stale session rules as well.
  scheduleRefresh();
})();
