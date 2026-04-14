const assert = require('assert');
const fs = require('fs');

const source = fs.readFileSync('background.js', 'utf8');

function extractFunction(name) {
  const markers = [`async function ${name}(`, `function ${name}(`];
  const start = markers
    .map((marker) => source.indexOf(marker))
    .find((index) => index >= 0);

  if (start < 0) {
    throw new Error(`missing function ${name}`);
  }

  let parenDepth = 0;
  let signatureEnded = false;
  let braceStart = -1;
  for (let i = start; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '(') {
      parenDepth += 1;
    } else if (ch === ')') {
      parenDepth -= 1;
      if (parenDepth === 0) {
        signatureEnded = true;
      }
    } else if (ch === '{' && signatureEnded) {
      braceStart = i;
      break;
    }
  }

  if (braceStart < 0) {
    throw new Error(`missing body for function ${name}`);
  }

  let depth = 0;
  let end = braceStart;
  for (; end < source.length; end += 1) {
    const ch = source[end];
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        end += 1;
        break;
      }
    }
  }

  return source.slice(start, end);
}

const bundle = [
  extractFunction('reuseOrCreateTab'),
].join('\n');

function buildApi() {
  return new Function(`
let alive = false;
let currentTab = { id: 41, url: 'https://old.example.com/' };
const createCalls = [];
const updateCalls = [];
const remembered = [];
const stateUpdates = [];

async function isTabAlive() {
  return alive;
}

async function getTabId() {
  return currentTab.id;
}

async function ensureRunTabGroupForTab() {}
async function closeConflictingTabsForSource() {}
async function rememberSourceLastUrl(source, url) {
  remembered.push({ source, url });
}
async function getTabRegistry() {
  return {
    'signup-page': { tabId: currentTab.id, ready: true },
  };
}
async function setState(updates) {
  stateUpdates.push(updates);
}

const chrome = {
  tabs: {
    async get() {
      return currentTab;
    },
    async update(tabId, updateInfo) {
      updateCalls.push({ tabId, updateInfo });
      currentTab = {
        ...currentTab,
        ...(updateInfo.url ? { url: updateInfo.url } : {}),
      };
      return currentTab;
    },
    async create(createInfo) {
      createCalls.push(createInfo);
      currentTab = {
        id: 99,
        url: createInfo.url,
      };
      return currentTab;
    },
    async reload() {},
    onUpdated: {
      addListener(listener) {
        setImmediate(() => listener(currentTab.id, { status: 'complete' }));
      },
      removeListener() {},
    },
  },
  scripting: {
    async executeScript() {},
  },
};

const LOG_PREFIX = '[test]';
console = { log() {}, warn() {} };

${bundle}

return {
  async createInBackground() {
    alive = false;
    currentTab = { id: 41, url: 'https://old.example.com/' };
    createCalls.length = 0;
    updateCalls.length = 0;
    await reuseOrCreateTab('signup-page', 'https://auth.openai.com/authorize');
    return { createCalls: [...createCalls], updateCalls: [...updateCalls], remembered: [...remembered] };
  },
  async navigateExistingWithoutFocus() {
    alive = true;
    currentTab = { id: 41, url: 'https://old.example.com/' };
    createCalls.length = 0;
    updateCalls.length = 0;
    stateUpdates.length = 0;
    await reuseOrCreateTab('signup-page', 'https://auth.openai.com/authorize');
    return { createCalls: [...createCalls], updateCalls: [...updateCalls], stateUpdates: [...stateUpdates] };
  },
};
`)();
}

(async () => {
  const api = buildApi();

  const created = await api.createInBackground();
  assert.deepStrictEqual(
    created.createCalls,
    [{ url: 'https://auth.openai.com/authorize', active: false }],
    '默认新开标签页应在后台打开，避免抢焦点'
  );
  assert.deepStrictEqual(created.updateCalls, [], '新开后台标签页时不应额外激活标签页');

  const navigated = await api.navigateExistingWithoutFocus();
  assert.deepStrictEqual(navigated.createCalls, [], '复用已有标签页时不应再新建标签页');
  assert.deepStrictEqual(
    navigated.updateCalls[0],
    { tabId: 41, updateInfo: { url: 'https://auth.openai.com/authorize' } },
    '复用已有标签页导航时不应附带 active: true'
  );

  console.log('tab background open tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
