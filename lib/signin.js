// Sign-in by an emailed link (LGC-45), as plain logic over a `store` so it can
// be tested without a database. The Apostrophe module supplies a MongoDB
// store, the person lookup and the session login.
//
// - A link is a random token; only its SHA-256 hash is stored.
// - Links are short-lived and single use; asking for a new one revokes the
//   old ones.
// - Requests are rate-limited per address and per IP.
// - The answer to a request never says whether the address is on file, is a
//   minor's, or is off the send-allowlist.
// - Minors and inactive people can't sign in (poc-data-model.md).
const crypto = require('node:crypto');
const rules = require('./rules.js');
const { normalizeEmail } = require('./mail.js');

const DEFAULTS = {
  ttlMs: 15 * 60 * 1000,
  windowMs: 15 * 60 * 1000,
  perEmail: 3,
  perIp: 10,
  failedRedeemsPerIp: 20
};

function newToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function looksLikeEmail(email) {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Whether this person may sign in at all.
function canSignIn(person, today) {
  return Boolean(person) &&
    Boolean(person.email) &&
    !rules.isInactive(person) &&
    !rules.isMinor(person.dateOfBirth, today);
}

// Apostrophe role for a signed-in person: the office, or a plain member.
function roleFor(person) {
  return person.officeAdmin ? 'admin' : 'guest';
}

// store: addAttempt(kind, key, at), countAttempts(kind, key, since),
//   revokeTokens(personId), createToken(record), consumeToken(hash, now)
// findPerson(email): the person record or null
// mailer: { send({ to, subject, text }) }
// buildMessage({ url, minutes, locale }): { subject, text }
function createSignin({
  store,
  mailer,
  findPerson,
  buildMessage,
  log = () => {},
  now = () => new Date(),
  options = {}
}) {
  const config = {
    ...DEFAULTS,
    ...options
  };

  async function limited(kind, key, max, at) {
    const since = new Date(at.getTime() - config.windowMs);
    return (await store.countAttempts(kind, key, since)) >= max;
  }

  // -> { status: 'sent' | 'limited' | 'invalid', reason? }. `reason` is for
  // the log, never for the person asking.
  async function requestLink({
    email, ip, verifyUrl, locale
  }) {
    const at = now();
    const address = normalizeEmail(email);
    if (!looksLikeEmail(address)) {
      return {
        status: 'invalid',
        reason: 'bad-address'
      };
    }
    if (await limited('request-ip', ip, config.perIp, at) ||
      await limited('request-email', address, config.perEmail, at)) {
      return {
        status: 'limited',
        reason: 'rate-limit'
      };
    }
    await store.addAttempt('request-ip', ip, at);
    await store.addAttempt('request-email', address, at);

    const person = await findPerson(address);
    if (!canSignIn(person, rules.todayIso(at))) {
      return {
        status: 'sent',
        reason: person ? 'not-eligible' : 'unknown-address'
      };
    }
    if (!verifyUrl) {
      log('error', 'signin-no-base-url', {});
      return {
        status: 'sent',
        reason: 'no-base-url'
      };
    }
    const token = newToken();
    await store.revokeTokens(person._id);
    await store.createToken({
      hash: hashToken(token),
      personId: person._id,
      email: address,
      createdAt: at,
      expiresAt: new Date(at.getTime() + config.ttlMs)
    });
    const url = `${verifyUrl}${verifyUrl.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`;
    const message = buildMessage({
      url,
      minutes: Math.round(config.ttlMs / 60000),
      locale
    });
    try {
      const result = await mailer.send({
        to: address,
        ...message
      });
      if (!result.sent) {
        // Never log the address; log why.
        log('warn', 'signin-mail-refused', { reason: result.reason });
        return {
          status: 'sent',
          reason: result.reason
        };
      }
    } catch (error) {
      log('error', 'signin-mail-failed', { message: error.message });
      return {
        status: 'sent',
        reason: 'send-failed'
      };
    }
    return { status: 'sent' };
  }

  // -> { ok: true, personId } | { ok: false, reason }. The caller loads the
  // person, rechecks canSignIn and starts the session.
  async function redeem({ token, ip }) {
    const at = now();
    if (await limited('redeem-fail', ip, config.failedRedeemsPerIp, at)) {
      return {
        ok: false,
        reason: 'rate-limit'
      };
    }
    const record = token ? await store.consumeToken(hashToken(token), at) : null;
    if (!record) {
      await store.addAttempt('redeem-fail', ip, at);
      return {
        ok: false,
        reason: 'invalid-or-used'
      };
    }
    return {
      ok: true,
      personId: record.personId
    };
  }

  return {
    requestLink,
    redeem,
    config
  };
}

module.exports = {
  DEFAULTS,
  canSignIn,
  createSignin,
  hashToken,
  newToken,
  roleFor
};
