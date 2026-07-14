// src/engine/rng.js
// Seeded mulberry32 PRNG with a serializable 32-bit state, plus a stable
// string hash for deriving seeds from names. This is the single source of
// randomness for the entire career — see the determinism contract in
// 02-architecture.html.

/** FNV-1a 32-bit hash. Stable across JS engines (no Math.random, no toHash). */
export function hashString(str) {
  if (typeof str !== 'string') {
    throw new TypeError('hashString expects a string');
  }
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    // h = h * 16777619, kept in 32-bit unsigned space
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h >>> 0;
}

/** Convert any seed (number or string) to a u32 state value. */
function coerceSeed(seed) {
  if (typeof seed === 'number') {
    return seed >>> 0;
  }
  if (typeof seed === 'string') {
    return hashString(seed);
  }
  if (seed === undefined || seed === null) {
    // Fall back to a deterministic-ish default rather than Math.random, so a
    // forgotten seed is still reproducible. Callers that want true randomness
    // pass Math.random() explicitly.
    return 0x9e3779b9;
  }
  return hashString(String(seed));
}

/**
 * Create a seeded RNG. State is a 32-bit unsigned integer and is the only
 * mutable field, so getState()/setState() fully capture the future.
 */
export function createRng(seed) {
  let state = coerceSeed(seed) >>> 0;
  if (state === 0) state = 0x9e3779b9; // mulberry32 with state 0 is degenerate

  function next() {
    // mulberry32
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  return {
    /** Float in [0, 1). */
    next,
    /** Inclusive integer in [min, max]. */
    int(min, max) {
      if (max < min) [min, max] = [max, min];
      return min + Math.floor(next() * (max - min + 1));
    },
    /** True with probability p (0..1). */
    chance(p) {
      return next() < p;
    },
    /** Uniform pick from a non-empty array. */
    pick(items) {
      if (!Array.isArray(items) || items.length === 0) {
        throw new RangeError('pick: empty array');
      }
      return items[Math.floor(next() * items.length)];
    },
    /** Pick an {item, weight} entry by weight. */
    weightedPick(entries) {
      let total = 0;
      for (const e of entries) total += e.weight;
      if (total <= 0) throw new RangeError('weightedPick: total weight <= 0');
      let r = next() * total;
      for (const e of entries) {
        r -= e.weight;
        if (r < 0) return e.item;
      }
      return entries[entries.length - 1].item;
    },
    /** Shuffle (Fisher-Yates) a copy and return it. */
    shuffle(items) {
      const out = items.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
    getState() {
      return state >>> 0;
    },
    setState(s) {
      state = (s >>> 0) || 0x9e3779b9;
    },
  };
}
