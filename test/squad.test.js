// test/squad.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  RACE_PLANS,
  AGGRESSIONS,
  selectRaceTeam,
  validateTeam,
  teamRatings,
  overallRating,
  slotPenalty,
  planWarning,
  RACE_TEAM_SIZE,
  MAX_LEADERS,
} from '../src/engine/squad.js';
import { createRider } from '../src/engine/riders.js';
import { TEAMS, findTeam } from '../src/data/teams.js';

function makeTeam(planSpecs) {
  return {
    name: 'Test Team',
    riders: planSpecs.map(([type, abilityValue, age = 26]) =>
      createRider({ name: `${type}-${abilityValue}`, type, age, power: abilityValue, climb: abilityValue })
    ),
  };
}

test('RACE_PLANS and AGGRESSIONS exported', () => {
  assert.deepEqual(RACE_PLANS, ['Sprint Train', 'Climbing Block', 'All-Round', 'Breakaway', 'GC Defence']);
  assert.deepEqual(AGGRESSIONS, ['defensive', 'normal', 'attacking']);
});

test('validateTeam accepts a valid 8-rider team', () => {
  const team = makeTeam([
    ['LDR', 85], ['LDR', 80], ['SPR', 84], ['SPR', 78],
    ['CLM', 82], ['CLM', 76], ['ROU', 74], ['ROU', 70],
  ]);
  assert.ok(validateTeam(team.riders));
});

test('validateTeam rejects wrong size', () => {
  const team = makeTeam([['LDR', 80], ['SPR', 80]]);
  assert.throws(() => validateTeam(team.riders), /expected 8/);
});

test('validateTeam rejects invalid role', () => {
  const riders = makeTeam([
    ['LDR', 85], ['LDR', 80], ['SPR', 84], ['SPR', 78],
    ['CLM', 82], ['CLM', 76], ['ROU', 74], ['ROU', 70],
  ]).riders.map((r, i) => (i === 7 ? { ...r, type: 'GK' } : r));
  assert.throws(() => validateTeam(riders), /invalid role/);
});

test('validateTeam rejects out-of-range attributes', () => {
  const riders = makeTeam([
    ['LDR', 85], ['LDR', 80], ['SPR', 84], ['SPR', 78],
    ['CLM', 82], ['CLM', 76], ['ROU', 74], ['ROU', 70],
  ]).riders.map((r, i) => (i === 0 ? { ...r, power: 200 } : r));
  assert.throws(() => validateTeam(riders), /out of range/);
});

test('validateTeam rejects duplicate names', () => {
  const riders = makeTeam([
    ['LDR', 85], ['LDR', 80], ['SPR', 84], ['SPR', 78],
    ['CLM', 82], ['CLM', 76], ['ROU', 74], ['ROU', 70],
  ]).riders;
  riders[7].name = riders[0].name;
  assert.throws(() => validateTeam(riders), /duplicate/);
});

test('validateTeam rejects >2 LDR', () => {
  const team = makeTeam([
    ['LDR', 85], ['LDR', 80], ['LDR', 78], ['SPR', 84],
    ['CLM', 82], ['CLM', 76], ['ROU', 74], ['ROU', 70],
  ]);
  assert.throws(() => validateTeam(team.riders), /too many LDR/);
});

test('selectRaceTeam returns 8 starters', () => {
  const team = makeTeam([
    ['LDR', 85], ['LDR', 80], ['SPR', 84], ['SPR', 78],
    ['CLM', 82], ['CLM', 76], ['ROU', 74], ['ROU', 70], ['ROU', 60],
  ]);
  const { starters, reserves } = selectRaceTeam(team, 'All-Round');
  assert.equal(starters.length, RACE_TEAM_SIZE);
  assert.equal(starters.filter((r) => r.type === 'LDR').length, 2);
});

test('Sprint Train selects sprinters and rouleurs first', () => {
  const team = makeTeam([
    ['LDR', 95], ['CLM', 90], ['SPR', 80], ['SPR', 79], ['ROU', 75], ['ROU', 74], ['ROU', 73], ['ROU', 72], ['ROU', 71], ['ROU', 70],
  ]);
  const { starters } = selectRaceTeam(team, 'Sprint Train');
  assert.ok(starters.some((r) => r.type === 'SPR'));
  assert.ok(starters.filter((r) => r.type === 'LDR').length <= MAX_LEADERS);
});

test('Climbing Block selects climbers and leaders first', () => {
  const team = TEAMS.find((t) => t.shortName === 'UAE');
  const { starters } = selectRaceTeam(team, 'Climbing Block');
  assert.ok(starters.some((r) => r.type === 'CLM' || r.type === 'LDR'));
  assert.equal(starters.length, RACE_TEAM_SIZE);
});

test('teamRatings and overallRating return sensible numbers', () => {
  const team = makeTeam([
    ['LDR', 80], ['LDR', 70], ['SPR', 90], ['SPR', 80],
    ['CLM', 80], ['CLM', 70], ['ROU', 70], ['ROU', 60],
  ]);
  const ratings = teamRatings(team.riders);
  assert.ok(ratings.LDR >= 74 && ratings.LDR <= 76);
  assert.ok(ratings.SPR >= 84 && ratings.SPR <= 86);
  assert.ok(overallRating(team.riders) > 60);
});

test('slotPenalty matches design', () => {
  const sprinter = createRider({ name: 's', type: 'SPR', age: 26, power: 80, climb: 50 });
  const leader = createRider({ name: 'l', type: 'LDR', age: 26, power: 80, climb: 80 });
  assert.equal(slotPenalty(sprinter, 'SPR'), 1.0);
  assert.equal(slotPenalty(sprinter, 'LDR'), 0.8);
  assert.equal(slotPenalty(sprinter, 'CLM'), 0.75);
  assert.ok(slotPenalty(leader, 'ROU') > 0.79 && slotPenalty(leader, 'ROU') < 0.91);
});

test('planWarning detects Sprint Train on mountain stage', () => {
  assert.ok(planWarning('Sprint Train', 'mountain'));
  assert.equal(planWarning('Sprint Train', 'flat'), null);
  assert.ok(planWarning('Climbing Block', 'flat'));
});

test('selectRaceTeam excludes injured and DNF riders', () => {
  const team = makeTeam([
    ['LDR', 85], ['LDR', 80], ['SPR', 84], ['SPR', 78],
    ['CLM', 82], ['CLM', 76], ['ROU', 74], ['ROU', 70], ['ROU', 65], ['ROU', 60],
  ]);
  team.riders[0].injuryWeeks = 5;
  team.riders[1].abandonedRace = 'tdf';
  const { starters } = selectRaceTeam(team, 'All-Round');
  assert.ok(!starters.includes(team.riders[0]));
  assert.ok(!starters.includes(team.riders[1]));
  assert.equal(starters.length, 8);
});

test('all real teams yield a valid race team', () => {
  for (const team of TEAMS) {
    const { starters } = selectRaceTeam(team, 'All-Round');
    assert.equal(starters.length, RACE_TEAM_SIZE, `${team.name} starters`);
    assert.ok(validateTeam(starters), `${team.name} validate`);
    assert.ok(starters.filter((r) => r.type === 'LDR').length <= MAX_LEADERS);
  }
});
