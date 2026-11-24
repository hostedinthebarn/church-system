// The demo seed's content and safety rules, without a database (LGC-40).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const seed = require('../lib/demo-seed/index.js');
const rules = require('../lib/rules.js');

const TODAY = '2026-11-24';
const root = path.join(__dirname, '..');

const everyone = plan => plan.households.flatMap(home => home.people);

function dayOfYear(monthDay) {
  const lengths = [ 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31 ];
  const [ month, day ] = monthDay.split('-').map(Number);
  return lengths.slice(0, month - 1).reduce((a, b) => a + b, 0) + day - 1;
}

test('the same day gives exactly the same plan', () => {
  assert.deepEqual(seed.fullPlan(TODAY), seed.fullPlan(TODAY));
});

test('about 45 households and 150 people', () => {
  const plan = seed.fullPlan(TODAY);
  assert.equal(plan.households.length, 45);
  assert.ok(everyone(plan).length >= 135 && everyone(plan).length <= 165, `people: ${everyone(plan).length}`);
});

test('every address is example.com, and a different one is refused', () => {
  const plan = seed.fullPlan(TODAY);
  const emails = everyone(plan).map(person => person.email).filter(Boolean);
  assert.ok(emails.length > 50);
  assert.ok(emails.every(email => email.endsWith('@example.com')));
  assert.equal(new Set(emails).size, emails.length, 'one person per address');
  seed.assertSafe(plan);
  plan.households[10].people[0].email = 'someone@gmail.com';
  assert.throws(() => seed.assertSafe(plan), /^Error: The demo seed only uses example\.com addresses; .+ has someone@gmail\.com\.$/);
});

test('the household shapes the data model needs are all there', () => {
  const plan = seed.fullPlan(TODAY);
  const minor = person => rules.isMinor(person.dateOfBirth, TODAY);
  const active = home => home.people.filter(person => !rules.isInactive(person));
  assert.ok(plan.households.some(home => active(home).length === 1 && !minor(active(home)[0]) &&
    Number(active(home)[0].dateOfBirth.slice(0, 4)) < 1960), 'a widow or widower');
  assert.ok(plan.households.some(home => active(home).length > 0 && active(home).every(minor)), 'a household with no adults');
  assert.ok(everyone(plan).some(person => person.inactiveReason === 'deceased'));
  assert.ok(everyone(plan).some(person => person.inactiveReason === 'left'));
  assert.ok(everyone(plan).filter(minor).length >= 25, 'minors');
  const grandparents = plan.relationships.filter(link => link.kind === 'parent-child').filter(link => {
    const home = plan.households.find(item => item.people.some(person => person.key === link.a));
    const child = plan.households.find(item => item.people.some(person => person.key === link.b));
    return home === child && home.people.some(person => rules.isMinor(person.dateOfBirth, TODAY)) &&
      !minor(home.people.find(person => person.key === link.b));
  });
  assert.ok(grandparents.length >= 1, 'a grandparent living with a daughter\'s family');
  assert.ok(plan.relationships.some(link => link.kind === 'guardian'));
  const keys = everyone(plan).map(person => person.key);
  assert.equal(new Set(keys).size, keys.length, 'keys are unique');
  for (const link of plan.relationships) {
    assert.ok(keys.includes(link.a) && keys.includes(link.b), `${link.a} / ${link.b} exist`);
  }
});

test('birthdays fall in every week of the year; anniversaries are spread', () => {
  const plan = seed.fullPlan(TODAY);
  const weeks = new Array(52).fill(0);
  for (const person of everyone(plan)) {
    weeks[Math.min(51, Math.floor(dayOfYear(person.dateOfBirth.slice(5)) / 7))]++;
  }
  assert.ok(weeks.every(count => count >= 1), `empty weeks: ${weeks.map((n, i) => (n ? null : i)).filter(n => n !== null)}`);
  const anniversaries = plan.relationships.filter(link => link.anniversary).map(link => dayOfYear(link.anniversary.slice(5)));
  assert.ok(anniversaries.length >= 30);
  const months = new Set(anniversaries.map(day => Math.floor(day / 31)));
  assert.ok(months.size >= 10, 'anniversaries across the year');
});

test('the song leader group is small on purpose, and the other serving groups are not', () => {
  const plan = seed.fullPlan(TODAY);
  const size = title => plan.groups.find(group => group.title === title).members.length;
  assert.equal(size('Song Leader'), 3);
  assert.ok(size('Opening Prayer') >= 6);
  for (const group of plan.groups) {
    assert.equal(new Set(group.members).size, group.members.length, `${group.title}: nobody twice`);
  }
});

test('the events: services, a year behind, two months ahead, one members-only', () => {
  const events = seed.eventsPlan(TODAY);
  const services = events.filter(entry => entry.regularService);
  assert.equal(services.length, 2);
  assert.ok(services.every(entry => entry.repeatEnds === 'until' && entry.repeatUntil > TODAY && entry.startDate < TODAY));
  const oneOffs = events.filter(entry => !entry.regularService);
  assert.ok(oneOffs.some(entry => entry.startDate < '2025-12-31'), 'about a year of history');
  assert.ok(oneOffs.filter(entry => entry.startDate < TODAY).length >= 10);
  assert.ok(oneOffs.filter(entry => entry.startDate > TODAY).length >= 4);
  assert.ok(oneOffs.some(entry => entry.publicEvent === false));
});

// "Never on a schedule" (Gary): nothing starts the reset by itself.
test('nothing schedules the reset', () => {
  const files = [
    path.join(root, 'modules', 'church-demo', 'index.js'),
    path.join(root, 'lib', 'demo-seed', 'reset.js'),
    path.join(root, 'lib', 'demo-seed', 'index.js'),
    path.join(root, 'lib', 'demo-seed', 'people.js'),
    path.join(root, 'lib', 'demo-data.js')
  ];
  for (const file of files) {
    // Comments may say "schedule"; only code counts.
    const code = fs.readFileSync(file, 'utf8').replace(/^\s*\/\/.*$/gm, '');
    assert.doesNotMatch(code, /setInterval|setTimeout|node-cron|\bcron\b|apostrophe:listen|schedule/i, file);
    assert.doesNotMatch(code, /Math\.random/, `${file}: the seed uses the seeded generator only`);
  }
  // Only the explicit command and the route call it.
  for (const dir of [ 'modules', 'lib' ]) {
    for (const file of fs.readdirSync(path.join(root, dir), { recursive: true })) {
      if (!String(file).endsWith('.js') || String(file).includes('church-demo') || String(file).includes('demo-seed')) {
        continue;
      }
      const code = fs.readFileSync(path.join(root, dir, String(file)), 'utf8');
      assert.doesNotMatch(code, /churchDemo\.reset|resetDemo/, `${dir}/${file} must not call the reset`);
    }
  }
  const workflows = path.join(root, '.github', 'workflows');
  if (fs.existsSync(workflows)) {
    for (const file of fs.readdirSync(workflows)) {
      assert.doesNotMatch(fs.readFileSync(path.join(workflows, file), 'utf8'), /church-demo|demo\/reset/, file);
    }
  }
  assert.doesNotMatch(fs.readFileSync(path.join(root, 'app.js'), 'utf8'), /church-demo.*(schedule|timer)/i);
});

test('the reset sends no mail', () => {
  for (const file of [ 'modules/church-demo/index.js', 'lib/demo-seed/reset.js', 'lib/demo-seed/index.js' ]) {
    assert.doesNotMatch(fs.readFileSync(path.join(root, file), 'utf8'), /mailer|sendMail|churchSignin/, file);
  }
});
