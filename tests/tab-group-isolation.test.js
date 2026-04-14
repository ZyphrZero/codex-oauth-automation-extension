const assert = require('assert');
const fs = require('fs');

const source = fs.readFileSync('background.js', 'utf8');

function extractFunction(name) {
  const markers = [`async function ${name}(`, `function ${name}(`];
  const start = markers
    .map(marker => source.indexOf(marker))
    .find(index => index >= 0);

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
  extractFunction('normalizeRunTabGroupId'),
  extractFunction('getRunTabGroupId'),
  extractFunction('doesTabBelongToRunGroup'),
  extractFunction('filterTabsForCurrentRun'),
  extractFunction('getTabRegistry'),
  extractFunction('parseUrlSafely'),
  extractFunction('isSignupPageHost'),
  extractFunction('is163MailHost'),
  extractFunction('matchesSourceUrlFamily'),
  extractFunction('closeConflictingTabsForSource'),
].join('\n');

const api = new Function(`
let currentState = {
  runTabGroupId: 11,
  sourceLastUrls: {
    'signup-page': 'https://auth.openai.com/authorize',
  },
  tabRegistry: {
    'signup-page': { tabId: 1, ready: true },
  },
};
let currentTabs = [];
const removedBatches = [];
const logMessages = [];

const chrome = {
  tabs: {
    async query() {
      return currentTabs;
    },
    async remove(ids) {
      removedBatches.push(ids);
      currentTabs = currentTabs.filter((tab) => !ids.includes(tab.id));
    },
  },
};

async function getState() {
  return currentState;
}

async function setState(updates) {
  currentState = { ...currentState, ...updates };
}

function getSourceLabel(source) {
  return source;
}

async function addLog(message) {
  logMessages.push(message);
}

${bundle}

return {
  closeConflictingTabsForSource,
  reset({ tabs, state }) {
    currentTabs = tabs;
    removedBatches.length = 0;
    logMessages.length = 0;
    currentState = {
      runTabGroupId: 11,
      sourceLastUrls: {
        'signup-page': 'https://auth.openai.com/authorize',
      },
      tabRegistry: {
        'signup-page': { tabId: 1, ready: true },
      },
      ...(state || {}),
    };
  },
  snapshot() {
    return {
      currentState,
      currentTabs,
      removedBatches,
      logMessages,
    };
  },
};
`)();

(async () => {
  api.reset({
    tabs: [
      { id: 1, url: 'https://auth.openai.com/authorize?state=current', groupId: 11 },
      { id: 2, url: 'https://auth.openai.com/authorize?state=old-same-group', groupId: 11 },
      { id: 3, url: 'https://auth.openai.com/authorize?state=other-group', groupId: 22 },
      { id: 4, url: 'https://mail.qq.com/', groupId: 11 },
    ],
  });

  await api.closeConflictingTabsForSource('signup-page', 'https://auth.openai.com/authorize?state=current', {
    excludeTabIds: [1],
  });

  let snapshot = api.snapshot();
  assert.deepStrictEqual(
    snapshot.removedBatches,
    [[2]],
    '只应清理当前运行标签组内的同类旧标签页'
  );
  assert.strictEqual(snapshot.currentTabs.some((tab) => tab.id === 3), true, '其他标签组中的同类页不应被误删');
  assert.strictEqual(snapshot.currentTabs.some((tab) => tab.id === 4), true, '同组但不同来源的页不应被误删');

  api.reset({
    state: {
      runTabGroupId: null,
    },
    tabs: [
      { id: 1, url: 'https://auth.openai.com/authorize?state=current', groupId: 11 },
      { id: 2, url: 'https://auth.openai.com/authorize?state=old-same-group', groupId: 11 },
    ],
  });

  await api.closeConflictingTabsForSource('signup-page', 'https://auth.openai.com/authorize?state=current', {
    excludeTabIds: [1],
  });

  snapshot = api.snapshot();
  assert.deepStrictEqual(snapshot.removedBatches, [], '没有当前运行标签组时不应扫描全窗口清理');

  console.log('tab group isolation tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
