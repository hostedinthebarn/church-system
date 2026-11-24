// A small seeded random generator (mulberry32), so the demo seed makes the
// same people every run. Never use Math.random() in the seed.
const SEED = 0x5eed2026;

function createRng(seed = SEED) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    pick: list => list[Math.floor(next() * list.length)],
    // A new array in a random order.
    shuffle(list) {
      const copy = [ ...list ];
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [ copy[i], copy[j] ] = [ copy[j], copy[i] ];
      }
      return copy;
    },
    // An index chosen with the given weights.
    weighted(weights) {
      const total = weights.reduce((a, b) => a + b, 0);
      let roll = next() * total;
      for (let i = 0; i < weights.length; i++) {
        roll -= weights[i];
        if (roll < 0) {
          return i;
        }
      }
      return weights.length - 1;
    }
  };
}

module.exports = {
  SEED,
  createRng
};
