const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DEFAULT_MOEMAIL_API_BASE_URL,
  buildMoemailApiUrl,
  extractVerificationCode,
  normalizeTimestamp,
  normalizeMoemailApiBaseUrl,
  normalizeMoemailDomain,
  normalizeMoemailMessages,
  pickVerificationMessage,
  pickVerificationMessageWithTimeFallback,
  parseMoemailConfigDomains,
} = require('../content/moemail-utils.js');

test('normalizeMoemailApiBaseUrl falls back to the default host and strips API paths', () => {
  assert.equal(normalizeMoemailApiBaseUrl(''), DEFAULT_MOEMAIL_API_BASE_URL);
  assert.equal(
    normalizeMoemailApiBaseUrl('https://sall.cc/api/config'),
    'https://sall.cc'
  );
  assert.equal(
    normalizeMoemailApiBaseUrl('https://example.com/api/emails/generate/'),
    'https://example.com'
  );
});

test('normalizeMoemailApiBaseUrl rejects non-http urls', () => {
  assert.throws(
    () => normalizeMoemailApiBaseUrl('sall.cc/api'),
    /http:\/\/ 或 https:\/\//
  );
  assert.throws(
    () => normalizeMoemailApiBaseUrl('ftp://example.com'),
    /http:\/\/ 或 https:\/\//
  );
});

test('parseMoemailConfigDomains supports array and comma-delimited config shapes', () => {
  assert.deepEqual(
    parseMoemailConfigDomains({
      domains: [
        { domain: 'alpha.test' },
        'beta.test',
        { domain: 'alpha.test' },
      ],
    }),
    ['alpha.test', 'beta.test']
  );

  assert.deepEqual(
    parseMoemailConfigDomains({
      emailDomains: 'gamma.test, delta.test, gamma.test',
    }),
    ['gamma.test', 'delta.test']
  );
});

test('normalizeMoemailDomain keeps valid domains and drops invalid ones', () => {
  assert.equal(normalizeMoemailDomain('@Demo.TEST'), 'demo.test');
  assert.equal(normalizeMoemailDomain(''), '');
  assert.equal(normalizeMoemailDomain('bad domain'), '');
});

test('buildMoemailApiUrl appends endpoints to the normalized base url', () => {
  assert.equal(
    buildMoemailApiUrl('https://example.com/api', '/api/config'),
    'https://example.com/api/config'
  );
  assert.equal(
    buildMoemailApiUrl('https://example.com', 'api/config'),
    'https://example.com/api/config'
  );
});

test('normalizeMoemailMessages maps MoeMail payloads into the shared verification message shape', () => {
  const messages = normalizeMoemailMessages([
    {
      id: 'msg-1',
      subject: 'Your verification code is 123456',
      from_address: 'noreply@openai.com',
      html_content: '<div>Your code is <b>123456</b></div>',
      created_at: '2026-04-14T10:00:00.000Z',
    },
    {
      message_id: 'msg-2',
      title: 'Fallback subject',
      from: { address: 'alerts@example.com' },
      content: 'body text',
      receivedAt: '2026-04-14T10:01:00.000Z',
    },
  ]);

  assert.deepEqual(messages, [
    {
      id: 'msg-1',
      subject: 'Your verification code is 123456',
      from: {
        emailAddress: {
          address: 'noreply@openai.com',
        },
      },
      bodyPreview: 'Your code is 123456',
      receivedDateTime: '2026-04-14T10:00:00.000Z',
    },
    {
      id: 'msg-2',
      subject: 'Fallback subject',
      from: {
        emailAddress: {
          address: 'alerts@example.com',
        },
      },
      bodyPreview: 'body text',
      receivedDateTime: '2026-04-14T10:01:00.000Z',
    },
  ]);
});

test('extractVerificationCode picks the first six-digit verification code', () => {
  assert.equal(extractVerificationCode('你的验证码为 654321，请勿泄露。'), '654321');
  assert.equal(extractVerificationCode('Your code is 123456.'), '123456');
  assert.equal(extractVerificationCode('no code here'), null);
});

test('pickVerificationMessage filters messages by sender, subject, time, and excluded codes', () => {
  const messages = normalizeMoemailMessages([
    {
      id: 'old',
      subject: 'Your verification code is 111111',
      from_address: 'noreply@openai.com',
      content: '111111',
      created_at: '2026-04-14T10:00:00.000Z',
    },
    {
      id: 'new',
      subject: 'Your verification code is 222222',
      from_address: 'noreply@openai.com',
      content: '222222',
      created_at: '2026-04-14T10:03:00.000Z',
    },
  ]);

  const match = pickVerificationMessage(messages, {
    afterTimestamp: Date.parse('2026-04-14T10:01:00.000Z'),
    senderFilters: ['openai'],
    subjectFilters: ['verification'],
    excludeCodes: ['111111'],
  });

  assert.equal(match?.code, '222222');
  assert.equal(match?.message?.id, 'new');
});

test('pickVerificationMessageWithTimeFallback can ignore stale timestamps while keeping filters', () => {
  const messages = normalizeMoemailMessages([
    {
      id: 'mail-1',
      subject: 'Login verification code 333333',
      from_address: 'noreply@chatgpt.com',
      content: '333333',
      created_at: '2026-04-14T09:59:00.000Z',
    },
  ]);

  const result = pickVerificationMessageWithTimeFallback(messages, {
    afterTimestamp: Date.parse('2026-04-14T10:05:00.000Z'),
    senderFilters: ['chatgpt'],
    subjectFilters: ['login'],
  });

  assert.equal(result.usedTimeFallback, true);
  assert.equal(result.match?.code, '333333');
});

test('normalizeTimestamp accepts both numbers and ISO datetime strings', () => {
  assert.equal(normalizeTimestamp(123), 123);
  assert.equal(normalizeTimestamp('2026-04-14T10:00:00.000Z'), Date.parse('2026-04-14T10:00:00.000Z'));
  assert.equal(normalizeTimestamp('invalid'), 0);
});
