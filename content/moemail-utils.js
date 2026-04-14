(function moemailUtilsModule(root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
    return;
  }

  root.MoemailUtils = factory();
})(typeof self !== 'undefined' ? self : globalThis, function createMoemailUtils() {
  const DEFAULT_MOEMAIL_API_BASE_URL = 'https://sall.cc';

  function normalizeText(value) {
    return String(value || '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  function normalizeTimestamp(value) {
    if (!value) return 0;
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value > 0 ? value : 0;
    }

    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) ? timestamp : 0;
  }

  function firstNonEmptyString(values) {
    for (const value of values) {
      if (value === undefined || value === null) continue;
      const normalized = String(value).trim();
      if (normalized) return normalized;
    }
    return '';
  }

  function normalizeMoemailApiBaseUrl(rawValue = '') {
    const input = String(rawValue || '').trim() || DEFAULT_MOEMAIL_API_BASE_URL;
    let parsed;
    try {
      parsed = new URL(input);
    } catch {
      throw new Error('MoeMail API Base URL 必须以 http:// 或 https:// 开头');
    }

    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error('MoeMail API Base URL 必须以 http:// 或 https:// 开头');
    }

    if (parsed.pathname === '/api' || parsed.pathname.startsWith('/api/')) {
      parsed.pathname = '';
      parsed.search = '';
      parsed.hash = '';
    }

    return parsed.toString().replace(/\/$/, '');
  }

  function normalizeMoemailDomain(rawValue = '') {
    let value = String(rawValue || '').trim().toLowerCase();
    if (!value) return '';
    value = value.replace(/^@+/, '');
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(value)) {
      return '';
    }
    return value;
  }

  function parseMoemailConfigDomains(config = {}) {
    const rawDomains = [];

    if (Array.isArray(config?.domains)) {
      rawDomains.push(...config.domains.map((item) => (typeof item === 'string' ? item : item?.domain)));
    }

    const delimitedDomains = firstNonEmptyString([
      config?.emailDomains,
      config?.email_domains,
    ]);
    if (delimitedDomains) {
      rawDomains.push(...delimitedDomains.split(','));
    }

    const uniqueDomains = [];
    const seen = new Set();
    for (const rawDomain of rawDomains) {
      const normalizedDomain = normalizeMoemailDomain(rawDomain);
      if (!normalizedDomain || seen.has(normalizedDomain)) {
        continue;
      }
      seen.add(normalizedDomain);
      uniqueDomains.push(normalizedDomain);
    }

    return uniqueDomains;
  }

  function buildMoemailApiUrl(baseUrl, endpoint = '') {
    const normalizedBaseUrl = normalizeMoemailApiBaseUrl(baseUrl);
    const normalizedEndpoint = String(endpoint || '').startsWith('/')
      ? String(endpoint || '')
      : `/${String(endpoint || '')}`;
    return `${normalizedBaseUrl}${normalizedEndpoint}`;
  }

  function normalizeMailAddress(rawValue) {
    if (!rawValue) return '';
    if (typeof rawValue === 'string') {
      return rawValue.trim();
    }
    if (typeof rawValue === 'object') {
      return firstNonEmptyString([
        rawValue.emailAddress?.address,
        rawValue.address,
        rawValue.email,
        rawValue.from,
        rawValue.sender,
      ]);
    }
    return '';
  }

  function stripHtmlTags(text) {
    return String(text || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function normalizeMoemailMessage(message = {}) {
    return {
      id: firstNonEmptyString([message.id, message.messageId, message.message_id]),
      subject: firstNonEmptyString([message.subject, message.title]),
      from: {
        emailAddress: {
          address: normalizeMailAddress(
            message.from
            || message.from_address
            || message.sender
            || message.sender_email
            || message.emailAddress
          ),
        },
      },
      bodyPreview: firstNonEmptyString([
        message.bodyPreview,
        message.preview,
        message.content,
        message.text,
        message.body,
        stripHtmlTags(message.html || message.html_content || ''),
      ]),
      receivedDateTime: firstNonEmptyString([
        message.receivedDateTime,
        message.receivedAt,
        message.received_at,
        message.createdAt,
        message.created_at,
        message.date,
        message.time,
      ]),
    };
  }

  function normalizeMoemailMessages(messages) {
    const list = Array.isArray(messages)
      ? messages
      : (messages ? [messages] : []);
    return list.map((message) => normalizeMoemailMessage(message));
  }

  function extractVerificationCode(text) {
    const source = String(text || '');
    const matchCn = source.match(/(?:代码为|验证码[^0-9]*?)[\s：:]*(\d{6})/i);
    if (matchCn) return matchCn[1];

    const matchEn = source.match(/code(?:\s+is|[\s:])+(\d{6})/i);
    if (matchEn) return matchEn[1];

    const matchStandalone = source.match(/\b(\d{6})\b/);
    return matchStandalone ? matchStandalone[1] : null;
  }

  function messageMatchesFilters(message, filters = {}) {
    const senderFilters = (filters.senderFilters || []).map(normalizeText).filter(Boolean);
    const subjectFilters = (filters.subjectFilters || []).map(normalizeText).filter(Boolean);
    const afterTimestamp = normalizeTimestamp(filters.afterTimestamp);
    const receivedAt = normalizeTimestamp(message?.receivedDateTime);
    if (afterTimestamp && receivedAt && receivedAt < afterTimestamp) {
      return null;
    }

    const sender = normalizeText(message?.from?.emailAddress?.address);
    const subject = normalizeText(message?.subject);
    const preview = String(message?.bodyPreview || '');
    const combinedText = [subject, sender, preview].filter(Boolean).join(' ');
    const code = extractVerificationCode(combinedText);
    const excludedCodes = new Set((filters.excludeCodes || []).filter(Boolean));
    if (code && excludedCodes.has(code)) {
      return null;
    }

    const senderMatch = senderFilters.length === 0
      ? true
      : senderFilters.some((item) => sender.includes(item) || normalizeText(preview).includes(item));
    const subjectMatch = subjectFilters.length === 0
      ? true
      : subjectFilters.some((item) => subject.includes(item) || normalizeText(preview).includes(item));

    if (!senderMatch && !subjectMatch) {
      return null;
    }

    if (!code) {
      return null;
    }

    return {
      code,
      message,
      receivedAt,
    };
  }

  function pickVerificationMessage(messages, filters = {}) {
    const matches = (Array.isArray(messages) ? messages : [])
      .map((message) => messageMatchesFilters(message, filters))
      .filter(Boolean)
      .sort((left, right) => right.receivedAt - left.receivedAt);

    return matches[0] || null;
  }

  function pickVerificationMessageWithFallback(messages, filters = {}) {
    const strictMatch = pickVerificationMessage(messages, filters);
    return {
      match: strictMatch || null,
      usedRelaxedFilters: false,
      usedTimeFallback: false,
    };
  }

  function pickVerificationMessageWithTimeFallback(messages, filters = {}) {
    const strictOrRelaxedResult = pickVerificationMessageWithFallback(messages, filters);
    if (strictOrRelaxedResult.match) {
      return strictOrRelaxedResult;
    }

    const timeFallbackMatch = pickVerificationMessage(messages, {
      afterTimestamp: 0,
      excludeCodes: filters.excludeCodes,
      senderFilters: filters.senderFilters,
      subjectFilters: filters.subjectFilters,
    });

    return {
      match: timeFallbackMatch || null,
      usedRelaxedFilters: false,
      usedTimeFallback: Boolean(timeFallbackMatch),
    };
  }

  return {
    DEFAULT_MOEMAIL_API_BASE_URL,
    buildMoemailApiUrl,
    extractVerificationCode,
    normalizeTimestamp,
    normalizeMoemailApiBaseUrl,
    normalizeMoemailDomain,
    normalizeMoemailMessage,
    normalizeMoemailMessages,
    pickVerificationMessage,
    pickVerificationMessageWithFallback,
    pickVerificationMessageWithTimeFallback,
    parseMoemailConfigDomains,
  };
});
