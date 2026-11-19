import * as cheerio from 'cheerio';
import type { CollectionResult } from './collector.js';

export interface PageSignals {
  finalUrl: string;
  headers: Record<string, string>;
  cookieNames: string[];
  generators: string[];
  meta: Record<string, string[]>;
  scripts: string[];
  inlineScripts: string[];
  stylesheets: string[];
  html: string;
  dnsRecords: Record<string, string[]>;
  runtimeValues: Record<string, string[]>;
  domValues: Record<string, string[]>;
  xhrUrls: string[];
  tlsIssuer?: string;
  cssContents: string[];
}

export function discoverInternalPages(html: string, baseUrl: string, limit = 3): string[] {
  const $ = cheerio.load(html);
  const base = new URL(baseUrl);
  const root = base.hostname.replace(/^www\./, '');
  const candidates = new Map<string, number>();
  $('a[href]').each((_, element) => {
    try {
      const url = new URL($(element).attr('href')!, base);
      if (!['http:', 'https:'].includes(url.protocol)) return;
      if (url.hostname.replace(/^www\./, '') !== root) return;
      url.hash = '';
      if (url.pathname === '/' || /\.(?:pdf|jpe?g|png|gif|svg|zip)$/i.test(url.pathname)) return;
      const text = `${url.pathname} ${$(element).text()}`.toLowerCase();
      const score = /checkout|cart|basket|shop|store|product/.test(text) ? 4
        : /contact|booking|reservation|login|account/.test(text) ? 3
        : /blog|news|article|about|service/.test(text) ? 2 : 1;
      candidates.set(url.href, Math.max(candidates.get(url.href) ?? 0, score));
    } catch { /* invalid link */ }
  });
  return [...candidates].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([url]) => url);
}

function absoluteUrl(value: string, base: string): string {
  try {
    return new URL(value, base).href;
  } catch {
    return value;
  }
}

export function extractSignals(page: CollectionResult): PageSignals {
  const $ = cheerio.load(page.html);
  const scripts: string[] = [...(page.serviceWorkerUrls ?? [])];
  const inlineScripts: string[] = [...(page.auxiliaryScripts ?? [])];

  $('script').each((_, element) => {
    const src = $(element).attr('src');
    if (src) scripts.push(absoluteUrl(src, page.finalUrl));
    else {
      const content = $(element).html()?.trim();
      if (content) inlineScripts.push(content);
    }
  });
  $('link[rel~="modulepreload"][href]').each((_, element) => {
    scripts.push(absoluteUrl($(element).attr('href')!, page.finalUrl));
  });

  const stylesheets = $('link[rel~="stylesheet"][href]')
    .map((_, element) => absoluteUrl($(element).attr('href')!, page.finalUrl))
    .get();
  const generators = $('meta[name="generator" i][content]')
    .map((_, element) => $(element).attr('content')!.trim())
    .get();
  const meta: Record<string, string[]> = {};
  $('meta[content]').each((_, element) => {
    const key = ($(element).attr('name') ?? $(element).attr('property'))?.toLowerCase();
    const value = $(element).attr('content')?.trim();
    if (key && value) (meta[key] ??= []).push(value);
  });

  return {
    finalUrl: page.finalUrl,
    headers: page.headers,
    cookieNames: page.cookieNames,
    generators: [...new Set(generators)],
    meta,
    scripts: [...new Set(scripts)],
    inlineScripts,
    stylesheets: [...new Set(stylesheets)],
    html: [page.html, ...(page.auxiliaryHtml ?? [])].join('\n'),
    dnsRecords: page.dnsRecords ?? {},
    runtimeValues: page.runtimeValues ?? {},
    domValues: page.domValues ?? {},
    xhrUrls: page.xhrUrls ?? [],
    cssContents: page.cssContents ?? [],
    ...(page.tlsIssuer ? { tlsIssuer: page.tlsIssuer } : {}),
  };
}
