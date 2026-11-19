import { readFile } from 'node:fs/promises';
import { writeOutputs } from './exporter.js';
import type { ScanResult } from './pipeline.js';

export function selectRichestSnapshots(runs: ScanResult[][]): ScanResult[] {
  const selected = new Map<string, ScanResult>();
  for (const run of runs) {
    for (const result of run) {
      const current = selected.get(result.domain);
      if (!current || result.technologies.length > current.technologies.length) {
        selected.set(result.domain, result);
      }
    }
  }
  return runs[0]?.map(({ domain }) => selected.get(domain)!) ?? [];
}

async function main(): Promise<void> {
  const [output, ...inputs] = process.argv.slice(2);
  if (!output || inputs.length < 2) {
    throw new Error('Usage: consolidate <output-directory> <results.json> <results.json> [...]');
  }
  const runs = await Promise.all(inputs.map(async (path) =>
    JSON.parse(await readFile(path, 'utf8')) as ScanResult[],
  ));
  await writeOutputs(output, selectRichestSnapshots(runs));
  console.log(`Wrote consolidated results to ${output}`);
}

if (process.argv[1]?.endsWith('/consolidate.js')) await main();
