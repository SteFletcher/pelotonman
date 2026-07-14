// test/series-gt.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { awardPoints, computeStandings } from '../src/engine/series.js';
import { createGrandTour, advanceStage, jerseyHolders } from '../src/engine/gt.js';
import { simulateRace } from '../src/engine/race.js';
import { TEAMS } from '../src/data/teams.js';
import { selectRaceTeam } from '../src/engine/squad.js';
import { createRider } from '../src/engine/riders.js';

function makeResult(kind = 'classic', isMonument = false) {
  return {
    kind,
    isMonument,
    placings: [
      { position: 1, team: 'A', rider: createRider({ id: 'a1', name: 'R1', type: 'LDR', age: 26, power: 80, climb: 80 }) },
      { position: 2, team: 'B', rider: createRider({ id: 'b1', name: 'R2', type: 'LDR', age: 26, power: 78, climb: 78 }) },
      { position: 3, team: 'A', rider: createRider({ id: 'a2', name: 'R3', type: 'CLM', age: 26, power: 75, climb: 80 }) },
      { position: 4, team: 'C', rider: createRider({ id: 'c1', name: 'R4', type: 'SPR', age: 26, power: 80, climb: 50 }) },
    ],
  };
}

test('awardPoints gives more for monuments', () => {
  const classic = awardPoints(makeResult('classic', false));
  const monument = awardPoints(makeResult('classic', true));
  assert.ok(monument.perTeam.get('A') > classic.perTeam.get('A'));
});

test('computeStandings sorts by points then wins then podiums', () => {
  const r1 = makeResult('classic');
  const r2 = makeResult('classic', true);
  // Give B two wins; A one third and one fourth.
  r2.placings = [
    { position: 1, team: 'B', rider: createRider({ id: 'b2', name: 'B2', type: 'LDR', age: 26, power: 80, climb: 80 }) },
    { position: 2, team: 'B', rider: createRider({ id: 'b3', name: 'B3', type: 'LDR', age: 26, power: 78, climb: 78 }) },
    { position: 3, team: 'A', rider: createRider({ id: 'a3', name: 'A3', type: 'CLM', age: 26, power: 75, climb: 80 }) },
    { position: 4, team: 'A', rider: createRider({ id: 'a4', name: 'A4', type: 'CLM', age: 26, power: 70, climb: 75 }) },
  ];
  const standings = computeStandings([r1, r2]);
  assert.equal(standings[0].team, 'B');
  assert.ok(standings[0].points > standings[1].points);
  assert.equal(standings[0].position, 1);
});

test('GT GC accumulates time + bonuses', () => {
  const gt = createGrandTour('test', 'Test GT', 10);

  const rider = createRider({ id: 'gc1', name: 'GC Leader', type: 'LDR', age: 26, power: 80, climb: 90 });
  const stage = {
    kind: 'gt-stage',
    profileKind: 'classic',
    placings: [
      { position: 1, team: 'A', rider, timeGap: 0 },
      { position: 2, team: 'B', rider: createRider({ id: 'gc2', name: 'Chaser', type: 'LDR', age: 26, power: 78, climb: 88 }), timeGap: 6 },
      { position: 3, team: 'C', rider: createRider({ id: 'spr1', name: 'Sprinter GT', type: 'SPR', age: 24, power: 88, climb: 50 }), timeGap: 12 },
    ],
    komPoints: [{ rider, points: 5 }],
    sprintPoints: [{ rider: createRider({ id: 'spr1', name: 'Sprinter GT', type: 'SPR', age: 24, power: 88, climb: 50 }), points: 20 }],
  };
  advanceStage(gt, stage);

  const jerseys = jerseyHolders(gt);
  assert.equal(jerseys.gc.rider.id, 'gc1');
  assert.ok(jerseys.kom.points > 0);
  assert.ok(jerseys.points.points > 0);
});

test('GT white jersey uses age <=25', () => {
  const gt = createGrandTour('white', 'White Test', 5);
  const young = createRider({ id: 'yng', name: 'Young', type: 'LDR', age: 23, power: 75, climb: 85 });
  const old = createRider({ id: 'old', name: 'Vet', type: 'LDR', age: 32, power: 85, climb: 90 });
  advanceStage(gt, {
    kind: 'gt-stage',
    profileKind: 'classic',
    placings: [
      { position: 1, team: 'A', rider: old, timeGap: 0 },
      { position: 2, team: 'B', rider: young, timeGap: 15 },
    ],
    komPoints: [],
    sprintPoints: [],
  });
  const jerseys = jerseyHolders(gt);
  assert.equal(jerseys.gc.rider.id, 'old');
  assert.equal(jerseys.white.rider.id, 'yng');
});

test('advanceStage throws after finished', () => {
  const gt = createGrandTour('fin', 'Finish Test', 0, { totalStages: 1 });
  advanceStage(gt, makeResult('gt-stage'));
  assert.equal(gt.finished, true);
  assert.throws(() => advanceStage(gt, makeResult('gt-stage')));
});

test('GT stage result from RaceSim integrates', () => {
  const teams = TEAMS.slice(0, 4).map((team) => {
    const { starters } = selectRaceTeam(team, 'All-Round');
    return { name: team.name, shortName: team.shortName, plan: 'All-Round', aggression: 'normal', starters: starters.map((rider) => ({ rider, role: rider.type })) };
  });
  const profile = { id: 'gtp', name: 'GT Stage', kind: 'gt-stage', distanceKm: 120, parcourType: 'mountain', profile: [{ km: 80, type: 'flat' }, { km: 30, type: 'climb', cat: 1 }, { km: 10, type: 'finish', cat: 1 }] };
  const result = simulateRace(teams, profile, { seed: 7 });
  assert.equal(result.kind, 'gt-stage');
  const gt = createGrandTour('giro', 'Giro Test', 3);
  advanceStage(gt, result);
  const jerseys = jerseyHolders(gt);
  assert.ok(jerseys.gc);
});
