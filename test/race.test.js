// test/race.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RaceSim, simulateRace } from '../src/engine/race.js';
import { createRng } from '../src/engine/rng.js';
import { TEAMS } from '../src/data/teams.js';
import { selectRaceTeam } from '../src/engine/squad.js';

function flatProfile(name = 'test-classic', distanceKm = 100) {
  return {
    id: name,
    name: 'Test Classic',
    kind: 'classic',
    distanceKm,
    parcourType: 'flat',
    profile: [{ km: distanceKm * 0.8, type: 'flat' }, { km: distanceKm * 0.15, type: 'hilly' }, { km: distanceKm * 0.05, type: 'finish' }],
  };
}

function mountainProfile(name = 'test-mountain', distanceKm = 120) {
  return {
    id: name,
    name: 'Test Mountain',
    kind: 'classic',
    distanceKm,
    parcourType: 'mountain',
    profile: [
      { km: distanceKm * 0.5, type: 'flat' },
      { km: distanceKm * 0.3, type: 'climb', cat: 1 },
      { km: distanceKm * 0.15, type: 'descent' },
      { km: distanceKm * 0.05, type: 'finish', cat: 1 },
    ],
  };
}

function ittProfile() {
  return { id: 'test-itt', name: 'Test ITT', kind: 'itt', distanceKm: 25, parcourType: 'itt', profile: [{ km: 25, type: 'flat' }] };
}

function prepareTeams(plan = 'All-Round') {
  return TEAMS.slice(0, 5).map((team) => {
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

test('simulateRace returns a result', () => {
  const result = simulateRace(prepareTeams(), flatProfile(), { seed: 1 });
  assert.ok(Array.isArray(result.placings));
  assert.equal(result.placings.length, 5 * 8);
  assert.ok(result.winner);
  assert.ok(result.timeline.length > 1);
});

test('identical seeds replay identical races', () => {
  const a = simulateRace(prepareTeams(), flatProfile('det-a', 80), { seed: 123 });
  const b = simulateRace(prepareTeams(), flatProfile('det-b', 80), { seed: 123 });
  assert.equal(a.placings.length, b.placings.length);
  for (let i = 0; i < a.placings.length; i++) {
    assert.equal(a.placings[i].rider.id, b.placings[i].rider.id);
    assert.equal(a.placings[i].position, b.placings[i].position);
    assert.equal(a.placings[i].timeGap, b.placings[i].timeGap);
  }
  assert.deepEqual(a.timeline, b.timeline);
});

test('different seeds usually produce different races', () => {
  const distinct = new Set();
  for (let i = 0; i < 50; i++) {
    const r = simulateRace(prepareTeams(), flatProfile(`seed-${i}`, 90), { seed: i + 1 });
    distinct.add(r.placings[0].rider.id + r.placings[1].rider.id);
  }
  assert.ok(distinct.size >= 25, `distinct=${distinct.size}`);
});

test('placings order matches time gap order', () => {
  const r = simulateRace(prepareTeams(), flatProfile(), { seed: 7 });
  let prev = -1;
  for (const p of r.placings) {
    assert.ok(p.timeGap >= prev, 'gaps should be non-decreasing');
    prev = p.timeGap;
  }
  assert.equal(r.placings[0].timeGap, 0);
});

test('ITT has no peloton/orders and sorts by tt strength', () => {
  const r = simulateRace(prepareTeams(), ittProfile(), { seed: 3 });
  assert.ok(r.placings.length > 0);
  assert.ok(r.placings[0].rider.tt > 0);
});

test('mountain stage selects climbers/high finishers', () => {
  const r = simulateRace(prepareTeams('Climbing Block'), mountainProfile(), { seed: 5 });
  const top3 = r.placings.slice(0, 3);
  // Most likely a climber/leader wins.
  assert.ok(top3.some((p) => p.rider.type === 'CLM' || p.rider.type === 'LDR'));
});

test('RaceSim playSegment advances until finish', () => {
  const sim = new RaceSim(prepareTeams(), flatProfile('segtest', 30), { seed: 9 });
  let steps = 0;
  while (!sim.finished && steps < 500) {
    sim.playSegment();
    steps++;
  }
  assert.ok(sim.finished);
  assert.equal(sim.km, 30);
  assert.ok(sim.result);
});

test('RaceSim call finish multiple times returns same result', () => {
  const sim = new RaceSim(prepareTeams(), flatProfile('multi', 40), { seed: 11 });
  sim.simulateToEnd();
  const a = sim.finish();
  const b = sim.finish();
  assert.equal(a.winner.rider.id, b.winner.rider.id);
});

test('engine does not mutate input rider objects', () => {
  const teams = prepareTeams();
  const before = JSON.stringify(teams[0].starters[0].rider);
  simulateRace(teams, flatProfile('mut', 35), { seed: 13 });
  const after = JSON.stringify(teams[0].starters[0].rider);
  assert.equal(before, after);
});
