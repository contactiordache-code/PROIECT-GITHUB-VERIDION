import { resolve } from 'node:path';
import { writeOutputs } from './exporter.js';
import { loadParquetDomains } from './input.js';
import { recoverWithBrowser, scanDomains } from './pipeline.js';
import { rules } from './rules.js';
import { loadWappalyzerRules } from './wappalyzer.js';

function option(name: string, fallback: string): string {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : (process.argv[index + 1] ?? fallback);
}

const input = resolve(option('--input', 'data/input/domains.parquet'));
const output = resolve(option('--output', 'results'));
const concurrency = Number(option('--concurrency', '5'));
const offset = Number(option('--offset', '0'));
const limit = Number(option('--limit', String(Number.MAX_SAFE_INTEGER)));
const timeoutMs = Number(option('--timeout', '15000'));
const retries = Number(option('--retries', '1'));
const loaded = await loadParquetDomains(input);
const externalRules = await loadWappalyzerRules(
  resolve('vendor/wappalyzer'),
  new Set(rules.map(({ name }) => name)),
);
const technologyRules = [...rules, ...externalRules];

if (loaded.rejected.length) {
  console.warn(`Rejected ${loaded.rejected.length} invalid input rows`);
}

const selectedDomains = loaded.domains.slice(offset, offset + limit);
let results = await scanDomains(
  selectedDomains,
  concurrency,
  { timeoutMs, retries },
  (completed, total, result) => {
    console.log(`[${completed}/${total}] ${result.domain}: ${result.status}`);
  },
  technologyRules,
);
if (process.argv.includes('--browser-fallback') || process.argv.includes('--browser-all') || process.argv.includes('--deep')) {
  results = await recoverWithBrowser(
    selectedDomains,
    results,
    { timeoutMs, retries },
    technologyRules,
    Math.min(concurrency, 4),
    (completed, total, result) => {
      console.log(`[browser ${completed}/${total}] ${result.domain}: ${result.status}`);
    },
    process.argv.includes('--browser-all') || process.argv.includes('--deep'),
    process.argv.includes('--deep'),
  );
}
await writeOutputs(output, results);
console.log(`Wrote results to ${output}`);
