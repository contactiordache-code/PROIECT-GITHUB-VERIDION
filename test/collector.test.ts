import assert from 'node:assert/strict';
import { test } from 'node:test';
import { collectDomain, collectWebsite, formatCertificateIssuer, isPublicIp } from '../src/collector.js';
import { normalizeDomain } from '../src/input.js';

test('classifies public and non-public IP addresses', () => {
  for (const address of ['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111']) {
    assert.equal(isPublicIp(address), true, address);
  }
  for (const address of [
    '127.0.0.1', '10.0.0.1', '169.254.1.1', '192.168.1.1',
    '192.0.2.1', '::1', 'fc00::1', 'fe80::1', '2001:db8::1',
  ]) {
    assert.equal(isPublicIp(address), false, address);
  }
});

test('formats certificate issuer fields for fingerprint matching', () => {
  assert.equal(formatCertificateIssuer({ O: 'Let\'s Encrypt', CN: 'R13' }), "Let's Encrypt R13");
});

test('blocks private DNS results before fetching', async () => {
  let fetched = false;
  await assert.rejects(
    collectWebsite(normalizeDomain('example.com'), {}, {
      resolve: async () => ['127.0.0.1'],
      fetch: async () => {
        fetched = true;
        return new Response();
      },
    }),
    /non-public/,
  );
  assert.equal(fetched, false);
});

test('collects a redirect chain, safe headers, cookie names, and HTML', async () => {
  const responses = [
    new Response(null, { status: 301, headers: { location: 'https://www.example.com/' } }),
    new Response('<meta name="generator" content="Example CMS">', {
      status: 200,
      headers: {
        'content-type': 'text/html',
        'set-cookie': 'session=secret; HttpOnly',
        server: 'ExampleServer',
      },
    }),
  ];
  const result = await collectWebsite(normalizeDomain('example.com'), {}, {
    resolve: async () => ['93.184.216.34'],
    fetch: async () => responses.shift()!,
  });

  assert.equal(result.finalUrl, 'https://www.example.com/');
  assert.equal(result.httpStatus, 200);
  assert.equal(result.headers.server, 'ExampleServer');
  assert.equal(result.headers['set-cookie'], undefined);
  assert.deepEqual(result.cookieNames, ['session']);
  assert.match(result.html, /Example CMS/);
  assert.deepEqual(result.redirects.map(({ status }) => status), [301]);
});

test('checks redirect destinations against SSRF', async () => {
  await assert.rejects(
    collectWebsite(normalizeDomain('example.com'), {}, {
      resolve: async (hostname) =>
        hostname === 'example.com' ? ['93.184.216.34'] : ['10.0.0.1'],
      fetch: async () => new Response(null, {
        status: 302,
        headers: { location: 'http://internal.example/' },
      }),
    }),
    /non-public/,
  );
});

test('rejects oversized responses', async () => {
  await assert.rejects(
    collectWebsite(normalizeDomain('example.com'), { maxBodyBytes: 4 }, {
      resolve: async () => ['93.184.216.34'],
      fetch: async () => new Response('12345'),
    }),
    /exceeds 4 bytes/,
  );
});

test('falls back to HTTP only when HTTPS cannot be collected', async () => {
  const requested: string[] = [];
  const result = await collectDomain(normalizeDomain('example.com'), { retries: 0 }, {
    resolve: async () => ['93.184.216.34'],
    fetch: async (url) => {
      requested.push(String(url));
      if (String(url).startsWith('https:')) throw new Error('TLS failure');
      return new Response('ok', { status: 200 });
    },
  });

  assert.deepEqual(requested, ['https://example.com/', 'http://example.com/']);
  assert.equal(result.finalUrl, 'http://example.com/');
  assert.match(result.warnings[0] ?? '', /HTTPS failed/);
});
