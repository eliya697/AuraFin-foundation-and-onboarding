// Run with `npm test` (node --test). Asserts the offline JS engine matches the Python engine.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyzeBudget, roundHalfUp } from '../src/lib/analysis.js';

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf-8'));
const catalog = read('../../shared/tracks.json');
const cases = read('../../shared/fixtures/analysis_cases.json');

for (const { name, snapshot, expected } of cases) {
  test(`analysis parity: ${name}`, () => {
    assert.deepEqual(analyzeBudget(snapshot, catalog), expected);
  });
}

test('roundHalfUp matches Python ROUND_HALF_UP', () => {
  assert.equal(roundHalfUp(2.5), 3);
  assert.equal(roundHalfUp(-2.5), -3);
  assert.equal(roundHalfUp(1.005, 2), 1.01);
  assert.equal(roundHalfUp(0.285, 2), 0.29);
  assert.equal(Object.is(roundHalfUp(-0.2), 0), true);
});
