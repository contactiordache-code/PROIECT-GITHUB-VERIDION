import { chromium, type Browser, type Page, type Response } from 'playwright';
import { assertPublicUrl, type CollectionResult, type CollectorOptions } from './collector.js';
import type { DomainInput } from './input.js';

export interface BrowserSignalPlan {
  jsKeys: string[];
  domKeys: string[];
}

async function open(page: Page, url: string, timeoutMs: number): Promise<Response> {
  const checked = new Map<string, Promise<void>>();
  let unsafe: Error | undefined;
  await page.route('**/*', async (route) => {
    try {
      const target = new URL(route.request().url());
      if (!['http:', 'https:'].includes(target.protocol)) return route.continue();
      let check = checked.get(target.hostname);
      if (!check) {
        check = assertPublicUrl(target);
        checked.set(target.hostname, check);
      }
      await check;
      await route.continue();
    } catch (error) {
      unsafe = error instanceof Error ? error : new Error(String(error));
      await route.abort('blockedbyclient');
    }
  });

  const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
  if (unsafe) throw unsafe;
  if (!response) throw new Error(`Browser returned no response from ${url}`);
  await page.waitForTimeout(1_500);
  return response;
}

export async function collectBrowserDomain(
  browser: Browser,
  input: DomainInput,
  options: CollectorOptions = {},
  signalPlan: BrowserSignalPlan = { jsKeys: [], domKeys: [] },
): Promise<CollectionResult> {
  const started = performance.now();
  const timeoutMs = options.timeoutMs ?? 15_000;
  const maxBodyBytes = options.maxBodyBytes ?? 5_000_000;
  const context = await browser.newContext({
    userAgent: options.userAgent ?? 'VeridionTechnologyResearch/0.1 (+public technology analysis)',
  });
  const page = await context.newPage();
  const xhrUrls = new Set<string>();
  page.on('request', (request) => {
    if (['xhr', 'fetch'].includes(request.resourceType())) xhrUrls.add(request.url());
  });
  try {
    let response: Response;
    const warnings: string[] = ['Collected with JavaScript browser fallback'];
    try {
      response = await open(page, input.url, timeoutMs);
    } catch (httpsError) {
      response = await open(page, `http://${input.domain}`, timeoutMs);
      warnings.push(`HTTPS browser navigation failed: ${httpsError instanceof Error ? httpsError.message : httpsError}`);
    }
    const html = await page.content();
    if (Buffer.byteLength(html) > maxBodyBytes) {
      throw new Error(`Rendered page exceeds ${maxBodyBytes} bytes`);
    }
    const headers = await response.allHeaders();
    delete headers['set-cookie'];
    const cookieNames = [...new Set((await context.cookies()).map(({ name }) => name))];
    const runtimeValues = await page.evaluate((keys) => {
      const output: Record<string, string[]> = {};
      for (const key of keys) {
        try {
          let value: unknown = window;
          for (const part of key.split('.')) value = (value as Record<string, unknown>)?.[part];
          if (value instanceof Element || value instanceof HTMLCollection || value instanceof NodeList) continue;
          if (value !== undefined && value !== null) {
            output[key] = [typeof value === 'string' ? value : String(value)];
          }
        } catch { /* inaccessible property */ }
      }
      return output;
    }, signalPlan.jsKeys);
    const domValues = await page.evaluate((keys) => {
      const output: Record<string, string[]> = {};
      for (const key of keys) {
        try {
          const spec = JSON.parse(key) as {
            selector: string; kind: 'exists' | 'text' | 'attribute' | 'property'; name: string;
          };
          const elements = [...document.querySelectorAll(spec.selector)].slice(0, 20);
          const values = elements.flatMap((element) => {
            if (spec.kind === 'exists') return ['true'];
            if (spec.kind === 'text') return [element.textContent ?? ''];
            if (spec.kind === 'attribute') return [element.getAttribute(spec.name) ?? ''];
            const value = (element as unknown as Record<string, unknown>)[spec.name];
            return value === undefined || value === null ? [] : [String(value)];
          }).filter(Boolean);
          if (values.length) output[key] = values;
        } catch { /* invalid or unsupported selector */ }
      }
      return output;
    }, signalPlan.domKeys);
    const serviceWorkerUrls = await page.evaluate(async () => {
      try {
        return (await navigator.serviceWorker?.getRegistrations() ?? [])
          .flatMap((registration) => [registration.active, registration.waiting, registration.installing])
          .filter(Boolean)
          .map((worker) => worker!.scriptURL);
      } catch { return []; }
    });
    const stylesheetUrls = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLLinkElement>('link[rel~="stylesheet"][href]')]
        .map(({ href }) => href).slice(0, 8),
    );
    const cssContents: string[] = [];
    const auxiliaryScripts: string[] = [];
    for (const url of stylesheetUrls) {
      try {
        await assertPublicUrl(new URL(url));
        const cssResponse = await context.request.get(url, { timeout: Math.min(timeoutMs, 8_000) });
        const body = await cssResponse.body();
        if (body.byteLength <= 750_000) {
          const css = body.toString('utf8');
          cssContents.push(css);
          const mapPath = css.match(/sourceMappingURL=([^\s*]+)/)?.[1];
          if (mapPath && auxiliaryScripts.length < 2) {
            const mapUrl = new URL(mapPath, url);
            await assertPublicUrl(mapUrl);
            const mapResponse = await context.request.get(mapUrl.href, { timeout: Math.min(timeoutMs, 8_000) });
            const map = await mapResponse.body();
            if (map.byteLength <= 1_000_000) auxiliaryScripts.push(map.toString('utf8'));
          }
        }
      } catch { /* inaccessible stylesheet */ }
    }
    for (const url of serviceWorkerUrls.slice(0, 2)) {
      try {
        await assertPublicUrl(new URL(url));
        const workerResponse = await context.request.get(url, { timeout: Math.min(timeoutMs, 8_000) });
        const body = await workerResponse.body();
        if (body.byteLength <= 750_000) auxiliaryScripts.push(body.toString('utf8'));
      } catch { /* inaccessible worker */ }
    }
    const manifestUrls = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLLinkElement>('link[rel~="manifest"][href]')]
        .map(({ href }) => href).slice(0, 2),
    );
    const auxiliaryHtml: string[] = [];
    for (const url of manifestUrls) {
      try {
        await assertPublicUrl(new URL(url));
        const manifestResponse = await context.request.get(url, { timeout: Math.min(timeoutMs, 8_000) });
        const body = await manifestResponse.body();
        if (body.byteLength <= 250_000) auxiliaryHtml.push(body.toString('utf8'));
      } catch { /* inaccessible manifest */ }
    }
    return {
      domain: input.domain,
      requestedUrl: input.url,
      finalUrl: page.url(),
      httpStatus: response.status(),
      headers,
      cookieNames,
      html,
      redirects: [],
      durationMs: Math.round(performance.now() - started),
      warnings,
      runtimeValues,
      domValues,
      xhrUrls: [...xhrUrls],
      serviceWorkerUrls: [...new Set(serviceWorkerUrls)],
      cssContents,
      auxiliaryScripts,
      auxiliaryHtml,
    };
  } finally {
    await context.close();
  }
}

export async function withBrowser<T>(work: (browser: Browser) => Promise<T>): Promise<T> {
  const browser = await chromium.launch({ headless: true });
  try {
    return await work(browser);
  } finally {
    await browser.close();
  }
}
