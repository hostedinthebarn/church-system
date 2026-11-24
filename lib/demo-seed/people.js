// The generated part of the demo: households and people to bring the small
// hand-made set in lib/demo-data.js up to about 45 households and 150
// people. Fixed shapes, fixed order and a seeded generator, so every run makes
// the same content. Dates of birth are worked out from `today`, so a child
// stays a child; the content (names, shapes, days of the year) does not change.
const { createRng } = require('./rng.js');
const names = require('./names.js');

// The shapes of the 36 generated households, in no particular order.
const SHAPES = [
  ...Array(20).fill('family'),
  ...Array(3).fill('couple'),
  ...Array(4).fill('widow'),
  ...Array(3).fill('multigen'),
  ...Array(3).fill('grown'),
  'minors',
  ...Array(2).fill('single')
];

// How many children a family has: weights for 1, 2, 3 and 4.
const KID_WEIGHTS = [ 1, 4, 5, 3 ];

const pad = n => String(n).padStart(2, '0');

// Day 0 to 364 of a year with no 29 February, as 'MM-DD'.
function monthDay(dayOfYear) {
  const lengths = [ 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31 ];
  let left = ((dayOfYear % 365) + 365) % 365;
  for (let month = 0; month < 12; month++) {
    if (left < lengths[month]) {
      return `${pad(month + 1)}-${pad(left + 1)}`;
    }
    left -= lengths[month];
  }
  return '01-01';
}

function build(today) {
  const rng = createRng();
  const year = Number(today.slice(0, 4));
  const surnames = rng.shuffle(names.SURNAMES);
  const used = new Set([ 'sam.sample@example.com', 'sally.sample@example.com', 'eli.example@example.com',
    'casey.office@example.com', 'pat.placeholder@example.com', 'riley.test@example.com', 'fran.figure@example.com' ]);
  const households = [];
  const relationships = [];
  const genders = {};
  const born = [];
  const married = [];
  let surnameIndex = 0;
  let householdNumber = 0;

  const nextSurname = () => surnames[surnameIndex++];
  const firstName = (gender, kid) => rng.pick(gender === 'm'
    ? (kid ? names.KID_MALE : names.MALE)
    : (kid ? names.KID_FEMALE : names.FEMALE));

  function person(household, lastName, gender, age, extra = {}) {
    const key = `${household.key}-${household.people.length + 1}`;
    const kid = age < 18;
    const first = firstName(gender, kid);
    const entry = {
      key,
      firstName: first,
      lastName,
      // The birthday is given its day of the year later, so they spread out.
      dateOfBirth: null,
      ...extra
    };
    if (!kid && !extra.noEmail && rng.next() < 0.75) {
      let local = `${first}.${lastName}`.toLowerCase();
      let n = 1;
      while (used.has(`${local}@example.com`)) {
        n++;
        local = `${first}.${lastName}${n}`.toLowerCase();
      }
      used.add(`${local}@example.com`);
      entry.email = `${local}@example.com`;
    }
    const alive = extra.inactiveReason !== 'deceased';
    if (alive && ((age >= 18 && rng.next() < 0.8) || (age >= 13 && age < 18 && rng.next() < 0.4))) {
      entry.cellphone = `(979) 555-01${pad(rng.int(0, 99))}`;
    }
    if (alive && age >= 18 && rng.next() < 0.08) {
      entry.hiddenFields = [ rng.pick([ 'cellphone', 'email', 'birthday' ]) ];
    }
    delete entry.noEmail;
    genders[key] = gender;
    born.push({
      entry,
      age
    });
    household.people.push(entry);
    return entry;
  }

  function household(label) {
    householdNumber++;
    const town = rng.pick(names.TOWNS);
    const made = {
      key: `gen${pad(householdNumber)}`,
      shape: label,
      address: {
        street: `${rng.int(100, 989)} ${rng.pick(names.STREETS)}`,
        city: town.city,
        state: 'TX',
        zip: town.zip
      },
      homePhone: rng.next() < 0.5 ? `(979) 555-01${pad(rng.int(0, 99))}` : '',
      people: []
    };
    households.push(made);
    return made;
  }

  function spouses(home, lastName, husbandAge, wifeAge) {
    const husband = person(home, lastName, 'm', husbandAge);
    const wife = person(home, lastName, 'f', wifeAge);
    // Married at least two years, and not before 20.
    const years = Math.max(2, Math.min(husbandAge - 20, wifeAge - 20, rng.int(3, 45)));
    married.push({
      a: husband.key,
      b: wife.key,
      years
    });
    return {
      husband,
      wife,
      years
    };
  }

  const first = {};
  for (const shape of rng.shuffle(SHAPES)) {
    const home = household(shape);
    if (shape === 'family') {
      const lastName = nextSurname();
      const husbandAge = rng.int(30, 52);
      const pair = spouses(home, lastName, husbandAge, husbandAge - rng.int(0, 4));
      const count = 1 + rng.weighted(KID_WEIGHTS);
      const maxAge = Math.min(17, pair.years - 1, husbandAge - 21);
      const ages = Array.from({ length: count }, () => rng.int(1, Math.max(1, maxAge))).sort((a, b) => b - a);
      for (const age of ages) {
        const kid = person(home, lastName, rng.next() < 0.5 ? 'm' : 'f', age);
        relationships.push({
          kind: 'parent-child',
          a: pair.husband.key,
          b: kid.key
        }, {
          kind: 'parent-child',
          a: pair.wife.key,
          b: kid.key
        });
      }
      first.family = first.family || pair.husband;
    } else if (shape === 'couple') {
      const lastName = nextSurname();
      const age = rng.int(58, 82);
      const pair = spouses(home, lastName, age, age - rng.int(0, 5));
      (first.couples = first.couples || []).push(pair);
    } else if (shape === 'widow') {
      const lastName = nextSurname();
      const female = rng.next() < 0.75;
      const survivor = person(home, lastName, female ? 'f' : 'm', rng.int(68, 91));
      // Every other widow's late spouse stays on file, marked deceased.
      if (households.filter(item => item.shape === 'widow').length % 2 === 1) {
        const late = person(home, lastName, female ? 'm' : 'f', rng.int(70, 92), {
          inactiveReason: 'deceased',
          noEmail: true
        });
        married.push({
          a: female ? late.key : survivor.key,
          b: female ? survivor.key : late.key,
          years: rng.int(30, 50)
        });
      }
      (first.widows = first.widows || []).push(survivor);
    } else if (shape === 'multigen') {
      const lastName = nextSurname();
      const husbandAge = rng.int(38, 50);
      const pair = spouses(home, lastName, husbandAge, husbandAge - rng.int(0, 3));
      // The wife's mother lives with them, under her own surname.
      const grandmother = person(home, nextSurname(), 'f', husbandAge + rng.int(20, 28));
      relationships.push({
        kind: 'parent-child',
        a: grandmother.key,
        b: pair.wife.key
      });
      for (let i = 0; i < 2; i++) {
        const kid = person(home, lastName, i === 0 ? 'f' : 'm', rng.int(2, Math.max(2, Math.min(16, pair.years - 1))));
        relationships.push({
          kind: 'parent-child',
          a: pair.husband.key,
          b: kid.key
        }, {
          kind: 'parent-child',
          a: pair.wife.key,
          b: kid.key
        });
      }
    } else if (shape === 'single') {
      const female = households.filter(item => item.shape === 'single').length === 1;
      person(home, nextSurname(), female ? 'f' : 'm', rng.int(30, 60), female ? { status: 'regular' } : {});
    }
  }

  // The households that need another household to exist first.
  const grownIndexes = households.filter(item => item.shape === 'grown');
  grownIndexes.forEach((home, index) => {
    const parents = first.couples[index % first.couples.length];
    const lastName = parents.husband.lastName;
    if (index < 2) {
      const child = person(home, lastName, index === 0 ? 'm' : 'f', rng.int(24, 34),
        index === 1 ? { inactiveReason: 'left' } : {});
      for (const parent of [ parents.husband, parents.wife ]) {
        relationships.push({
          kind: 'parent-child',
          a: parent.key,
          b: child.key
        });
      }
    } else {
      // A young couple whose mother is one of the widows.
      const mother = first.widows[0];
      const pair = spouses(home, mother.lastName, rng.int(27, 33), rng.int(26, 32));
      relationships.push({
        kind: 'parent-child',
        a: mother.key,
        b: pair.husband.key
      });
    }
  });

  // Two or three children with no adult at home; a guardian elsewhere.
  const minors = households.find(item => item.shape === 'minors');
  const minorSurname = nextSurname();
  const guardian = first.family;
  const siblingAges = [ 15, 12, 9 ];
  for (const age of siblingAges) {
    const kid = person(minors, minorSurname, rng.next() < 0.5 ? 'm' : 'f', age);
    relationships.push({
      kind: 'guardian',
      a: guardian.key,
      b: kid.key
    });
  }

  // Birthdays: the people are put in a random order and given evenly spaced
  // days of the year, so every week has some.
  const order = rng.shuffle(born);
  order.forEach(({ entry, age }, index) => {
    const day = Math.floor(index * 365 / order.length);
    entry.dateOfBirth = `${year - age}-${monthDay(day + 3)}`;
  });

  // Anniversaries, evenly spaced too.
  const couples = rng.shuffle(married);
  couples.forEach((couple, index) => {
    const day = Math.floor(index * 365 / couples.length) + 5;
    relationships.push({
      kind: 'spouse',
      a: couple.a,
      b: couple.b,
      anniversary: `${year - couple.years - 1}-${monthDay(day)}`
    });
  });

  return {
    households: households.map(({ shape, ...rest }) => ({
      ...rest,
      shape
    })),
    relationships,
    genders
  };
}

module.exports = {
  build,
  monthDay
};
