import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dailyPoem, poetryCount } from '../src/poetry';
import { shanghaiDay } from '../src/model';

test('daily poetry stays consistent for a Shanghai day and changes after midnight', () => {
  const beforeMidnight = shanghaiDay(new Date('2026-11-01T15:59:59Z'));
  const afterMidnight = shanghaiDay(new Date('2026-11-01T16:00:00Z'));
  assert.deepEqual(dailyPoem(beforeMidnight), dailyPoem(shanghaiDay(new Date('2026-11-01T00:00:00Z'))));
  assert.notEqual(dailyPoem(beforeMidnight).text, dailyPoem(afterMidnight).text);
});
test('the collection provides 730 distinct daily excerpts with poet and title', () => {
  assert.equal(poetryCount, 730);
  const poems = Array.from({ length: poetryCount }, (_, index) => dailyPoem(new Date(Date.UTC(2026, 10, 1 + index)).toISOString().slice(0, 10)));
  assert.equal(new Set(poems.map(poem => poem.text)).size, 730);
  assert.ok(new Set(poems.map(poem => poem.author)).size >= 150);
  for (const poem of poems) { assert.ok(poem.author && poem.title); assert.ok(poem.text.length >= 10 && poem.text.length <= 38); }
});
test('calendar dates before the epoch and malformed stored dates have a valid excerpt', () => {
  for (const day of ['2025-01-01', '2026-02-30', '', 'invalid']) assert.ok(dailyPoem(day).text);
});
