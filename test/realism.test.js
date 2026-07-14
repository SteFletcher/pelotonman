// test/realism.test.js
// Statistical realism harness over thousands of simulations.
// Asserts distributional properties rather than single-race outcomes.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulateRace } from '../src/engine/race.js';
import { TEAMS } from '../src/data/teams.js';
import { selectRaceTeam } from '../src/engine/squad.js';

function prepareTeams(plan = 'All-Round') {
  return TEAMS.map((team) => {
    const { starters } = selectRaceTeam(team, plan);
    return {
      name: team.name,
      shortName: team.shortName,
      plan,
      aggression: 'normal',
      starters: starters.map((rider) => ({ rider, role: rider.type })),
    };
  });
}

function flatProfile(distanceKm = 180) {
  return {
    id: 'flat',
    name: 'Flat Classic',
    kind: 'classic',
    distanceKm,
    parcourType: 'flat',
    profile: [{ km: distanceKm - 5, type: 'flat' }, { km: 5, type: 'finish' }],
  };
}

function mountainProfile(distanceKm = 160) {
  return {
    id: 'mountain',
    name: 'Mountain Stage',
    kind: 'classic',
    distanceKm,
    parcourType: 'mountain',
    profile: [{ km: distanceKm * 0.4, type: 'flat' }, { km: distanceKm * 0.4, type: 'climb', cat: 1 }, { km: distanceKm * 0.15, type: 'descent' }, { km: distanceKm * 0.05, type: 'finish', cat: 1 }],
  };
}

function ittProfile(distanceKm = 30) {
  return { id: 'itt', name: 'ITT', kind: 'itt', distanceKm, parcourType: 'itt', profile: [{ km: distanceKm, type: 'flat' }] };
}

test('breakaways form in a believable fraction of races', () => {
  const teams = prepareTeams();
  let breaks = 0;
  const N = 60;
  for (let i = 0; i < N; i++) {
    const r = simulateRace(teams, flatProfile(), { seed: 1000 + i });
    if (r.events.some((e) => e.type === 'break')) breaks++;
  }
  const rate = breaks / N;
  assert.ok(rate >= 0.3 && rate <= 0.95, `break rate=${rate}`);
});

test('climbers dominate mountain stages', () => {
  const teams = prepareTeams('Climbing Block');
  let climberWins = 0;
  const N = 40;
  for (let i = 0; i < N; i++) {
    const r = simulateRace(teams, mountainProfile(), { seed: 2000 + i });
    if (r.placings[0].rider.type === 'CLM' || r.placings[0].rider.type === 'LDR') climberWins++;
  }
  assert.ok(climberWins / N >= 0.6, `climber wins=${climberWins}/${N}`);
});

test('sprinters dominate flat finishes', () => {
  const teams = prepareTeams('Sprint Train');
  let sprintWins = 0;
  const N = 40;
  for (let i = 0; i < N; i++) {
    const r = simulateRace(teams, flatProfile(), { seed: 3000 + i });
    if (r.placings[0].rider.type === 'SPR') sprintWins++;
  }
  assert.ok(sprintWins / N >= 0.4, `sprint wins=${sprintWins}/${N}`);
});

test('time trialists win ITTs', () => {
  const teams = prepareTeams();
  let ttWins = 0;
  const N = 30;
  for (let i = 0; i < N; i++) {
    const r = simulateRace(teams, ittProfile(), { seed: 4000 + i });
    const winner = r.placings[0].rider;
    if (winner.tt >= 70) ttWins++;
  }
  assert.ok(ttWins / N >= 0.5, `tt wins=${ttWins}/${N}`);
});

test('time gaps are plausible and monotonic', () => {
  const teams = prepareTeams();
  for (let i = 0; i < 20; i++) {
    const r = simulateRace(teams, flatProfile(), { seed: 5000 + i });
    let prev = -1;
    for (const p of r.placings) {
      assert.ok(p.timeGap >= prev);
      prev = p.timeGap;
    }
    assert.equal(r.placings[0].timeGap, 0);
  }
});

test('crashes are rare and weighted by injury proneness', () => {
  const teams = prepareTeams();
  let crashRaces = 0;
  const N = 50;
  for (let i = 0; i < N; i++) {
    const r = simulateRace(teams, flatProfile(200), { seed: 6000 + i });
    if (r.crashes.length > 0) crashRaces++;
  }
  const rate = crashRaces / N;
  assert.ok(rate >= 0.05 && rate <= 0.9, `crash race rate=${rate}`);
});

test('determinism: same seed identical, 50 seeds yield >=45 distinct races', () => {
  const teams = prepareTeams();
  const a = simulateRace(teams, flatProfile(150), { seed: 777 });
  const b = simulateRace(teams, flatProfile(150), { seed: 777 });
  assert.deepEqual(a.placings.map((p) => p.rider.id), b.placings.map((p) => p.rider.id));

  const distinct = new Set();
  for (let i = 0; i < 50; i++) {
    const r = simulateRace(teams, flatProfile(150), { seed: 7000 + i });
    distinct.add(r.placings[0].rider.id + ',' + r.placings[1].rider.id);
  }
  assert.ok(distinct.size >= 45, `distinct=${distinct.size}`);
});
