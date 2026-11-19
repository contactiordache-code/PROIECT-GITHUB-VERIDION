import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { RE2 } from 're2-wasm';
import type { Fingerprint, SignalSource, TechnologyRule } from './rules.js';

type PatternValue = string | string[];
type PatternMap = Record<string, PatternValue>;
interface UpstreamTechnology {
  cats: number[];
  headers?: PatternMap;
  cookies?: PatternMap;
  meta?: PatternMap;
  html?: PatternValue;
  scriptSrc?: PatternValue;
  scripts?: PatternValue;
  url?: PatternValue;
  js?: PatternMap;
  dom?: PatternValue | Record<string, unknown>;
  xhr?: PatternValue;
  dns?: PatternMap;
  certIssuer?: PatternValue;
  css?: PatternValue;
  requires?: PatternValue;
  requiresCategory?: PatternValue;
  excludes?: PatternValue;
}

function list(value: PatternValue | undefined): string[] {
  return value === undefined ? [] : Array.isArray(value) ? value : [value];
}

function compile(
  source: SignalSource,
  raw: string,
  key?: string,
): Fingerprint | undefined {
  const [expression, ...directives] = raw.split('\\;');
  const confidence = Number(
    directives.find((part) => part.startsWith('confidence:'))?.slice(11) ?? 100,
  );
  if (confidence < 50) return undefined;
  try {
    const strength = source === 'html' || (source === 'dns' && key === 'TXT') ||
      (source === 'header' && key?.toLowerCase() === 'content-security-policy')
      ? 2
      : confidence >= 75 ? 3 : 2;
    return {
      source,
      pattern: ['html', 'inlineScript', 'css'].includes(source)
        ? new RE2(expression || '.+', 'iu') as unknown as RegExp
        : new RegExp(expression || '.+', 'i'),
      strength,
      ...(key ? { key: source === 'dns' ? key.toUpperCase() : key.toLowerCase() } : {}),
      // shortcut: cap untrusted regex input, move matching to timed workers if tail coverage is required.
      ...(['html', 'inlineScript', 'css'].includes(source) ? { maxValueLength: 300_000 } : {}),
    };
  } catch {
    return undefined;
  }
}

export async function loadWappalyzerRules(
  directory: string,
  excludedNames: Set<string> = new Set(),
): Promise<TechnologyRule[]> {
  const excludedNamesLowercase = new Set(
    [...excludedNames].map((name) => name.toLowerCase()),
  );
  const categories = JSON.parse(
    await readFile(join(directory, 'categories.json'), 'utf8'),
  ) as Record<string, { name: string }>;
  const technologyDirectory = join(directory, 'technologies');
  const files = (await readdir(technologyDirectory)).filter((file) => file.endsWith('.json'));
  const rules: TechnologyRule[] = [];

  for (const file of files) {
    const technologies = JSON.parse(
      await readFile(join(technologyDirectory, file), 'utf8'),
    ) as Record<string, UpstreamTechnology>;

    for (const [name, technology] of Object.entries(technologies)) {
      if (excludedNamesLowercase.has(name.toLowerCase())) continue;
      const fingerprints: Fingerprint[] = [];
      const add = (source: SignalSource, values: PatternValue | undefined, key?: string) => {
        for (const value of list(values)) {
          const fingerprint = compile(source, value, key);
          if (fingerprint) fingerprints.push(fingerprint);
        }
      };

      add('script', technology.scriptSrc);
      add('html', technology.html);
      add('inlineScript', technology.scripts);
      add('xhr', technology.xhr);
      add('certIssuer', technology.certIssuer);
      add('css', technology.css);
      add('url', technology.url);
      for (const [key, value] of Object.entries(technology.js ?? {})) {
        add('js', value || '.+', key);
      }
      for (const [key, value] of Object.entries(technology.dns ?? {})) {
        add('dns', value, key.toUpperCase());
      }
      const addDom = (selector: string, kind: 'exists' | 'text' | 'attribute' | 'property', name = '', value = '.+') =>
        add('dom', value || '.+', JSON.stringify({ selector, kind, name }));
      if (typeof technology.dom === 'string') addDom(technology.dom, 'exists');
      else if (Array.isArray(technology.dom)) {
        for (const selector of technology.dom) addDom(selector, 'exists');
      } else if (technology.dom) {
        for (const [selector, rawConfig] of Object.entries(technology.dom)) {
          const config = rawConfig as {
            exists?: string; text?: PatternValue;
            attributes?: PatternMap; properties?: PatternMap;
          };
          if (!Object.keys(config).length || config.exists !== undefined) addDom(selector, 'exists');
          for (const value of list(config.text)) addDom(selector, 'text', '', value);
          for (const [name, value] of Object.entries(config.attributes ?? {})) {
            for (const pattern of list(value)) addDom(selector, 'attribute', name, pattern);
          }
          for (const [name, value] of Object.entries(config.properties ?? {})) {
            for (const pattern of list(value)) addDom(selector, 'property', name, pattern);
          }
        }
      }
      for (const [key, value] of Object.entries(technology.headers ?? {})) {
        add('header', value, key);
      }
      for (const key of Object.keys(technology.cookies ?? {})) {
        add('cookie', key);
      }
      for (const [key, value] of Object.entries(technology.meta ?? {})) {
        add('meta', value, key);
      }

      if (!fingerprints.length) continue;
      rules.push({
        id: `wappalyzer:${name}`,
        name,
        category: technology.cats
          .map((id) => categories[String(id)]?.name)
          .filter(Boolean)
          .join(', ') || 'Uncategorized',
        fingerprints,
        ...(technology.requires ? {
          requires: list(technology.requires).map((value) => String(value).split('\\;')[0]!),
        } : {}),
        ...(technology.requiresCategory ? {
          requiresCategory: list(technology.requiresCategory).map((value) => {
            const category = String(value).split('\\;')[0]!;
            return categories[category]?.name ?? category;
          }),
        } : {}),
        ...(technology.excludes ? {
          excludes: list(technology.excludes).map((value) => String(value).split('\\;')[0]!),
        } : {}),
      });
    }
  }

  return rules;
}
