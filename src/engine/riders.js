// src/engine/riders.js
// Rider creation, valuation, and development. Pure module — no DOM, no I/O.
// Riders are created from authored roster rows (see src/data/teams.js) and
// developed yearly at season end by developRider().

import { hashString } from './rng.js';

export const ROLES = ['LDR', 'SPR', 'CLM', 'ROU'];

/** Hidden attribute range. */
const ATTR_MIN = 1, ATTR_MAX = 99;

function clampAttr(v) {
  v = Math.round(v);
  if (!Number.isFinite(v)) return 50;
  if (v < ATTR_MIN) return ATTR_MIN;
  if (v > ATTR_MAX) return ATTR_MAX;
  return v;
}

/** Derive time-trial rating if not authored. */
function deriveTT(rider) {
  return clampAttr(0.6 * rider.power + 0.4 * rider.consistency);
}

/**
 * Build a rider record from an authored row. Does not consume RNG.
 * @param {object} row { id?, name, type, age, power, climb, tt?, consistency?, injuryProne?, wage?, value?, contractYears? }
 */
export function createRider(row) {
  if (!row || !row.name) throw new TypeError('createRider: name required');
  if (!ROLES.includes(row.type)) {
    throw new TypeError(`createRider: invalid role ${row.type}`);
  }
  const consistency = clampAttr(row.consistency ?? 70);
  const r = {
    id: row.id || null, // assigned by teams.js using the UCI code
    name: row.name,
    type: row.type,
    age: Math.round(row.age),
    power: clampAttr(row.power),
    climb: clampAttr(row.climb),
    tt: clampAttr(row.tt ?? 0),
    consistency,
    injuryProne: clampAttr(row.injuryProne ?? 50),
    wage: Math.round(row.wage ?? fairWage({ type: row.type, power: row.power, climb: row.climb, age: row.age, consistency })),
    value: Math.round(row.value ?? 0) || 0,
    contractYears: row.contractYears ?? 2,
    condition: 100,
    form: 6.0,
    morale: 70,
    injuryWeeks: 0,
    abandonedRace: null,
    listed: false,
  };
  if (!riderRosterRowHasTT(row)) r.tt = deriveTT(r);
  r.ability = ability(r);
  r.value = Math.max(25000, Math.round(fairValue(r)));
  r.wage = Math.round(fairWage(r));
  return r;
}

function riderRosterRowHasTT(row) {
  return row.tt !== undefined && row.tt !== null;
}

/** Headline ability number, by role. */
export function ability(rider) {
  const p = rider.power, c = rider.climb;
  switch (rider.type) {
    case 'SPR': return 0.85 * p + 0.15 * c;
    case 'CLM': return 0.85 * c + 0.15 * p;
    case 'LDR': return 0.55 * p + 0.45 * c;
    case 'ROU': return 0.6 * p + 0.4 * c;
    default: return 0.6 * p + 0.4 * c;
  }
}

/** Age curve: ramps 0.75→1.0 across peak window 24–28, then fades ~0.12/year. */
export function ageFactor(age) {
  const PEAK_LO = 24, PEAK_HI = 28;
  if (age < PEAK_LO) {
    // ramp up from 0.75 at 18 to 1.0 at 24
    const t = Math.max(0, (age - 18) / (PEAK_LO - 18));
    return 0.75 + 0.25 * t;
  }
  if (age <= PEAK_HI) return 1.0;
  // fade ~0.12/year past peak
  const yearsPast = age - PEAK_HI;
  return Math.max(0.3, 1.0 - 0.12 * yearsPast);
}

/** Fair transfer value in £. */
export function fairValue(rider) {
  const ab = ability(rider);
  let v = Math.pow(ab / 10, 4.3) * 950 * ageFactor(rider.age);
  if (v < 25000) v = 25000;
  return v;
}

/** Fair annual wage in £. */
export function fairWage(rider) {
  const ab = ability(rider);
  return Math.pow(ab / 10, 3.1) * 16;
}

/** Available for selection? */
export function isAvailable(rider) {
  return rider && rider.injuryWeeks <= 0 && !rider.abandonedRace;
}

/** Yearly development: youngsters grow, veterans fade, some retire. */
export function developRider(rider, rng) {
  const r = { ...rider };
  r.age = rider.age + 1;
  if (r.age <= 22) {
    // grow +4 spread across attributes by role
    bump(r, rng, +4);
  } else if (r.age >= 33) {
    bump(r, rng, -4);
  } else if (r.age >= 30) {
    bump(r, rng, -1);
  } else if (r.age >= 26) {
    // small late-career polish to strengths
    bump(r, rng, +1);
  }
  // recompute derived
  r.ability = ability(r);
  r.value = Math.max(25000, Math.round(fairValue(r)));
  r.wage = Math.round(fairWage(r));
  r.contractYears = Math.max(0, (rider.contractYears || 0) - 1);
  return r;
}

function bump(r, rng, delta) {
  // bias growth/fade to the rider's strengths (their headline attribute)
  const which = r.type === 'SPR' || r.type === 'ROU' ? 'power' : 'climb';
  const secondary = which === 'power' ? 'climb' : 'power';
  const dMain = Math.round(delta * (0.6 + 0.4 * (rng ? rng.next() : 0.5)));
  const dSec = delta - dMain;
  r[which] = clampAttr(r[which] + dMain);
  r[secondary] = clampAttr(r[secondary] + dSec);
  // small consistency drift toward stability for young, away for old
  if (delta > 0 && r.consistency < 80) r.consistency = clampAttr(r.consistency + 1);
  if (delta < 0 && r.consistency > 40) r.consistency = clampAttr(r.consistency - 1);
}

/** Retirement chance. age >= 36 → 55% chance. */
export function shouldRetire(rider, rng) {
  if (rider.age >= 36) return rng.chance(0.55);
  if (rider.age >= 34) return rng.chance(0.15);
  return false;
}

/** A neo-pro id derived from the team uci code and an index. */
export function neoProId(uciCode, n) {
  return `${uciCode}-Y${n}`;
}

export const RETIREMENT_AGE = 36;
