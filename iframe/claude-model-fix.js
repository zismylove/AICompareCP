(() => {
  'use strict';

  // Claude now switches to a restricted integration mode whenever it detects
  // a cross-origin ancestor. In a regular extension iframe that mode leaves
  // the model catalog empty, so the composer model is undefined and the UI
  // falls back to "Unsupported model".
  if (window.top === window.self) {
    return;
  }

  const MODEL_ID = 'claude-sonnet-4-6';
  const MODEL_LABEL = 'Sonnet 4.6 Low';
  const MODEL_BUTTON_SELECTOR = '[data-testid="model-selector-dropdown"]';
  const FIXED_ATTRIBUTE = 'data-ai-compare-model-fixed';
  const repairedStores = new WeakSet();

  let repairScheduled = false;
  let repairLogged = false;
  let cachedChatStore = null;

  function installFixedLabelStyle() {
    if (document.getElementById('ai-compare-claude-model-fix-style')) {
      return;
    }

    const style = document.createElement('style');
    style.id = 'ai-compare-claude-model-fix-style';
    style.textContent = `
      [${FIXED_ATTRIBUTE}="true"] > div:first-child {
        display: none !important;
      }

      [${FIXED_ATTRIBUTE}="true"]::before {
        content: "${MODEL_LABEL}";
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function getReactFiber(element) {
    try {
      const fiberKey = Object.keys(element).find(key => key.startsWith('__reactFiber$'));
      return fiberKey ? element[fiberKey] : null;
    } catch (error) {
      return null;
    }
  }

  function findChatStoreInValue(value, seen, depth = 0) {
    if (!value || typeof value !== 'object' || depth > 10 || seen.has(value)) {
      return null;
    }

    seen.add(value);

    try {
      if (typeof value.getState === 'function' && typeof value.setState === 'function') {
        const state = value.getState();
        if (state && typeof state.setModel === 'function' && 'sendMessage' in state) {
          return value;
        }
      }
    } catch (error) {
      // Some React values contain cross-origin Window proxies. Ignore them.
    }

    let keys;
    try {
      keys = Object.keys(value);
    } catch (error) {
      return null;
    }

    const skippedKeys = new Set([
      'return',
      'child',
      'sibling',
      'alternate',
      'stateNode',
      '_owner'
    ]);

    for (const key of keys.slice(0, 120)) {
      if (skippedKeys.has(key)) {
        continue;
      }

      try {
        const store = findChatStoreInValue(value[key], seen, depth + 1);
        if (store) {
          return store;
        }
      } catch (error) {
        // Keep searching other branches when a property cannot be read.
      }
    }

    return null;
  }

  function findClaudeChatStore(modelButton) {
    let fiber = getReactFiber(modelButton);

    for (let ancestorIndex = 0; fiber && ancestorIndex < 45; ancestorIndex += 1) {
      const store = findChatStoreInValue(fiber.memoizedState, new WeakSet());
      if (store) {
        return store;
      }
      fiber = fiber.return;
    }

    return null;
  }

  function repairClaudeModel() {
    repairScheduled = false;

    const modelButton = document.querySelector(MODEL_BUTTON_SELECTOR);
    if (!modelButton) {
      return;
    }

    const isAlreadyFixed = modelButton.getAttribute(FIXED_ATTRIBUTE) === 'true';
    const nativeModelText = modelButton.textContent || '';
    const visibleModelText = `${modelButton.getAttribute('aria-label') || ''} ${nativeModelText}`;
    if (!isAlreadyFixed && !/unsupported model/i.test(visibleModelText)) {
      modelButton.removeAttribute(FIXED_ATTRIBUTE);
      return;
    }

    if (isAlreadyFixed && !/unsupported model/i.test(nativeModelText)) {
      modelButton.removeAttribute(FIXED_ATTRIBUTE);
      return;
    }

    const chatStore = cachedChatStore || findClaudeChatStore(modelButton);
    let modelRestored = false;
    if (chatStore) {
      cachedChatStore = chatStore;
      try {
        const state = chatStore.getState();
        if (state.model !== MODEL_ID) {
          state.setModel(MODEL_ID);
        }
        repairedStores.add(chatStore);
        modelRestored = chatStore.getState().model === MODEL_ID;
      } catch (error) {
        console.warn('[AI Compare] Failed to restore the Claude iframe model state.', error);
      }
    }

    if (!modelRestored) {
      window.setTimeout(scheduleRepair, 250);
      return;
    }

    installFixedLabelStyle();
    modelButton.setAttribute(FIXED_ATTRIBUTE, 'true');
    if (modelButton.getAttribute('aria-label') !== `Model: ${MODEL_LABEL}`) {
      modelButton.setAttribute('aria-label', `Model: ${MODEL_LABEL}`);
    }

    if (!repairLogged && chatStore && repairedStores.has(chatStore)) {
      repairLogged = true;
      console.info(`[AI Compare] Restored embedded Claude model to ${MODEL_ID}.`);
    }
  }

  function scheduleRepair() {
    if (repairScheduled) {
      return;
    }

    repairScheduled = true;
    requestAnimationFrame(repairClaudeModel);
  }

  const observer = new MutationObserver(scheduleRepair);

  function startRepairObserver() {
    if (!document.documentElement) {
      window.setTimeout(startRepairObserver, 0);
      return;
    }

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['aria-label'],
      childList: true,
      subtree: true
    });

    scheduleRepair();
  }

  startRepairObserver();
})();
