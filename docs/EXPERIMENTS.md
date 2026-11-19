# Experiments

This log records measured results. It deliberately separates raw detector output
from validated technology detections.

## 2026-11-19 — Dataset inspection

### Question

What is the actual shape of the official input?

### Method

Downloaded the file linked by the Veridion challenge and inspected it with
DuckDB 1.4.5.

### Result

- Apache Parquet with Snappy compression
- one nullable `VARCHAR` column named `root_domain`
- 200 rows and 200 unique domains
- no null or empty domains

### Decision

Preserve every input value, including subdomains and Punycode domains. Do not
reduce inputs to registrable domains during normalization.

## 2026-11-19 — httpx/Wappalyzer baseline

### Question

How much coverage does passive HTTP fingerprinting provide before we build a
custom collector or browser analyzer?

### Method

ProjectDiscovery httpx 1.12.0 was run with technology detection, redirect
following, one retry, a 15-second timeout, eight workers, and an eight
requests/second global limit. Private, loopback, link-local, multicast, and
reserved address ranges were denied.

### Measured result

- 188/200 domains returned a response
- 151 responses had HTTP status 200
- 183/188 responding domains had at least one raw technology match
- 1,298 raw domain–technology matches
- 210 distinct technology names after removing version suffixes
- 12 domains produced no response

These numbers are not validated detections. They exceed Veridion's published
reference count, which means the metrics may use different definitions and that
some Wappalyzer implications may be indirect. Versions such as future-looking
WordPress values also require verification rather than automatic acceptance.

### Decision

Use this output as candidates and as a baseline, not as final ground truth. The
final system must attach inspectable evidence and distinguish direct signals
from implied technologies.

## 2026-11-19 — WhatWeb baseline

### Question

Does a second fingerprint family add independent coverage?

### Method

WhatWeb 0.6.4 was run at aggression level 1 on 188 URLs confirmed public by the
HTTP baseline. Redirects were disabled for this experiment. The targets were
split into five batches after a single long-running JSON output was interrupted.

### Measured result

- 187/188 URLs returned a WhatWeb record
- 1,458 raw plugin matches after excluding only title, IP, country, and email
- 51 distinct plugin names in that raw set

The output includes features that are not technologies, such as `HTML5`,
`Script`, `Cookies`, security headers, and generic metadata. Its raw count is
therefore not comparable with the httpx or Veridion counts.

### Decision

Keep WhatWeb as a separate comparison source. Map only technology-bearing
plugins into candidates; do not copy its GPL-2.0 plugin code into the project.

## Next experiment

Collect direct HTTP evidence and browser-runtime evidence for a representative
sample containing successful, blocked, JavaScript-heavy, and unreachable
domains. Measure the incremental detections from each source before committing
to full browser processing.

## 2026-11-19 — Custom evidence engine baseline

### Question

How much can a deliberately small set of high-confidence rules detect while
preserving direct evidence for every result?

### Method

The custom TypeScript pipeline processed all 200 domains with five workers, an
eight-second timeout, no retry, HTTPS-to-HTTP fallback, a five-megabyte response
limit, and SSRF checks before requests and redirects. Nine initial technology
rules inspected headers, cookie names, generator metadata, asset URLs, and HTML.

### Measured result

- 200 result records written
- 185 accessible domains and 15 failures
- 148 domains with at least one technology
- 324 evidence-backed domain–technology detections
- all 9 implemented technology names found in the dataset
- 1.75 detections per accessible domain

### Decision

The evidence model works, but writing hundreds of fingerprints manually is not
an efficient path to maximum coverage. Preserve this engine for custom and
high-value rules. Evaluate a licensed fingerprint adapter and browser-runtime
signals for breadth, while keeping their results distinguishable from direct
custom evidence.

## 2026-11-19 — Pinned Wappalyzer passive adapter

### Question

Can a broad GPL-licensed fingerprint snapshot materially improve coverage while
retaining evidence and predictable execution?

### Method

Pinned HTTP Archive/Wappalyzer commit
`35b0847c01c118055c42596d5c6d01f60f15d706` was integrated under GPL-3.0.
The adapter evaluates script URLs, stylesheet URLs through custom rules,
headers, cookie names, meta tags, and page URLs. It respects upstream
`requires`, `requiresCategory`, and `excludes` relationships.

### Measured result

- 200 result records
- 186 accessible domains and 14 failures
- 185 domains with at least one technology
- 933 raw evidence-backed detections
- 148 distinct technology names
- 5.02 detections per accessible domain

### Reliability findings

- A broad custom `wp-content` HTML rule falsely identified Disney Store as
  WordPress because the page linked to a policy on an external WordPress site.
  The rule was restricted to loaded scripts and stylesheets.
- Selected upstream HTML regular expressions exhibited catastrophic
  backtracking on a 3 MB page. Generic upstream HTML and inline-script patterns
  were disabled until matching can run in time-limited workers.
- Four detections were based only on Content-Security-Policy allowlists. These
  are classified as probable because permission to load a service does not
  prove that the page actually uses it.

### Decision

The 933 count exceeds the published 477 reference count but is not directly
comparable without Veridion's ground truth and counting definition. Continue
reporting confirmed and probable results separately, manually audit a stratified
sample, and treat loaded assets, cookies, explicit metadata, and vendor headers
as stronger evidence than allowlists or implications.

## 2026-11-19 — Independent baseline comparison

### Question

How many final passive detections are independently reproduced by the earlier
httpx/Wappalyzer run on the same domain?

### Method

Technology names were lowercased, version suffixes were removed, and the known
`Apache HTTP Server`/`Apache` alias was normalized. Agreement requires the same
normalized technology on the same domain. The generated `validation.json` also
contains a deterministic 30-technology sample of project-only detections with
their complete evidence.

### Measured result

- 933 final detections
- 923 detections on domains represented in the httpx baseline
- 775 independently corroborated detections
- 84.0% same-domain agreement
- 148 project-only detections and 10 detections outside baseline domains

### Interpretation

Agreement between two implementations materially increases confidence, but it
is not ground truth because both use related fingerprint knowledge. A
project-only result is not automatically a false positive: examples include
explicit script URLs, vendor cookies, and response headers that one collector
observed and the other did not. The evidence remains the authoritative audit
trail for each reported detection.

## 2026-11-19 — Selective browser fallback

### Method and result

Playwright/Chromium was invoked only for the 14 HTTP failures and the one
accessible domain without detections. It recovered `cmc01village.com` and
identified `GoDaddy Parking` from the loaded
`img1.wsimg.com/parking-lander/static/js/` application bundle. The other 14
domains remained unavailable in Chromium. Browser evidence uses the same output
model and SSRF checks as passive collection.

The second live HTTP pass returned 920 detections because some sites served
different content than in the earlier pass; for example, one HTTPS site fell
back to a minimal HTTP response. The final output therefore selects, per
domain, the complete snapshot with the most evidence from the two valid runs.
It does not union individual technologies across incompatible responses, and
each selected record retains its original collection timestamp.

## 2026-11-19 — Safe HTML and inline-JavaScript fingerprints

### Method

Wappalyzer HTML and inline-script patterns were enabled through RE2-WASM, which
guarantees linear-time matching and rejects unsupported backreferences and
lookarounds. The heuristic `safe-regex2` approach was tested first and rejected
after a large page still stalled. A single upstream HTML match is classified as
probable; stronger asset, header, cookie, metadata, or inline-script evidence
is required for confirmed status.

### Measured result

- 200 input domains; 186 accessible and 14 unavailable after browser fallback
- 1,017 domain–technology detections: 931 confirmed and 86 probable
- 169 distinct technology candidates
- 147 distinct technologies with at least one confirmed occurrence
- 819/1,006 comparable detections independently corroborated by httpx (81.4%)
- 0 production dependency vulnerabilities reported by `npm audit --omit=dev`

Against the challenge's unpublished set of 477 distinct technologies, candidate
recall is at most 35.4% (308 names short). High-confidence coverage is 30.8%
(330 names short). These are coverage comparisons, not true recall, because the
reference labels and counting rules are unavailable.

## 2026-11-19 — Firecrawl recovery and audited candidate assets

### Firecrawl recovery

Firecrawl was tested only on the 14 domains unavailable after passive and local
browser collection. One domain returned HTML without recognizable technology
signals; six domains had no DNS, four had broken TLS, one timed out, and two
initial rate-limit failures also failed on a targeted retry. HTTP retries for
the broken-TLS group did not recover content. No technology was added, so a
full Firecrawl pass was rejected as poor credit efficiency. The API key is read
only from `FIRECRAWL_API_KEY` and is never written to project output.

### Audited httpx candidates

Candidate differences against httpx were inspected using freshly collected
asset URLs. Eight direct fingerprints were added: imagesLoaded, FitVids.JS,
Zoho SalesIQ, Humblytics, Joinchat, WPForms, Mailcheck, and punycode. Indirect
server-side implications such as MySQL and generic cloud hosting were rejected.

### Measured result

- 1,040 detections: 954 confirmed and 86 probable
- 177 distinct candidates; 155 with a confirmed occurrence
- 839/1,029 comparable detections independently corroborated (81.5%)
- 23/23 tests passing and 0 production dependency vulnerabilities
- candidate coverage versus 477: 37.1%, or 300 names short
- confirmed coverage versus 477: 32.5%, or 322 names short

## 2026-11-19 — Full runtime, DOM, XHR, DNS, and TLS audit

### Method

Chromium was run for all 200 inputs, not only failed pages. The browser pass
evaluated the pinned Wappalyzer JavaScript globals and DOM selectors after
rendering and recorded XHR/fetch URLs. The passive pass also collected MX, NS,
SOA, and TXT records and the verified TLS certificate issuer. TLS connections
use only DNS addresses that passed the same public-IP check as HTTP collection.

An audit found and fixed one definite false positive: the upstream Element UI
DOM expression matched the substring `el-button` inside `next-level-button`.
Element UI now requires its runtime version global and Vue.js. Generic server
implications such as MySQL remain excluded.

### Measured result

- 200 input domains; 186 accessible and 14 unavailable
- 1,690 domain–technology detections: 1,623 confirmed and 67 probable
- 247 distinct technology candidates
- 230 distinct technologies with at least one confirmed occurrence
- 837/1,677 comparable detections independently corroborated by httpx (49.9%)
- 26/26 tests passing
- candidate coverage versus 477: 51.8%, or 230 names short
- confirmed coverage versus 477: 48.2%, or 247 names short

The lower independent-agreement percentage is expected because httpx did not
collect the newly enabled DOM, runtime-global, or certificate-issuer classes.
It must not be interpreted as a 50.1% false-positive rate. Every output item
retains the exact evidence source, key, excerpt, and strength for review.

### Accuracy boundary

The output can prove that a fingerprint was observed at collection time; it
cannot prove 100% correspondence with Veridion's unpublished 477-label ground
truth. `confirmed` means direct, high-strength evidence under the documented
rules, while `probable` remains explicitly separated. The 14 unreachable
domains are failures, not zero-technology results.

## 2026-11-19 — Final bounded deep crawl

### Method

All five remaining avenues were implemented: up to three prioritized internal
pages; audited httpx/WhatWeb asset candidates; bounded CSS and public
sourcemaps; manifests, modulepreload links, and service workers; and DNS-first
probing of `shop`, `store`, `app`, and `www`. Subdomain results are accepted
only when the final URL remains under the supplied domain. Evidence records
the exact page URL.

Browser-created globals backed by `Element`, `HTMLCollection`, or `NodeList`
are rejected to avoid named-DOM false positives. A final scope audit removed
33 external evidence items and four affected domain detections.

### Measured result

- 200 input domains; 186 accessible and 14 unavailable
- 2,078 detections: 1,985 confirmed and 93 probable
- 335 distinct candidates; 309 with a confirmed occurrence
- 88 distinct names added versus the audited homepage/runtime run
- 40/40 tests passing
- candidate coverage versus 477: 70.2%, or 142 names short
- confirmed coverage versus 477: 64.8%, or 168 names short

New directly evidenced technologies include Essential Blocks, Friendly
Captcha, JetEngine, LinkedIn Sign-in, Magnific Popup, Max Mega Menu, Morphext,
Pinterest Ads, Plyr, RTB House, Tailwind CSS, Twitter, Web Font Loader,
parallax.js, and sidr. Inferred databases, hosting internals, and stale
baseline-only labels remain excluded because they would reduce precision.

An independent Apify run on the first 30 domains reproduced 66 of its 80
detections on the same domain (82.5%). It also exposed Sentry 7.120.3 on two
Wix sites through `browser.sentry-cdn.com`; this was independently verified
against the live HTML and added as a strict direct-asset rule. Apify's Magento
match on a Squarespace site was rejected because it relied only on the generic
path fragment `/static/version`.

A second Apify batch covering inputs 31–60 identified two further direct
signals. Fastly was accepted only after live verification of `x-served-by`,
`x-cache`, and the Fastly-formatted `x-timer` header together. Mailchimp was
confirmed through a subscription URL on the official `list-manage.com`
domain. Meta Pixel, Adobe Fonts, and YouTube embed were normalized to the
already counted Facebook Pixel, Typekit, and YouTube technologies.

The third Apify batch covered inputs 61–110 and reproduced 112 of 133
detections on the same domain (84.2%). Its apparently new Matomo, Vimeo embed,
Microsoft IIS, and ASP.NET labels normalize to the already counted Matomo
Analytics, Vimeo, IIS, and Microsoft ASP.NET entries, so the distinct total did
not change. Another Magento match based only on `/static/version` was rejected.

The fourth Apify batch covered inputs 111–160 and reproduced 80 of 117
detections on the same domain (68.4%). Its sole apparently new label, HubSpot
CMS, is an alias of the already counted HubSpot CMS Hub. Two more Magento
matches based only on `/static/version` were rejected, so the distinct total
did not change.

The fifth and final Apify batch covered inputs 161–200 and reproduced 80 of
107 detections on the same domain (74.8%). It exposed the official Square Web
Payments SDK at `web.squarecdn.com/v1/square.js`; live HTML independently
confirmed the exact SDK URL. The upstream rule covered only `js.squareup.com`,
so the official CDN was added as a strict direct fingerprint. Two final
Magento matches based only on `/static/version` were rejected.

A BuiltWith export for `celiabedilia.com` contained 23 labels but mixed live
technologies with language, page-type, crawl-ranking, inferred copy, and
contradictory historical server-location metadata. Baidu Share was the only
new live technology: its inline code directly requested
`api.share.baidu.com/s.gif`. Baidu Analytics was already counted; historical
jQuery Custom Content Scroller, WOW, and ICP labels were not observable and
were not imported.

A later BuiltWith batch supplied as the full-domain export actually contained
only 22 of the 200 domains, with 1,123 rows and 508 distinct labels. It was
used as a candidate source rather than imported wholesale because it mixed
current observations with historical products, generic page attributes, and
non-technology metadata. Auditing its DNS candidates exposed a loader bug that
lowercased `MX`, `NS`, `SOA`, and `TXT` keys while the collector stored them in
uppercase. Fixing that root cause and rerunning live DNS collection across all
200 inputs added 37 net distinct candidates after alias deduplication.

Provider-specific NS, MX, and SOA matches remain confirmed. TXT-only service
verification, including configured email and SaaS vendors, is deliberately
kept probable even when several TXT records match. `MailChimp` and `Mailchimp`
were consolidated into one canonical technology instead of inflating the
distinct count.

The remaining-domain BuiltWith export contained 178 rows, 8,632 label
occurrences, and 1,629 distinct raw labels. Six rows had no domain, and three
subdomains were collapsed to their registrable domains. Generic attributes,
rankings, locations, inferred copy, historical products, and aliases were not
imported. Direct script and stylesheet paths already retained in the crawl
were instead audited on the same domains. This added 25 distinct confirmed
products across 42 domain–technology occurrences, including Elementor Pro,
Isotope, reCAPTCHA Enterprise, jQuery Colorbox, jQuery BlockUI, Formidable
Forms, WPBakery Page Builder, Kadence Blocks, Modern Events Calendar,
JetElements, JetMenu, JetPopup, JetTabs, JetThemeCore, Paid Memberships Pro,
and Simple Cloudflare Turnstile. Every accepted product has a strict reusable
fingerprint and a regression test.
