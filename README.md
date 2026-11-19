# Website Technologies Scraper

Instrument pentru identificarea tehnologiilor folosite de site-uri, realizat pentru provocarea tehnică Veridion. Soluția analizează 200 de domenii și păstrează dovezi verificabile pentru fiecare detecție.

## Cuprins

- [Rezultatul final](#rezultatul-final)
- [Cerința proiectului](#cerința-proiectului)
- [Soluția](#soluția)
- [Dovezi și niveluri de încredere](#dovezi-și-niveluri-de-încredere)
- [Firecrawl, Apify și BuiltWith](#firecrawl-apify-și-builtwith)
- [Fișiere livrate](#fișiere-livrate)
- [Instalare și rulare](#instalare-și-rulare)
- [Limitări și îmbunătățiri](#limitări-și-îmbunătățiri)
- [Scalare](#scalare-la-milioane-de-domenii)
- [Descoperirea tehnologiilor noi](#descoperirea-tehnologiilor-noi)
- [Prezentarea proiectului](#prezentarea-proiectului)

## Rezultatul final

| Indicator | Rezultat |
|---|---:|
| Domenii analizate | 200 |
| Domenii accesibile | 186 |
| Domenii inaccesibile | 14 |
| Detecții domeniu–tehnologie | 2.078 |
| Detecții confirmate | 1.985 |
| Detecții probabile | 93 |
| Tehnologii distincte identificate | 335 |
| Tehnologii distincte cu apariții confirmate | 309 |
| Teste automate | 40/40 |

Setul de referință menționează 477 de tehnologii distincte. Lista acestora, data colectării și regulile de normalizare nu sunt publice. Din acest motiv, `335 / 477 = 70,2%` este o comparație de acoperire, nu un recall măsurat față de un ground truth disponibil.

## Cerința proiectului

Scenariul este cel al unei companii care dezvoltă un plugin de analytics pentru magazine Shopify. Echipa de vânzări dorește să identifice site-uri care folosesc produse concurente.

Soluția trebuie să:

- identifice cât mai multe tehnologii;
- arate cum a fost stabilită fiecare tehnologie;
- producă rezultate pentru fiecare domeniu primit;
- includă codul și logica folosite;
- explice problemele implementării;
- descrie scalarea la milioane de domenii în 1–2 luni;
- propună o metodă pentru descoperirea tehnologiilor noi.

## Soluția

Proiectul este scris în TypeScript și rulează pe Node.js. Procesarea are două etape.

### 1. Colectare HTTP, DNS și TLS

Pentru fiecare domeniu sunt analizate:

- URL-ul final și redirectările;
- headerele HTTP;
- numele cookie-urilor;
- HTML-ul și meta-tagurile;
- scripturile și stylesheet-urile;
- înregistrările DNS `MX`, `NS`, `SOA` și `TXT`;
- emitentul certificatului TLS.

### 2. Analiză în Chromium

Playwright și Chromium sunt folosite pentru semnalele care nu pot fi observate doar prin HTTP:

- DOM randat;
- JavaScript globals;
- request-uri XHR și `fetch`;
- maximum trei pagini interne relevante;
- subdomeniile publice `shop`, `store`, `app` și `www`;
- service workers, manifest, `modulepreload`, CSS și sourcemap-uri publice limitate.

Destinațiile de rețea sunt verificate înainte de acces. Adresele private și rezervate sunt blocate, inclusiv în cazul redirectărilor.

### 3. Reguli de detecție

Semnalele sunt comparate cu:

- o versiune fixată a catalogului HTTP Archive/Wappalyzer;
- reguli locale pentru tehnologii verificate în timpul auditului;
- reguli de normalizare pentru aliasuri și denumiri duplicate.

Catalogul este fixat la commit-ul:

```text
35b0847c01c118055c42596d5c6d01f60f15d706
```

Această alegere face rezultatele reproductibile. Expresiile regulate aplicate pe conținut de dimensiuni mari sunt evaluate cu RE2-WASM pentru a limita timpul de procesare.

## Dovezi și niveluri de încredere

Pentru fiecare detecție sunt salvate:

- sursa semnalului;
- cheia verificată, dacă există;
- fragmentul care a produs potrivirea;
- puterea dovezii;
- pagina exactă unde a fost observată.

Nivelurile sunt:

- `confirmed` — dovadă directă puternică sau mai multe semnale relevante;
- `probable` — semnal relevant, dar insuficient pentru confirmare completă.

Semnalele DNS `NS`, `MX` și `SOA` specifice unui furnizor pot confirma serviciul. Detecțiile bazate exclusiv pe DNS `TXT` rămân `probable`. Nu sunt deduse baze de date sau alte tehnologii server-side fără o dovadă directă.

Exemplu simplificat:

```json
{
  "name": "Elementor Pro",
  "confidence": "confirmed",
  "evidence": [{
    "source": "script",
    "value": "/wp-content/plugins/elementor-pro/assets/js/frontend.min.js",
    "strength": 3,
    "pageUrl": "https://example.com/"
  }]
}
```

## Firecrawl, Apify și BuiltWith

Aceste servicii au fost folosite pentru verificare și pentru descoperirea candidaților. Rezultatele lor nu au fost importate automat.

### Firecrawl

Firecrawl a fost testat ca metodă de recuperare pentru cele 14 domenii care nu au putut fi accesate prin colectarea HTTP și Chromium.

Procesul a fost:

1. trimiterea domeniilor inaccesibile către Firecrawl;
2. transformarea HTML-ului returnat în același format folosit de colectorul proiectului;
3. rularea acelorași reguli de detecție și păstrarea acelorași tipuri de dovezi;
4. compararea rezultatului cu rularea principală.

Firecrawl nu a adăugat tehnologii noi pentru aceste domenii, astfel că nu a fost justificată o rulare plătită pentru toate cele 200 de domenii. Integrarea opțională este în `src/firecrawl.ts`. Cheia API este citită numai din variabila de mediu și nu este salvată în repository.

### Apify

Au fost analizate cinci exporturi JSON generate cu actorul Website Tech Stack Detector:

```text
dataset_website-tech-stack-detector_2026-11-19_16-46-16-456.json
dataset_website-tech-stack-detector_2026-11-19_16-52-01-770.json
dataset_website-tech-stack-detector_2026-11-19_17-00-13-587.json
dataset_website-tech-stack-detector_2026-11-19_17-04-01-405.json
dataset_website-tech-stack-detector_2026-11-19_17-07-20-641.json
```

Exporturile au acoperit lista în loturi. Pentru fiecare rezultat Apify:

1. tehnologia a fost normalizată pentru a elimina aliasurile;
2. domeniul a fost comparat cu rezultatul propriu;
3. candidatul nou a fost căutat în HTML, scripturi, headere sau alte semnale păstrate;
4. a fost adăugat numai dacă exista o dovadă directă;
5. regula nouă a primit un test automat.

Apify a contribuit la identificarea și verificarea unor tehnologii precum:

- Sentry, prin scriptul oficial `browser.sentry-cdn.com`;
- Fastly, prin combinația de headere specifice;
- Mailchimp, prin URL-ul oficial `list-manage.com`;
- Square, prin SDK-ul `web.squarecdn.com/v1/square.js`.

Au fost respinse rezultate care foloseau semnale prea generale. De exemplu, Magento nu a fost acceptat când singura dovadă era fragmentul `/static/version`.

### BuiltWith

Au fost analizate două exporturi principale:

```text
dataset_builtwith-official-technology-scraper_2026-11-19_17-19-08-157.json
dataset_builtwith-official-technology-scraper_2026-11-19_17-32-12-524.json
```

Primul export a ajutat la auditarea semnalelor DNS și la identificarea unei probleme de normalizare pentru cheile `MX`, `NS`, `SOA` și `TXT`. După corectare, DNS-ul a fost verificat din nou pentru toate cele 200 de domenii.

Al doilea export conținea 178 de rânduri, 8.632 de asocieri și 1.629 de etichete distincte. Au fost eliminate:

- informațiile istorice fără dovadă curentă;
- locațiile serverelor;
- rangurile și etichetele Common Crawl;
- atributele generale de pagină;
- aliasurile tehnologiilor deja identificate;
- pluginurile personalizate fără un produs public clar.

Candidații rămași au fost comparați cu scripturile și stylesheet-urile observate pe același domeniu. Auditul a adăugat 25 de tehnologii distincte confirmate și 42 de asocieri domeniu–tehnologie. Exemple:

- Elementor Pro;
- Isotope;
- reCAPTCHA Enterprise;
- WPBakery Page Builder;
- Formidable Forms;
- Kadence Blocks;
- Modern Events Calendar;
- JetElements, JetMenu, JetPopup, JetTabs și JetThemeCore;
- Paid Memberships Pro;
- Simple Cloudflare Turnstile.

Istoricul complet al experimentelor și al deciziilor este disponibil în `docs/EXPERIMENTS.md`.

## Fișiere livrate

```text
.
├── data/input/                 # lista celor 200 de domenii
├── docs/EXPERIMENTS.md         # experimente și decizii
├── experiments/raw/            # rezultate independente httpx/WhatWeb
├── results/final-deep-audited/ # rezultatele finale
├── src/                        # implementarea
├── test/                       # testele automate
├── vendor/wappalyzer/          # catalogul de fingerprint-uri
├── LICENSE
└── THIRD_PARTY_NOTICES.md
```

Rezultatele finale sunt:

- `results/final-deep-audited/results.json` — rezultate și dovezi complete;
- `results/final-deep-audited/results.csv` — format compact;
- `results/final-deep-audited/summary.json` — statistici și tehnologii distincte;
- `results/final-deep-audited/validation.json` — comparația cu httpx.

## Instalare și rulare

Cerințe:

- Node.js 22.12 sau mai nou;
- Chromium pentru Playwright.

```bash
npm install
npx playwright install chromium
npm test
npm run scan -- --output results/final --concurrency 4 --deep
```

Intrarea implicită este `data/input/domains.parquet`.

Validarea față de httpx poate fi refăcută astfel:

```bash
npm run validate -- \
  results/final-deep-audited/results.json \
  experiments/raw/httpx.jsonl \
  results/final-deep-audited/validation.json
```

## Limitări și îmbunătățiri

### Domenii inaccesibile

Paisprezece domenii nu au putut fi accesate. Într-un sistem de producție, capturile ar putea fi repetate din mai multe regiuni și la momente diferite. Domeniile eșuate trebuie raportate separat, nu tratate ca site-uri fără tehnologii.

### Conținut dinamic

Tehnologiile încărcate pot depinde de regiune, consimțământ sau interacțiunea utilizatorului. Soluția poate fi extinsă cu profile regionale și scenarii controlate pentru cookie banners.

### Fingerprint-uri incomplete

Tehnologiile pot fi redenumite, incluse în bundle-uri sau mutate. Catalogul trebuie actualizat periodic, iar regulile noi trebuie verificate pe exemple pozitive și negative.

### Referință indisponibilă

Cele 477 de etichete nu sunt publice. Pentru măsurarea exactă a precision și recall ar fi necesare lista etichetată, data colectării și regulile de normalizare.

## Scalare la milioane de domenii

Pentru procesarea a milioane de domenii în 1–2 luni:

1. domeniile sunt distribuite printr-o coadă către workeri stateless;
2. HTTP, DNS și TLS rulează pentru toate domeniile;
3. Chromium rulează selectiv, pentru rezultate insuficiente sau site-uri dinamice;
4. DNS, TLS, hash-urile și resursele comune sunt cache-uite;
5. se aplică rate limiting, retry limitat și circuit breakers;
6. semnalele brute sunt stocate separat de detecțiile normalizate;
7. regulile noi pot fi rulate peste datele păstrate fără un crawl complet.

Trebuie urmărite throughput-ul, latența, rata de eșec, costul per domeniu și distribuția nivelurilor de încredere.

## Descoperirea tehnologiilor noi

Semnalele necunoscute pot fi grupate după script, stylesheet, XHR, domeniu extern, generator, DNS și JavaScript global. Candidații sunt prioritizați după:

- frecvență;
- asocierea clară cu un furnizor sau pachet;
- stabilitatea între capturi;
- documentația oficială disponibilă;
- rezultatele pe exemple negative.

O regulă nouă trebuie să aibă review, exemplu pozitiv, exemplu negativ și test automat. Pot fi monitorizate registrele de pachete, directoarele CMS, changelog-urile și catalogul Wappalyzer.

## Prezentarea proiectului

Ordinea recomandată pentru prezentare:

1. problema și cele 200 de domenii;
2. principiul bazat pe dovezi;
3. colectarea HTTP/DNS/TLS și etapa Chromium;
4. un exemplu complet din `results.json`;
5. rezultatul: 335 de tehnologii distincte și 2.078 de detecții;
6. verificarea cu httpx, Apify și BuiltWith;
7. candidații respinși și motivele;
8. limitările și planul de scalare.

## Licență

Proiectul este distribuit sub GPL-3.0 deoarece include un catalog derivat din Wappalyzer. Detaliile sunt în `LICENSE` și `THIRD_PARTY_NOTICES.md`.
