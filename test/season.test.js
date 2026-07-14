// test/season.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCalendar, raceProfile, monthName, RACES } from '../src/engine/season.js';

test('calendar has ~28 weeks and three Grand Tours', () => {
  const cal = buildCalendar();
  console.log('calendar length', cal.length);
  assert.ok(cal.length >= 28, `calendar length=${cal.length}`);
  assert.ok(cal.some((e) => e.raceId === 'giro'));
  assert.ok(cal.some((e) => e.raceId === 'tour'));
  assert.ok(cal.some((e) => e.raceId === 'vuelta'));
});

test('monthName advances every 4 weeks', () => {
  assert.equal(monthName(0), 'Jan');
  assert.equal(monthName(4), 'Feb');
});

test('raceProfile returns usable profiles for all race kinds', () => {
  assert.equal(raceProfile('milano-sanremo').parcourType, 'flat');
  assert.equal(raceProfile('tirreno', 2).kind, 'stage');
  assert.equal(raceProfile('giro', 10).kind, 'gt-stage');
  assert.equal(raceProfile('giro', 1).kind, 'gt-stage');
});

test('stage race stage count covers calendar entries', () => {
  const cal = buildCalendar();
  const giroStages = cal.filter((e) => e.raceId === 'giro').length;
  assert.equal(giroStages, 21);
});
