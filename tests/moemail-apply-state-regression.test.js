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

const applySettingsState = new Function(`
let latestState = null;
let currentAutoRun = {};
let moemailAvailableDomains = ['alpha.test', 'beta.test', 'gamma.test'];
let sub2ApiAvailableGroups = [];
const DEFAULT_MOEMAIL_API_BASE_URL = 'https://sall.cc';
const DEFAULT_SUB2API_GROUP_NAMES = [];

const inputEmail = { value: '' };
const inputPassword = { value: '' };
const inputVpsUrl = { value: '' };
const inputVpsPassword = { value: '' };
const selectPanelMode = { value: '' };
const inputSub2ApiUrl = { value: '' };
const inputSub2ApiEmail = { value: '' };
const inputSub2ApiPassword = { value: '' };
const inputSub2ApiGroup = { value: '' };
const selectMailProvider = { value: '' };
const selectEmailGenerator = { value: '' };
const inputEmailPrefix = { value: '' };
const inputInbucketHost = { value: '' };
const inputInbucketMailbox = { value: '' };
const inputMoemailBaseUrl = { value: '' };
const inputMoemailApiKey = { value: '' };
const inputAutoSkipFailures = { checked: false };
const inputAutoSkipFailuresThreadIntervalMinutes = { value: '' };
const inputAutoDelayEnabled = { checked: false };
const inputAutoDelayMinutes = { value: '' };
const inputAutoStepDelaySeconds = { value: '' };
const inputRunCount = { value: '' };

let moemailRenderCall = null;
let sub2apiRenderCall = null;

function syncLatestState(state) { latestState = state; }
function syncAutoRunState(state) { currentAutoRun = state; }
function syncPasswordField() {}
function setLocalCpaStep9Mode() {}
function isCustomMailProvider() { return false; }
function renderSub2ApiGroupOptions(groups, selectedNames) {
  sub2apiRenderCall = { groups, selectedNames };
}
function renderMoemailDomainOptions(domains, preferredDomain) {
  moemailRenderCall = { domains, preferredDomain };
}
function renderCloudflareDomainOptions() {}
function setCloudflareDomainEditMode() {}
function normalizeAutoRunThreadIntervalMinutes(value) { return Number(value || 0); }
function normalizeAutoDelayMinutes(value) { return Number(value || 0); }
function formatAutoStepDelayInputValue(value) { return value == null ? '' : String(value); }
function applyAutoRunStatus() {}
function markSettingsDirty() {}
function updateAutoDelayInputState() {}
function updateFallbackThreadIntervalInputState() {}
function updatePanelModeUI() {}
function updateMailProviderUI() {}
function updateButtonStates() {}

${extractFunction('applySettingsState')}

return function run(state) {
  applySettingsState(state);
  return moemailRenderCall;
};
`)();

test('applySettingsState preserves loaded MoeMail domains when syncing the selected domain', () => {
  assert.deepEqual(
    applySettingsState({
      mailProvider: 'moemail',
      moemailDomain: 'beta.test',
      moemailApiBaseUrl: 'https://sall.cc',
      moemailApiKey: 'secret',
    }),
    {
      domains: ['alpha.test', 'beta.test', 'gamma.test'],
      preferredDomain: 'beta.test',
    }
  );
});
