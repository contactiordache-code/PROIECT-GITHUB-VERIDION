import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { CollectionResult } from './collector.js';
import { detectTechnologies } from './detector.js';
import { writeOutputs } from './exporter.js';
import { rules } from './rules.js';
import { extractSignals } from './signals.js';
import type { ScanResult } from './pipeline.js';
import { loadWappalyzerRules } from './wappalyzer.js';

interface FirecrawlResponse {
  success?: boolean;
  data?: {
    html?: string;
    rawHtml?: string;
    metadata?: { sourceURL?: string; url?: string; statusCode?: number };
  };
  error?: string;
}

export async function scrapeWithFirecrawl(
  domain: string,
  apiKey: string,
  fetcher: typeof fetch = fetch,
  protocol: 'https' | 'http' = 'https',
): Promise<CollectionResult> {
  const started = performance.now();
  const response = await fetcher('https://api.firecrawl.dev/v2/scrape', {
    method: 'POST',
    signal: AbortSignal.timeout(120_000),
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      url: `${protocol}://${domain}`,
      formats: ['html', 'rawHtml'],
      onlyMainContent: false,
      timeout: 60_000,
    }),
  });
  const payload = await response.json() as FirecrawlResponse;
  if (!response.ok || !payload.success || !payload.data) {
    throw new Error(`Firecrawl scrape failed (${response.status}): ${payload.error ?? 'unknown error'}`);
  }
  const html = payload.data.rawHtml || payload.data.html || '';
  if (!html) throw new Error('Firecrawl returned no HTML');
  if (Buffer.byteLength(html) > 5_000_000) throw new Error('Firecrawl HTML exceeds 5000000 bytes');
  const finalUrl = payload.data.metadata?.sourceURL ?? payload.data.metadata?.url ?? `${protocol}://${domain}`;
  return {
    domain,
    requestedUrl: `${protocol}://${domain}`,
    finalUrl,
    httpStatus: payload.data.metadata?.statusCode ?? 200,
    headers: {},
    cookieNames: [],
    html,
    redirects: [],
    durationMs: Math.round(performance.now() - started),
    warnings: ['Collected through Firecrawl cloud recovery'],
  };
}

async function main(): Promise<void> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) throw new Error('FIRECRAWL_API_KEY is required');
  const inputPath = resolve(process.argv[2] ?? 'results/calibrated-hybrid/results.json');
  const outputPath = resolve(process.argv[3] ?? 'results/firecrawl-recovery');
  const domainFilter = new Set((process.argv[4] ?? '').split(',').filter(Boolean));
  const protocol = process.argv.includes('--http') ? 'http' : 'https';
  const existing = JSON.parse(await readFile(inputPath, 'utf8')) as ScanResult[];
  const failed = existing.filter(({ status, domain }) =>
    status === 'failed' && (!domainFilter.size || domainFilter.has(domain)),
  );
  const externalRules = await loadWappalyzerRules(
    resolve('vendor/wappalyzer'), new Set(rules.map(({ name }) => name)),
  );
  const technologyRules = [...rules, ...externalRules];
  const recovered: ScanResult[] = [];

  for (const [index, previous] of failed.entries()) {
    const started = performance.now();
    try {
      const page = await scrapeWithFirecrawl(previous.domain, apiKey, fetch, protocol);
      const technologies = detectTechnologies(extractSignals(page), technologyRules);
      recovered.push({
        domain: previous.domain,
        resolvedUrl: page.finalUrl,
        status: technologies.length ? 'detected' : 'no_technologies',
        httpStatus: page.httpStatus,
        technologies,
        errors: [],
        warnings: page.warnings,
        durationMs: Math.round(performance.now() - started),
        analyzedAt: new Date().toISOString(),
      });
    } catch (error) {
      recovered.push({
        ...previous,
        warnings: [...previous.warnings, `Firecrawl recovery failed: ${error instanceof Error ? error.message : error}`],
      });
    }
    console.log(`[${index + 1}/${failed.length}] ${previous.domain}: ${recovered.at(-1)!.status}`);
  }
  await writeOutputs(outputPath, recovered);
  console.log(`Wrote Firecrawl recovery to ${outputPath}`);
}

if (process.argv[1]?.endsWith('/firecrawl.js')) await main();
