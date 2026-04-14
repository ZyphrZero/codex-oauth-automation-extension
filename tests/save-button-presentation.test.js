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

const getSaveButtonPresentation = new Function(`
${extractFunction('getSaveButtonPresentation')}
return getSaveButtonPresentation;
`)();

test('getSaveButtonPresentation keeps save button clickable after autosave completes', () => {
  assert.deepEqual(getSaveButtonPresentation(false, false), {
    disabled: false,
    label: '保存',
    title: '当前配置已保存',
  });
});

test('getSaveButtonPresentation shows active save state while request is in flight', () => {
  assert.deepEqual(getSaveButtonPresentation(true, true), {
    disabled: true,
    label: '保存中',
    title: '正在保存配置',
  });
});

test('getSaveButtonPresentation exposes manual save affordance when config is dirty', () => {
  assert.deepEqual(getSaveButtonPresentation(true, false), {
    disabled: false,
    label: '保存',
    title: '保存当前配置',
  });
});
