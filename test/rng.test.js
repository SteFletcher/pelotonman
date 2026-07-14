// test/rng.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng, hashString } from '../src/engine/rng.js';

test('hashString is stable and deterministic', () => {
  assert.equal(hashString('UAD'), hashString('UAD'));
  assert.equal(typeof hashString('UAD'), 'number');
  assert.ok(Number.isInteger(hashString('UAD')));
});

test('hashString differs for different inputs', () => {
  assert.notEqual(hashString('UAD'), hashString('TVM'));
});

test('next() is in [0, 1)', () => {
  const rng = createRng(42);
  for (let i = 0; i < 10000; i++) {
    const v = rng.next();
    assert.ok(v >= 0 && v < 1, `out of range: ${v}`);
  }
});

test('identical seeds replay the identical sequence', () => {
  const a = createRng(1234);
  const b = createRng(1234);
  for (let i = 0; i < 1000; i++) {
    assert.equal(a.next(), b.next());
  }
});

test('different seeds diverge', () => {
  const a = createRng(1);
  const b = createRng(2);
  let diffs = 0;
  for (let i = 0; i < 1000; i++) {
    if (a.next() !== b.next()) diffs++;
  }
  assert.ok(diffs > 990, `seeds should diverge, diffs=${diffs}`);
});

test('int() is inclusive of both bounds', () => {
  const rng = createRng(7);
  let min = Infinity, max = -Infinity;
  for (let i = 0; i < 100000; i++) {
    const v = rng.int(3, 5);
    assert.ok(v >= 3 && v <= 5);
    if (v < min) min = v;
    if (v > max) max = v;
  }
  assert.equal(min, 3);
  assert.equal(max, 5);
});

test('chance() respects probability', () => {
  const rng = createRng(99);
  let trues = 0;
  const N = 100000;
  for (let i = 0; i < N; i++) if (rng.chance(0.25)) trues++;
  const p = trues / N;
  assert.ok(p > 0.24 && p < 0.26, `p=${p}`);
});

test('pick() returns array elements only', () => {
  const rng = createRng(5);
  const items = ['a', 'b', 'c'];
  for (let i = 0; i < 1000; i++) {
    assert.ok(items.includes(rng.pick(items)));
  }
});

test('pick() throws on empty array', () => {
  const rng = createRng(5);
  assert.throws(() => rng.pick([]), RangeError);
});

test('weightedPick() respects weights', () => {
  const rng = createRng(3);
  const counts = { a: 0, b: 0, c: 0 };
  const N = 60000;
  for (let i = 0; i < N; i++) {
    const r = rng.weightedPick([
      { item: 'a', weight: 1 },
      { item: 'b', weight: 3 },
      { item: 'c', weight: 6 },
    ]);
    counts[r]++;
  }
  assert.ok(counts.a < counts.b && counts.b < counts.c);
  // c should be ~60% of draws
  assert.ok(counts.c / N > 0.55 && counts.c / N < 0.65, `c=${counts.c / N}`);
});

test('getState()/setState() restore the future', () => {
  const rng = createRng(555);
  rng.next(); rng.next();
  const snap = rng.getState();
  const seq1 = [rng.next(), rng.next(), rng.next()];
  const copy = createRng(0);
  copy.setState(snap);
  const seq2 = [copy.next(), copy.next(), copy.next()];
  assert.deepEqual(seq1, seq2);
});

test('string seed works like its hash', () => {
  const a = createRng('Pelotonman');
  const b = createRng(hashString('Pelotonman'));
  assert.equal(a.next(), b.next());
});

test('distribution is roughly uniform over 100k draws', () => {
  const rng = createRng(2024);
  const buckets = new Array(10).fill(0);
  for (let i = 0; i < 100000; i++) {
    buckets[Math.floor(rng.next() * 10)]++;
  }
  for (const c of buckets) {
    assert.ok(c > 9000 && c < 11000, `bucket=${c}`);
  }
});
