import { lookup, resolveMx, resolveNs, resolveSoa, resolveTxt } from 'node:dns/promises';
import { isIP } from 'node:net';
import { connect as connectTls, type PeerCertificate } from 'node:tls';
import type { DomainInput } from './input.js';

export interface RedirectHop {
  url: string;
  status: number;
  location: string;
}

export interface CollectionResult {
  domain: string;
  requestedUrl: string;
  finalUrl: string;
  httpStatus: number;
  headers: Record<string, string>;
  cookieNames: string[];
  html: string;
  redirects: RedirectHop[];
  durationMs: number;
  warnings: string[];
  dnsRecords?: Record<string, string[]>;
  runtimeValues?: Record<string, string[]>;
  domValues?: Record<string, string[]>;
  xhrUrls?: string[];
  tlsIssuer?: string;
  serviceWorkerUrls?: string[];
  cssContents?: string[];
  auxiliaryScripts?: string[];
  auxiliaryHtml?: string[];
}

export async function collectDnsRecords(domain: string): Promise<Record<string, string[]>> {
  const [mx, ns, soa, txt] = await Promise.allSettled([
    resolveMx(domain), resolveNs(domain), resolveSoa(domain), resolveTxt(domain),
  ]);
  return {
    MX: mx.status === 'fulfilled' ? mx.value.map(({ exchange }) => exchange) : [],
    NS: ns.status === 'fulfilled' ? ns.value : [],
    SOA: soa.status === 'fulfilled' ? [soa.value.nsname, soa.value.hostmaster] : [],
    TXT: txt.status === 'fulfilled' ? txt.value.map((parts) => parts.join('')) : [],
  };
}

export function formatCertificateIssuer(issuer: PeerCertificate['issuer']): string {
  return Object.values(issuer ?? {}).filter(Boolean).join(' ');
}

export async function collectTlsIssuer(domain: string, timeoutMs = 5_000): Promise<string | undefined> {
  const addresses = await defaultResolver(domain);
  if (!addresses.length || addresses.some((address) => !isPublicIp(address))) return undefined;

  for (const address of addresses) {
    try {
      const issuer = await new Promise<string | undefined>((resolve, reject) => {
        const socket = connectTls({ host: address, port: 443, servername: domain, rejectUnauthorized: true });
        socket.setTimeout(timeoutMs, () => socket.destroy(new Error('TLS issuer timeout')));
        socket.once('secureConnect', () => {
          const value = formatCertificateIssuer(socket.getPeerCertificate().issuer);
          socket.end();
          resolve(value || undefined);
        });
        socket.once('error', reject);
      });
      if (issuer) return issuer;
    } catch {
      // Try the next already-validated public address.
    }
  }
  return undefined;
}

export interface CollectorOptions {
  timeoutMs?: number;
  retries?: number;
  maxRedirects?: number;
  maxBodyBytes?: number;
  userAgent?: string;
}

type Resolver = (hostname: string) => Promise<string[]>;
type Fetcher = typeof fetch;

const redirectStatuses = new Set([301, 302, 303, 307, 308]);
const retryStatuses = new Set([408, 425, 429, 500, 502, 503, 504]);

const defaultResolver: Resolver = async (hostname) =>
  (await lookup(hostname, { all: true })).map(({ address }) => address);

export async function discoverPublicSubdomains(domain: string): Promise<string[]> {
  const candidates = ['shop', 'store', 'app', 'www'].map((prefix) => `${prefix}.${domain}`);
  const checked = await Promise.all(candidates.map(async (hostname) => {
    try {
      const addresses = await defaultResolver(hostname);
      return addresses.length && addresses.every(isPublicIp) ? `https://${hostname}` : undefined;
    } catch { return undefined; }
  }));
  return checked.filter((url): url is string => Boolean(url)).slice(0, 3);
}

export function isPublicIp(address: string): boolean {
  if (isIP(address) === 4) {
    const value = address
      .split('.')
      .reduce((total, octet) => (total << 8) + Number(octet), 0) >>> 0;
    const inRange = (base: number, bits: number) =>
      bits === 0 || (value >>> (32 - bits)) === (base >>> (32 - bits));

    return ![
      [0x00000000, 8], [0x0a000000, 8], [0x64400000, 10],
      [0x7f000000, 8], [0xa9fe0000, 16], [0xac100000, 12],
      [0xc0000000, 24], [0xc0000200, 24], [0xc0a80000, 16],
      [0xc6120000, 15], [0xc6336400, 24], [0xcb007100, 24],
      [0xe0000000, 4], [0xf0000000, 4],
    ].some(([base, bits]) => inRange(base!, bits!));
  }

  if (isIP(address) === 6) {
    const normalized = address.toLowerCase();
    const mapped = normalized.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
    if (mapped) return isPublicIp(mapped);
    return !(
      normalized === '::' ||
      normalized === '::1' ||
      /^f[cd]/.test(normalized) ||
      /^fe[89ab]/.test(normalized) ||
      normalized.startsWith('ff') ||
      normalized.startsWith('2001:db8:')
    );
  }

  return false;
}

export async function assertPublicUrl(
  url: URL,
  resolve: Resolver = defaultResolver,
): Promise<void> {
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error(`Unsafe URL: ${url.href}`);
  }
  const addresses = await resolve(url.hostname);
  if (!addresses.length || addresses.some((address) => !isPublicIp(address))) {
    throw new Error(`Domain resolves to a non-public address: ${url.hostname}`);
  }
}

async function readBody(response: Response, maxBytes: number): Promise<string> {
  const declaredSize = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredSize) && declaredSize > maxBytes) {
    throw new Error(`Response body exceeds ${maxBytes} bytes`);
  }
  if (!response.body) return '';

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new Error(`Response body exceeds ${maxBytes} bytes`);
    }
    chunks.push(value);
  }

  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(body);
}

function safeHeaders(headers: Headers): {
  headers: Record<string, string>;
  cookieNames: string[];
} {
  const values = Object.fromEntries(headers);
  delete values['set-cookie'];
  const setCookies = (headers as Headers & { getSetCookie?: () => string[] })
    .getSetCookie?.() ?? [];
  const cookieNames = setCookies
    .map((cookie) => cookie.match(/^\s*([^=;\s]+)=/)?.[1])
    .filter((name): name is string => Boolean(name));
  return { headers: values, cookieNames: [...new Set(cookieNames)] };
}

export async function collectWebsite(
  input: DomainInput,
  options: CollectorOptions = {},
  dependencies: { resolve?: Resolver; fetch?: Fetcher } = {},
): Promise<CollectionResult> {
  const started = performance.now();
  const resolve = dependencies.resolve ?? defaultResolver;
  const fetcher = dependencies.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? 15_000;
  const retries = options.retries ?? 1;
  const maxRedirects = options.maxRedirects ?? 5;
  const maxBodyBytes = options.maxBodyBytes ?? 5_000_000;
  const requestedUrl = input.url;
  const redirects: RedirectHop[] = [];
  const warnings: string[] = [];
  let current = new URL(requestedUrl);
  let response: Response | undefined;

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount++) {
    await assertPublicUrl(current, resolve);

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        response = await fetcher(current, {
          redirect: 'manual',
          signal: AbortSignal.timeout(timeoutMs),
          headers: {
            accept: 'text/html,application/xhtml+xml',
            'user-agent': options.userAgent ??
              'VeridionTechnologyResearch/0.1 (+public technology analysis)',
          },
        });
        if (!retryStatuses.has(response.status) || attempt === retries) break;
        await response.body?.cancel();
      } catch (error) {
        if (attempt === retries) throw error;
        warnings.push(`Request retry: ${error instanceof Error ? error.message : error}`);
      }
    }

    if (!response) throw new Error(`No response from ${current.href}`);
    const location = response.headers.get('location');
    if (!redirectStatuses.has(response.status) || !location) break;
    if (redirectCount === maxRedirects) throw new Error('Too many redirects');

    const next = new URL(location, current);
    redirects.push({ url: current.href, status: response.status, location: next.href });
    await response.body?.cancel();
    current = next;
    response = undefined;
  }

  if (!response) throw new Error(`No final response from ${current.href}`);
  const { headers, cookieNames } = safeHeaders(response.headers);
  const html = await readBody(response, maxBodyBytes);

  return {
    domain: input.domain,
    requestedUrl,
    finalUrl: current.href,
    httpStatus: response.status,
    headers,
    cookieNames,
    html,
    redirects,
    durationMs: Math.round(performance.now() - started),
    warnings,
  };
}

export async function collectDomain(
  input: DomainInput,
  options: CollectorOptions = {},
  dependencies: { resolve?: Resolver; fetch?: Fetcher } = {},
): Promise<CollectionResult> {
  try {
    return await collectWebsite(input, options, dependencies);
  } catch (httpsError) {
    const fallback = { ...input, url: `http://${input.domain}` };
    try {
      const result = await collectWebsite(fallback, options, dependencies);
      result.requestedUrl = input.url;
      result.warnings.unshift(
        `HTTPS failed; used HTTP: ${httpsError instanceof Error ? httpsError.message : httpsError}`,
      );
      return result;
    } catch (httpError) {
      throw new AggregateError(
        [httpsError, httpError],
        `HTTPS and HTTP failed for ${input.domain}`,
      );
    }
  }
}
