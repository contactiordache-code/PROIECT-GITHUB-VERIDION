import { readFile, writeFile } from 'node:fs/promises';
import type { TechnologyDetection } from './detector.js';

interface ResultRecord {
  domain: string;
  status: string;
  technologies: TechnologyDetection[];
}

interface HttpxRecord {
  input: string;
  tech?: string[];
}

const aliases: Record<string, string> = {
  'apache http server': 'apache',
  'adobe fonts': 'typekit',
  'asp.net': 'microsoft asp.net',
  'google fonts': 'google font api',
  'hubspot cms': 'hubspot cms hub',
  'linkedin ads': 'linkedin ads',
  'litespeed cache': 'litespeed cache',
  'matomo': 'matomo analytics',
  'meta pixel': 'facebook pixel',
  'microsoft iis': 'iis',
  'nuxt': 'nuxt.js',
  'vimeo embed': 'vimeo',
  'youtube embed': 'youtube',
};

export function normalizeTechnology(value: string): string {
  const normalized = value
    .replace(/:[\d.]+$/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  return aliases[normalized] ?? normalized;
}

function key(domain: string, technology: string): string {
  return `${domain.toLowerCase()}\0${normalizeTechnology(technology)}`;
}

function evidenceQuality(detection: TechnologyDetection): 'direct' | 'indirect' {
  return detection.evidence.some(({ source }) => source !== 'header' || detection.name !== 'HSTS')
    && detection.confidence === 'confirmed'
    ? 'direct'
    : 'indirect';
}

export function buildValidation(results: ResultRecord[], baseline: HttpxRecord[]) {
  const baselineDomains = new Set(baseline.map(({ input }) => input.toLowerCase()));
  const baselineKeys = new Set(
    baseline.flatMap(({ input, tech = [] }) => tech.map((name) => key(input, name))),
  );
  const detections = results.filter(({ status }) => status !== 'failed').flatMap(({ domain, technologies }) =>
    technologies.map((technology) => ({ domain, technology })),
  );
  const comparable = detections.filter(({ domain }) => baselineDomains.has(domain.toLowerCase()));
  const agreed = comparable.filter(({ domain, technology }) =>
    baselineKeys.has(key(domain, technology.name)),
  );
  const oursOnly = comparable.filter(({ domain, technology }) =>
    !baselineKeys.has(key(domain, technology.name)),
  );
  const sample = [...oursOnly]
    .sort((a, b) =>
      a.technology.name.localeCompare(b.technology.name) || a.domain.localeCompare(b.domain),
    )
    .filter(({ technology }, index, all) =>
      all.findIndex((candidate) => candidate.technology.name === technology.name) === index,
    )
    .slice(0, 30)
    .map(({ domain, technology }) => ({
      domain,
      technology: technology.name,
      confidence: technology.confidence,
      evidenceQuality: evidenceQuality(technology),
      evidence: technology.evidence,
    }));

  return {
    generatedAt: new Date().toISOString(),
    methodology: {
      baseline: 'ProjectDiscovery httpx 1.12.0 technology detection',
      agreementMeaning: 'Both engines named the same normalized technology on the same domain.',
      limitation: 'Agreement increases confidence but does not prove ground truth; disagreement is not a false positive.',
    },
    totals: {
      detections: detections.length,
      comparableDetections: comparable.length,
      independentlyCorroborated: agreed.length,
      agreementPercent: comparable.length ? Number((agreed.length / comparable.length * 100).toFixed(1)) : 0,
      projectOnly: oursOnly.length,
      detectionsOutsideBaselineDomains: detections.length - comparable.length,
    },
    projectOnlyByTechnology: Object.entries(
      oursOnly.reduce<Record<string, number>>((counts, { technology }) => {
        counts[technology.name] = (counts[technology.name] ?? 0) + 1;
        return counts;
      }, {}),
    )
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([technology, count]) => ({ technology, count })),
    auditSample: sample,
  };
}

async function main(): Promise<void> {
  const [resultsPath = 'results/final-passive/results.json', baselinePath = 'experiments/raw/httpx.jsonl', outputPath = 'results/final-passive/validation.json'] = process.argv.slice(2);
  const results = JSON.parse(await readFile(resultsPath, 'utf8')) as ResultRecord[];
  const baseline = (await readFile(baselinePath, 'utf8')).trim().split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as HttpxRecord);
  await writeFile(outputPath, JSON.stringify(buildValidation(results, baseline), null, 2) + '\n');
  console.log(`Wrote ${outputPath}`);
}

if (process.argv[1]?.endsWith('/validate.js')) await main();
