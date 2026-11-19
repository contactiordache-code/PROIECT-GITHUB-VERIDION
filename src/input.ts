import { isIP } from 'node:net';
import { asyncBufferFromFile, parquetReadObjects } from 'hyparquet';

export interface DomainInput {
  original: string;
  domain: string;
  url: string;
}

export interface RejectedInput {
  value: unknown;
  reason: string;
}

export interface InputLoadResult {
  domains: DomainInput[];
  rejected: RejectedInput[];
}

export function normalizeDomain(value: string): DomainInput {
  const original = value.trim();
  if (!original) throw new Error('Domain is empty');

  const candidate = /^[a-z][a-z\d+.-]*:\/\//i.test(original)
    ? original
    : `https://${original}`;
  const url = new URL(candidate);

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Only HTTP and HTTPS URLs are supported');
  }
  if (url.username || url.password || url.port) {
    throw new Error('Credentials and explicit ports are not allowed');
  }
  if (url.pathname !== '/' || url.search || url.hash) {
    throw new Error('Expected a domain, not a page URL');
  }

  const domain = url.hostname.toLowerCase().replace(/\.$/, '');
  if (!domain.includes('.') || isIP(domain)) {
    throw new Error('Expected a public domain name');
  }

  return { original, domain, url: `https://${domain}` };
}

export async function loadParquetDomains(
  path: string,
  column = 'root_domain',
): Promise<InputLoadResult> {
  const file = await asyncBufferFromFile(path);
  const rows = await parquetReadObjects({ file, columns: [column] });
  const domains: DomainInput[] = [];
  const rejected: RejectedInput[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    const value = row[column];
    if (typeof value !== 'string') {
      rejected.push({ value, reason: `Missing string column "${column}"` });
      continue;
    }

    try {
      const normalized = normalizeDomain(value);
      if (!seen.has(normalized.domain)) {
        seen.add(normalized.domain);
        domains.push(normalized);
      }
    } catch (error) {
      rejected.push({
        value,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { domains, rejected };
}
