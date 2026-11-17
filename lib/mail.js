// The mail interface (LGC-45). Everything that sends email goes through
// `mailer.send({ to, subject, text })`, so changing provider is a config
// change. Two senders: a fake one that only keeps a viewable outbox (the
// default), and Resend. The send-allowlist wraps whichever sender is chosen
// and refuses any address not on the tester list, so a made-up person can
// never email a real stranger (poc-email-spanish-testing.md).
//
// Plain functions, no Apostrophe and no network unless a sender is called.

const RESEND_URL = 'https://api.resend.com/emails';

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

// "a@x.org, @example.com" (commas, semicolons, spaces or newlines): an entry
// is an exact address, or `@domain` for everything at that domain.
function parseAllowlist(raw) {
  return String(raw || '')
    .split(/[\s,;]+/)
    .map(normalizeEmail)
    .filter(Boolean);
}

function isAllowed(allowlist, address) {
  const email = normalizeEmail(address);
  const at = email.lastIndexOf('@');
  if (at < 1) {
    return false;
  }
  const domain = email.slice(at);
  return allowlist.some(entry => entry === email || (entry.startsWith('@') && entry === domain));
}

// Keeps what it was asked to send, newest last, up to `max` messages.
function createFakeSender({ max = 200 } = {}) {
  const outbox = [];
  return {
    name: 'fake',
    async send(message) {
      const entry = {
        id: `fake-${Date.now()}-${outbox.length}`,
        at: new Date().toISOString(),
        ...message
      };
      outbox.push(entry);
      if (outbox.length > max) {
        outbox.shift();
      }
      return { id: entry.id };
    },
    outbox() {
      return outbox.slice();
    }
  };
}

function createResendSender({
  apiKey, from, fetchImpl = globalThis.fetch, timeoutMs = 10000
}) {
  if (!apiKey) {
    throw new Error('The Resend sender needs RESEND_API_KEY');
  }
  if (!from) {
    throw new Error('The Resend sender needs CHURCH_MAIL_FROM');
  }
  return {
    name: 'resend',
    async send({
      to, subject, text
    }) {
      const response = await fetchImpl(RESEND_URL, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          from,
          to: [ to ],
          subject,
          text
        }),
        signal: AbortSignal.timeout(timeoutMs)
      });
      if (!response.ok) {
        // The body can echo the request, so keep only the status.
        throw new Error(`Resend refused the message (HTTP ${response.status})`);
      }
      const body = await response.json().catch(() => ({}));
      return { id: body.id || null };
    }
  };
}

// The allowlist is enforced here, for every sender. An empty list refuses
// everything: fail closed.
function createMailer({ sender, allowlist }) {
  return {
    sender,
    allowlist,
    async send(message) {
      if (!isAllowed(allowlist, message.to)) {
        return {
          sent: false,
          reason: 'not-allowlisted'
        };
      }
      const result = await sender.send({
        ...message,
        to: normalizeEmail(message.to)
      });
      return {
        sent: true,
        id: result.id
      };
    }
  };
}

// CHURCH_MAIL=fake (default) | resend
// CHURCH_MAIL_ALLOWLIST: the tester list. The fake sender never delivers, so
//   its default is `@example.com`; Resend has no default and refuses all
//   until a list is set.
// RESEND_API_KEY, CHURCH_MAIL_FROM: Resend only, set at deploy time.
function mailerFromEnv(env = process.env, { fetchImpl } = {}) {
  const provider = (env.CHURCH_MAIL || 'fake').toLowerCase();
  if (provider === 'fake') {
    return createMailer({
      sender: createFakeSender(),
      allowlist: parseAllowlist(env.CHURCH_MAIL_ALLOWLIST || '@example.com')
    });
  }
  if (provider === 'resend') {
    return createMailer({
      sender: createResendSender({
        apiKey: env.RESEND_API_KEY,
        from: env.CHURCH_MAIL_FROM,
        fetchImpl
      }),
      allowlist: parseAllowlist(env.CHURCH_MAIL_ALLOWLIST)
    });
  }
  throw new Error(`CHURCH_MAIL must be "fake" or "resend", not "${provider}"`);
}

module.exports = {
  createFakeSender,
  createMailer,
  createResendSender,
  isAllowed,
  mailerFromEnv,
  normalizeEmail,
  parseAllowlist
};
