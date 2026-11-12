import type { Questionnaire } from '../schemas.ts'

/**
 * How fast the front end has to stay, and what keeps it fast: measuring before optimizing and
 * budgets, page weight and requests, images, CSS, JavaScript, fonts, network and cache, and the
 * rendering of a React single-page app. Questions 1, 5, 8, 14, 15, 18 and 24 are preferences on a
 * 1–5 agreement scale, where 3 produces nothing; the others record facts about the repository.
 * It feeds only its own `perf.*` slots, so it combines with any other questionnaire.
 *
 * Bump `version` on any change to a question, an option or a fragment; never reuse a removed
 * question id; declare a removed option in `migrations`.
 */
export const frontendPerformance = {
  id: 'frontend-performance',
  version: '1.0.0',
  title: { en: 'Front end: performance', fr: 'Front : performance' },
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
  questions: [
    {
      id: 'perf-measure-first',
      type: 'scale',
      slot: 'perf.measure-first',
      section: 'Performance measurement',
      label: {
        en: 'An optimization starts from a measurement, never from a guess.',
        fr: 'Une optimisation part d’une mesure, jamais d’une intuition.',
      },
      required: false,
      fragments: [
        {
          when: { scaleAtLeast: 4 },
          text: 'Before optimizing, measure the starting point (LCP, INP, CLS, TTFB) on a throttled mobile profile, fix what weighs most first, and report the numbers before and after; never claim a gain that was not measured.',
        },
        {
          when: { scaleAtLeast: 4 },
          text: 'Do not chase a lab score of 100: a lab run reproduces and diagnoses a problem, real-user data says whether it matters.',
        },
        {
          when: { scaleAtMost: 2 },
          text: 'Apply the usual performance practices without measuring each one; still do not add complexity (memoization, a cache, a worker) for a gain nobody measured.',
        },
      ],
    },
    {
      id: 'perf-vitals-targets',
      type: 'single',
      slot: 'perf.vitals-targets',
      section: 'Performance measurement',
      label: {
        en: 'The pages must meet:',
        fr: 'Les pages doivent tenir :',
      },
      options: [
        {
          value: 'good',
          label: {
            en: 'The "good" Core Web Vitals thresholds (LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1)',
            fr: 'Les seuils « bon » des Core Web Vitals (LCP ≤ 2,5 s, INP ≤ 200 ms, CLS ≤ 0,1)',
          },
        },
        { value: 'none', label: { en: 'No set target', fr: 'Aucun objectif fixé' } },
        {
          value: 'other',
          label: { en: 'Other targets', fr: 'D’autres objectifs' },
          freeText: true,
        },
      ],
      required: false,
      fragments: [
        {
          when: { equals: 'good' },
          text: 'Keep every page within LCP 2.5 s, INP 200 ms and CLS 0.1 at the 75th percentile of real visits (not the average), with TTFB under 1.3 s; say so when a change puts one of them at risk.',
        },
        {
          when: { equals: 'none' },
          text: 'The project sets no performance target: do not block a change on a metric, but point out one that clearly slows loading, interaction or layout stability.',
        },
        {
          when: { other: true },
          text: 'Keep every page within the project’s performance targets: {value}; say so when a change puts one of them at risk.',
        },
        {
          when: { answered: true },
          text: 'Measure responsiveness with INP, which covers every interaction; FID is no longer a Core Web Vital.',
        },
      ],
    },
    {
      id: 'perf-field-metrics',
      type: 'single',
      slot: 'perf.field-metrics',
      section: 'Performance measurement',
      label: {
        en: 'Metrics from real visits are collected with:',
        fr: 'Les métriques des visites réelles sont collectées avec :',
      },
      options: [
        {
          value: 'web-vitals',
          label: { en: 'The `web-vitals` library', fr: 'La bibliothèque `web-vitals`' },
        },
        {
          value: 'rum-service',
          label: {
            en: 'A monitoring service’s own agent',
            fr: 'L’agent d’un service de monitoring',
          },
        },
        { value: 'none', label: { en: 'Nothing yet', fr: 'Rien pour l’instant' } },
      ],
      required: false,
      fragments: [
        {
          when: { equals: 'web-vitals' },
          text: 'Real-user metrics are reported with `web-vitals`: keep LCP, INP, CLS and TTFB sent to monitoring with the page and the device type, and wire a new page or route into the same reporting.',
        },
        {
          when: { equals: 'rum-service' },
          text: 'Real-user metrics come from the monitoring service’s agent: keep it loaded on every page, do not add a second collector, and read its 75th percentile per page and device before judging a page.',
        },
        {
          when: { equals: 'none' },
          text: 'No real-user metrics are collected: do not add a collector or a monitoring script unasked, and say that a lab measurement is not what users experience.',
        },
      ],
    },
    {
      id: 'perf-budget-check',
      type: 'single',
      slot: 'perf.budget-check',
      section: 'Performance measurement',
      label: {
        en: 'Performance budgets are checked in CI with:',
        fr: 'Les budgets de performance sont vérifiés en CI avec :',
      },
      options: [
        { value: 'lighthouse-ci', label: { en: 'Lighthouse CI', fr: 'Lighthouse CI' } },
        {
          value: 'bundle-size',
          label: {
            en: 'A bundle size limit (size-limit, bundler budgets)',
            fr: 'Une limite de taille de bundle (size-limit, budgets du bundler)',
          },
        },
        { value: 'none', label: { en: 'No budget in CI', fr: 'Aucun budget en CI' } },
        { value: 'other', label: { en: 'Something else', fr: 'Autre chose' }, freeText: true },
      ],
      required: false,
      fragments: [
        {
          when: { equals: 'lighthouse-ci' },
          text: 'Lighthouse CI enforces the budgets: a change that fails one is fixed, never merged by raising the budget or skipping the check; a new page gets its own entry in the Lighthouse CI configuration.',
        },
        {
          when: { equals: 'bundle-size' },
          text: 'A bundle size limit runs in CI: when a change goes over it, reduce what is shipped (split, lighter import, removal) and never raise the limit without asking.',
        },
        {
          when: { equals: 'none' },
          text: 'No budget is checked in CI: keep a page under 1,500 KB in total as a working limit, and report the change in bundle size when a change adds a dependency or a large asset.',
        },
        {
          when: { other: true },
          text: 'Performance budgets are checked with {value}: fix a change that fails one, and never raise a budget or skip the check without asking.',
        },
      ],
    },
    {
      id: 'perf-requests',
      type: 'scale',
      slot: 'perf.requests',
      section: 'Assets and page weight',
      label: {
        en: 'I keep the number of requests per page low, even over HTTP/2.',
        fr: 'Je garde peu de requêtes par page, même en HTTP/2.',
      },
      required: false,
      fragments: [
        {
          when: { scaleAtLeast: 4 },
          text: 'Keep requests per page few, HTTP/2 or not: one SVG sprite or inline SVG instead of a file per icon, stylesheets bundled at build time, and no reference to a file that answers 404.',
        },
        {
          when: { scaleAtLeast: 4 },
          text: 'Keep cookies small and few (at most 4,096 bytes each and 20 per domain): they are sent with every request to the domain, static files included.',
        },
        {
          when: { scaleAtMost: 2 },
          text: 'The number of requests is not a concern on this project: do not restructure assets to save requests; still remove any reference to a file that answers 404.',
        },
      ],
    },
    {
      id: 'perf-third-party',
      type: 'single',
      slot: 'perf.third-party',
      section: 'Assets and page weight',
      label: {
        en: 'Third-party scripts and embeds (analytics, chat, A/B tests, iframes):',
        fr: 'Les scripts et contenus tiers (analytics, chat, tests A/B, iframes) :',
      },
      options: [
        {
          value: 'ask',
          label: {
            en: 'The assistant asks me before adding one',
            fr: "L'assistant me demande avant d'en ajouter",
          },
        },
        {
          value: 'deferred',
          label: {
            en: 'Allowed when loaded late or on interaction',
            fr: 'Autorisés s’ils sont chargés tard ou à l’interaction',
          },
        },
        { value: 'never', label: { en: 'None are allowed', fr: 'Aucun n’est autorisé' } },
      ],
      required: false,
      fragments: [
        {
          when: { equals: 'ask' },
          text: 'Ask before adding a third-party script or an iframe, and give its weight and the requests it adds; an embed is put behind a clickable facade or `loading="lazy"`.',
        },
        {
          when: { equals: 'deferred' },
          text: 'A third-party script or embed never loads on the critical path: load it after the page is interactive or on the first interaction, and put an iframe behind a clickable facade or `loading="lazy"`.',
        },
        {
          when: { equals: 'never' },
          text: 'Never add a third-party script, widget or iframe: build the feature with the project’s own code, or stop and say what is missing.',
        },
        {
          when: { answered: true },
          text: 'Load application scripts with `defer` or `type="module"` and independent ones with `async`; never put a blocking `<script>` in the head, and keep inline scripts few: they block parsing, are not cached and get in the way of a strict CSP.',
        },
      ],
    },
    {
      id: 'perf-image-formats',
      type: 'single',
      slot: 'perf.image-formats',
      section: 'Assets and page weight',
      label: {
        en: 'Photos and other raster images are served:',
        fr: 'Les photos et autres images matricielles sont servies :',
      },
      options: [
        {
          value: 'modern-files',
          label: {
            en: 'As AVIF or WebP files produced by the build or by hand',
            fr: 'En fichiers AVIF ou WebP produits au build ou à la main',
          },
        },
        {
          value: 'image-service',
          label: {
            en: 'Through an image CDN or the framework’s image component',
            fr: 'Par un CDN d’images ou le composant image du framework',
          },
        },
        {
          value: 'as-is',
          label: { en: 'As they are (JPEG, PNG)', fr: 'Telles quelles (JPEG, PNG)' },
        },
      ],
      required: false,
      fragments: [
        {
          when: { equals: 'modern-files' },
          text: 'Add a photo as AVIF or WebP, compressed and no larger than its biggest displayed size; never commit a raw JPEG or PNG export for one.',
        },
        {
          when: { equals: 'image-service' },
          text: 'Serve every raster image through the project’s image CDN or image component, which picks the format and the size; never link a raw file or bypass it with a plain `<img>`.',
        },
        {
          when: { equals: 'as-is' },
          text: 'Images are served as JPEG or PNG: do not add a conversion step unasked; compress a new image and size it to its biggest displayed size before adding it.',
        },
        {
          when: { answered: true },
          text: 'Use SVG for icons and logos and never for a photo, and do not embed images as base64: it adds about 33% to the weight and cannot be cached on its own.',
        },
      ],
    },
    {
      id: 'perf-image-loading',
      type: 'scale',
      slot: 'perf.image-loading',
      section: 'Assets and page weight',
      label: {
        en: 'Every image reserves its place and loads only when it is about to be seen.',
        fr: 'Chaque image réserve sa place et ne se charge que lorsqu’elle va être vue.',
      },
      required: false,
      fragments: [
        {
          when: { scaleAtLeast: 4 },
          text: 'Give every image an explicit `width` and `height` (or an `aspect-ratio`) so the layout does not shift, and `loading="lazy"` with `decoding="async"` when it starts off screen.',
        },
        {
          when: { scaleAtLeast: 4 },
          text: 'Never lazy-load the image that is the largest element of the first screen: load it at once with `fetchpriority="high"`.',
        },
        {
          when: { scaleAtMost: 2 },
          text: 'Lazy loading is not applied by rule: add `loading="lazy"` only where asked, and still give an image its dimensions when it would otherwise shift the layout.',
        },
      ],
    },
    {
      id: 'perf-responsive-images',
      type: 'single',
      slot: 'perf.responsive-images',
      section: 'Assets and page weight',
      label: {
        en: 'For different screen sizes, an image comes:',
        fr: 'Pour les différentes tailles d’écran, une image est fournie :',
      },
      options: [
        {
          value: 'srcset',
          label: {
            en: 'In several widths, with `srcset` and `sizes`',
            fr: 'En plusieurs largeurs, avec `srcset` et `sizes`',
          },
        },
        {
          value: 'generated',
          label: {
            en: 'In widths generated by the image component or CDN',
            fr: 'En largeurs générées par le composant ou le CDN d’images',
          },
        },
        { value: 'single', label: { en: 'In one size', fr: 'En une seule taille' } },
      ],
      required: false,
      fragments: [
        {
          when: { equals: 'srcset' },
          text: 'Give a content image several widths in `srcset` (for example 400w, 800w, 1600w) and a `sizes` that matches its real layout width, so a small screen never downloads the largest file.',
        },
        {
          when: { equals: 'generated' },
          text: 'Let the image component or CDN generate the widths: pass it the layout size (`sizes` or its equivalent) of each image rather than writing `srcset` by hand.',
        },
        {
          when: { equals: 'single' },
          text: 'Images ship in one size: export each at about twice its largest displayed width at most, never a multi-thousand-pixel original shown at a few hundred pixels.',
        },
      ],
    },
    {
      id: 'perf-critical-css',
      type: 'single',
      slot: 'perf.critical-css',
      section: 'Loading and caching',
      label: {
        en: 'The CSS of the first screen is:',
        fr: 'Le CSS du premier écran est :',
      },
      options: [
        {
          value: 'inlined',
          label: {
            en: 'Inlined in the head, the rest loaded without blocking',
            fr: 'En ligne dans le head, le reste chargé sans bloquer',
          },
        },
        {
          value: 'per-route',
          label: {
            en: 'Part of stylesheets split per route by the bundler',
            fr: 'Dans des feuilles découpées par route par le bundler',
          },
        },
        {
          value: 'one-file',
          label: {
            en: 'In one stylesheet for the whole app',
            fr: 'Dans une seule feuille pour toute l’app',
          },
        },
      ],
      required: false,
      fragments: [
        {
          when: { equals: 'inlined' },
          text: 'Keep the inlined critical CSS to what the first screen needs, about 14 KB at most, and load the rest without blocking rendering; never inline the whole stylesheet, which bloats the HTML and escapes the cache.',
        },
        {
          when: { equals: 'per-route' },
          text: 'CSS is split per route: import a style from the component or route that uses it so it ships with that chunk, and keep only the styles of the app shell in the global stylesheet.',
        },
        {
          when: { equals: 'one-file' },
          text: 'The app ships one stylesheet: keep it small since it blocks the first paint, and do not set up critical-CSS extraction or CSS splitting unasked.',
        },
      ],
    },
    {
      id: 'perf-unused-css',
      type: 'single',
      slot: 'perf.unused-css',
      section: 'Loading and caching',
      label: {
        en: 'Unused CSS is removed:',
        fr: 'Le CSS inutilisé est retiré :',
      },
      options: [
        {
          value: 'build',
          label: {
            en: 'By the build (Tailwind, PurgeCSS, CSS Modules)',
            fr: 'Par le build (Tailwind, PurgeCSS, CSS Modules)',
          },
        },
        { value: 'manual', label: { en: 'By hand', fr: 'À la main' } },
        { value: 'not-removed', label: { en: 'It is not', fr: 'Il ne l’est pas' } },
      ],
      required: false,
      fragments: [
        {
          when: { equals: 'build' },
          text: 'The build drops unused CSS: write class names in full so it can find them (never build one by concatenating strings), and never import a whole CSS framework or theme for a few rules.',
        },
        {
          when: { equals: 'manual' },
          text: 'Nothing removes unused CSS at build time: delete the rules of a component in the same change that deletes or rewrites it, and do not leave dead selectors behind.',
        },
        {
          when: { equals: 'not-removed' },
          text: 'Unused CSS is not removed on this project: do not add a purge step unasked, and do not make it worse by importing a whole stylesheet for a few rules.',
        },
      ],
    },
    {
      id: 'perf-css-rules',
      type: 'multi',
      slot: 'perf.css-rules',
      section: 'Loading and caching',
      label: {
        en: 'In styles, the project refuses:',
        fr: 'Dans les styles, le projet refuse :',
      },
      options: [
        {
          value: 'css-import',
          label: { en: '`@import` in shipped CSS', fr: '`@import` dans le CSS livré' },
        },
        {
          value: 'inline-style',
          label: { en: 'Inline `style` attributes', fr: 'Les attributs `style` en ligne' },
        },
        {
          value: 'runtime-css-in-js',
          label: {
            en: 'CSS-in-JS computed at run time',
            fr: 'Le CSS-in-JS calculé à l’exécution',
          },
        },
        {
          value: 'deep-selectors',
          label: {
            en: 'Deep or highly specific selectors',
            fr: 'Les sélecteurs profonds ou très spécifiques',
          },
        },
        {
          value: 'layout-animations',
          label: {
            en: 'Animations of layout properties',
            fr: 'Les animations de propriétés de mise en page',
          },
        },
        {
          value: 'layout-thrashing',
          label: {
            en: 'Reading layout between DOM writes',
            fr: 'Lire la mise en page entre deux écritures du DOM',
          },
        },
      ],
      required: false,
      fragments: [
        {
          when: { includes: 'css-import' },
          text: 'Never leave an `@import` in a stylesheet that ships: each one adds a download in series; import styles through the bundler so they are concatenated.',
        },
        {
          when: { includes: 'inline-style' },
          text: 'Do not style with the `style` attribute: it is not cached, it duplicates rules and it breaks a strict CSP; use a class, and keep `style` for a value only known at run time.',
        },
        {
          when: { includes: 'runtime-css-in-js' },
          text: 'Do not add CSS-in-JS that computes styles while rendering: use styles extracted at build time.',
        },
        {
          when: { includes: 'deep-selectors' },
          text: 'Select with one simple class: no deep descendant chain, no id or `!important` to win specificity, and no rule duplicated from another component.',
        },
        {
          when: { includes: 'layout-animations' },
          text: 'Animate only `transform` and `opacity`; never `width`, `height`, `top`, `left` or `margin`, which force a layout on every frame and miss the 16 ms a frame has at 60 frames per second.',
        },
        {
          when: { includes: 'layout-thrashing' },
          text: 'Never read layout (`offsetWidth`, `getBoundingClientRect`, `scrollTop`) between DOM writes in a loop: read everything first, then write, or do the writes in `requestAnimationFrame`.',
        },
      ],
    },
    {
      id: 'perf-code-splitting',
      type: 'single',
      slot: 'perf.code-splitting',
      section: 'Loading and caching',
      label: {
        en: 'The JavaScript bundle is split:',
        fr: 'Le bundle JavaScript est découpé :',
      },
      options: [
        { value: 'route', label: { en: 'Per route', fr: 'Par route' } },
        {
          value: 'route-and-heavy',
          label: {
            en: 'Per route, plus heavy components loaded on demand',
            fr: 'Par route, plus les composants lourds chargés à la demande',
          },
        },
        {
          value: 'framework',
          label: { en: 'By the framework, automatically', fr: 'Par le framework, automatiquement' },
        },
        { value: 'none', label: { en: 'It is not split', fr: 'Il n’est pas découpé' } },
      ],
      required: false,
      fragments: [
        {
          when: { equals: 'route' },
          text: 'Load every route with a dynamic `import()` (`lazy` and `Suspense` in React) so the initial bundle holds only the first page: one chunk per page on top of the shared base, and no finer split.',
        },
        {
          when: { equals: 'route-and-heavy' },
          text: 'Load every route with a dynamic `import()`, and also a heavy component that is not shown at once (charts, editor, map); do not split further: dozens of small chunks in cascade slow navigation down.',
        },
        {
          when: { equals: 'framework' },
          text: 'The framework splits the code per route: follow its conventions and its performance guide, use its dynamic import only for a heavy component hidden at first, and do not configure chunks by hand.',
        },
        {
          when: { equals: 'none' },
          text: 'The app ships as one bundle: do not introduce code splitting unasked; say so when a change adds a large library that only one screen uses.',
        },
      ],
    },
    {
      id: 'perf-dependency-weight',
      type: 'scale',
      slot: 'perf.dependency-weight',
      section: 'Loading and caching',
      label: {
        en: 'The weight a dependency adds to the bundle is checked before it is added.',
        fr: 'Le poids qu’une dépendance ajoute au bundle est vérifié avant de l’ajouter.',
      },
      required: false,
      fragments: [
        {
          when: { scaleAtLeast: 4 },
          text: 'Before adding a front-end dependency, check what it adds to the bundle and whether it tree-shakes, prefer a platform API or a lighter library, and import only the functions used, never the whole package.',
        },
        {
          when: { scaleAtLeast: 4 },
          text: 'Judge a script by its uncompressed size too: that is what the browser parses and runs, and it costs most on a phone.',
        },
        {
          when: { scaleAtMost: 2 },
          text: 'Bundle weight does not decide the choice of a library here: pick the one that fits the task; still import only what is used.',
        },
      ],
    },
    {
      id: 'perf-main-thread',
      type: 'scale',
      slot: 'perf.main-thread',
      section: 'Rendering performance',
      label: {
        en: 'No task may hold the main thread for more than 50 ms.',
        fr: 'Aucune tâche ne doit occuper le thread principal plus de 50 ms.',
      },
      required: false,
      fragments: [
        {
          when: { scaleAtLeast: 4 },
          text: 'Keep every task on the main thread under 50 ms: split long work into chunks that yield to the browser, move heavy computation to a Web Worker, and debounce or throttle handlers of scroll, resize and typing.',
        },
        {
          when: { scaleAtMost: 2 },
          text: 'Do not add a worker or task chunking unasked; point out a synchronous computation that visibly freezes an interaction.',
        },
      ],
    },
    {
      id: 'perf-font-hosting',
      type: 'single',
      slot: 'perf.font-hosting',
      section: 'Assets and page weight',
      label: {
        en: 'Web fonts are:',
        fr: 'Les polices web sont :',
      },
      options: [
        {
          value: 'self-hosted',
          label: { en: 'Hosted with the app', fr: 'Hébergées avec l’app' },
        },
        {
          value: 'font-service',
          label: { en: 'Loaded from a font service', fr: 'Chargées depuis un service de polices' },
        },
        {
          value: 'system',
          label: { en: 'Not used: system fonts only', fr: 'Absentes : polices système seulement' },
        },
      ],
      required: false,
      fragments: [
        {
          when: { equals: 'self-hosted' },
          text: 'Serve fonts from the app’s own origin, in WOFF2 only, and preload only the weight the first screen uses, with `as="font"`, `type="font/woff2"` and `crossorigin` (without it the file is downloaded twice).',
        },
        {
          when: { equals: 'font-service' },
          text: 'Fonts come from a font service: keep a `<link rel="preconnect" crossorigin>` to its file domain, request only the weights and character sets in use, and do not add a second font origin.',
        },
        {
          when: { equals: 'system' },
          text: 'The project uses system fonts only: never add a web font, an icon font or a link to a font service; use the existing system font stack.',
        },
      ],
    },
    {
      id: 'perf-font-display',
      type: 'single',
      slot: 'perf.font-display',
      section: 'Assets and page weight',
      label: {
        en: 'While a web font loads, text is shown with `font-display`:',
        fr: 'Pendant le chargement d’une police web, le texte s’affiche avec `font-display` :',
      },
      options: [
        {
          value: 'swap',
          label: {
            en: '`swap`: fallback at once, replaced when the font arrives',
            fr: '`swap` : repli immédiat, remplacé à l’arrivée de la police',
          },
        },
        {
          value: 'optional',
          label: {
            en: '`optional`: the font only if it is already there',
            fr: '`optional` : la police seulement si elle est déjà là',
          },
        },
        {
          value: 'fallback',
          label: {
            en: '`fallback`: short wait, replaced only if fast',
            fr: '`fallback` : courte attente, remplacé seulement si rapide',
          },
        },
      ],
      required: false,
      fragments: [
        {
          when: { equals: 'swap' },
          text: 'Declare every `@font-face` with `font-display: swap`, and tune the fallback font with `size-adjust` so the swap does not shift the layout.',
        },
        {
          when: { equals: 'optional' },
          text: 'Declare every `@font-face` with `font-display: optional`: the layout must look right in the fallback font, since a first visit may never show the web font.',
        },
        {
          when: { equals: 'fallback' },
          text: 'Declare every `@font-face` with `font-display: fallback`, and tune the fallback font with `size-adjust` so a late swap does not shift the layout.',
        },
        {
          when: { answered: true },
          text: 'Never leave a text font on `font-display: block` or without `font-display`: text stays invisible for up to about 3 s; `block` is for icon fonts only.',
        },
      ],
    },
    {
      id: 'perf-font-budget',
      type: 'scale',
      slot: 'perf.font-budget',
      section: 'Assets and page weight',
      label: {
        en: 'I keep font families and weights few and light.',
        fr: 'Je garde peu de familles et de graisses de police, et légères.',
      },
      required: false,
      fragments: [
        {
          when: { scaleAtLeast: 4 },
          text: 'Keep all fonts under 300 KB in total, with at most two families and four weights; ask before adding a family or a weight, and subset each file to the characters in use with `unicode-range`.',
        },
        {
          when: { scaleAtMost: 2 },
          text: 'Use the families and weights the design asks for; still ship each one as a single WOFF2 file and never preload them all.',
        },
      ],
    },
    {
      id: 'perf-cache-headers',
      type: 'single',
      slot: 'perf.cache-headers',
      section: 'Loading and caching',
      label: {
        en: 'HTTP caching of the front end’s files is:',
        fr: 'Le cache HTTP des fichiers du front est :',
      },
      options: [
        {
          value: 'hashed-immutable',
          label: {
            en: 'Hashed assets cached for a year, HTML always revalidated',
            fr: 'Assets hashés en cache un an, HTML toujours revalidé',
          },
        },
        {
          value: 'platform',
          label: { en: 'Set by the hosting platform', fr: 'Réglé par la plateforme d’hébergement' },
        },
        { value: 'not-set', label: { en: 'Not set up', fr: 'Pas en place' } },
      ],
      required: false,
      fragments: [
        {
          when: { equals: 'hashed-immutable' },
          text: 'Serve hashed assets with `Cache-Control: public, max-age=31536000, immutable` and `index.html` with `no-cache` and an `ETag`; never give the HTML a long cache: it would point to bundles that no longer exist.',
        },
        {
          when: { equals: 'hashed-immutable' },
          text: 'Reference every asset through the bundler so its name carries a content hash; a file with a fixed name (in `public/`) must not get the one-year cache.',
        },
        {
          when: { equals: 'platform' },
          text: 'The hosting platform sets the cache headers: do not override them in code or configuration, and reference every asset through the bundler so its name carries a content hash.',
        },
        {
          when: { equals: 'not-set' },
          text: 'Cache headers are not set up: do not add any unasked, and never assume a deployed file is refreshed or kept by the browser.',
        },
        {
          when: { answered: true },
          text: 'A private API response is `Cache-Control: private, no-store`: never let a shared cache or a CDN keep it.',
        },
      ],
    },
    {
      id: 'perf-compression',
      type: 'single',
      slot: 'perf.compression',
      section: 'Loading and caching',
      label: {
        en: 'HTML, CSS and JavaScript are compressed:',
        fr: 'HTML, CSS et JavaScript sont compressés :',
      },
      options: [
        {
          value: 'edge',
          label: {
            en: 'By the CDN or the reverse proxy (Brotli, gzip)',
            fr: 'Par le CDN ou le reverse proxy (Brotli, gzip)',
          },
        },
        {
          value: 'build',
          label: {
            en: 'At build time, as `.br` and `.gz` files',
            fr: 'Au build, en fichiers `.br` et `.gz`',
          },
        },
        { value: 'not-set', label: { en: 'Not set up', fr: 'Pas en place' } },
      ],
      required: false,
      fragments: [
        {
          when: { equals: 'edge' },
          text: 'The CDN or the proxy compresses text with Brotli, then gzip: do not compress in application code, and check that a new text type (JSON, SVG, source map) is in its list of compressed types.',
        },
        {
          when: { equals: 'build' },
          text: 'The build writes `.br` and `.gz` files next to each text asset: keep that step when changing the build, and keep the server serving them with the right `Content-Encoding`.',
        },
        {
          when: { equals: 'not-set' },
          text: 'Text assets are served uncompressed: do not add compression unasked, and say so when a change ships a large text file.',
        },
        {
          when: { answered: true },
          text: 'Ship HTML, CSS and JavaScript minified, never gzip or Brotli an already compressed format (JPEG, WebP, AVIF, WOFF2), and load every resource over HTTPS: no mixed content.',
        },
      ],
    },
    {
      id: 'perf-resource-hints',
      type: 'multi',
      slot: 'perf.resource-hints',
      section: 'Loading and caching',
      label: {
        en: 'Resource hints the pages use:',
        fr: 'Indications de ressources utilisées par les pages :',
      },
      options: [
        {
          value: 'preconnect',
          label: {
            en: '`preconnect` to critical origins (API, CDN, fonts)',
            fr: '`preconnect` vers les origines critiques (API, CDN, polices)',
          },
        },
        {
          value: 'dns-prefetch',
          label: {
            en: '`dns-prefetch` to secondary origins',
            fr: '`dns-prefetch` vers les origines secondaires',
          },
        },
        {
          value: 'preload',
          label: {
            en: '`preload` of first-screen resources',
            fr: '`preload` des ressources du premier écran',
          },
        },
        { value: 'none', label: { en: 'None', fr: 'Aucune' }, exclusive: true },
      ],
      required: false,
      fragments: [
        {
          when: { includes: 'preconnect' },
          text: 'Add a `<link rel="preconnect">` for an origin the first screen needs (API, CDN, fonts) when introducing one, with `crossorigin` when it serves fonts; keep them to a handful and remove the hint with the origin.',
        },
        {
          when: { includes: 'dns-prefetch' },
          text: 'Use `<link rel="dns-prefetch">` for an origin that is used later or only sometimes, rather than a full `preconnect`.',
        },
        {
          when: { includes: 'preload' },
          text: 'Preload only what the first screen needs and the browser finds late (the largest image, the heading font), with the right `as`; every extra preload competes with critical resources.',
        },
        {
          when: { includes: 'none' },
          text: 'The pages use no resource hint: do not add `preconnect`, `dns-prefetch` or `preload` tags unasked.',
        },
      ],
    },
    {
      id: 'perf-memoization',
      type: 'single',
      slot: 'perf.memoization',
      section: 'Rendering performance',
      label: {
        en: '`memo`, `useMemo` and `useCallback` are written:',
        fr: '`memo`, `useMemo` et `useCallback` sont écrits :',
      },
      options: [
        {
          value: 'measured',
          label: {
            en: 'Only where a profile shows a costly re-render',
            fr: 'Seulement là où un profil montre un re-rendu coûteux',
          },
        },
        {
          value: 'compiler',
          label: {
            en: 'Never by hand: the React Compiler does it',
            fr: 'Jamais à la main : le React Compiler s’en charge',
          },
        },
        {
          value: 'default',
          label: {
            en: 'By default on components and callbacks passed down',
            fr: 'Par défaut sur les composants et les callbacks transmis',
          },
        },
      ],
      required: false,
      fragments: [
        {
          when: { equals: 'measured' },
          text: 'Add `memo`, `useMemo` or `useCallback` only where the React DevTools Profiler shows a costly re-render with stable props; comparing props has a cost, so do not wrap by default, and remove one that no longer pays.',
        },
        {
          when: { equals: 'compiler' },
          text: 'The React Compiler memoizes: do not write `memo`, `useMemo` or `useCallback` by hand, and follow the Rules of React (no mutation of props or state, no side effect while rendering) so it can optimize a component.',
        },
        {
          when: { equals: 'default' },
          text: 'Wrap a component that receives props in `memo`, and pass it objects and callbacks kept stable with `useMemo` and `useCallback`; an inline object or function in its props defeats the memoization.',
        },
        {
          when: { answered: true },
          text: 'A re-render costs the computation of the render, not a DOM update: before memoizing, look for the cause (state held too high, a context value rebuilt on each render, an unstable `key`).',
        },
      ],
    },
    {
      id: 'perf-long-lists',
      type: 'single',
      slot: 'perf.long-lists',
      section: 'Rendering performance',
      label: {
        en: 'Long lists and tables are:',
        fr: 'Les longues listes et les grands tableaux sont :',
      },
      options: [
        {
          value: 'virtualized',
          label: {
            en: 'Virtualized (TanStack Virtual, react-window…)',
            fr: 'Virtualisés (TanStack Virtual, react-window…)',
          },
        },
        { value: 'paginated', label: { en: 'Paginated', fr: 'Paginés' } },
        {
          value: 'whole',
          label: {
            en: 'Rendered whole: they stay short',
            fr: 'Rendus en entier : ils restent courts',
          },
        },
      ],
      required: false,
      fragments: [
        {
          when: { equals: 'virtualized' },
          text: 'Render a list or a table that can exceed a few hundred rows with the project’s virtualization library, so only the visible rows (about 30) are in the DOM; give each row a stable `key`.',
        },
        {
          when: { equals: 'paginated' },
          text: 'Never render a collection in full: page it on the server and show one page at a time; do not add a virtualization library unasked.',
        },
        {
          when: { equals: 'whole' },
          text: 'Lists are short and rendered whole: do not add virtualization or pagination unasked; say so when a list can grow past a few hundred rows.',
        },
      ],
    },
    {
      id: 'perf-state-placement',
      type: 'scale',
      slot: 'perf.state-placement',
      section: 'Rendering performance',
      label: {
        en: 'State lives as close as possible to the components that use it.',
        fr: 'L’état vit au plus près des composants qui l’utilisent.',
      },
      required: false,
      fragments: [
        {
          when: { scaleAtLeast: 4 },
          text: 'Keep state in the lowest component that needs it: never the value of a form field in a global store or context; split a context whose value changes often, since every consumer re-renders with it.',
        },
        {
          when: { scaleAtLeast: 4 },
          text: 'Fetch data next to the component that shows it and subscribe to the fields it reads; poll no more often than needed, pause while the tab is hidden, and never poll at the top of the tree.',
        },
        {
          when: { scaleAtMost: 2 },
          text: 'State may be lifted or made global for convenience; still keep a value that changes on every keystroke or every second out of a context the whole page consumes.',
        },
      ],
    },
  ],
} satisfies Questionnaire
