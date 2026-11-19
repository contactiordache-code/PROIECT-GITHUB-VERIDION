import { collectDnsRecords, collectDomain, collectTlsIssuer, discoverPublicSubdomains, type CollectorOptions } from './collector.js';
import { detectTechnologies, type TechnologyDetection } from './detector.js';
import type { DomainInput } from './input.js';
import { rules, type TechnologyRule } from './rules.js';
import { discoverInternalPages, extractSignals } from './signals.js';
import { collectBrowserDomain, withBrowser } from './browser.js';

export interface ScanResult {
  domain: string;
  resolvedUrl?: string;
  status: 'detected' | 'no_technologies' | 'failed';
  httpStatus?: number;
  technologies: TechnologyDetection[];
  errors: string[];
  warnings: string[];
  durationMs: number;
  analyzedAt: string;
}

function belongsToHost(url: string, host: string): boolean {
  const actual = new URL(url).hostname.replace(/^www\./, '');
  const expected = host.replace(/^www\./, '');
  return actual === expected || actual.endsWith(`.${expected}`);
}

export async function scanDomain(
  input: DomainInput,
  collectorOptions: CollectorOptions = {},
  technologyRules: TechnologyRule[] = rules,
): Promise<ScanResult> {
  const started = performance.now();
  try {
    const page = await collectDomain(input, collectorOptions);
    const [dnsRecords, tlsIssuer] = await Promise.all([
      collectDnsRecords(input.domain),
      collectTlsIssuer(new URL(page.finalUrl).hostname),
    ]);
    page.dnsRecords = dnsRecords;
    if (tlsIssuer) page.tlsIssuer = tlsIssuer;
    const technologies = detectTechnologies(extractSignals(page), technologyRules);
    return {
      domain: input.domain,
      resolvedUrl: page.finalUrl,
      status: technologies.length ? 'detected' : 'no_technologies',
      httpStatus: page.httpStatus,
      technologies,
      errors: [],
      warnings: page.warnings,
      durationMs: Math.round(performance.now() - started),
      analyzedAt: new Date().toISOString(),
    };
  } catch (error) {
    return {
      domain: input.domain,
      status: 'failed',
      technologies: [],
      errors: [error instanceof Error ? error.message : String(error)],
      warnings: [],
      durationMs: Math.round(performance.now() - started),
      analyzedAt: new Date().toISOString(),
    };
  }
}

export async function scanDomains(
  inputs: DomainInput[],
  concurrency = 5,
  collectorOptions: CollectorOptions = {},
  onResult?: (completed: number, total: number, result: ScanResult) => void,
  technologyRules: TechnologyRule[] = rules,
): Promise<ScanResult[]> {
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error('Concurrency must be a positive integer');
  }

  const results = new Array<ScanResult>(inputs.length);
  let next = 0;
  let completed = 0;
  const worker = async () => {
    while (true) {
      const index = next++;
      const input = inputs[index];
      if (!input) return;
      const result = await scanDomain(input, collectorOptions, technologyRules);
      results[index] = result;
      onResult?.(++completed, inputs.length, result);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, inputs.length) }, worker),
  );
  return results;
}

export async function recoverWithBrowser(
  inputs: DomainInput[],
  results: ScanResult[],
  collectorOptions: CollectorOptions = {},
  technologyRules: TechnologyRule[] = rules,
  concurrency = 2,
  onResult?: (completed: number, total: number, result: ScanResult) => void,
  allDomains = false,
  deep = false,
): Promise<ScanResult[]> {
  const candidates = results
    .map((result, index) => ({ result, input: inputs[index] }))
    .filter(({ result, input }) => input && (
      allDomains || result.status === 'failed' || !result.technologies.length
    ));
  if (!candidates.length) return results;

  return withBrowser(async (browser) => {
    const signalPlan = {
      jsKeys: [...new Set(technologyRules.flatMap(({ fingerprints }) =>
        fingerprints.filter(({ source, key }) => source === 'js' && key).map(({ key }) => key!),
      ))],
      domKeys: [...new Set(technologyRules.flatMap(({ fingerprints }) =>
        fingerprints.filter(({ source, key }) => source === 'dom' && key).map(({ key }) => key!),
      ))],
    };
    let next = 0;
    let completed = 0;
    const workers = Array.from({ length: Math.min(concurrency, candidates.length) }, async () => {
      while (true) {
        const candidate = candidates[next++];
        if (!candidate?.input) return;
        const started = performance.now();
        try {
          const page = await collectBrowserDomain(browser, candidate.input, collectorOptions, signalPlan);
          const relatedPages = deep
            ? await Promise.all(discoverInternalPages(page.html, page.finalUrl).map(async (url) => {
              try {
                return await collectBrowserDomain(browser, { ...candidate.input!, url }, collectorOptions, signalPlan);
              } catch { return undefined; }
            }))
            : [];
          const subdomainPages = deep
            ? await Promise.all((await discoverPublicSubdomains(candidate.input.domain)).map(async (url) => {
              if (new URL(page.finalUrl).hostname === new URL(url).hostname) return undefined;
              try {
                const snapshot = await collectBrowserDomain(browser, { ...candidate.input!, url }, collectorOptions, signalPlan);
                return belongsToHost(snapshot.finalUrl, candidate.input!.domain) ? snapshot : undefined;
              } catch { return undefined; }
            }))
            : [];
          const browserTechnologies = [
            page,
            ...relatedPages.filter((item) => item !== undefined),
            ...subdomainPages.filter((item) => item !== undefined),
          ]
            .flatMap((snapshot) => detectTechnologies(extractSignals(snapshot), technologyRules))
            .reduce<TechnologyDetection[]>((merged, detection) => {
              const existing = merged.find(({ name }) => name === detection.name);
              if (!existing) merged.push(detection);
              else {
                existing.evidence = [...existing.evidence, ...detection.evidence].filter(
                  (item, index, all) => all.findIndex((other) =>
                    other.source === item.source && other.key === item.key &&
                    other.value === item.value && other.pageUrl === item.pageUrl,
                  ) === index,
                );
                if (detection.confidence === 'confirmed') existing.confidence = 'confirmed';
              }
              return merged;
            }, []);
          const technologies = allDomains && candidate.result.status !== 'failed'
            ? [...candidate.result.technologies, ...browserTechnologies].reduce<TechnologyDetection[]>(
              (merged, detection) => {
                const existing = merged.find(({ name }) => name === detection.name);
                if (!existing) merged.push(detection);
                else {
                  existing.evidence = [...existing.evidence, ...detection.evidence].filter(
                    (item, index, all) => all.findIndex((other) =>
                      other.source === item.source && other.key === item.key && other.value === item.value,
                    ) === index,
                  );
                  if (detection.confidence === 'confirmed') existing.confidence = 'confirmed';
                }
                return merged;
              },
              [],
            )
            : browserTechnologies;
          const recovered: ScanResult = {
            domain: candidate.input.domain,
            resolvedUrl: page.finalUrl,
            status: technologies.length ? 'detected' : 'no_technologies',
            httpStatus: page.httpStatus,
            technologies,
            errors: [],
            warnings: page.warnings,
            durationMs: Math.round(performance.now() - started),
            analyzedAt: new Date().toISOString(),
          };
          results[inputs.indexOf(candidate.input)] = recovered;
          onResult?.(++completed, candidates.length, recovered);
        } catch (error) {
          candidate.result.warnings.push(`Browser fallback failed: ${error instanceof Error ? error.message : error}`);
          onResult?.(++completed, candidates.length, candidate.result);
        }
      }
    });
    await Promise.all(workers);
    return results;
  });
}
