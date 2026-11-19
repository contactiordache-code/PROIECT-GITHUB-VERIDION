import assert from 'node:assert/strict';
import test from 'node:test';
import { selectRichestSnapshots } from '../src/consolidate.js';
import type { ScanResult } from '../src/pipeline.js';

function result(domain: string, names: string[]): ScanResult {
  return {
    domain, status: names.length ? 'detected' : 'no_technologies', errors: [], warnings: [],
    durationMs: 1, analyzedAt: '2026-11-19T00:00:00Z',
    technologies: names.map((name) => ({
      id: name, name, category: 'Test', confidence: 'confirmed', evidence: [],
    })),
  };
}

test('keeps one complete evidence-rich snapshot per domain in input order', () => {
  const selected = selectRichestSnapshots([
    [result('a.example', ['A', 'B']), result('b.example', [])],
    [result('a.example', ['A']), result('b.example', ['C'])],
  ]);
  assert.deepEqual(selected.map(({ domain, technologies }) =>
    [domain, technologies.map(({ name }) => name)]), [
    ['a.example', ['A', 'B']], ['b.example', ['C']],
  ]);
});
