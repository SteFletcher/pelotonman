// src/engine/transfers.js
// Valuations, offers, willingness, and AI market behaviour.
// Pure module — no DOM, no I/O.

import { ability, fairValue, fairWage, ROLES } from './riders.js';

export const SCOUT_FEE = 25000;

export function askingPrice(team, rider) {
  if (!team || !rider) throw new TypeError('askingPrice: team and rider required');
  const value = rider.value || 25000;
  const key = (team.riders || []).some((r) => r.id === rider.id) && isKeyRider(team, rider);
  let price = value * (rider.listed ? 0.85 : 1.2) * (key ? 1.3 : 1.0);
  price = Math.round(price / 25000) * 25000;
  return Math.max(25000, price);
}

function isKeyRider(team, rider) {
  const ab = ability(rider);
  const best = Math.max(...(team.riders || []).map(ability));
  return ab >= best - 3;
}

export function evaluateBid(team, rider, amount) {
  const ask = askingPrice(team, rider);
  if (amount >= ask) return { status: 'accepted', counter: null };
  if (amount >= rider.value * 0.9) {
    const counter = Math.round(((amount + ask) / 2) / 25000) * 25000;
    return { status: 'countered', counter };
  }
  return { status: 'rejected', counter: null };
}

export function wageDemand(rider, fromTier, toTier) {
  const base = Math.max(rider.wage || 0, fairWage(rider));
  const demotion = toTier < fromTier - 4 ? 1.35 : 1.0;
  return Math.round((base * 1.1 * demotion) / 25000) * 25000;
}

export function freeAgentWage(rider) {
  return Math.round((fairWage(rider) * 1.05) / 25000) * 25000;
}

export function riderAgrees(rng, rider, fromTier, toTier, offerLeadership = false) {
  if (toTier >= fromTier - 4 || offerLeadership) return true;
  const agePenalty = rider.age >= 28 && rider.age <= 31 ? 0.1 : 0.0;
  const reluctant = 0.85 - agePenalty;
  return !rng.chance(reluctant);
}

export function canRelease(team, rider) {
  if (!team || !rider) return false;
  const remaining = (team.riders || []).filter((r) => r.id !== rider.id);
  if (remaining.length < 22) return false;
  if (rider.type === 'LDR') {
    const remainingLeaders = remaining.filter((r) => r.type === 'LDR').length;
    if (remainingLeaders < 2) return false;
  }
  return true;
}

export function aiInterest(team, rider) {
  if (!team || !rider) return 0;
  if (team.riders?.some((r) => r.id === rider.id)) return 0;
  const ab = ability(rider);
  const bestInRole = Math.max(
    1,
    ...(team.riders || [])
      .filter((r) => r.type === rider.type)
      .map(ability)
  );
  const upgrade = Math.max(0, ab - bestInRole + 4);
  const thinSquadBonus = (team.riders || []).length < 24 ? 4 : 0;
  return upgrade + thinSquadBonus;
}

export function aiOfferAmount(rng, rider) {
  const mult = 0.9 + rng.next() * 0.5;
  return Math.round((rider.value * mult) / 25000) * 25000;
}

export function searchRiders(allTeams, freeAgents, filters = {}) {
  let pool = [];
  for (const team of allTeams || []) {
    for (const rider of team.riders || []) {
      if (filters.excludeTeam && rider.team === filters.excludeTeam) continue;
      pool.push({ ...rider, teamName: team.name });
    }
  }
  pool = pool.concat(freeAgents || []);

  if (filters.type) pool = pool.filter((r) => r.type === filters.type);
  if (filters.maxValue) pool = pool.filter((r) => r.value <= filters.maxValue);

  pool.sort((a, b) => {
    if (filters.sort === 'value') return b.value - a.value;
    return ability(b) - ability(a);
  });
  return pool;
}
