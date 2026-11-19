import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { detectTechnologies } from '../src/detector.js';
import { extractSignals } from '../src/signals.js';
import { loadWappalyzerRules } from '../src/wappalyzer.js';
import type { CollectionResult } from '../src/collector.js';

test('loads the pinned fingerprint snapshot and preserves match evidence', async () => {
  const rules = await loadWappalyzerRules(resolve('vendor/wappalyzer'));
  assert.ok(rules.length > 2_000);

  const page: CollectionResult = {
    domain: 'example.com', requestedUrl: 'https://example.com',
    finalUrl: 'https://example.com/', httpStatus: 200,
    headers: { 'x-powered-by': 'Express' }, cookieNames: [],
    html: `<html amp><script src="https://cdn.example.com/react.production.min.js"></script>
      <script>admiral:enabled</script></html>`,
    redirects: [], durationMs: 1, warnings: [],
  };
  const detections = detectTechnologies(extractSignals(page), rules);

  assert.ok(detections.some(({ name }) => name === 'Express'));
  assert.ok(detections.find(({ name }) => name === 'Express')!.evidence.length > 0);
  assert.ok(detections.some(({ name }) => name === 'AMP'));
  assert.equal(detections.find(({ name }) => name === 'AMP')?.confidence, 'probable');
  assert.ok(detections.some(({ name }) => name === 'Admiral'));

  const linkedin = rules.find(({ name }) => name === 'Linkedin Ads');
  assert.ok(linkedin?.fingerprints.some(
    ({ key, strength }) => key === 'content-security-policy' && strength === 2,
  ));
});

test('preserves uppercase DNS record keys', async () => {
  const loaded = await loadWappalyzerRules(resolve('vendor/wappalyzer'));
  const workspace = loaded.find(({ name }) => name === 'Google Workspace')!;
  assert.equal(workspace.fingerprints.find(({ source }) => source === 'dns')?.key, 'MX');
});

test('excludes upstream aliases without case-sensitive duplicates', async () => {
  const loaded = await loadWappalyzerRules(
    resolve('vendor/wappalyzer'),
    new Set(['Mailchimp']),
  );
  assert.equal(loaded.some(({ name }) => name === 'MailChimp'), false);
});
