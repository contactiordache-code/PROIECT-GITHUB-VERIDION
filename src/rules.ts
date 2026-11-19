export type SignalSource =
  | 'header'
  | 'cookie'
  | 'generator'
  | 'meta'
  | 'script'
  | 'inlineScript'
  | 'stylesheet'
  | 'html'
  | 'url'
  | 'js'
  | 'dom'
  | 'xhr'
  | 'dns'
  | 'certIssuer'
  | 'css';

export interface Fingerprint {
  source: SignalSource;
  pattern: RegExp;
  strength: 1 | 2 | 3;
  key?: string;
  maxValueLength?: number;
}

export interface TechnologyRule {
  id: string;
  name: string;
  category: string;
  fingerprints: Fingerprint[];
  minimumScore?: number;
  requires?: string[];
  requiresCategory?: string[];
  excludes?: string[];
}

export const rules: TechnologyRule[] = [
  {
    id: 'wordpress', name: 'WordPress', category: 'CMS',
    fingerprints: [
      { source: 'generator', pattern: /\bWordPress(?:\s+([\d.]+))?/i, strength: 3 },
      { source: 'script', pattern: /\/(?:wp-content|wp-includes)\//i, strength: 3 },
      { source: 'stylesheet', pattern: /\/(?:wp-content|wp-includes)\//i, strength: 3 },
    ],
  },
  {
    id: 'shopify', name: 'Shopify', category: 'E-commerce',
    fingerprints: [
      { source: 'header', key: 'x-shopid', pattern: /.+/, strength: 3 },
      { source: 'script', pattern: /cdn\.shopify\.com/i, strength: 3 },
      { source: 'html', pattern: /\bShopify\.(?:theme|shop)\b/i, strength: 3 },
    ],
  },
  {
    id: 'cloudflare', name: 'Cloudflare', category: 'CDN',
    fingerprints: [
      { source: 'header', key: 'cf-ray', pattern: /.+/, strength: 3 },
      { source: 'cookie', pattern: /^__cf_bm$/i, strength: 3 },
    ],
  },
  {
    id: 'google-tag-manager', name: 'Google Tag Manager', category: 'Tag manager',
    fingerprints: [
      { source: 'script', pattern: /googletagmanager\.com\/gtm\.js/i, strength: 3 },
      { source: 'html', pattern: /\bGTM-[A-Z0-9]+\b/, strength: 3 },
    ],
  },
  {
    id: 'google-analytics', name: 'Google Analytics', category: 'Analytics',
    fingerprints: [
      { source: 'script', pattern: /google-analytics\.com\/(?:analytics|ga)\.js/i, strength: 3 },
      { source: 'script', pattern: /googletagmanager\.com\/gtag\/js\?[^\s"']*id=(?:G-[A-Z0-9]{10}|UA-\d+-\d+)/, strength: 3 },
      { source: 'html', pattern: /\b(?:G-[A-Z0-9]{10}|UA-\d+-\d+)\b/, strength: 3 },
    ],
  },
  {
    id: 'jquery', name: 'jQuery', category: 'JavaScript library',
    fingerprints: [
      { source: 'script', pattern: /(?:^|[/.@-])jquery(?:[.-][\d.]+)?(?:\.min)?\.js(?:\?|$)/i, strength: 3 },
    ],
  },
  {
    id: 'nextjs', name: 'Next.js', category: 'Web framework',
    fingerprints: [
      { source: 'html', pattern: /id=["']__NEXT_DATA__["']/i, strength: 3 },
      { source: 'script', pattern: /\/_next\/static\//i, strength: 3 },
    ],
  },
  {
    id: 'wix', name: 'Wix', category: 'Website builder',
    fingerprints: [
      { source: 'generator', pattern: /\bWix\.com\b/i, strength: 3 },
      { source: 'script', pattern: /static\.parastorage\.com/i, strength: 3 },
    ],
  },
  {
    id: 'elementor', name: 'Elementor', category: 'Page builder',
    fingerprints: [
      { source: 'generator', pattern: /\bElementor\s*([\d.]+)?/i, strength: 3 },
      { source: 'html', pattern: /\belementor-(?:element|section|widget)-/i, strength: 3 },
    ],
  },
  {
    id: 'godaddy-parking', name: 'GoDaddy Parking', category: 'Domain parking',
    fingerprints: [
      { source: 'script', pattern: /img1\.wsimg\.com\/parking-lander\/static\/js\//i, strength: 3 },
    ],
  },
  {
    id: 'imagesloaded', name: 'imagesLoaded', category: 'JavaScript library',
    fingerprints: [{ source: 'script', pattern: /(?:^|\/)imagesloaded(?:\.pkgd)?(?:\.min)?\.js(?:\?|$)/i, strength: 3 }],
  },
  {
    id: 'fitvids', name: 'FitVids.JS', category: 'JavaScript library',
    fingerprints: [{ source: 'script', pattern: /(?:^|\/)jquery\.fitvids(?:\.min)?\.js(?:\?|$)/i, strength: 3 }],
  },
  {
    id: 'zoho-salesiq', name: 'Zoho SalesIQ', category: 'Live chat',
    fingerprints: [{ source: 'script', pattern: /salesiq\.zohopublic\.com\/widget/i, strength: 3 }],
  },
  {
    id: 'humblytics', name: 'Humblytics', category: 'Analytics',
    fingerprints: [{ source: 'script', pattern: /app\.humblytics\.com\/hmbl(?:\.min)?\.js/i, strength: 3 }],
  },
  {
    id: 'joinchat', name: 'Joinchat', category: 'WordPress plugin', requires: ['WordPress'],
    fingerprints: [{ source: 'script', pattern: /\/wp-content\/plugins\/(?:creame-whatsapp-me|joinchat)\/.*joinchat(?:\.min)?\.js/i, strength: 3 }],
  },
  {
    id: 'wpforms', name: 'WPForms', category: 'WordPress plugin, Form builder', requires: ['WordPress'],
    fingerprints: [{ source: 'script', pattern: /\/wp-content\/plugins\/wpforms(?:-lite)?\/.*\/wpforms(?:\.min)?\.js/i, strength: 3 }],
  },
  {
    id: 'mailcheck', name: 'Mailcheck', category: 'JavaScript library',
    fingerprints: [{ source: 'script', pattern: /(?:^|\/)mailcheck(?:\.min)?\.js(?:\?|$)/i, strength: 3 }],
  },
  {
    id: 'punycode', name: 'punycode', category: 'JavaScript library',
    fingerprints: [{ source: 'script', pattern: /(?:^|\/)punycode(?:\.min)?\.js(?:\?|$)/i, strength: 3 }],
  },
  {
    id: 'bootstrap', name: 'Bootstrap', category: 'UI framework',
    fingerprints: [
      { source: 'script', pattern: /(?:^|\/)bootstrap(?:\.bundle)?(?:\.min)?\.js(?:\?|$)/i, strength: 3 },
      { source: 'stylesheet', pattern: /(?:^|\/)bootstrap(?:\.min)?\.css(?:\?|$)/i, strength: 3 },
      { source: 'js', key: 'bootstrap.Alert.VERSION', pattern: /.+/, strength: 3 },
      { source: 'js', key: 'jQuery.fn.tooltip.Constructor.VERSION', pattern: /.+/, strength: 3 },
    ],
  },
  {
    id: 'element-ui', name: 'Element UI', category: 'UI framework', requires: ['Vue.js'],
    fingerprints: [
      { source: 'js', key: 'ELEMENT.version', pattern: /^\d+(?:\.\d+){1,3}(?:[-+].+)?$/, strength: 3 },
    ],
  },
  {
    id: 'sentry', name: 'Sentry', category: 'Error monitoring',
    fingerprints: [
      { source: 'script', pattern: /browser\.sentry-cdn\.com\/[^/]+\/(?:bundle|modulemetadata)/i, strength: 3 },
      { source: 'html', pattern: /browser\.sentry-cdn\.com\/[^/]+\/(?:bundle|modulemetadata)/i, strength: 3 },
      { source: 'js', key: 'Sentry.SDK_VERSION', pattern: /.+/, strength: 3 },
    ],
  },
  {
    id: 'fastly', name: 'Fastly', category: 'CDN', minimumScore: 6,
    fingerprints: [
      { source: 'header', key: 'x-served-by', pattern: /(?:^|,\s*)cache-[a-z0-9-]+/i, strength: 3 },
      { source: 'header', key: 'x-timer', pattern: /^S\d+\.\d+,VS\d+,VE\d+/i, strength: 3 },
    ],
  },
  {
    id: 'mailchimp', name: 'Mailchimp', category: 'Email marketing',
    fingerprints: [
      { source: 'html', pattern: /https?:\/\/[a-z0-9.-]+\.list-manage\.com\/(?:subscribe|track)\b/i, strength: 3 },
      { source: 'script', pattern: /(?:chimpstatic\.com|list-manage\.com)/i, strength: 3 },
      { source: 'dns', key: 'TXT', pattern: /spf\.mandrillapp\.com/i, strength: 2 },
    ],
  },
  {
    id: 'square', name: 'Square', category: 'Payment processor',
    fingerprints: [
      { source: 'script', pattern: /web\.squarecdn\.com\/v\d+\/square\.js/i, strength: 3 },
      { source: 'html', pattern: /web\.squarecdn\.com\/v\d+\/square\.js/i, strength: 3 },
    ],
  },
  {
    id: 'baidu-share', name: 'Baidu Share', category: 'Social sharing',
    fingerprints: [
      { source: 'html', pattern: /(?:api\.share\.baidu\.com\/s\.gif|sp0\.baidu\.com\/[^"']+\/s\.gif)/i, strength: 3 },
    ],
  },
  ...[
    ['elementor-pro', 'Elementor Pro', /\/wp-content\/plugins\/elementor-pro\//i, 'WordPress plugin, Page builder'],
    ['isotope', 'Isotope', /(?:^|\/)isotope(?:\.pkgd)?(?:\.min)?\.js(?:\?|$)/i, 'JavaScript library'],
    ['jquery-colorbox', 'jQuery Colorbox', /(?:^|\/)jquery\.colorbox(?:\.[\d.]+)?(?:-min|\.min)?\.js(?:\?|$)/i, 'JavaScript library, Lightbox'],
    ['jquery-blockui', 'jQuery BlockUI', /(?:^|\/)jquery\.blockUI(?:\.min)?\.js(?:\?|$)/i, 'JavaScript library'],
  ].map(([id, name, pattern, category]) => ({
    id: id as string,
    name: name as string,
    category: category as string,
    fingerprints: [{ source: 'script' as const, pattern: pattern as RegExp, strength: 3 as const }],
  })),
  {
    id: 'recaptcha-enterprise', name: 'reCAPTCHA Enterprise', category: 'Security, Captcha',
    fingerprints: [
      { source: 'script', pattern: /google\.com\/recaptcha\/enterprise\.js(?:\?|$)/i, strength: 3 },
    ],
  },
  ...[
    ['burst-statistics', 'Burst Statistics', 'burst-statistics', 'Analytics'],
    ['formidable-forms', 'Formidable Forms', 'formidable(?:-pro)?', 'WordPress plugin, Form builder'],
    ['wpbakery', 'WPBakery Page Builder', 'js_composer', 'WordPress plugin, Page builder'],
    ['essential-addons-elementor', 'Essential Addons for Elementor', 'essential-addons-for-elementor-lite', 'WordPress plugin'],
    ['kadence-blocks', 'Kadence Blocks', 'kadence-blocks', 'WordPress plugin, Page builder'],
    ['modern-events-calendar', 'Modern Events Calendar', 'modern-events-calendar(?:-lite)?', 'WordPress plugin, Events'],
    ['popup-maker', 'Popup Maker', 'popup-maker', 'WordPress plugin'],
    ['smush-pro', 'Smush Pro', 'wp-smush-pro', 'WordPress plugin, Image optimization'],
    ['directorist', 'Directorist', 'directorist', 'WordPress plugin, Directory'],
    ['jet-elements', 'JetElements', 'jet-elements', 'WordPress plugin'],
    ['jet-menu', 'JetMenu', 'jet-menu', 'WordPress plugin'],
    ['jet-popup', 'JetPopup', 'jet-popup', 'WordPress plugin'],
    ['jet-tabs', 'JetTabs', 'jet-tabs', 'WordPress plugin'],
    ['jet-theme-core', 'JetThemeCore', 'jet-theme-core', 'WordPress plugin'],
    ['paid-memberships-pro', 'Paid Memberships Pro', 'paid-memberships-pro', 'WordPress plugin, Membership'],
    ['responsive-lightbox', 'Responsive Lightbox', 'responsive-lightbox', 'WordPress plugin, Lightbox'],
    ['simple-cloudflare-turnstile', 'Simple Cloudflare Turnstile', 'simple-cloudflare-turnstile', 'WordPress plugin, Security'],
    ['ultimate-vc-addons', 'Ultimate Addons for WPBakery', 'ultimate_vc_addons', 'WordPress plugin'],
    ['widget-options', 'Widget Options', 'widget-options', 'WordPress plugin'],
    ['wp-pagenavi', 'WP PageNavi', 'wp-pagenavi', 'WordPress plugin'],
  ].map(([id, name, slug, category]) => ({
    id: id as string,
    name: name as string,
    category: category as string,
    fingerprints: [
      { source: 'script' as const, pattern: new RegExp(`/wp-content/plugins/${slug}/`, 'i'), strength: 3 as const },
      { source: 'stylesheet' as const, pattern: new RegExp(`/wp-content/plugins/${slug}/`, 'i'), strength: 3 as const },
    ],
  })),
  ...[
    ['godaddy-dns', 'GoDaddy DNS', 'NS', /\.domaincontrol\.com$/i, 'DNS'],
    ['cloudflare-dns', 'Cloudflare DNS', 'NS', /\.ns\.cloudflare\.com$/i, 'DNS'],
    ['akamai-dns', 'Akamai DNS', 'NS', /\.akam\.net$/i, 'DNS'],
    ['hostgator-dns', 'HostGator DNS', 'NS', /\.hostgator\.com$/i, 'DNS'],
    ['wix-dns', 'Wix DNS', 'NS', /\.wixdns\.net$/i, 'DNS'],
    ['timeweb-dns', 'TimeWeb DNS', 'NS', /\.timeweb\.(?:ru|org)$/i, 'DNS'],
    ['bluehost-dns', 'Bluehost DNS', 'NS', /\.bluehost\.com$/i, 'DNS'],
    ['route53', 'Amazon Route 53', 'NS', /\.awsdns-[^.]+\.(?:com|net|org|co\.uk)$/i, 'DNS'],
    ['godaddy-email', 'GoDaddy Email', 'MX', /\.(?:secureserver\.net)$/i, 'Webmail'],
    ['yandex-mail', 'Yandex Mail', 'MX', /\.yandex\.net$/i, 'Webmail'],
  ].map(([id, name, key, pattern, category]) => ({
    id: id as string,
    name: name as string,
    category: category as string,
    fingerprints: [{ source: 'dns' as const, key: key as string, pattern: pattern as RegExp, strength: 3 as const }],
  })),
  ...[
    ['parallax-js', 'parallax.js', /(?:^|\/)parallax(?:\.min)?\.js(?:\?|$)/i],
    ['magnific-popup', 'Magnific Popup', /(?:^|\/)jquery\.magnific-popup(?:\.min)?\.js(?:\?|$)/i],
    ['webfontloader', 'Web Font Loader', /(?:^|\/)webfontloader(?:\.min)?\.js(?:\?|$)|ajax\.googleapis\.com\/ajax\/libs\/webfont\//i],
    ['easy-pie-chart', 'Easy Pie Chart', /(?:^|\/)jquery\.easypiechart(?:\.min)?\.js(?:\?|$)/i],
    ['morphext', 'Morphext', /(?:^|\/)morphext(?:\.min)?\.js(?:\?|$)/i],
    ['progressbar-js', 'ProgressBar.js', /(?:^|\/)progressbar(?:\.min)?\.js(?:\?|$)/i],
    ['tiny-slider', 'Tiny Slider', /(?:^|\/)tiny-slider(?:\.min)?\.js(?:\?|$)|(?:^|\/)tns(?:\.min)?\.js(?:\?|$)/i],
    ['c3-js', 'C3.js', /(?:^|\/)c3(?:\.min)?\.js(?:\?|$)/i],
    ['sidr', 'sidr', /(?:^|\/)jquery\.sidr(?:\.min)?\.js(?:\?|$)/i],
    ['clipboard-js', 'Clipboard.js', /(?:^|\/)clipboard(?:\.min)?\.js(?:\?|$)/i],
    ['wow-js', 'WOW.js', /(?:^|\/)wow(?:\.min)?\.js(?:\?|$)/i],
    ['flickity', 'Flickity', /(?:^|\/)flickity(?:\.pkgd)?(?:\.min)?\.js(?:\?|$)/i],
  ].map(([id, name, pattern]) => ({
    id: id as string,
    name: name as string,
    category: 'JavaScript library',
    fingerprints: [{ source: 'script' as const, pattern: pattern as RegExp, strength: 3 as const }],
  })),
  ...[
    ['jetpack', 'Jetpack', 'jetpack'],
    ['instagram-feed', 'Smash Balloon Instagram Feed', 'instagram-feed'],
    ['mailchimp-wp', 'MailChimp for WordPress', 'mailchimp-for-wp'],
    ['profilepress', 'ProfilePress', 'wp-user-avatar|profilepress'],
    ['wpml', 'WPML', 'sitepress-multilingual-cms'],
    ['max-mega-menu', 'Max Mega Menu', 'megamenu'],
    ['generateblocks', 'GenerateBlocks', 'generateblocks'],
    ['conditional-cf7', 'Conditional Fields for Contact Form 7', 'conditional-fields-for-contact-form-7'],
    ['jetengine', 'JetEngine', 'jet-engine'],
    ['chaty', 'Premio Chaty', 'chaty'],
  ].map(([id, name, slug]) => ({
    id: id!,
    name: name!,
    category: 'WordPress plugin',
    requires: ['WordPress'],
    fingerprints: [
      { source: 'script' as const, pattern: new RegExp(`/wp-content/plugins/(?:${slug})/`, 'i'), strength: 3 as const },
      { source: 'stylesheet' as const, pattern: new RegExp(`/wp-content/plugins/(?:${slug})/`, 'i'), strength: 3 as const },
    ],
  })),
];
