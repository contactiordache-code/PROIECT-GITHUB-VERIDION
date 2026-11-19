import type { PageSignals } from './signals.js';
import type { Fingerprint, TechnologyRule } from './rules.js';

export interface Evidence {
  source: Fingerprint['source'];
  key?: string;
  value: string;
  strength: 1 | 2 | 3;
  pageUrl?: string;
}

export interface TechnologyDetection {
  id: string;
  name: string;
  category: string;
  confidence: 'confirmed' | 'probable';
  evidence: Evidence[];
}

function valuesFor(fingerprint: Fingerprint, signals: PageSignals): string[] {
  let values: string[];
  switch (fingerprint.source) {
    case 'header':
      values = fingerprint.key && signals.headers[fingerprint.key]
        ? [signals.headers[fingerprint.key]!]
        : [];
      break;
    case 'cookie': values = signals.cookieNames; break;
    case 'generator': values = signals.generators; break;
    case 'meta':
      values = fingerprint.key ? (signals.meta[fingerprint.key] ?? []) : [];
      break;
    case 'script': values = signals.scripts; break;
    case 'inlineScript': values = signals.inlineScripts; break;
    case 'stylesheet': values = signals.stylesheets; break;
    case 'html': values = [signals.html]; break;
    case 'url': values = [signals.finalUrl]; break;
    case 'js': values = fingerprint.key ? (signals.runtimeValues[fingerprint.key] ?? []) : []; break;
    case 'dom': values = fingerprint.key ? (signals.domValues[fingerprint.key] ?? []) : []; break;
    case 'xhr': values = signals.xhrUrls; break;
    case 'dns': values = fingerprint.key ? (signals.dnsRecords[fingerprint.key] ?? []) : []; break;
    case 'certIssuer': values = signals.tlsIssuer ? [signals.tlsIssuer] : []; break;
    case 'css': values = signals.cssContents; break;
  }
  return fingerprint.maxValueLength
    ? values.map((value) => value.slice(0, fingerprint.maxValueLength))
    : values;
}

function excerpt(value: string, match: RegExpExecArray): string {
  const start = Math.max(0, match.index - 60);
  const end = Math.min(value.length, match.index + Math.min(match[0].length, 120) + 60);
  return value.slice(start, end)
    .replace(/AIza[0-9A-Za-z_-]{35}/g, '[REDACTED_GOOGLE_API_KEY]')
    + (match[0].length > 120 ? '…' : '');
}

export function detectTechnologies(
  signals: PageSignals,
  rules: TechnologyRule[],
): TechnologyDetection[] {
  const detections: TechnologyDetection[] = [];

  for (const rule of rules) {
    const evidence: Evidence[] = [];
    for (const fingerprint of rule.fingerprints) {
      for (const value of valuesFor(fingerprint, signals)) {
        fingerprint.pattern.lastIndex = 0;
        const match = fingerprint.pattern.exec(value);
        if (match) {
          evidence.push({
            source: fingerprint.source,
            ...(fingerprint.key ? { key: fingerprint.key } : {}),
            value: excerpt(value, match),
            strength: fingerprint.strength,
            pageUrl: signals.finalUrl,
          });
        }
      }
    }

    const score = evidence.reduce((sum, item) => sum + item.strength, 0);
    if (score < (rule.minimumScore ?? 2)) continue;
    detections.push({
      id: rule.id,
      name: rule.name,
      category: rule.category,
      confidence: evidence.some(({ strength }) => strength === 3) ||
        (score >= 4 && !evidence.every(({ source, key }) => source === 'dns' && key === 'TXT'))
        ? 'confirmed'
        : 'probable',
      evidence,
    });
  }

  let filtered = detections;
  while (true) {
    const names = new Set(filtered.map(({ name }) => name));
    const categories = new Set(
      filtered.flatMap(({ category }) => category.split(',').map((value) => value.trim())),
    );
    const next = filtered.filter((detection) => {
      const rule = rules.find(({ id }) => id === detection.id)!;
      return (
        (rule.requires?.every((name) => names.has(name)) ?? true) &&
        (rule.requiresCategory?.every((category) => categories.has(category)) ?? true) &&
        !(rule.excludes?.some((name) => names.has(name)) ?? false)
      );
    });
    if (next.length === filtered.length) return next;
    filtered = next;
  }
}
