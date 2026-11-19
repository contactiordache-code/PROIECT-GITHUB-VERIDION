import assert from 'node:assert/strict';
import test from 'node:test';
import { scrapeWithFirecrawl } from '../src/firecrawl.js';

test('turns Firecrawl HTML into a collection result without exposing the key', async () => {
  const fetcher: typeof fetch = async (_url, init) => {
    assert.equal((init?.headers as Record<string, string>).authorization, 'Bearer secret');
    return new Response(JSON.stringify({
      success: true,
      data: { rawHtml: '<meta name="generator" content="WordPress">', metadata: {
        sourceURL: 'https://example.com/home', statusCode: 200,
      } },
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const result = await scrapeWithFirecrawl('example.com', 'secret', fetcher);
  assert.equal(result.finalUrl, 'https://example.com/home');
  assert.match(result.html, /WordPress/);
  assert.doesNotMatch(JSON.stringify(result), /secret/);
});
