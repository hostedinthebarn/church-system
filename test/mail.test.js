const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createFakeSender, createMailer, createResendSender, isAllowed, mailerFromEnv, parseAllowlist
} = require('../lib/mail.js');

test('the allowlist takes addresses and @domains, in any separator', () => {
  const list = parseAllowlist('Brynna@Example.org, @example.com;\n scott@x.org');
  assert.deepEqual(list, [ 'brynna@example.org', '@example.com', 'scott@x.org' ]);
  assert.ok(isAllowed(list, 'BRYNNA@example.org'));
  assert.ok(isAllowed(list, 'anyone@example.com'));
  assert.ok(isAllowed(list, ' scott@x.org '));
});

test('the allowlist refuses everything else, and an empty list refuses all', () => {
  const list = parseAllowlist('@example.com');
  assert.equal(isAllowed(list, 'stranger@gmail.com'), false);
  assert.equal(isAllowed(list, 'x@evil.example.com'), false);
  assert.equal(isAllowed(list, 'x@example.com.evil.org'), false);
  assert.equal(isAllowed(list, 'not-an-address'), false);
  assert.equal(isAllowed(list, ''), false);
  assert.equal(isAllowed([], 'a@example.com'), false);
});

test('the mailer sends allowed mail and keeps it in the fake outbox', async () => {
  const sender = createFakeSender();
  const mailer = createMailer({
    sender,
    allowlist: [ '@example.com' ]
  });
  const result = await mailer.send({
    to: 'Jo@Example.com',
    subject: 'Hi',
    text: 'Body'
  });
  assert.equal(result.sent, true);
  assert.equal(sender.outbox().length, 1);
  assert.equal(sender.outbox()[0].to, 'jo@example.com');
});

test('the mailer refuses an address off the list and never calls the sender', async () => {
  let called = false;
  const mailer = createMailer({
    sender: {
      async send() {
        called = true;
        return {};
      }
    },
    allowlist: [ '@example.com' ]
  });
  const result = await mailer.send({
    to: 'real@gmail.com',
    subject: 's',
    text: 't'
  });
  assert.deepEqual(result, {
    sent: false,
    reason: 'not-allowlisted'
  });
  assert.equal(called, false);
});

test('the fake outbox is capped', async () => {
  const sender = createFakeSender({ max: 2 });
  for (const n of [ 1, 2, 3 ]) {
    await sender.send({
      to: 'a@example.com',
      subject: String(n),
      text: ''
    });
  }
  assert.deepEqual(sender.outbox().map(m => m.subject), [ '2', '3' ]);
});

test('Resend posts the message with the key, and never echoes the key in an error', async () => {
  const calls = [];
  const sender = createResendSender({
    apiKey: 're_secret',
    from: 'Church <signin@example.org>',
    fetchImpl: async (url, init) => {
      calls.push({
        url,
        init
      });
      return {
        ok: true,
        json: async () => ({ id: 'abc' })
      };
    }
  });
  const result = await sender.send({
    to: 'a@example.com',
    subject: 'S',
    text: 'T'
  });
  assert.equal(result.id, 'abc');
  assert.equal(calls[0].url, 'https://api.resend.com/emails');
  assert.equal(calls[0].init.headers.authorization, 'Bearer re_secret');
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    from: 'Church <signin@example.org>',
    to: [ 'a@example.com' ],
    subject: 'S',
    text: 'T'
  });

  const failing = createResendSender({
    apiKey: 're_secret',
    from: 'x@example.org',
    fetchImpl: async () => ({
      ok: false,
      status: 403
    })
  });
  await assert.rejects(
    failing.send({
      to: 'a@example.com',
      subject: 'S',
      text: 'T'
    }),
    error => /HTTP 403/.test(error.message) && !error.message.includes('re_secret')
  );
});

test('config: fake by default with an @example.com allowlist', () => {
  const mailer = mailerFromEnv({});
  assert.equal(mailer.sender.name, 'fake');
  assert.deepEqual(mailer.allowlist, [ '@example.com' ]);
});

test('config: Resend needs a key and a from address, and starts with an empty allowlist', () => {
  assert.throws(() => mailerFromEnv({ CHURCH_MAIL: 'resend' }), /RESEND_API_KEY/);
  assert.throws(() => mailerFromEnv({
    CHURCH_MAIL: 'resend',
    RESEND_API_KEY: 'k'
  }), /CHURCH_MAIL_FROM/);
  const mailer = mailerFromEnv({
    CHURCH_MAIL: 'resend',
    RESEND_API_KEY: 'k',
    CHURCH_MAIL_FROM: 'a@example.org'
  });
  assert.equal(mailer.sender.name, 'resend');
  assert.deepEqual(mailer.allowlist, []);
});

test('config: an unknown provider is an error', () => {
  assert.throws(() => mailerFromEnv({ CHURCH_MAIL: 'smtp' }), /fake.*resend/);
});
