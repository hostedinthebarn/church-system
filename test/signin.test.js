const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createSignin, canSignIn, hashToken, roleFor
} = require('../lib/signin.js');
const { createFakeSender, createMailer } = require('../lib/mail.js');

// In-memory version of the store the Apostrophe module keeps in MongoDB.
function memoryStore() {
  const attempts = [];
  const tokens = [];
  return {
    tokens,
    async addAttempt(kind, key, at) {
      attempts.push({
        kind,
        key,
        at
      });
    },
    async countAttempts(kind, key, since) {
      return attempts.filter(a => a.kind === kind && a.key === key && a.at >= since).length;
    },
    async revokeTokens(personId) {
      for (const token of tokens) {
        if (token.personId === personId && !token.usedAt) {
          token.usedAt = new Date();
        }
      }
    },
    async createToken(record) {
      tokens.push({
        ...record,
        usedAt: null
      });
    },
    async consumeToken(hash, now) {
      const token = tokens.find(t => t.hash === hash && !t.usedAt && t.expiresAt > now);
      if (!token) {
        return null;
      }
      token.usedAt = now;
      return token;
    }
  };
}

const NOW = new Date('2026-11-13T12:00:00Z');
const adult = (extra = {}) => ({
  _id: 'p1',
  email: 'jo@example.com',
  firstName: 'Jo',
  dateOfBirth: '1980-05-01',
  ...extra
});

function setup({
  people = [ adult() ], allowlist = [ '@example.com' ], options, clock = { now: NOW }
} = {}) {
  const store = memoryStore();
  const sender = createFakeSender();
  const logs = [];
  const signin = createSignin({
    store,
    mailer: createMailer({
      sender,
      allowlist
    }),
    findPerson: async email => people.find(p => p.email === email) || null,
    buildMessage: ({ url, minutes }) => ({
      subject: 'Sign in',
      text: `${url} (${minutes})`
    }),
    log: (level, name, data) => logs.push({
      level,
      name,
      data
    }),
    now: () => clock.now,
    options
  });
  return {
    signin,
    store,
    sender,
    logs,
    clock
  };
}

const ask = (signin, email = 'jo@example.com', ip = '1.1.1.1') => signin.requestLink({
  email,
  ip,
  verifyUrl: 'https://x.test/sign-in/verify',
  locale: 'en'
});
const tokenFrom = sender => new URL(/https?:\/\/\S+/.exec(sender.outbox().at(-1).text)[0]).searchParams.get('token');

test('a member asks for a link, gets it by mail, and it signs them in once', async () => {
  const {
    signin, sender, store
  } = setup();
  assert.deepEqual(await ask(signin), { status: 'sent' });
  assert.equal(sender.outbox().length, 1);
  assert.equal(sender.outbox()[0].to, 'jo@example.com');
  const token = tokenFrom(sender);
  assert.ok(token.length >= 40);
  // Only the hash is stored.
  assert.equal(JSON.stringify(store.tokens).includes(token), false);
  assert.equal(store.tokens[0].hash, hashToken(token));

  assert.deepEqual(await signin.redeem({
    token,
    ip: '1.1.1.1'
  }), {
    ok: true,
    personId: 'p1'
  });
  const second = await signin.redeem({
    token,
    ip: '1.1.1.1'
  });
  assert.equal(second.ok, false);
});

test('a link expires', async () => {
  const {
    signin, sender, clock
  } = setup();
  await ask(signin);
  const token = tokenFrom(sender);
  clock.now = new Date(NOW.getTime() + 16 * 60 * 1000);
  assert.equal((await signin.redeem({
    token,
    ip: 'x'
  })).ok, false);
});

test('a new link revokes the older one', async () => {
  const {
    signin, sender
  } = setup();
  await ask(signin);
  const first = tokenFrom(sender);
  await ask(signin);
  const second = tokenFrom(sender);
  assert.equal((await signin.redeem({
    token: first,
    ip: 'x'
  })).ok, false);
  assert.equal((await signin.redeem({
    token: second,
    ip: 'x'
  })).ok, true);
});

test('a made-up token fails', async () => {
  const { signin } = setup();
  assert.equal((await signin.redeem({
    token: 'nope',
    ip: 'x'
  })).ok, false);
  assert.equal((await signin.redeem({
    token: '',
    ip: 'x'
  })).ok, false);
});

test('unknown, minor, inactive and no-birthdate people get the same answer and no mail', async () => {
  const people = [
    adult({
      _id: 'm',
      email: 'kid@example.com',
      dateOfBirth: '2015-01-01'
    }),
    adult({
      _id: 'i',
      email: 'gone@example.com',
      inactiveReason: 'moved'
    }),
    adult({
      _id: 'u',
      email: 'nodob@example.com',
      dateOfBirth: ''
    })
  ];
  const {
    signin, sender
  } = setup({ people });
  for (const email of [ 'nobody@example.com', 'kid@example.com', 'gone@example.com', 'nodob@example.com' ]) {
    const result = await ask(signin, email);
    assert.equal(result.status, 'sent', email);
  }
  assert.equal(sender.outbox().length, 0);
});

test('an address off the send-allowlist is refused: same answer, no mail, nothing stored as sent', async () => {
  const {
    signin, sender, logs
  } = setup({
    people: [ adult({ email: 'real@gmail.com' }) ],
    allowlist: [ '@example.com' ]
  });
  const result = await ask(signin, 'real@gmail.com');
  assert.equal(result.status, 'sent');
  assert.equal(result.reason, 'not-allowlisted');
  assert.equal(sender.outbox().length, 0);
  assert.equal(logs[0].name, 'signin-mail-refused');
  assert.equal(JSON.stringify(logs).includes('real@gmail.com'), false);
});

test('a sender that fails is logged, and the person still sees the same answer', async () => {
  const store = memoryStore();
  const logs = [];
  const signin = createSignin({
    store,
    mailer: {
      async send() {
        throw new Error('boom');
      }
    },
    findPerson: async () => adult(),
    buildMessage: () => ({
      subject: 's',
      text: 't'
    }),
    log: (level, name) => logs.push(name),
    now: () => NOW
  });
  assert.equal((await ask(signin)).status, 'sent');
  assert.deepEqual(logs, [ 'signin-mail-failed' ]);
});

test('requests are rate-limited per address and per IP, and the window passes', async () => {
  const {
    signin, clock
  } = setup();
  for (let i = 0; i < 3; i++) {
    assert.equal((await ask(signin)).status, 'sent');
  }
  assert.equal((await ask(signin)).status, 'limited');
  // Another address from another IP is untouched.
  assert.equal((await ask(signin, 'other@example.com', '2.2.2.2')).status, 'sent');
  clock.now = new Date(NOW.getTime() + 16 * 60 * 1000);
  assert.equal((await ask(signin)).status, 'sent');

  const ipLimited = setup();
  for (let i = 0; i < 10; i++) {
    await ask(ipLimited.signin, `a${i}@example.com`, '9.9.9.9');
  }
  assert.equal((await ask(ipLimited.signin, 'z@example.com', '9.9.9.9')).status, 'limited');
});

test('failed redeems from one IP are limited too', async () => {
  const { signin } = setup({ options: { failedRedeemsPerIp: 2 } });
  await signin.redeem({
    token: 'a',
    ip: 'bad'
  });
  await signin.redeem({
    token: 'b',
    ip: 'bad'
  });
  assert.equal((await signin.redeem({
    token: 'c',
    ip: 'bad'
  })).reason, 'rate-limit');
});

test('a bad address is invalid and does not count against the limit', async () => {
  const { signin } = setup();
  assert.equal((await ask(signin, 'not an email')).status, 'invalid');
  assert.equal((await ask(signin, '')).status, 'invalid');
});

test('no base URL means no link is sent, and it is logged', async () => {
  const {
    signin, sender, logs
  } = setup();
  const result = await signin.requestLink({
    email: 'jo@example.com',
    ip: 'x',
    verifyUrl: null,
    locale: 'en'
  });
  assert.equal(result.status, 'sent');
  assert.equal(sender.outbox().length, 0);
  assert.equal(logs[0].name, 'signin-no-base-url');
});

test('canSignIn and roleFor', () => {
  const today = '2026-11-13';
  assert.equal(canSignIn(adult(), today), true);
  assert.equal(canSignIn(adult({ email: '' }), today), false);
  assert.equal(canSignIn(null, today), false);
  assert.equal(roleFor(adult()), 'guest');
  assert.equal(roleFor(adult({ officeAdmin: true })), 'admin');
});
