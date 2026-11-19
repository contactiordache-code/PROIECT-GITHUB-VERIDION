import assert from 'node:assert/strict';
import { test } from 'node:test';
import { summarize } from '../src/exporter.js';
import type { ScanResult } from '../src/pipeline.js';

test('summarizes detections without confusing total and distinct counts', () => {
  const detection = {
    id: 'wordpress', name: 'WordPress', category: 'CMS',
    confidence: 'confirmed' as const, evidence: [],
  };
  const results: ScanResult[] = [
    {
      domain: 'a.example', status: 'detected', technologies: [detection],
      errors: [], warnings: [], durationMs: 1, analyzedAt: '2026-01-01',
    },
    {
      domain: 'b.example', status: 'detected', technologies: [detection],
      errors: [], warnings: [], durationMs: 1, analyzedAt: '2026-01-01',
    },
    {
      domain: 'c.example', status: 'failed', technologies: [],
      errors: ['failed'], warnings: [], durationMs: 1, analyzedAt: '2026-01-01',
    },
  ];

  assert.deepEqual(summarize(results), {
    totalDomains: 3,
    accessibleDomains: 2,
    failedDomains: 1,
    domainsWithTechnologies: 2,
    totalDetections: 2,
    confirmedDetections: 2,
    probableDetections: 0,
    distinctTechnologyCount: 1,
    confirmedDistinctTechnologyCount: 1,
    distinctTechnologies: ['WordPress'],
    averageDetectionsPerAccessibleDomain: 1,
  });
});
