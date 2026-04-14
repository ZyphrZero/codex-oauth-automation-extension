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
${extractFunction('normalizeMoemailDomainValueForUi')}
${extractFunction('normalizeMoemailDomainList')}
${extractFunction('buildMoemailDomainOptionModels')}
${extractFunction('resolveMoemailDomainRefreshPreferred')}

return {
  normalizeMoemailDomainValueForUi,
  normalizeMoemailDomainList,
  buildMoemailDomainOptionModels,
  resolveMoemailDomainRefreshPreferred,
};
`)();

test('buildMoemailDomainOptionModels always keeps the random-domain option first', () => {
  assert.deepEqual(
    api.buildMoemailDomainOptionModels(['alpha.test', 'beta.test'], ''),
    {
      options: [
        { value: '', label: '随机域名' },
        { value: 'alpha.test', label: 'alpha.test' },
        { value: 'beta.test', label: 'beta.test' },
      ],
      selectedValue: '',
    }
  );
});

test('buildMoemailDomainOptionModels appends a saved domain when it is not in the fetched list', () => {
  assert.deepEqual(
    api.buildMoemailDomainOptionModels(['alpha.test'], 'saved.test'),
    {
      options: [
        { value: '', label: '随机域名' },
        { value: 'alpha.test', label: 'alpha.test' },
        { value: 'saved.test', label: 'saved.test（已保存）' },
      ],
      selectedValue: 'saved.test',
    }
  );
});

test('normalizeMoemailDomainList de-duplicates invalid and repeated domains', () => {
  assert.deepEqual(
    api.normalizeMoemailDomainList(['ALPHA.TEST', 'bad domain', 'alpha.test', '@beta.test']),
    ['alpha.test', 'beta.test']
  );
});

test('resolveMoemailDomainRefreshPreferred preserves an explicit random-domain selection', () => {
  assert.equal(
    api.resolveMoemailDomainRefreshPreferred(undefined, '', 'alpha.test'),
    '',
  );
});

test('resolveMoemailDomainRefreshPreferred falls back to the saved domain only when no current selection exists', () => {
  assert.equal(
    api.resolveMoemailDomainRefreshPreferred(undefined, undefined, 'alpha.test'),
    'alpha.test',
  );
});
