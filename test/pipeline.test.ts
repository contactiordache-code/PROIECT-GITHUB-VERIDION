import assert from 'node:assert/strict';
import { test } from 'node:test';
import { scanDomains } from '../src/pipeline.js';

test('validates worker concurrency before scanning', async () => {
  await assert.rejects(scanDomains([], 0), /positive integer/);
});
