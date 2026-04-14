// content/sub2api-panel.js — 页内脚本：SUB2API 后台（步骤 1、9）

console.log('[MultiPage:sub2api-panel] Content script loaded on', location.href);

const SUB2API_PANEL_LISTENER_SENTINEL = 'data-multipage-sub2api-panel-listener';
const SUB2API_DEFAULT_GROUP_NAME = 'codex';
const SUB2API_DEFAULT_REDIRECT_URI = 'http://localhost:1455/auth/callback';
const SUB2API_DEFAULT_CONCURRENCY = 10;
const SUB2API_DEFAULT_PRIORITY = 1;
const SUB2API_DEFAULT_RATE_MULTIPLIER = 1;

if (document.documentElement.getAttribute(SUB2API_PANEL_LISTENER_SENTINEL) !== '1') {
  document.documentElement.setAttribute(SUB2API_PANEL_LISTENER_SENTINEL, '1');

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'EXECUTE_STEP') {
      resetStopState();
      handleStep(message.step, message.payload).then(() => {
        sendResponse({ ok: true });
      }).catch((err) => {
        if (isStopError(err)) {
          log(`步骤 ${message.step}：已被用户停止。`, 'warn');
          sendResponse({ stopped: true, error: err.message });
          return;
        }
        reportError(message.step, err.message);
        sendResponse({ error: err.message });
      });
      return true;
    }
  });
} else {
  console.log('[MultiPage:sub2api-panel] 消息监听已存在，跳过重复注册');
}

function getSub2ApiOrigin(payload = {}) {
  const rawUrl = payload.sub2apiUrl || location.href;
  try {
    return new URL(rawUrl).origin;
  } catch {
    return location.origin;
  }
}

function normalizeRedirectUri() {
  const input = SUB2API_DEFAULT_REDIRECT_URI;
  const withProtocol = /^https?:\/\//i.test(input) ? input : `http://${input}`;
  const parsed = new URL(withProtocol);
  if (!parsed.pathname || parsed.pathname === '/') {
    parsed.pathname = '/auth/callback';
  }
  if (parsed.pathname !== '/auth/callback') {
    throw new Error('SUB2API 回调地址必须是 /auth/callback，例如 http://localhost:1455/auth/callback');
  }
  return parsed.toString();
}

async function handleStep(step, payload = {}) {
  switch (step) {
    case 1:
      return step1_generateOpenAiAuthUrl(payload);
    case 9:
      return step9_submitOpenAiCallback(payload);
    default:
      throw new Error(`sub2api-panel.js 不处理步骤 ${step}`);
  }
}

async function requestJson(origin, path, options = {}) {
  throwIfStopped();
  const {
    method = 'GET',
    token = '',
    body = undefined,
  } = options;

  const response = await fetch(`${origin}${path}`, {
    method,
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (json && typeof json === 'object' && 'code' in json) {
    if (json.code === 0) {
      return json.data;
    }
    throw new Error(json.message || json.detail || `请求失败（${path}）`);
  }

  if (!response.ok) {
    throw new Error((json && (json.message || json.detail)) || `请求失败（HTTP ${response.status}）：${path}`);
  }

  return json;
}

function storeAuthSession(loginData) {
  if (!loginData?.access_token) {
    throw new Error('SUB2API 登录返回缺少 access_token。');
  }

  localStorage.setItem('auth_token', loginData.access_token);
  if (loginData.refresh_token) {
    localStorage.setItem('refresh_token', loginData.refresh_token);
  } else {
    localStorage.removeItem('refresh_token');
  }
  if (loginData.expires_in) {
    localStorage.setItem('token_expires_at', String(Date.now() + Number(loginData.expires_in) * 1000));
  }
  if (loginData.user) {
    localStorage.setItem('auth_user', JSON.stringify(loginData.user));
  }
  sessionStorage.removeItem('auth_expired');
}

async function loginSub2Api(payload = {}) {
  const email = (payload.sub2apiEmail || '').trim();
  const password = payload.sub2apiPassword || '';
  const origin = getSub2ApiOrigin(payload);

  if (!email) {
    throw new Error('缺少 SUB2API 登录邮箱，请先在侧边栏填写。');
  }
  if (!password) {
    throw new Error('缺少 SUB2API 登录密码，请先在侧边栏填写。');
  }

  log('步骤：正在登录 SUB2API 后台...');
  const loginData = await requestJson(origin, '/api/v1/auth/login', {
    method: 'POST',
    body: {
      email,
      password,
    },
  });
  storeAuthSession(loginData);

  return {
    origin,
    token: loginData.access_token,
    user: loginData.user || null,
  };
}

function normalizeSub2ApiGroupName(rawValue = '') {
  return String(rawValue || '').trim();
}

function normalizeSub2ApiGroupNames(rawValue = []) {
  const values = Array.isArray(rawValue) ? rawValue : [];
  const seen = new Set();
  const names = [];

  for (const value of values) {
    const normalized = normalizeSub2ApiGroupName(value);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(normalized);
  }

  return names;
}

function getSelectedSub2ApiGroupNames(payload = {}, backgroundState = {}) {
  const payloadNames = normalizeSub2ApiGroupNames(payload.sub2apiGroupNames);
  if (payloadNames.length) {
    return payloadNames;
  }

  const backgroundNames = normalizeSub2ApiGroupNames(backgroundState.sub2apiGroupNames);
  if (backgroundNames.length) {
    return backgroundNames;
  }

  return [];
}

function normalizeSub2ApiGroupRecords(groups = []) {
  const seenIds = new Set();
  const seenNames = new Set();
  const normalizedGroups = [];

  for (const group of Array.isArray(groups) ? groups : []) {
    const id = Number(group?.id);
    const name = normalizeSub2ApiGroupName(group?.name);
    const platform = String(group?.platform || '').trim().toLowerCase();
    if (!Number.isFinite(id) || id <= 0 || !name) continue;
    if (platform && platform !== 'openai') continue;

    const nameKey = name.toLowerCase();
    if (seenIds.has(id) || seenNames.has(nameKey)) continue;
    seenIds.add(id);
    seenNames.add(nameKey);
    normalizedGroups.push({
      id,
      name,
      platform: platform || 'openai',
    });
  }

  return normalizedGroups;
}

async function fetchOpenAiGroups(origin, token) {
  const groups = await requestJson(origin, '/api/v1/admin/groups/all?platform=openai', {
    method: 'GET',
    token,
  });
  return normalizeSub2ApiGroupRecords(groups);
}

function resolveSub2ApiGroups(groups = [], groupNames = []) {
  const availableGroups = normalizeSub2ApiGroupRecords(groups);
  const selectedNames = normalizeSub2ApiGroupNames(groupNames);
  const matchedGroups = [];
  const missingNames = [];

  selectedNames.forEach((name) => {
    const lowerName = name.toLowerCase();
    const matchedGroup = availableGroups.find((group) => group.name.toLowerCase() === lowerName);
    if (matchedGroup) {
      matchedGroups.push(matchedGroup);
    } else {
      missingNames.push(name);
    }
  });

  if (missingNames.length) {
    throw new Error(`SUB2API 中未找到这些 openai 分组：${missingNames.join('、')}。`);
  }

  return matchedGroups;
}

function buildDraftAccountName(groupName) {
  const prefix = (groupName || SUB2API_DEFAULT_GROUP_NAME)
    .trim()
    .replace(/[^\w\u4e00-\u9fa5-]+/g, '-')
    .replace(/^-+|-+$/g, '') || SUB2API_DEFAULT_GROUP_NAME;
  const stamp = new Date().toISOString().replace(/\D/g, '').slice(2, 14);
  const random = Math.floor(Math.random() * 9000 + 1000);
  return `${prefix}-${stamp}-${random}`;
}

function buildSub2ApiAccountCreatePayload(accountName, credentials, extra, groupIds) {
  const normalizedGroupIds = Array.isArray(groupIds)
    ? groupIds.map((groupId) => Number(groupId)).filter((groupId) => Number.isFinite(groupId) && groupId > 0)
    : [];
  if (!normalizedGroupIds.length) {
    throw new Error('SUB2API 返回的目标分组 ID 无效。');
  }

  const payload = {
    name: accountName,
    notes: '',
    platform: 'openai',
    type: 'oauth',
    credentials,
    concurrency: SUB2API_DEFAULT_CONCURRENCY,
    priority: SUB2API_DEFAULT_PRIORITY,
    rate_multiplier: SUB2API_DEFAULT_RATE_MULTIPLIER,
    group_ids: normalizedGroupIds,
    auto_pause_on_expired: true,
  };

  if (extra) {
    payload.extra = extra;
  }

  return payload;
}

function extractStateFromAuthUrl(authUrl) {
  try {
    return new URL(authUrl).searchParams.get('state') || '';
  } catch {
    return '';
  }
}

function parseLocalhostCallback(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('提供的回调 URL 不是合法链接。');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('回调 URL 协议不正确。');
  }
  if (!['localhost', '127.0.0.1'].includes(parsed.hostname)) {
    throw new Error('步骤 9 只接受 localhost / 127.0.0.1 回调地址。');
  }
  if (parsed.pathname !== '/auth/callback') {
    throw new Error('回调 URL 路径必须是 /auth/callback。');
  }

  const code = (parsed.searchParams.get('code') || '').trim();
  const state = (parsed.searchParams.get('state') || '').trim();
  if (!code || !state) {
    throw new Error('回调 URL 中缺少 code 或 state。');
  }

  return {
    url: parsed.toString(),
    code,
    state,
  };
}

function buildOpenAiCredentials(exchangeData) {
  const credentials = {};
  const allowedKeys = [
    'access_token',
    'refresh_token',
    'id_token',
    'expires_at',
    'email',
    'chatgpt_account_id',
    'chatgpt_user_id',
    'organization_id',
    'plan_type',
    'client_id',
  ];

  for (const key of allowedKeys) {
    if (exchangeData?.[key] !== undefined && exchangeData?.[key] !== null && exchangeData?.[key] !== '') {
      credentials[key] = exchangeData[key];
    }
  }

  if (!credentials.access_token) {
    throw new Error('SUB2API 交换授权码后未返回 access_token。');
  }

  return credentials;
}

function buildOpenAiExtra(exchangeData) {
  const extra = {};
  const allowedKeys = ['email', 'name', 'privacy_mode'];

  for (const key of allowedKeys) {
    if (exchangeData?.[key] !== undefined && exchangeData?.[key] !== null && exchangeData?.[key] !== '') {
      extra[key] = exchangeData[key];
    }
  }

  return Object.keys(extra).length ? extra : undefined;
}

async function getBackgroundState() {
  try {
    return await chrome.runtime.sendMessage({ type: 'GET_STATE', source: 'sub2api-panel' });
  } catch {
    return {};
  }
}

function openAccountsPageSoon(origin) {
  const accountsUrl = `${origin}/admin/accounts`;
  if (location.href === accountsUrl || location.pathname.startsWith('/admin/accounts')) {
    return;
  }
  setTimeout(() => {
    try {
      location.replace(accountsUrl);
    } catch { }
  }, 500);
}

async function step1_generateOpenAiAuthUrl(payload = {}) {
  const redirectUri = normalizeRedirectUri();
  const selectedGroupNames = getSelectedSub2ApiGroupNames(payload);
  if (!selectedGroupNames.length) {
    throw new Error('尚未选择 SUB2API 分组，请先在侧边栏勾选至少一个分组。');
  }

  const { origin, token } = await loginSub2Api(payload);
  const groups = resolveSub2ApiGroups(await fetchOpenAiGroups(origin, token), selectedGroupNames);
  const draftName = buildDraftAccountName(groups[0]?.name || selectedGroupNames[0] || SUB2API_DEFAULT_GROUP_NAME);
  const groupSummary = groups.map((group) => `${group.name}（#${group.id}）`).join('、');

  log(`步骤 1：已登录 SUB2API，使用分组 ${groupSummary}。`);
  log(`步骤 1：正在向 SUB2API 生成 OpenAI Auth 链接，回调地址为 ${redirectUri}。`);

  const authData = await requestJson(origin, '/api/v1/admin/openai/generate-auth-url', {
    method: 'POST',
    token,
    body: {
      redirect_uri: redirectUri,
    },
  });

  const oauthUrl = String(authData?.auth_url || '').trim();
  const sessionId = String(authData?.session_id || '').trim();
  const oauthState = String(authData?.state || extractStateFromAuthUrl(oauthUrl)).trim();

  if (!oauthUrl || !sessionId) {
    throw new Error('SUB2API 未返回完整的 auth_url / session_id。');
  }

  log(`步骤 1：已获取 SUB2API OAuth 链接：${oauthUrl.slice(0, 96)}...`, 'ok');
  reportComplete(1, {
    oauthUrl,
    sub2apiSessionId: sessionId,
    sub2apiOAuthState: oauthState,
    sub2apiGroupIds: groups.map((group) => group.id),
    sub2apiDraftName: draftName,
  });
  openAccountsPageSoon(origin);
}

async function step9_submitOpenAiCallback(payload = {}) {
  const callback = parseLocalhostCallback(payload.localhostUrl || '');
  const backgroundState = await getBackgroundState();
  const flowEmail = String(backgroundState.email || '').trim();
  const selectedGroupNames = getSelectedSub2ApiGroupNames(payload, backgroundState);

  const sessionId = String(payload.sub2apiSessionId || backgroundState.sub2apiSessionId || '').trim();
  const expectedState = String(payload.sub2apiOAuthState || backgroundState.sub2apiOAuthState || '').trim();
  const accountName = flowEmail
    || String(payload.sub2apiDraftName || backgroundState.sub2apiDraftName || '').trim()
    || buildDraftAccountName(selectedGroupNames[0] || SUB2API_DEFAULT_GROUP_NAME);

  const { origin, token } = await loginSub2Api(payload);
  const groupIds = Array.isArray(payload.sub2apiGroupIds) && payload.sub2apiGroupIds.length
    ? payload.sub2apiGroupIds
    : backgroundState.sub2apiGroupIds;
  if (!selectedGroupNames.length && !(Array.isArray(groupIds) && groupIds.length)) {
    throw new Error('尚未选择 SUB2API 分组，请先在侧边栏勾选至少一个分组。');
  }
  const resolvedGroupIds = Array.isArray(groupIds) && groupIds.length
    ? groupIds
    : resolveSub2ApiGroups(await fetchOpenAiGroups(origin, token), selectedGroupNames).map((group) => group.id);

  if (!sessionId) {
    throw new Error('缺少 SUB2API session_id，请重新执行步骤 1。');
  }
  if (expectedState && expectedState !== callback.state) {
    throw new Error('本次 localhost 回调中的 state 与步骤 1 生成的 state 不一致，请重新执行步骤 1。');
  }

  log('步骤 9：正在向 SUB2API 交换 OpenAI 授权码...');
  const exchangeData = await requestJson(origin, '/api/v1/admin/openai/exchange-code', {
    method: 'POST',
    token,
    body: {
      session_id: sessionId,
      code: callback.code,
      state: callback.state,
    },
  });

  const credentials = buildOpenAiCredentials(exchangeData);
  const extra = buildOpenAiExtra(exchangeData);
  const createPayload = buildSub2ApiAccountCreatePayload(accountName, credentials, extra, resolvedGroupIds);
  const groupSummary = selectedGroupNames.join('、');

  log(`步骤 9：授权码交换成功，正在创建 SUB2API 账号（名称：${accountName}，分组：${groupSummary}）...`);
  const createdAccount = await requestJson(origin, '/api/v1/admin/accounts', {
    method: 'POST',
    token,
    body: createPayload,
  });

  const verifiedStatus = `SUB2API 已创建账号 #${createdAccount?.id || 'unknown'}`;
  log(`步骤 9：${verifiedStatus}`, 'ok');
  reportComplete(9, {
    localhostUrl: callback.url,
    verifiedStatus,
  });
  openAccountsPageSoon(origin);
}

reportReady();
