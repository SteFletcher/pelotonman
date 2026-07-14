// test/rider-stats.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createRider, ability, fairValue, fairWage, ageFactor,
  developRider, shouldRetire, isAvailable, ROLES,
} from '../src/engine/riders.js';
import { createRng } from '../src/engine/rng.js';

test('createRider builds a well-formed rider', () => {
  const r = createRider({ name: 'Test Rider', type: 'LDR', age: 26, power: 85, climb: 88 });
  assert.equal(r.name, 'Test Rider');
  assert.equal(r.type, 'LDR');
  assert.equal(r.power, 85);
  assert.equal(r.climb, 88);
  assert.equal(r.age, 26);
  assert.equal(r.condition, 100);
  assert.equal(r.form, 6.0);
  assert.equal(r.morale, 70);
  assert.equal(r.injuryWeeks, 0);
  assert.equal(r.listed, false);
  assert.ok(r.value >= 25000);
  assert.ok(r.wage > 0);
  assert.ok(r.tt >= 1 && r.tt <= 99); // derived
});

test('createRider throws on invalid role', () => {
  assert.throws(() => createRider({ name: 'X', type: 'GK', age: 25, power: 80, climb: 80 }), TypeError);
});

test('createRider clamps attributes to [1,99]', () => {
  const r = createRider({ name: 'X', type: 'LDR', age: 25, power: 200, climb: -5 });
  assert.equal(r.power, 99);
  assert.equal(r.climb, 1);
});

test('ability() by role uses the documented weights', () => {
  assert.equal(ability({ type: 'SPR', power: 90, climb: 50 }), 0.85 * 90 + 0.15 * 50);
  assert.equal(ability({ type: 'CLM', power: 60, climb: 90 }), 0.85 * 90 + 0.15 * 60);
  assert.equal(ability({ type: 'LDR', power: 80, climb: 90 }), 0.55 * 80 + 0.45 * 90);
  assert.equal(ability({ type: 'ROU', power: 80, climb: 70 }), 0.6 * 80 + 0.4 * 70);
});

test('ageFactor peaks 24-28 and fades after', () => {
  assert.equal(ageFactor(26), 1.0);
  assert.equal(ageFactor(24), 1.0);
  assert.equal(ageFactor(28), 1.0);
  assert.ok(ageFactor(34) < 1.0);
  assert.ok(ageFactor(18) < 1.0 && ageFactor(18) >= 0.75);
});

test('fairValue has a floor of £25k and scales with ability', () => {
  const weak = createRider({ name: 'w', type: 'ROU', age: 26, power: 15, climb: 15 });
  const star = createRider({ name: 's', type: 'LDR', age: 26, power: 90, climb: 92 });
  assert.equal(fairValue(weak), 25000);
  assert.ok(fairValue(star) > fairValue(weak) * 100);
});

test('fairWage scales with ability', () => {
  const star = createRider({ name: 's', type: 'LDR', age: 26, power: 90, climb: 92 });
  const dom = createRider({ name: 'd', type: 'ROU', age: 26, power: 60, climb: 55 });
  assert.ok(fairWage(star) > fairWage(dom));
});

test('developRider ages the rider and keeps attributes in range', () => {
  const rng = createRng(1);
  const r = createRider({ name: 'young', type: 'LDR', age: 21, power: 78, climb: 80 });
  const r2 = developRider(r, rng);
  assert.equal(r2.age, 22);
  assert.ok(r2.power >= 1 && r2.power <= 99);
  assert.ok(r2.climb >= 1 && r2.climb <= 99);
  // youngster should grow
  assert.ok(r2.ability >= r.ability, 'young rider should not get weaker');
});

test('developRider fades veterans', () => {
  const rng = createRng(2);
  const r = createRider({ name: 'old', type: 'LDR', age: 34, power: 80, climb: 82 });
  const r2 = developRider(r, rng);
  assert.equal(r2.age, 35);
  assert.ok(r2.ability <= r.ability, 'veteran should not improve');
});

test('shouldRetire triggers more for older riders', () => {
  const rng = createRng(3);
  const young = createRider({ name: 'y', type: 'ROU', age: 24, power: 70, climb: 70 });
  const old = createRider({ name: 'o', type: 'ROU', age: 38, power: 70, climb: 70 });
  let yRet = 0, oRet = 0;
  for (let i = 0; i < 1000; i++) {
    if (shouldRetire(young, rng)) yRet++;
    if (shouldRetire(old, rng)) oRet++;
  }
  assert.equal(yRet, 0);
  assert.ok(oRet > 400, `old retire count=${oRet}`);
});

test('isAvailable respects injury and abandonment', () => {
  const r = createRider({ name: 'x', type: 'LDR', age: 26, power: 80, climb: 80 });
  assert.equal(isAvailable(r), true);
  const inj = { ...r, injuryWeeks: 2 };
  assert.equal(isAvailable(inj), false);
  const dnf = { ...r, abandonedRace: 'tdf' };
  assert.equal(isAvailable(dnf), false);
});

test('createRider does not consume RNG (deterministic by data)', () => {
  const a = createRider({ name: 'p', type: 'LDR', age: 26, power: 88, climb: 93 });
  const b = createRider({ name: 'p', type: 'LDR', age: 26, power: 88, climb: 93 });
  assert.deepEqual(a, b);
});
