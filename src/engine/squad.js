// src/engine/squad.js
// Race plans, race-team selection, validation, and team/rider ratings.
// Pure module — no DOM, no I/O.

import { ROLES, ability, isAvailable } from './riders.js';

export const RACE_PLANS = [
  'Sprint Train',
  'Climbing Block',
  'All-Round',
  'Breakaway',
  'GC Defence',
];

export const AGGRESSIONS = ['defensive', 'normal', 'attacking'];

export const RACE_TEAM_SIZE = 8;
export const MAX_BENCH = 4;
export const MAX_LEADERS = 2;

const PLAN_ROLE_WEIGHTS = {
  'Sprint Train': { SPR: 3.0, ROU: 1.6, LDR: 0.9, CLM: 0.6 },
  'Climbing Block': { CLM: 3.0, LDR: 2.2, ROU: 1.0, SPR: 0.4 },
  'All-Round': { LDR: 1.6, SPR: 1.6, CLM: 1.6, ROU: 1.6 },
  'Breakaway': { ROU: 2.4, SPR: 2.0, CLM: 1.4, LDR: 1.0 },
  'GC Defence': { LDR: 3.0, CLM: 1.8, ROU: 1.4, SPR: 0.5 },
};

export function defaultAggression() {
  return 'normal';
}

/**
 * Penalty when a rider is placed in a slot not matching their natural role.
 * Natural → 1.0; non-leader in LDR slot → 0.8; severe mismatch → 0.75.
 */
export function slotPenalty(rider, assignedRole) {
  if (assignedRole === rider.type) return 1.0;
  if (assignedRole === 'LDR') return 0.8;
  // A climber/sprinter in ROU slot, or similar role-neighbour mis-slot.
  const severe =
    (rider.type === 'SPR' && assignedRole === 'CLM') ||
    (rider.type === 'CLM' && assignedRole === 'SPR');
  return severe ? 0.75 : 0.85;
}

/** Pick the best 8 starters + up to 4 reserves according to the plan. */
export function selectRaceTeam(team, plan = 'All-Round', bench = 0, rng = null) {
  if (!team || !Array.isArray(team.riders)) {
    throw new TypeError('selectRaceTeam: team required');
  }
  const weights = PLAN_ROLE_WEIGHTS[plan] || PLAN_ROLE_WEIGHTS['All-Round'];
  const scored = team.riders
    .filter((r) => isAvailable(r))
    .map((r) => ({
      rider: r,
      score: ability(r) * (weights[r.type] || 1.0),
    }));
  scored.sort((a, b) => b.score - a.score);

  const starters = [];
  const reserves = [];
  const counts = { LDR: 0, SPR: 0, CLM: 0, ROU: 0 };

  for (const { rider } of scored) {
    const isLeader = rider.type === 'LDR';
    const leaderLimitOk = !isLeader || counts.LDR < MAX_LEADERS;
    const pick = starterSlotAvailable(starters) && leaderLimitOk;
    if (pick) {
      starters.push(rider);
      counts[rider.type] = (counts[rider.type] || 0) + 1;
    } else if (reserves.length < MAX_BENCH) {
      reserves.push(rider);
    }
  }

  // If we still have too many leaders because two lowest weren't the extras,
  // enforce the cap by moving surplus LDR to reserves.
  while (starters.filter((r) => r.type === 'LDR').length > MAX_LEADERS) {
    const idx = starters
      .map((r, i) => ({ r, i }))
      .filter(({ r }) => r.type === 'LDR')
      .sort((a, b) => ability(a.r) - ability(b.r))[0].i;
    const moved = starters.splice(idx, 1)[0];
    reserves.unshift(moved);
  }

  return { starters, reserves };
}

function starterSlotAvailable(starters) {
  return starters.length < RACE_TEAM_SIZE;
}

export function validateTeam(starters) {
  if (!Array.isArray(starters)) throw new TypeError('validateTeam: array required');
  if (starters.length !== RACE_TEAM_SIZE) {
    throw new Error(`validateTeam: expected ${RACE_TEAM_SIZE} starters, got ${starters.length}`);
  }
  const names = new Set();
  const ldrs = [];
  for (const r of starters) {
    if (!r || !r.type || !ROLES.includes(r.type)) {
      throw new Error(`validateTeam: invalid role in starter`);
    }
    if (!Number.isFinite(r.power) || r.power < 1 || r.power > 99) {
      throw new Error(`validateTeam: power out of range for ${r.name || '?'}`);
    }
    if (!Number.isFinite(r.climb) || r.climb < 1 || r.climb > 99) {
      throw new Error(`validateTeam: climb out of range for ${r.name || '?'}`);
    }
    if (names.has(r.name)) throw new Error(`validateTeam: duplicate ${r.name}`);
    names.add(r.name);
    if (r.type === 'LDR') ldrs.push(r);
  }
  if (ldrs.length > MAX_LEADERS) {
    throw new Error(`validateTeam: too many LDR (${ldrs.length})`);
  }
  return true;
}

/** Average ability for each role in the selection. */
export function teamRatings(starters) {
  const byRole = { LDR: [], SPR: [], CLM: [], ROU: [] };
  for (const r of starters) {
    byRole[r.type].push(r);
  }
  const out = {};
  for (const role of ROLES) {
    const arr = byRole[role];
    out[role] = arr.length ? arr.reduce((s, r) => s + ability(r), 0) / arr.length : 0;
  }
  return out;
}

export function overallRating(starters) {
  return starters.reduce((s, r) => s + ability(r), 0) / starters.length;
}

/**
 * Profile awareness: returns a warning string if the plan is a poor match for
 * the given parcour type (flat / hilly / mountain / itt).
 */
export function planWarning(plan, parcourType) {
  const p = parcourType;
  if (!p || p === 'mixed') return null;
  const mismatches = {
    'Sprint Train': 'mountain',
    'Climbing Block': 'flat',
    'Breakaway': 'itt',
  };
  if (mismatches[plan] === p) {
    return `Warning: ${plan} may struggle on a ${p} parcours.`;
  }
  return null;
}
