import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { loadParquetDomains, normalizeDomain } from '../src/input.js';

test('normalizes case, URLs, trailing dots, and international domains', () => {
  assert.deepEqual(normalizeDomain(' HTTPS://Example.COM./ '), {
    original: 'HTTPS://Example.COM./',
    domain: 'example.com',
    url: 'https://example.com',
  });
  assert.equal(normalizeDomain('køleservice.dk').domain, 'xn--kleservice-0cb.dk');
});

test('rejects inputs outside the supplied public-domain scope', () => {
  for (const value of [
    '',
    'localhost',
    '127.0.0.1',
    'ftp://example.com',
    'https://user:pass@example.com',
    'https://example.com:8443',
    'https://example.com/page',
  ]) {
    assert.throws(() => normalizeDomain(value), value);
  }
});

test('loads the official parquet dataset without rejection', async () => {
  const fixture = resolve('data/input/domains.parquet');
  const result = await loadParquetDomains(fixture);

  assert.equal(result.domains.length, 200);
  assert.deepEqual(result.rejected, []);
  assert.equal(result.domains[0]?.domain, 'jcmobilecigars.com');
});
