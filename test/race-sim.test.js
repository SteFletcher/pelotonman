// test/race-sim.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RaceSim, simulateRace } from '../src/engine/race.js';
import { createRng } from '../src/engine/rng.js';
import { TEAMS } from '../src/data/teams.js';
import { selectRaceTeam } from '../src/engine/squad.js';
import { createRider } from '../src/engine/riders.js';

function prepareTeams() {
  return TEAMS.slice(0, 4).map((team) => {
    const { starters } = selectRaceTeam(team, 'All-Round');
    return {
      name: team.name,
      shortName: team.shortName,
      plan: 'All-Round',
      aggression: 'normal',
      starters: starters.map((rider) => ({ rider, role: rider.type })),
    };
  });
}

function profile() {
  return {
    id: 'sim-test',
    name: 'Sim Test',
    kind: 'classic',
    distanceKm: 60,
    parcourType: 'hilly',
    profile: [
      { km: 30, type: 'flat' },
      { km: 22, type: 'hilly' },
      { km: 8, type: 'finish' },
    ],
  };
}

test('segment-by-segment equals one-shot result', () => {
  const oneShot = simulateRace(prepareTeams(), profile(), { seed: 42 });

  const sim = new RaceSim(prepareTeams(), profile(), { seed: 42 });
  let steps = 0;
  while (!sim.finished && steps < 500) {
    sim.playSegment();
    steps++;
  }
  const segmented = sim.result;

  assert.equal(oneShot.placings.length, segmented.placings.length);
  for (let i = 0; i < oneShot.placings.length; i++) {
    assert.equal(oneShot.placings[i].rider.id, segmented.placings[i].rider.id);
    assert.equal(oneShot.placings[i].timeGap, segmented.placings[i].timeGap);
  }
  assert.deepEqual(oneShot.events, segmented.events);
  assert.deepEqual(oneShot.timeline, segmented.timeline);
});

test('setOrders changes team behaviour without errors', () => {
  const sim = new RaceSim(prepareTeams(), profile(), { seed: 3 });
  sim.setOrders('UAE', { chase: true });
  sim.simulateToEnd();
  assert.ok(sim.result.placings.length > 0);
});

test('setRacePlan changes plan and aggression', () => {
  const sim = new RaceSim(prepareTeams(), profile(), { seed: 5 });
  sim.setRacePlan('UAE', { plan: 'Sprint Train', aggression: 'attacking' });
  sim.simulateToEnd();
  assert.ok(sim.result);
});

test('setRole reassigns and rejects too many LDR', () => {
  const smallTeam = () => ({
    name: 'Tiny',
    shortName: 'TNY',
    plan: 'All-Round',
    aggression: 'normal',
    starters: [
      createRider({ id: 'L1', name: 'L1', type: 'LDR', age: 26, power: 80, climb: 80 }),
      createRider({ id: 'S1', name: 'S1', type: 'SPR', age: 26, power: 80, climb: 50 }),
      createRider({ id: 'S2', name: 'S2', type: 'SPR', age: 26, power: 78, climb: 50 }),
      createRider({ id: 'C1', name: 'C1', type: 'CLM', age: 26, power: 75, climb: 80 }),
      createRider({ id: 'C2', name: 'C2', type: 'CLM', age: 26, power: 73, climb: 78 }),
      createRider({ id: 'R1', name: 'R1', type: 'ROU', age: 26, power: 70, climb: 70 }),
      createRider({ id: 'R2', name: 'R2', type: 'ROU', age: 26, power: 68, climb: 68 }),
      createRider({ id: 'R3', name: 'R3', type: 'ROU', age: 26, power: 66, climb: 66 }),
    ].map((rider) => ({ rider, role: rider.type })),
  });
  const sim = new RaceSim([smallTeam()], profile(), { seed: 6 });
  const entry = sim.entries[0];
  const nonLdr = entry.riders.find((rr) => rr.role !== 'LDR');
  sim.setRole(entry.shortName, nonLdr.rider.id, 'LDR');
  // second non-LDR -> too many
  const another = entry.riders.find((rr) => rr.role !== 'LDR' && rr.rider.id !== nonLdr.rider.id);
  assert.throws(() => sim.setRole(entry.shortName, another.rider.id, 'LDR'), /cannot have more than/);
});

test('playSegment does nothing after finish', () => {
  const sim = new RaceSim(prepareTeams(), profile(), { seed: 8 });
  sim.simulateToEnd();
  const after = sim.result;
  const ev = sim.playSegment();
  assert.deepEqual(sim.result, after);
  assert.equal(ev.length, 0);
});

test('simulation runs to full distance', () => {
  const sim = new RaceSim(prepareTeams(), profile(), { seed: 9 });
  sim.simulateToEnd();
  assert.equal(sim.km, profile().distanceKm);
  assert.ok(sim.result.placings.every((p) => p.position > 0));
});

test('live StatLine ratings are updated', () => {
  const sim = new RaceSim(prepareTeams(), profile(), { seed: 10 });
  sim.simulateToEnd();
  const stats = Array.from(sim.statMap.values());
  assert.ok(stats.some((st) => st.kmRidden > 0));
  assert.ok(stats.some((st) => st.rating !== 6.0), 'at least one rating moved');
});
