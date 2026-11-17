import type { RulePack } from '../schemas.ts'

/**
 * Front end: performance: ready-made rules, one group per slot. Never reuse a removed rule id within
 * its slot, and bump `CATALOG_VERSION` on any change to a rule, a label or a line.
 */
export const frontendPerformance: RulePack = {
  id: 'frontend-performance',
  title: {
    en: 'Front end: performance',
    fr: 'Front : performance',
  },
  description: {
    en: 'What you measure, the budgets you hold, and how images, styles, scripts, fonts, caching and rendering stay fast: what your coding assistant must respect when it changes the front end.',
    fr: 'Ce que vous mesurez, les budgets que vous tenez, et comment images, styles, scripts, polices, cache et rendu restent rapides : ce que votre assistant de code doit respecter quand il modifie le front.',
  },
  sections: [
    'Performance measurement',
    'Assets and page weight',
    'Loading and caching',
    'Rendering performance',
  ],
  groups: [
    {
      slot: 'perf.measure-first',
      section: 'Performance measurement',
      label: {
        en: 'An optimization starts from a measurement, never from a guess.',
        fr: 'Une optimisation part d’une mesure, jamais d’une intuition.',
      },
      pick: 'one',
      rules: [
        {
          id: 'agree',
          lines: [
            'Before optimizing, measure the starting point (LCP, INP, CLS, TTFB) on a throttled mobile profile, fix what weighs most first, and report the numbers before and after; never claim a gain that was not measured.',
            'Do not chase a lab score of 100: a lab run reproduces and diagnoses a problem, real-user data says whether it matters.',
          ],
        },
        {
          id: 'disagree',
          lines: [
            'Apply the usual performance practices without measuring each one; still do not add complexity (memoization, a cache, a worker) for a gain nobody measured.',
          ],
        },
      ],
    },
    {
      slot: 'perf.vitals-targets',
      section: 'Performance measurement',
      label: {
        en: 'The pages must meet:',
        fr: 'Les pages doivent tenir :',
      },
      pick: 'one',
      rules: [
        {
          id: 'good',
          label: {
            en: 'The "good" Core Web Vitals thresholds (LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1)',
            fr: 'Les seuils « bon » des Core Web Vitals (LCP ≤ 2,5 s, INP ≤ 200 ms, CLS ≤ 0,1)',
          },
          lines: [
            'Keep every page within LCP 2.5 s, INP 200 ms and CLS 0.1 at the 75th percentile of real visits (not the average), with TTFB under 1.3 s; say so when a change puts one of them at risk.',
          ],
        },
        {
          id: 'none',
          label: {
            en: 'No set target',
            fr: 'Aucun objectif fixé',
          },
          lines: [
            'The project sets no performance target: do not block a change on a metric, but point out one that clearly slows loading, interaction or layout stability.',
          ],
        },
        {
          id: 'other',
          label: {
            en: 'Other targets',
            fr: 'D’autres objectifs',
          },
          input: true,
          lines: [
            'Keep every page within the project’s performance targets: {value}; say so when a change puts one of them at risk.',
          ],
        },
      ],
      lines: [
        'Measure responsiveness with INP, which covers every interaction; FID is no longer a Core Web Vital.',
      ],
    },
    {
      slot: 'perf.field-metrics',
      section: 'Performance measurement',
      label: {
        en: 'Metrics from real visits are collected with:',
        fr: 'Les métriques des visites réelles sont collectées avec :',
      },
      pick: 'one',
      rules: [
        {
          id: 'web-vitals',
          label: {
            en: 'The `web-vitals` library',
            fr: 'La bibliothèque `web-vitals`',
          },
          lines: [
            'Real-user metrics are reported with `web-vitals`: keep LCP, INP, CLS and TTFB sent to monitoring with the page and the device type, and wire a new page or route into the same reporting.',
          ],
        },
        {
          id: 'rum-service',
          label: {
            en: 'A monitoring service’s own agent',
            fr: 'L’agent d’un service de monitoring',
          },
          lines: [
            'Real-user metrics come from the monitoring service’s agent: keep it loaded on every page, do not add a second collector, and read its 75th percentile per page and device before judging a page.',
          ],
        },
        {
          id: 'none',
          label: {
            en: 'Nothing yet',
            fr: 'Rien pour l’instant',
          },
          lines: [
            'No real-user metrics are collected: do not add a collector or a monitoring script unasked, and say that a lab measurement is not what users experience.',
          ],
        },
      ],
    },
    {
      slot: 'perf.budget-check',
      section: 'Performance measurement',
      label: {
        en: 'Performance budgets are checked in CI with:',
        fr: 'Les budgets de performance sont vérifiés en CI avec :',
      },
      pick: 'one',
      rules: [
        {
          id: 'lighthouse-ci',
          label: {
            en: 'Lighthouse CI',
            fr: 'Lighthouse CI',
          },
          lines: [
            'Lighthouse CI enforces the budgets: a change that fails one is fixed, never merged by raising the budget or skipping the check; a new page gets its own entry in the Lighthouse CI configuration.',
          ],
        },
        {
          id: 'bundle-size',
          label: {
            en: 'A bundle size limit (size-limit, bundler budgets)',
            fr: 'Une limite de taille de bundle (size-limit, budgets du bundler)',
          },
          lines: [
            'A bundle size limit runs in CI: when a change goes over it, reduce what is shipped (split, lighter import, removal) and never raise the limit without asking.',
          ],
        },
        {
          id: 'none',
          label: {
            en: 'No budget in CI',
            fr: 'Aucun budget en CI',
          },
          lines: [
            'No budget is checked in CI: keep a page under 1,500 KB in total as a working limit, and report the change in bundle size when a change adds a dependency or a large asset.',
          ],
        },
        {
          id: 'other',
          label: {
            en: 'Something else',
            fr: 'Autre chose',
          },
          input: true,
          lines: [
            'Performance budgets are checked with {value}: fix a change that fails one, and never raise a budget or skip the check without asking.',
          ],
        },
      ],
    },
    {
      slot: 'perf.requests',
      section: 'Assets and page weight',
      label: {
        en: 'I keep the number of requests per page low, even over HTTP/2.',
        fr: 'Je garde peu de requêtes par page, même en HTTP/2.',
      },
      pick: 'one',
      rules: [
        {
          id: 'agree',
          lines: [
            'Keep requests per page few, HTTP/2 or not: one SVG sprite or inline SVG instead of a file per icon, stylesheets bundled at build time, and no reference to a file that answers 404.',
            'Keep cookies small and few (at most 4,096 bytes each and 20 per domain): they are sent with every request to the domain, static files included.',
          ],
        },
        {
          id: 'disagree',
          lines: [
            'The number of requests is not a concern on this project: do not restructure assets to save requests; still remove any reference to a file that answers 404.',
          ],
        },
      ],
    },
    {
      slot: 'perf.third-party',
      section: 'Assets and page weight',
      label: {
        en: 'Third-party scripts and embeds (analytics, chat, A/B tests, iframes):',
        fr: 'Les scripts et contenus tiers (analytics, chat, tests A/B, iframes) :',
      },
      pick: 'one',
      rules: [
        {
          id: 'ask',
          label: {
            en: 'The assistant asks me before adding one',
            fr: "L'assistant me demande avant d'en ajouter",
          },
          lines: [
            'Ask before adding a third-party script or an iframe, and give its weight and the requests it adds; an embed is put behind a clickable facade or `loading="lazy"`.',
          ],
        },
        {
          id: 'deferred',
          label: {
            en: 'Allowed when loaded late or on interaction',
            fr: 'Autorisés s’ils sont chargés tard ou à l’interaction',
          },
          lines: [
            'A third-party script or embed never loads on the critical path: load it after the page is interactive or on the first interaction, and put an iframe behind a clickable facade or `loading="lazy"`.',
          ],
        },
        {
          id: 'never',
          label: {
            en: 'None are allowed',
            fr: 'Aucun n’est autorisé',
          },
          lines: [
            'Never add a third-party script, widget or iframe: build the feature with the project’s own code, or stop and say what is missing.',
          ],
        },
      ],
      lines: [
        'Load application scripts with `defer` or `type="module"` and independent ones with `async`; never put a blocking `<script>` in the head, and keep inline scripts few: they block parsing, are not cached and get in the way of a strict CSP.',
      ],
    },
    {
      slot: 'perf.image-formats',
      section: 'Assets and page weight',
      label: {
        en: 'Photos and other raster images are served:',
        fr: 'Les photos et autres images matricielles sont servies :',
      },
      pick: 'one',
      rules: [
        {
          id: 'modern-files',
          label: {
            en: 'As AVIF or WebP files produced by the build or by hand',
            fr: 'En fichiers AVIF ou WebP produits au build ou à la main',
          },
          lines: [
            'Add a photo as AVIF or WebP, compressed and no larger than its biggest displayed size; never commit a raw JPEG or PNG export for one.',
          ],
        },
        {
          id: 'image-service',
          label: {
            en: 'Through an image CDN or the framework’s image component',
            fr: 'Par un CDN d’images ou le composant image du framework',
          },
          lines: [
            'Serve every raster image through the project’s image CDN or image component, which picks the format and the size; never link a raw file or bypass it with a plain `<img>`.',
          ],
        },
        {
          id: 'as-is',
          label: {
            en: 'As they are (JPEG, PNG)',
            fr: 'Telles quelles (JPEG, PNG)',
          },
          lines: [
            'Images are served as JPEG or PNG: do not add a conversion step unasked; compress a new image and size it to its biggest displayed size before adding it.',
          ],
        },
      ],
      lines: [
        'Use SVG for icons and logos and never for a photo, and do not embed images as base64: it adds about 33% to the weight and cannot be cached on its own.',
      ],
    },
    {
      slot: 'perf.image-loading',
      section: 'Assets and page weight',
      label: {
        en: 'Every image reserves its place and loads only when it is about to be seen.',
        fr: 'Chaque image réserve sa place et ne se charge que lorsqu’elle va être vue.',
      },
      pick: 'one',
      rules: [
        {
          id: 'agree',
          lines: [
            'Give every image an explicit `width` and `height` (or an `aspect-ratio`) so the layout does not shift, and `loading="lazy"` with `decoding="async"` when it starts off screen.',
            'Never lazy-load the image that is the largest element of the first screen: load it at once with `fetchpriority="high"`.',
          ],
        },
        {
          id: 'disagree',
          lines: [
            'Lazy loading is not applied by rule: add `loading="lazy"` only where asked, and still give an image its dimensions when it would otherwise shift the layout.',
          ],
        },
      ],
    },
    {
      slot: 'perf.responsive-images',
      section: 'Assets and page weight',
      label: {
        en: 'For different screen sizes, an image comes:',
        fr: 'Pour les différentes tailles d’écran, une image est fournie :',
      },
      pick: 'one',
      rules: [
        {
          id: 'srcset',
          label: {
            en: 'In several widths, with `srcset` and `sizes`',
            fr: 'En plusieurs largeurs, avec `srcset` et `sizes`',
          },
          lines: [
            'Give a content image several widths in `srcset` (for example 400w, 800w, 1600w) and a `sizes` that matches its real layout width, so a small screen never downloads the largest file.',
          ],
        },
        {
          id: 'generated',
          label: {
            en: 'In widths generated by the image component or CDN',
            fr: 'En largeurs générées par le composant ou le CDN d’images',
          },
          lines: [
            'Let the image component or CDN generate the widths: pass it the layout size (`sizes` or its equivalent) of each image rather than writing `srcset` by hand.',
          ],
        },
        {
          id: 'single',
          label: {
            en: 'In one size',
            fr: 'En une seule taille',
          },
          lines: [
            'Images ship in one size: export each at about twice its largest displayed width at most, never a multi-thousand-pixel original shown at a few hundred pixels.',
          ],
        },
      ],
    },
    {
      slot: 'perf.critical-css',
      section: 'Loading and caching',
      label: {
        en: 'The CSS of the first screen is:',
        fr: 'Le CSS du premier écran est :',
      },
      pick: 'one',
      rules: [
        {
          id: 'inlined',
          label: {
            en: 'Inlined in the head, the rest loaded without blocking',
            fr: 'En ligne dans le head, le reste chargé sans bloquer',
          },
          lines: [
            'Keep the inlined critical CSS to what the first screen needs, about 14 KB at most, and load the rest without blocking rendering; never inline the whole stylesheet, which bloats the HTML and escapes the cache.',
          ],
        },
        {
          id: 'per-route',
          label: {
            en: 'Part of stylesheets split per route by the bundler',
            fr: 'Dans des feuilles découpées par route par le bundler',
          },
          lines: [
            'CSS is split per route: import a style from the component or route that uses it so it ships with that chunk, and keep only the styles of the app shell in the global stylesheet.',
          ],
        },
        {
          id: 'one-file',
          label: {
            en: 'In one stylesheet for the whole app',
            fr: 'Dans une seule feuille pour toute l’app',
          },
          lines: [
            'The app ships one stylesheet: keep it small since it blocks the first paint, and do not set up critical-CSS extraction or CSS splitting unasked.',
          ],
        },
      ],
    },
    {
      slot: 'perf.unused-css',
      section: 'Loading and caching',
      label: {
        en: 'Unused CSS is removed:',
        fr: 'Le CSS inutilisé est retiré :',
      },
      pick: 'one',
      rules: [
        {
          id: 'build',
          label: {
            en: 'By the build (Tailwind, PurgeCSS, CSS Modules)',
            fr: 'Par le build (Tailwind, PurgeCSS, CSS Modules)',
          },
          lines: [
            'The build drops unused CSS: write class names in full so it can find them (never build one by concatenating strings), and never import a whole CSS framework or theme for a few rules.',
          ],
        },
        {
          id: 'manual',
          label: {
            en: 'By hand',
            fr: 'À la main',
          },
          lines: [
            'Nothing removes unused CSS at build time: delete the rules of a component in the same change that deletes or rewrites it, and do not leave dead selectors behind.',
          ],
        },
        {
          id: 'not-removed',
          label: {
            en: 'It is not',
            fr: 'Il ne l’est pas',
          },
          lines: [
            'Unused CSS is not removed on this project: do not add a purge step unasked, and do not make it worse by importing a whole stylesheet for a few rules.',
          ],
        },
      ],
    },
    {
      slot: 'perf.css-rules',
      section: 'Loading and caching',
      label: {
        en: 'In styles, the project refuses:',
        fr: 'Dans les styles, le projet refuse :',
      },
      pick: 'many',
      rules: [
        {
          id: 'css-import',
          label: {
            en: '`@import` in shipped CSS',
            fr: '`@import` dans le CSS livré',
          },
          lines: [
            'Never leave an `@import` in a stylesheet that ships: each one adds a download in series; import styles through the bundler so they are concatenated.',
          ],
        },
        {
          id: 'inline-style',
          label: {
            en: 'Inline `style` attributes',
            fr: 'Les attributs `style` en ligne',
          },
          lines: [
            'Do not style with the `style` attribute: it is not cached, it duplicates rules and it breaks a strict CSP; use a class, and keep `style` for a value only known at run time.',
          ],
        },
        {
          id: 'runtime-css-in-js',
          label: {
            en: 'CSS-in-JS computed at run time',
            fr: 'Le CSS-in-JS calculé à l’exécution',
          },
          lines: [
            'Do not add CSS-in-JS that computes styles while rendering: use styles extracted at build time.',
          ],
        },
        {
          id: 'deep-selectors',
          label: {
            en: 'Deep or highly specific selectors',
            fr: 'Les sélecteurs profonds ou très spécifiques',
          },
          lines: [
            'Select with one simple class: no deep descendant chain, no id or `!important` to win specificity, and no rule duplicated from another component.',
          ],
        },
        {
          id: 'layout-animations',
          label: {
            en: 'Animations of layout properties',
            fr: 'Les animations de propriétés de mise en page',
          },
          lines: [
            'Animate only `transform` and `opacity`; never `width`, `height`, `top`, `left` or `margin`, which force a layout on every frame and miss the 16 ms a frame has at 60 frames per second.',
          ],
        },
        {
          id: 'layout-thrashing',
          label: {
            en: 'Reading layout between DOM writes',
            fr: 'Lire la mise en page entre deux écritures du DOM',
          },
          lines: [
            'Never read layout (`offsetWidth`, `getBoundingClientRect`, `scrollTop`) between DOM writes in a loop: read everything first, then write, or do the writes in `requestAnimationFrame`.',
          ],
        },
      ],
    },
    {
      slot: 'perf.code-splitting',
      section: 'Loading and caching',
      label: {
        en: 'The JavaScript bundle is split:',
        fr: 'Le bundle JavaScript est découpé :',
      },
      pick: 'one',
      rules: [
        {
          id: 'route',
          label: {
            en: 'Per route',
            fr: 'Par route',
          },
          lines: [
            'Load every route with a dynamic `import()` (`lazy` and `Suspense` in React) so the initial bundle holds only the first page: one chunk per page on top of the shared base, and no finer split.',
          ],
        },
        {
          id: 'route-and-heavy',
          label: {
            en: 'Per route, plus heavy components loaded on demand',
            fr: 'Par route, plus les composants lourds chargés à la demande',
          },
          lines: [
            'Load every route with a dynamic `import()`, and also a heavy component that is not shown at once (charts, editor, map); do not split further: dozens of small chunks in cascade slow navigation down.',
          ],
        },
        {
          id: 'framework',
          label: {
            en: 'By the framework, automatically',
            fr: 'Par le framework, automatiquement',
          },
          lines: [
            'The framework splits the code per route: follow its conventions and its performance guide, use its dynamic import only for a heavy component hidden at first, and do not configure chunks by hand.',
          ],
        },
        {
          id: 'none',
          label: {
            en: 'It is not split',
            fr: 'Il n’est pas découpé',
          },
          lines: [
            'The app ships as one bundle: do not introduce code splitting unasked; say so when a change adds a large library that only one screen uses.',
          ],
        },
      ],
    },
    {
      slot: 'perf.dependency-weight',
      section: 'Loading and caching',
      label: {
        en: 'The weight a dependency adds to the bundle is checked before it is added.',
        fr: 'Le poids qu’une dépendance ajoute au bundle est vérifié avant de l’ajouter.',
      },
      pick: 'one',
      rules: [
        {
          id: 'agree',
          lines: [
            'Before adding a front-end dependency, check what it adds to the bundle and whether it tree-shakes, prefer a platform API or a lighter library, and import only the functions used, never the whole package.',
            'Judge a script by its uncompressed size too: that is what the browser parses and runs, and it costs most on a phone.',
          ],
        },
        {
          id: 'disagree',
          lines: [
            'Bundle weight does not decide the choice of a library here: pick the one that fits the task; still import only what is used.',
          ],
        },
      ],
    },
    {
      slot: 'perf.main-thread',
      section: 'Rendering performance',
      label: {
        en: 'No task may hold the main thread for more than 50 ms.',
        fr: 'Aucune tâche ne doit occuper le thread principal plus de 50 ms.',
      },
      pick: 'one',
      rules: [
        {
          id: 'agree',
          lines: [
            'Keep every task on the main thread under 50 ms: split long work into chunks that yield to the browser, move heavy computation to a Web Worker, and debounce or throttle handlers of scroll, resize and typing.',
          ],
        },
        {
          id: 'disagree',
          lines: [
            'Do not add a worker or task chunking unasked; point out a synchronous computation that visibly freezes an interaction.',
          ],
        },
      ],
    },
    {
      slot: 'perf.font-hosting',
      section: 'Assets and page weight',
      label: {
        en: 'Web fonts are:',
        fr: 'Les polices web sont :',
      },
      pick: 'one',
      rules: [
        {
          id: 'self-hosted',
          label: {
            en: 'Hosted with the app',
            fr: 'Hébergées avec l’app',
          },
          lines: [
            'Serve fonts from the app’s own origin, in WOFF2 only, and preload only the weight the first screen uses, with `as="font"`, `type="font/woff2"` and `crossorigin` (without it the file is downloaded twice).',
          ],
        },
        {
          id: 'font-service',
          label: {
            en: 'Loaded from a font service',
            fr: 'Chargées depuis un service de polices',
          },
          lines: [
            'Fonts come from a font service: keep a `<link rel="preconnect" crossorigin>` to its file domain, request only the weights and character sets in use, and do not add a second font origin.',
          ],
        },
        {
          id: 'system',
          label: {
            en: 'Not used: system fonts only',
            fr: 'Absentes : polices système seulement',
          },
          lines: [
            'The project uses system fonts only: never add a web font, an icon font or a link to a font service; use the existing system font stack.',
          ],
        },
      ],
    },
    {
      slot: 'perf.font-display',
      section: 'Assets and page weight',
      label: {
        en: 'While a web font loads, text is shown with `font-display`:',
        fr: 'Pendant le chargement d’une police web, le texte s’affiche avec `font-display` :',
      },
      pick: 'one',
      rules: [
        {
          id: 'swap',
          label: {
            en: '`swap`: fallback at once, replaced when the font arrives',
            fr: '`swap` : repli immédiat, remplacé à l’arrivée de la police',
          },
          lines: [
            'Declare every `@font-face` with `font-display: swap`, and tune the fallback font with `size-adjust` so the swap does not shift the layout.',
          ],
        },
        {
          id: 'optional',
          label: {
            en: '`optional`: the font only if it is already there',
            fr: '`optional` : la police seulement si elle est déjà là',
          },
          lines: [
            'Declare every `@font-face` with `font-display: optional`: the layout must look right in the fallback font, since a first visit may never show the web font.',
          ],
        },
        {
          id: 'fallback',
          label: {
            en: '`fallback`: short wait, replaced only if fast',
            fr: '`fallback` : courte attente, remplacé seulement si rapide',
          },
          lines: [
            'Declare every `@font-face` with `font-display: fallback`, and tune the fallback font with `size-adjust` so a late swap does not shift the layout.',
          ],
        },
      ],
      lines: [
        'Never leave a text font on `font-display: block` or without `font-display`: text stays invisible for up to about 3 s; `block` is for icon fonts only.',
      ],
    },
    {
      slot: 'perf.font-budget',
      section: 'Assets and page weight',
      label: {
        en: 'I keep font families and weights few and light.',
        fr: 'Je garde peu de familles et de graisses de police, et légères.',
      },
      pick: 'one',
      rules: [
        {
          id: 'agree',
          lines: [
            'Keep all fonts under 300 KB in total, with at most two families and four weights; ask before adding a family or a weight, and subset each file to the characters in use with `unicode-range`.',
          ],
        },
        {
          id: 'disagree',
          lines: [
            'Use the families and weights the design asks for; still ship each one as a single WOFF2 file and never preload them all.',
          ],
        },
      ],
    },
    {
      slot: 'perf.cache-headers',
      section: 'Loading and caching',
      label: {
        en: 'HTTP caching of the front end’s files is:',
        fr: 'Le cache HTTP des fichiers du front est :',
      },
      pick: 'one',
      rules: [
        {
          id: 'hashed-immutable',
          label: {
            en: 'Hashed assets cached for a year, HTML always revalidated',
            fr: 'Assets hashés en cache un an, HTML toujours revalidé',
          },
          lines: [
            'Serve hashed assets with `Cache-Control: public, max-age=31536000, immutable` and `index.html` with `no-cache` and an `ETag`; never give the HTML a long cache: it would point to bundles that no longer exist.',
            'Reference every asset through the bundler so its name carries a content hash; a file with a fixed name (in `public/`) must not get the one-year cache.',
          ],
        },
        {
          id: 'platform',
          label: {
            en: 'Set by the hosting platform',
            fr: 'Réglé par la plateforme d’hébergement',
          },
          lines: [
            'The hosting platform sets the cache headers: do not override them in code or configuration, and reference every asset through the bundler so its name carries a content hash.',
          ],
        },
        {
          id: 'not-set',
          label: {
            en: 'Not set up',
            fr: 'Pas en place',
          },
          lines: [
            'Cache headers are not set up: do not add any unasked, and never assume a deployed file is refreshed or kept by the browser.',
          ],
        },
      ],
      lines: [
        'A private API response is `Cache-Control: private, no-store`: never let a shared cache or a CDN keep it.',
      ],
    },
    {
      slot: 'perf.compression',
      section: 'Loading and caching',
      label: {
        en: 'HTML, CSS and JavaScript are compressed:',
        fr: 'HTML, CSS et JavaScript sont compressés :',
      },
      pick: 'one',
      rules: [
        {
          id: 'edge',
          label: {
            en: 'By the CDN or the reverse proxy (Brotli, gzip)',
            fr: 'Par le CDN ou le reverse proxy (Brotli, gzip)',
          },
          lines: [
            'The CDN or the proxy compresses text with Brotli, then gzip: do not compress in application code, and check that a new text type (JSON, SVG, source map) is in its list of compressed types.',
          ],
        },
        {
          id: 'build',
          label: {
            en: 'At build time, as `.br` and `.gz` files',
            fr: 'Au build, en fichiers `.br` et `.gz`',
          },
          lines: [
            'The build writes `.br` and `.gz` files next to each text asset: keep that step when changing the build, and keep the server serving them with the right `Content-Encoding`.',
          ],
        },
        {
          id: 'not-set',
          label: {
            en: 'Not set up',
            fr: 'Pas en place',
          },
          lines: [
            'Text assets are served uncompressed: do not add compression unasked, and say so when a change ships a large text file.',
          ],
        },
      ],
      lines: [
        'Ship HTML, CSS and JavaScript minified, never gzip or Brotli an already compressed format (JPEG, WebP, AVIF, WOFF2), and load every resource over HTTPS: no mixed content.',
      ],
    },
    {
      slot: 'perf.resource-hints',
      section: 'Loading and caching',
      label: {
        en: 'Resource hints the pages use:',
        fr: 'Indications de ressources utilisées par les pages :',
      },
      pick: 'many',
      rules: [
        {
          id: 'preconnect',
          label: {
            en: '`preconnect` to critical origins (API, CDN, fonts)',
            fr: '`preconnect` vers les origines critiques (API, CDN, polices)',
          },
          lines: [
            'Add a `<link rel="preconnect">` for an origin the first screen needs (API, CDN, fonts) when introducing one, with `crossorigin` when it serves fonts; keep them to a handful and remove the hint with the origin.',
          ],
        },
        {
          id: 'dns-prefetch',
          label: {
            en: '`dns-prefetch` to secondary origins',
            fr: '`dns-prefetch` vers les origines secondaires',
          },
          lines: [
            'Use `<link rel="dns-prefetch">` for an origin that is used later or only sometimes, rather than a full `preconnect`.',
          ],
        },
        {
          id: 'preload',
          label: {
            en: '`preload` of first-screen resources',
            fr: '`preload` des ressources du premier écran',
          },
          lines: [
            'Preload only what the first screen needs and the browser finds late (the largest image, the heading font), with the right `as`; every extra preload competes with critical resources.',
          ],
        },
        {
          id: 'none',
          label: {
            en: 'None',
            fr: 'Aucune',
          },
          alone: true,
          lines: [
            'The pages use no resource hint: do not add `preconnect`, `dns-prefetch` or `preload` tags unasked.',
          ],
        },
      ],
    },
    {
      slot: 'perf.memoization',
      section: 'Rendering performance',
      label: {
        en: '`memo`, `useMemo` and `useCallback` are written:',
        fr: '`memo`, `useMemo` et `useCallback` sont écrits :',
      },
      pick: 'one',
      rules: [
        {
          id: 'measured',
          label: {
            en: 'Only where a profile shows a costly re-render',
            fr: 'Seulement là où un profil montre un re-rendu coûteux',
          },
          lines: [
            'Add `memo`, `useMemo` or `useCallback` only where the React DevTools Profiler shows a costly re-render with stable props; comparing props has a cost, so do not wrap by default, and remove one that no longer pays.',
          ],
        },
        {
          id: 'compiler',
          label: {
            en: 'Never by hand: the React Compiler does it',
            fr: 'Jamais à la main : le React Compiler s’en charge',
          },
          lines: [
            'The React Compiler memoizes: do not write `memo`, `useMemo` or `useCallback` by hand, and follow the Rules of React (no mutation of props or state, no side effect while rendering) so it can optimize a component.',
          ],
        },
        {
          id: 'default',
          label: {
            en: 'By default on components and callbacks passed down',
            fr: 'Par défaut sur les composants et les callbacks transmis',
          },
          lines: [
            'Wrap a component that receives props in `memo`, and pass it objects and callbacks kept stable with `useMemo` and `useCallback`; an inline object or function in its props defeats the memoization.',
          ],
        },
      ],
      lines: [
        'A re-render costs the computation of the render, not a DOM update: before memoizing, look for the cause (state held too high, a context value rebuilt on each render, an unstable `key`).',
      ],
    },
    {
      slot: 'perf.long-lists',
      section: 'Rendering performance',
      label: {
        en: 'Long lists and tables are:',
        fr: 'Les longues listes et les grands tableaux sont :',
      },
      pick: 'one',
      rules: [
        {
          id: 'virtualized',
          label: {
            en: 'Virtualized (TanStack Virtual, react-window…)',
            fr: 'Virtualisés (TanStack Virtual, react-window…)',
          },
          lines: [
            'Render a list or a table that can exceed a few hundred rows with the project’s virtualization library, so only the visible rows (about 30) are in the DOM; give each row a stable `key`.',
          ],
        },
        {
          id: 'paginated',
          label: {
            en: 'Paginated',
            fr: 'Paginés',
          },
          lines: [
            'Never render a collection in full: page it on the server and show one page at a time; do not add a virtualization library unasked.',
          ],
        },
        {
          id: 'whole',
          label: {
            en: 'Rendered whole: they stay short',
            fr: 'Rendus en entier : ils restent courts',
          },
          lines: [
            'Lists are short and rendered whole: do not add virtualization or pagination unasked; say so when a list can grow past a few hundred rows.',
          ],
        },
      ],
    },
    {
      slot: 'perf.state-placement',
      section: 'Rendering performance',
      label: {
        en: 'State lives as close as possible to the components that use it.',
        fr: 'L’état vit au plus près des composants qui l’utilisent.',
      },
      pick: 'one',
      rules: [
        {
          id: 'agree',
          lines: [
            'Keep state in the lowest component that needs it: never the value of a form field in a global store or context; split a context whose value changes often, since every consumer re-renders with it.',
            'Fetch data next to the component that shows it and subscribe to the fields it reads; poll no more often than needed, pause while the tab is hidden, and never poll at the top of the tree.',
          ],
        },
        {
          id: 'disagree',
          lines: [
            'State may be lifted or made global for convenience; still keep a value that changes on every keystroke or every second out of a context the whole page consumes.',
          ],
        },
      ],
    },
  ],
}
