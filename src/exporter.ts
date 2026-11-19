import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ScanResult } from './pipeline.js';

function csvCell(value: unknown): string {
  const text = Array.isArray(value) ? value.join('; ') : String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function summarize(results: ScanResult[]) {
  const successful = results.filter(({ status }) => status !== 'failed');
  const detections = successful.flatMap(({ technologies }) => technologies);
  const distinctTechnologies = [...new Set(detections.map(({ name }) => name))].sort();
  const confirmed = detections.filter(({ confidence }) => confidence === 'confirmed');
  const probable = detections.filter(({ confidence }) => confidence === 'probable');
  const confirmedDistinctTechnologyCount = new Set(confirmed.map(({ name }) => name)).size;
  return {
    totalDomains: results.length,
    accessibleDomains: successful.length,
    failedDomains: results.length - successful.length,
    domainsWithTechnologies: successful.filter(({ technologies }) => technologies.length).length,
    totalDetections: detections.length,
    confirmedDetections: confirmed.length,
    probableDetections: probable.length,
    distinctTechnologyCount: distinctTechnologies.length,
    confirmedDistinctTechnologyCount,
    distinctTechnologies,
    averageDetectionsPerAccessibleDomain: successful.length
      ? Number((detections.length / successful.length).toFixed(2))
      : 0,
  };
}

export async function writeOutputs(
  outputDirectory: string,
  results: ScanResult[],
): Promise<void> {
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(
    join(outputDirectory, 'results.json'),
    JSON.stringify(results, null, 2),
  );

  const header = [
    'domain', 'resolved_url', 'status', 'http_status', 'technologies',
    'errors', 'warnings', 'duration_ms', 'analyzed_at',
  ];
  const rows = results.map((result) => [
    result.domain,
    result.resolvedUrl,
    result.status,
    result.httpStatus,
    result.technologies.map(({ name }) => name),
    result.errors,
    result.warnings,
    result.durationMs,
    result.analyzedAt,
  ]);
  await writeFile(
    join(outputDirectory, 'results.csv'),
    [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\n') + '\n',
  );
  await writeFile(
    join(outputDirectory, 'summary.json'),
    JSON.stringify(summarize(results), null, 2),
  );
}
