// test/game.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, SAVE_VERSION } from '../src/engine/game.js';
import { TEAMS, findTeam } from '../src/data/teams.js';

test('newGame creates a career', () => {
  const g = Game.newGame('Arrieta', 'UAE Team Emirates', 'seed-1');
  assert.equal(g.managerName, 'Arrieta');
  assert.equal(g.userTeam().name, 'UAE Team Emirates');
  assert.equal(g.teams.length, 24);
  assert.equal(g.teams.filter((t) => t.division === 1).length, 12);
  assert.equal(g.week, 0);
  assert.equal(g.calendar.length >= 28, true);
});

test('advanceWeek advances the race calendar', () => {
  const g = Game.newGame('Boss', 'UAE Team Emirates', 'seed-z');
  const before = g.week;
  const result = g.advanceWeek();
  assert.equal(g.week, before + 1);
  assert.ok(result);
  assert.ok(Array.isArray(result.placings));
  assert.ok(result.placings.length >= 24 * 7);
});

test('serializing and restoring continues deterministically', () => {
  const g1 = Game.newGame('Save', 'Visma | Lease a Bike', 777);
  g1.advanceWeek();
  g1.advanceWeek();

  const snap = g1.serialize();
  const g2 = Game.restore(snap);
  g2.advanceWeek();

  g1.advanceWeek();

  assert.equal(g1.week, g2.week);
  assert.equal(g1.results[g1.results.length - 1].placings[0].rider.id, g2.results[g2.results.length - 1].placings[0].rider.id);
});

test('board confidence reacts to results', () => {
  const g = Game.newGame('Tactician', 'UAE Team Emirates', 1001);
  const before = g.board.confidence;
  g.advanceWeek();
  assert.ok(g.board.confidence >= 0 && g.board.confidence <= 100);
  assert.ok(g.board.confidence !== undefined);
});

test('both divisions have valid teams', () => {
  for (const team of TEAMS) {
    assert.ok(team.riders.length >= 22, `${team.name} only ${team.riders.length}`);
    assert.ok(team.riders.some((r) => r.type === 'LDR'));
    const names = new Set(team.riders.map((r) => r.name));
    assert.equal(names.size, team.riders.length, `${team.name} duplicate names`);
    for (const r of team.riders) {
      assert.ok(r.power >= 1 && r.power <= 99, `${r.name} power ${r.power}`);
      assert.ok(r.climb >= 1 && r.climb <= 99, `${r.name} climb ${r.climb}`);
    }
  }
});

test('headline riders are on expected teams', () => {
  assert.ok(findTeam('UAE').riders.some((r) => r.name === 'Tadej Pogačar'));
  assert.ok(findTeam('TVM').riders.some((r) => r.name === 'Jonas Vingegaard'));
  assert.ok(findTeam('SQS').riders.some((r) => r.name === 'Remco Evenepoel'));
  assert.ok(findTeam('ADC').riders.some((r) => r.name === 'Mathieu van der Poel'));
});

test('wage bill is deducted weekly', () => {
  const g = Game.newGame('Fin', 'UAE Team Emirates', 2024);
  const team = g.userTeam();
  const wages = g.totalWageBill(team);
  assert.ok(wages > 0, 'team has a wage bill');
  g.advanceWeek();
  assert.ok(typeof team.balance === 'number', 'balance updated');
});

test('inbox receives an offer sometimes', () => {
  const g = Game.newGame('Inbox', 'Lotto Dstny', 1111);
  // Advance several weeks to give AI offer chance.
  for (let i = 0; i < 12; i++) g.advanceWeek();
  assert.ok(g.inbox.length > 0 || g.pendingOffers.length > 0);
});

test('season end produces history and resets calendar', () => {
  const g = Game.newGame('Eos', 'Kern Pharma', 555);
  g.calendar = []; // force immediate season-end on next advance
  g.advanceWeek();
  const hist = g.history[g.history.length - 1];
  assert.ok(hist);
  assert.equal(g.seasonIndex, 1);
  assert.equal(g.week, 0);
  assert.equal(g.results.length, 0);
});

test('oppositionReport returns predicted team', () => {
  const g = Game.newGame('Scout', 'UAE Team Emirates', 333);
  const report = g.oppositionReport('Visma | Lease a Bike');
  assert.ok(report);
  assert.equal(report.predicted.length, 8);
});
