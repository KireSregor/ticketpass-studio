import assert from 'node:assert/strict';
import { test } from 'node:test';
import { startTime } from '../src/review.js';

test('keeps the concert start instead of the door opening', () => {
  assert.equal(startTime('Apertura: 18:30 · Inicio del show: 20:00'), '20:00');
  assert.equal(startTime('9:30'), '09:30');
});

test('leaves the start time open for manual review when ambiguous or invalid', () => {
  assert.equal(startTime('Apertura: 18:30'), null);
  assert.equal(startTime('Inicio del evento: 20:00 / Inicio del evento: 21:00'), null);
  assert.equal(startTime('Inicio del evento: 25:90'), null);
});
