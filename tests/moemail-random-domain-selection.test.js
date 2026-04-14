const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

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

const api = new Function(`
function normalizeMoemailDomainValue(rawValue = '') {
  const value = String(rawValue || '').trim().toLowerCase();
  if (!value) {
    return '';
  }

  const normalized = value.startsWith('@') ? value.slice(1) : value;
  return /^[a-z0-9.-]+\\.[a-z]{2,}$/i.test(normalized) ? normalized : '';
}

${extractFunction('normalizeMoemailDomain')}
${extractFunction('pickMoemailGenerationDomain')}

return {
  pickMoemailGenerationDomain,
};
`)();

function withRandom(value, callback) {
  const originalRandom = Math.random;
  Math.random = () => value;
  try {
    return callback();
  } finally {
    Math.random = originalRandom;
  }
}

test('pickMoemailGenerationDomain keeps an explicit domain selection', () => {
  assert.equal(
    api.pickMoemailGenerationDomain('beta.test', ['alpha.test', 'gamma.test']),
    'beta.test',
  );
});

test('pickMoemailGenerationDomain chooses from all fetched domains when random mode is enabled', () => {
  const selected = withRandom(0.99, () => (
    api.pickMoemailGenerationDomain('', ['alpha.test', 'beta.test', 'gamma.test'])
  ));

  assert.equal(selected, 'gamma.test');
});

test('pickMoemailGenerationDomain ignores invalid and duplicate fetched domains before random selection', () => {
  const selected = withRandom(0.8, () => (
    api.pickMoemailGenerationDomain('', ['@alpha.test', 'bad domain', 'alpha.test', 'beta.test'])
  ));

  assert.equal(selected, 'beta.test');
});

