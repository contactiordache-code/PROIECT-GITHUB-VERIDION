import assert from 'node:assert/strict';
import { test } from 'node:test';
import { detectTechnologies } from '../src/detector.js';
import { rules } from '../src/rules.js';
import { discoverInternalPages, extractSignals } from '../src/signals.js';
import type { CollectionResult } from '../src/collector.js';

function page(html: string, headers: Record<string, string> = {}): CollectionResult {
  return {
    domain: 'shop.example', requestedUrl: 'https://shop.example',
    finalUrl: 'https://shop.example/', httpStatus: 200, headers,
    cookieNames: [], html, redirects: [], durationMs: 1, warnings: [],
  };
}

test('extracts absolute assets and produces inspectable evidence', () => {
  const signals = extractSignals(page(`
    <meta name="generator" content="WordPress 6.8">
    <script src="/wp-includes/js/jquery/jquery.min.js"></script>
    <link rel="stylesheet" href="/wp-content/theme.css">
  `));
  const detections = detectTechnologies(signals, rules);

  assert.equal(signals.scripts[0], 'https://shop.example/wp-includes/js/jquery/jquery.min.js');
  assert.deepEqual(detections.map(({ name }) => name), ['WordPress', 'jQuery']);
  assert.equal(detections[0]?.confidence, 'confirmed');
  assert.match(detections[0]?.evidence[0]?.value ?? '', /WordPress/);
});

test('detects multiple independent Shopify and analytics signals', () => {
  const signals = extractSignals(page(`
    <script src="https://cdn.shopify.com/store.js"></script>
    <script src="https://www.googletagmanager.com/gtag/js?id=G-ABCDEF1234"></script>
    <script>window.Shopify.theme = { id: 1 };</script>
  `, { 'x-shopid': '123' }));
  const detections = detectTechnologies(signals, rules);

  assert.deepEqual(detections.map(({ name }) => name), ['Shopify', 'Google Analytics']);
  assert.ok(detections.find(({ name }) => name === 'Shopify')!.evidence.length >= 2);
});

test('does not turn similar text into a technology detection', () => {
  const detections = detectTechnologies(
    extractSignals(page('<p>We write about shops, g-recaptcha-response, and GT-ABC123.</p>')),
    rules,
  );
  assert.deepEqual(detections, []);
});

test('does not infer WordPress from a link to another WordPress website', () => {
  const detections = detectTechnologies(
    extractSignals(page('<a href="https://other.example/wp-content/file.pdf">Policy</a>')),
    rules,
  );
  assert.equal(detections.some(({ name }) => name === 'WordPress'), false);
});

test('identifies a GoDaddy parking page from its loaded application bundle', () => {
  const detections = detectTechnologies(extractSignals(page(
    '<script src="https://img1.wsimg.com/parking-lander/static/js/main.1cc9fa89.js"></script>',
  )), rules);
  assert.equal(detections.find(({ name }) => name === 'GoDaddy Parking')?.confidence, 'confirmed');
});

test('identifies audited third-party assets without server-side inference', () => {
  const detections = detectTechnologies(extractSignals(page(`
    <meta name="generator" content="WordPress">
    <script src="/wp-includes/js/imagesloaded.min.js?ver=5.0.0"></script>
    <script src="/wp-content/plugins/wpforms-lite/assets/js/frontend/wpforms.min.js"></script>
    <script src="https://salesiq.zohopublic.com/widget?wc=123"></script>
  `)), rules);
  assert.deepEqual(
    detections.map(({ name }) => name),
    ['WordPress', 'imagesLoaded', 'Zoho SalesIQ', 'WPForms'],
  );
});

test('enforces rule dependencies', () => {
  const dependent = {
    id: 'plugin', name: 'CMS Plugin', category: 'Plugin', requires: ['CMS'],
    fingerprints: [{ source: 'html' as const, pattern: /plugin-marker/, strength: 3 as const }],
  };
  const signals = extractSignals(page('<p>plugin-marker</p>'));
  assert.deepEqual(detectTechnologies(signals, [dependent]), []);
});

test('matches browser runtime, DOM, XHR, and DNS evidence', () => {
  const dynamicRules = [{
    id: 'dynamic', name: 'Dynamic Tool', category: 'Test', minimumScore: 8,
    fingerprints: [
      { source: 'js' as const, key: 'Tool.version', pattern: /^2\./, strength: 3 as const },
      { source: 'dom' as const, key: 'selector-spec', pattern: /enabled/, strength: 2 as const },
      { source: 'xhr' as const, pattern: /api\.tool\.example/, strength: 2 as const },
      { source: 'dns' as const, key: 'MX', pattern: /mail\.tool\.example/, strength: 3 as const },
    ],
  }];
  const signals = extractSignals({
    ...page('<main></main>'),
    runtimeValues: { 'Tool.version': ['2.4.0'] },
    domValues: { 'selector-spec': ['enabled'] },
    xhrUrls: ['https://api.tool.example/event'],
    dnsRecords: { MX: ['mail.tool.example'] },
  });
  assert.equal(detectTechnologies(signals, dynamicRules)[0]?.confidence, 'confirmed');
});

test('does not confuse a next-level class with Element UI', () => {
  const elementUi = rules.find(({ name }) => name === 'Element UI')!;
  const signals = extractSignals({
    ...page('<button class="next-level-button"></button>'),
    domValues: { 'legacy-element-ui-selector': ['next-level-button'] },
  });
  assert.deepEqual(detectTechnologies(signals, [elementUi]), []);
});

test('prioritizes useful same-site pages and ignores external links', () => {
  const urls = discoverInternalPages(`
    <a href="/about">About</a><a href="/products/widget">Widget</a>
    <a href="/contact">Contact</a><a href="https://other.example/cart">Other</a>
  `, 'https://shop.example/');
  assert.deepEqual(urls, [
    'https://shop.example/products/widget',
    'https://shop.example/contact',
    'https://shop.example/about',
  ]);
});

test('detects a directly loaded Sentry browser bundle', () => {
  const detections = detectTechnologies(extractSignals(page(
    '<script src="https://browser.sentry-cdn.com/7.120.3/modulemetadata.es5.min.js"></script>',
  )), rules);
  assert.equal(detections.find(({ name }) => name === 'Sentry')?.confidence, 'confirmed');
});

test('requires corroborating Fastly headers', () => {
  const fastly = rules.find(({ name }) => name === 'Fastly')!;
  const oneHeader = extractSignals(page('', { 'x-served-by': 'cache-vie123-VIE' }));
  assert.deepEqual(detectTechnologies(oneHeader, [fastly]), []);
  const bothHeaders = extractSignals(page('', {
    'x-served-by': 'cache-vie123-VIE',
    'x-timer': 'S1795107240.810339,VS0,VE2522',
  }));
  assert.equal(detectTechnologies(bothHeaders, [fastly])[0]?.confidence, 'confirmed');
});

test('detects a direct Mailchimp subscription endpoint', () => {
  const detections = detectTechnologies(extractSignals(page(
    '<a href="https://design.us11.list-manage.com/subscribe?u=123">Subscribe</a>',
  )), rules);
  assert.equal(detections.find(({ name }) => name === 'Mailchimp')?.confidence, 'confirmed');
});

test('detects the official Square Web Payments SDK', () => {
  const detections = detectTechnologies(extractSignals(page(
    '<script>window.SQUARE_WEB_PAYMENTS_SDK="https://web.squarecdn.com/v1/square.js"</script>',
  )), rules);
  assert.equal(detections.find(({ name }) => name === 'Square')?.confidence, 'confirmed');
});

test('detects the Baidu Share endpoint', () => {
  const detections = detectTechnologies(extractSignals(page(
    '<script>new Image().src="//api.share.baidu.com/s.gif?l=" + location.href</script>',
  )), rules);
  assert.equal(detections.find(({ name }) => name === 'Baidu Share')?.confidence, 'confirmed');
});

test('detects audited BuiltWith candidates only from direct assets', () => {
  const detections = detectTechnologies(extractSignals(page(`
    <script src="/wp-content/plugins/elementor-pro/assets/js/frontend.min.js"></script>
    <script src="/assets/isotope.pkgd.min.js"></script>
    <script src="/assets/jquery.colorbox.1.5.9-min.js"></script>
    <script src="/assets/jquery.blockUI.min.js"></script>
    <script src="https://www.google.com/recaptcha/enterprise.js?render=key"></script>
  `)), rules);
  assert.deepEqual(
    detections.filter(({ name }) => [
      'Elementor Pro', 'Isotope', 'jQuery Colorbox', 'jQuery BlockUI', 'reCAPTCHA Enterprise',
    ].includes(name)).map(({ name }) => name),
    ['Elementor Pro', 'Isotope', 'jQuery Colorbox', 'jQuery BlockUI', 'reCAPTCHA Enterprise'],
  );
});

test('detects audited WordPress products from their plugin asset paths', () => {
  const slugs = [
    'burst-statistics', 'formidable-pro', 'js_composer',
    'essential-addons-for-elementor-lite', 'kadence-blocks',
    'modern-events-calendar-lite', 'popup-maker', 'wp-smush-pro',
  ];
  const detections = detectTechnologies(extractSignals(page(
    slugs.map((slug) => `<script src="/wp-content/plugins/${slug}/assets/app.js"></script>`).join(''),
  )), rules);
  assert.deepEqual(
    detections.filter(({ name }) => [
      'Burst Statistics', 'Formidable Forms', 'WPBakery Page Builder',
      'Essential Addons for Elementor', 'Kadence Blocks', 'Modern Events Calendar',
      'Popup Maker', 'Smush Pro',
    ].includes(name)).map(({ name }) => name),
    [
      'Burst Statistics', 'Formidable Forms', 'WPBakery Page Builder',
      'Essential Addons for Elementor', 'Kadence Blocks', 'Modern Events Calendar',
      'Popup Maker', 'Smush Pro',
    ],
  );
});

test('detects additional named plugins but not an unknown plugin directory', () => {
  const slugs = [
    'directorist', 'jet-elements', 'jet-menu', 'jet-popup', 'jet-tabs', 'jet-theme-core',
    'paid-memberships-pro', 'responsive-lightbox', 'simple-cloudflare-turnstile',
    'ultimate_vc_addons', 'widget-options', 'wp-pagenavi', 'customer-specific-plugin',
  ];
  const detections = detectTechnologies(extractSignals(page(
    slugs.map((slug) => `<script src="/wp-content/plugins/${slug}/assets/app.js"></script>`).join(''),
  )), rules);
  assert.equal(detections.filter(({ name }) => [
    'Directorist', 'JetElements', 'JetMenu', 'JetPopup', 'JetTabs', 'JetThemeCore',
    'Paid Memberships Pro', 'Responsive Lightbox', 'Simple Cloudflare Turnstile',
    'Ultimate Addons for WPBakery', 'Widget Options', 'WP PageNavi',
  ].includes(name)).length, 12);
  assert.equal(detections.some(({ name }) => name === 'customer-specific-plugin'), false);
});

test('detects directly verified DNS and mail providers', () => {
  const providerRules = rules.filter(({ name }) => ['GoDaddy DNS', 'Yandex Mail'].includes(name));
  const signals = extractSignals({
    ...page(''),
    dnsRecords: {
      NS: ['ns61.domaincontrol.com'],
      MX: ['mx.yandex.net'],
    },
  });
  assert.deepEqual(detectTechnologies(signals, providerRules).map(({ name }) => name), [
    'GoDaddy DNS', 'Yandex Mail',
  ]);
});

test('keeps TXT-only service verification probable even with multiple records', () => {
  const txtRule = {
    id: 'verified', name: 'Verified Service', category: 'Test',
    fingerprints: [{ source: 'dns' as const, key: 'TXT', pattern: /service-verify=/, strength: 2 as const }],
  };
  const signals = extractSignals({
    ...page(''),
    dnsRecords: { TXT: ['service-verify=one', 'service-verify=two'] },
  });
  assert.equal(detectTechnologies(signals, [txtRule])[0]?.confidence, 'probable');
});

test('redacts public Google API keys from retained evidence', () => {
  const apiKey = 'AIza' + '12345678901234567890123456789012345';
  const keyRule = {
    id: 'maps', name: 'Maps', category: 'Test',
    fingerprints: [{ source: 'script' as const, pattern: /maps\.googleapis\.com/, strength: 3 as const }],
  };
  const signals = extractSignals(page(
    `<script src="https://maps.googleapis.com/maps/api/js?key=${apiKey}"></script>`,
  ));
  const evidence = detectTechnologies(signals, [keyRule])[0]?.evidence[0]?.value;
  assert.ok(evidence?.includes('[REDACTED_GOOGLE_API_KEY]'));
  assert.equal(evidence?.includes(apiKey), false);
});
