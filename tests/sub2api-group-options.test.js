const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('sidepanel/sidepanel.js', 'utf8');

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

const api = new Function(`
const DEFAULT_SUB2API_GROUP_NAME = 'codex';
const DEFAULT_SUB2API_GROUP_NAMES = [];

${extractFunction('normalizeSub2ApiGroupNameForUi')}
${extractFunction('normalizeSub2ApiGroupNamesForUi')}
${extractFunction('normalizeSub2ApiGroupRecords')}
${extractFunction('buildSub2ApiGroupOptionModels')}

return {
  normalizeSub2ApiGroupNamesForUi,
  normalizeSub2ApiGroupRecords,
  buildSub2ApiGroupOptionModels,
};
`)();

test('normalizeSub2ApiGroupRecords keeps only unique openai groups', () => {
  assert.deepEqual(
    api.normalizeSub2ApiGroupRecords([
      { id: 1, name: 'alpha', platform: 'openai', account_count: 5 },
      { id: 1, name: 'alpha', platform: 'openai', account_count: 9 },
      { id: 2, name: 'beta', platform: 'anthropic', account_count: 3 },
      { id: 3, name: 'gamma', platform: 'openai', account_count: 7 },
    ]),
    [
      { id: 1, name: 'alpha', platform: 'openai', accountCount: 5 },
      { id: 3, name: 'gamma', platform: 'openai', accountCount: 7 },
    ]
  );
});

test('buildSub2ApiGroupOptionModels preserves all fetched groups and selected names', () => {
  assert.deepEqual(
    api.buildSub2ApiGroupOptionModels(
      [
        { id: 1, name: 'alpha', platform: 'openai', account_count: 1 },
        { id: 2, name: 'beta', platform: 'openai', account_count: 2 },
        { id: 3, name: 'gamma', platform: 'openai', account_count: 3 },
      ],
      ['beta', 'gamma']
    ),
    {
      options: [
        { id: 1, name: 'alpha', platform: 'openai', accountCount: 1 },
        { id: 2, name: 'beta', platform: 'openai', accountCount: 2 },
        { id: 3, name: 'gamma', platform: 'openai', accountCount: 3 },
      ],
      selectedNames: ['beta', 'gamma'],
    }
  );
});

test('buildSub2ApiGroupOptionModels leaves selection empty when nothing is selected', () => {
  assert.deepEqual(
    api.buildSub2ApiGroupOptionModels([], []),
    {
      options: [],
      selectedNames: [],
    }
  );
});
