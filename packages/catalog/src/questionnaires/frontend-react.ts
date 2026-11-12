import type { Questionnaire } from '../schemas.ts'

/**
 * Front-end work on a React and TypeScript code base. Questions 1 to 11 are the required core:
 * 2, 4, 5, 10 and 11 record facts about the repository; 1, 3, 7, 8 and 9 are preferences on a
 * 1–5 agreement scale, where 3 produces nothing. The optional `fe-` questions that follow go
 * through the rest of a front end, each feeding its own slot (`frontend.*`, plus `react.*` and
 * `typescript.*` where the question belongs there): script loading and browser support, HTML,
 * CSS and accessibility, TypeScript and React practices, the framework, its routing and its
 * rendering mode, the build and lint tools, what a test asserts and with which tools, browser
 * security, server data, Web Components and service workers, deployment and how the assistant
 * checks its work. Speed (measuring, page weight, memoization, code splitting) belongs to the
 * `frontend-performance` questionnaire.
 *
 * Bump `version` on any change to a question, an option or a fragment; never reuse a removed
 * question id; declare a removed option in `migrations`.
 */
export const frontendReact = {
  id: 'frontend-react',
  version: '1.1.0',
  title: { en: 'Front end: React and TypeScript', fr: 'Front : React et TypeScript' },
  description: {
    en: 'How you write, test, secure and ship a React and TypeScript front end (markup and accessibility, framework and rendering, server data, tools), and what your coding assistant should do the same way.',
    fr: 'Comment vous écrivez, testez, sécurisez et livrez un front React et TypeScript (balisage et accessibilité, framework et rendu, données serveur, outils), et ce que votre assistant de code doit faire de la même façon.',
  },
  sections: [
    'TypeScript',
    'React',
    'HTML, CSS and accessibility',
    'Framework and rendering',
    'Data and API',
    'Front-end security',
  ],
  questions: [
    {
      id: 'ts-any',
      type: 'scale',
      slot: 'typescript.any',
      section: 'TypeScript',
      label: {
        en: 'I forbid `any` and type explicitly, even if it means writing more code.',
        fr: "J'interdis `any` et je type explicitement, quitte à écrire plus de code.",
      },
      required: true,
      fragments: [
        {
          when: { scaleAtLeast: 4 },
          text: 'Never use `any`; prefer `unknown` with narrowing or an explicit type.',
        },
        {
          when: { scaleAtMost: 2 },
          text: '`any` is acceptable at integration boundaries when typing costs more than it brings; keep it local.',
        },
      ],
    },
    {
      id: 'ts-strict',
      type: 'single',
      slot: 'typescript.strict',
      section: 'TypeScript',
      label: {
        en: 'The project enables `strict: true`:',
        fr: 'Le projet active `strict: true` :',
      },
      options: [
        { value: 'all', label: { en: 'Everywhere', fr: 'Partout' } },
        { value: 'partial', label: { en: 'In part of the code', fr: 'Sur une partie du code' } },
        { value: 'none', label: { en: 'Not at all', fr: 'Pas du tout' } },
      ],
      required: true,
      fragments: [
        {
          when: { equals: 'all' },
          text: 'The code base is TypeScript `strict`: never loosen compiler options or silence errors with `@ts-ignore`.',
        },
        {
          when: { equals: 'partial' },
          text: 'Strict TypeScript is being adopted: write new and touched code so that it passes `strict`.',
        },
        {
          when: { equals: 'none' },
          text: 'TypeScript runs without `strict`: do not turn it on as a side effect of another change.',
        },
      ],
    },
    {
      id: 'components-size',
      type: 'scale',
      slot: 'react.granularity',
      section: 'React',
      label: {
        en: 'I prefer many small components to a few large ones.',
        fr: 'Je préfère beaucoup de petits composants à quelques gros.',
      },
      required: true,
      fragments: [
        {
          when: { scaleAtLeast: 4 },
          text: 'Keep components small and focused; extract a component as soon as a part has its own state or responsibility.',
        },
        {
          when: { scaleAtMost: 2 },
          text: 'Keep a screen in a few cohesive components; do not split a component only to make it shorter.',
        },
      ],
    },
    {
      id: 'state-management',
      type: 'single',
      slot: 'react.state',
      section: 'React',
      label: {
        en: 'For shared state, the project uses:',
        fr: "Pour l'état partagé, le projet utilise :",
      },
      options: [
        {
          value: 'tanstack-query-only',
          label: { en: 'TanStack Query only', fr: 'TanStack Query seulement' },
        },
        { value: 'zustand', label: { en: 'Zustand', fr: 'Zustand' } },
        { value: 'redux', label: { en: 'Redux', fr: 'Redux' } },
        { value: 'context', label: { en: 'React context', fr: 'Le contexte React' } },
        { value: 'other', label: { en: 'Something else', fr: 'Autre chose' }, freeText: true },
      ],
      required: true,
      fragments: [
        {
          when: { equals: 'tanstack-query-only' },
          text: 'Server state lives in TanStack Query; keep other state local to components and add no state library.',
        },
        {
          when: { equals: 'zustand' },
          text: 'Shared client state lives in Zustand stores; do not add another state library.',
        },
        {
          when: { equals: 'redux' },
          text: 'Shared client state lives in Redux; follow the existing slices and do not add another state library.',
        },
        {
          when: { equals: 'context' },
          text: 'Shared state goes through React context; do not add a state library.',
        },
        {
          when: { other: true },
          text: 'Shared state is handled with {value}; do not add another state library.',
        },
      ],
    },
    {
      id: 'styling',
      type: 'single',
      slot: 'react.styling',
      section: 'React',
      label: { en: 'For styling, the project uses:', fr: 'Pour le style, le projet utilise :' },
      options: [
        { value: 'tailwind', label: { en: 'Tailwind CSS', fr: 'Tailwind CSS' } },
        { value: 'css-modules', label: { en: 'CSS Modules', fr: 'CSS Modules' } },
        { value: 'styled-components', label: { en: 'styled-components', fr: 'styled-components' } },
        { value: 'vanilla-extract', label: { en: 'vanilla-extract', fr: 'vanilla-extract' } },
        { value: 'other', label: { en: 'Something else', fr: 'Autre chose' }, freeText: true },
      ],
      required: true,
      fragments: [
        {
          when: { equals: 'tailwind' },
          text: 'Style with Tailwind utility classes; do not add CSS files or inline styles.',
        },
        {
          when: { equals: 'css-modules' },
          text: 'Style with a CSS Module next to the component; do not add global CSS.',
        },
        {
          when: { equals: 'styled-components' },
          text: 'Style with styled-components; do not add CSS files or another styling library.',
        },
        {
          when: { equals: 'vanilla-extract' },
          text: 'Style with vanilla-extract `.css.ts` files; do not add another styling library.',
        },
        {
          when: { other: true },
          text: 'Style with {value}; do not add another styling library.',
        },
      ],
    },
    {
      id: 'tests-level',
      type: 'multi',
      slot: 'testing.levels',
      section: 'Testing',
      label: { en: 'The assistant writes tests:', fr: "L'assistant écrit des tests :" },
      options: [
        { value: 'unit', label: { en: 'Unit', fr: 'Unitaires' } },
        { value: 'component', label: { en: 'Component', fr: 'De composants' } },
        { value: 'e2e', label: { en: 'End-to-end', fr: 'De bout en bout' } },
        { value: 'none', label: { en: 'None', fr: 'Aucun' }, exclusive: true },
      ],
      required: true,
      fragments: [
        {
          when: { includes: 'unit' },
          text: 'Add or update unit tests for every change in logic.',
        },
        {
          when: { includes: 'component' },
          text: 'Add or update component tests for every change in a component’s behaviour.',
        },
        {
          when: { includes: 'e2e' },
          text: 'Add or update an end-to-end test when a user journey changes.',
        },
        {
          when: { includes: 'none' },
          text: 'Do not write tests unless asked to.',
        },
      ],
    },
    {
      id: 'comments',
      type: 'scale',
      slot: 'style.comments',
      section: 'Working style',
      label: {
        en: 'A comment explains why, never what the code does.',
        fr: 'Un commentaire explique le pourquoi, jamais ce que fait le code.',
      },
      required: true,
      fragments: [
        {
          when: { scaleAtLeast: 4 },
          text: 'Comment only to explain why; never restate what the code does.',
        },
        {
          when: { scaleAtMost: 2 },
          text: 'Comment non-obvious code, including what it does, so that it reads without its context.',
        },
      ],
    },
    {
      id: 'change-size',
      type: 'scale',
      slot: 'workflow.changes',
      section: 'Workflow',
      label: {
        en: 'I prefer small, frequent changes to large pull requests.',
        fr: 'Je préfère des changements petits et fréquents à de grosses PR.',
      },
      required: true,
      fragments: [
        {
          when: { scaleAtLeast: 4 },
          text: 'Keep each change small and focused on one concern; split larger work into steps that each stand alone.',
        },
        {
          when: { scaleAtMost: 2 },
          text: 'Deliver a feature as one complete change rather than a series of partial steps.',
        },
      ],
    },
    {
      id: 'ask-before-act',
      type: 'scale',
      slot: 'workflow.autonomy',
      section: 'Workflow',
      label: {
        en: 'The assistant asks me before a structural decision rather than choosing alone.',
        fr: "L'assistant me pose une question avant une décision structurante plutôt que de choisir seul.",
      },
      required: true,
      fragments: [
        {
          when: { scaleAtLeast: 4 },
          text: 'Ask before any structural decision (new dependency, new pattern, data model or public API change).',
        },
        {
          when: { scaleAtMost: 2 },
          text: 'Make structural decisions yourself when needed, and explain them when handing back.',
        },
      ],
    },
    {
      id: 'package-manager',
      type: 'single',
      slot: 'tooling.package-manager',
      section: 'Tooling',
      label: { en: 'Package manager:', fr: 'Gestionnaire de paquets :' },
      options: [
        { value: 'pnpm', label: { en: 'pnpm', fr: 'pnpm' } },
        { value: 'npm', label: { en: 'npm', fr: 'npm' } },
        { value: 'yarn', label: { en: 'Yarn', fr: 'Yarn' } },
        { value: 'bun', label: { en: 'Bun', fr: 'Bun' } },
      ],
      required: true,
      fragments: [
        {
          when: { answered: true },
          text: 'Use {value} for every install and script; never another package manager.',
        },
      ],
    },
    {
      id: 'checks',
      type: 'text',
      slot: 'tooling.checks',
      section: 'Tooling',
      label: {
        en: 'Commands to run before handing back (lint, types, tests):',
        fr: 'Commandes à lancer avant de rendre la main (lint, types, tests) :',
      },
      required: false,
      fragments: [{ when: { answered: true }, text: 'Before handing back, run: {value}.' }],
    },
    {
      id: 'fe-script-loading',
      type: 'scale',
      slot: 'frontend.script-loading',
      section: 'HTML, CSS and accessibility',
      label: {
        en: 'No script blocks the parsing of the page: each one is a module, `defer` or `async`.',
        fr: "Aucun script ne bloque l'analyse de la page : chacun est un module, `defer` ou `async`.",
      },
      required: false,
      fragments: [
        {
          when: { scaleAtLeast: 4 },
          text: 'Never add a classic blocking `<script>` to the `<head>`: load application code with `type="module"` or `defer`, and use `async` only for an independent script such as analytics, whose execution order is not guaranteed.',
        },
        {
          when: { scaleAtMost: 2 },
          text: 'Keep the script tags as the pages already load them; do not convert them to `defer`, `async` or modules as a side effect of another change.',
        },
      ],
    },
    {
      id: 'fe-animations',
      type: 'scale',
      slot: 'frontend.animations',
      section: 'HTML, CSS and accessibility',
      label: {
        en: 'An animation only changes `transform` and `opacity`, never a size or a position.',
        fr: 'Une animation ne change que `transform` et `opacity`, jamais une taille ou une position.',
      },
      required: false,
      fragments: [
        {
          when: { scaleAtLeast: 4 },
          text: 'Animate only `transform` and `opacity`, which the browser composites without layout or paint; never animate `width`, `height`, `top`, `left` or `margin`, and honour `prefers-reduced-motion`.',
        },
        {
          when: { scaleAtMost: 2 },
          text: 'Animating a size or a position is accepted on a small isolated element; never on a list, a table or a container that makes the rest of the page reflow.',
        },
      ],
    },
    {
      id: 'fe-browser-support',
      type: 'single',
      slot: 'frontend.browser-support',
      section: 'Framework and rendering',
      label: { en: 'The front end supports:', fr: 'Le front prend en charge :' },
      options: [
        {
          value: 'evergreen',
          label: {
            en: 'Current versions of evergreen browsers',
            fr: 'Les versions actuelles des navigateurs à mise à jour continue',
          },
        },
        {
          value: 'browserslist',
          label: {
            en: 'The browsers of the browserslist configuration',
            fr: 'Les navigateurs de la configuration browserslist',
          },
        },
        {
          value: 'legacy',
          label: { en: 'Old browsers too', fr: 'Aussi de vieux navigateurs' },
        },
      ],
      required: false,
      fragments: [
        {
          when: { equals: 'evergreen' },
          text: 'Target the current versions of evergreen browsers: use modern JavaScript, CSS and Web APIs directly, and add no polyfill or fallback for old browsers.',
        },
        {
          when: { equals: 'browserslist' },
          text: 'Supported browsers are listed in the browserslist configuration: check that a JavaScript, CSS or Web API feature is available in all of them before using it, and say when it is not.',
        },
        {
          when: { equals: 'legacy' },
          text: 'Old browsers are supported: before using a recent JavaScript, CSS or Web API feature, check its support and add the polyfill or fallback the project already uses for such cases.',
        },
      ],
    },
    {
      id: 'fe-semantic-html',
      type: 'scale',
      slot: 'frontend.semantic-html',
      section: 'HTML, CSS and accessibility',
      label: {
        en: 'I use the native HTML element for the job before a `div` with a role.',
        fr: "J'utilise l'élément HTML natif qui convient avant un `div` avec un rôle.",
      },
      required: false,
      fragments: [
        {
          when: { scaleAtLeast: 4 },
          text: 'Use the native element for the job (`button`, `a`, `nav`, `main`, `header`, `table`, `label`): never a clickable `div`, always `type="button"` on a button that does not submit, and an ARIA role only when no native element fits.',
        },
        {
          when: { scaleAtMost: 2 },
          text: 'Generic elements are accepted where the component library needs them; give each interactive one a role, `tabindex="0"` and keyboard handlers for Enter and Space.',
        },
      ],
    },
    {
      id: 'fe-accessibility',
      type: 'single',
      slot: 'frontend.accessibility',
      section: 'HTML, CSS and accessibility',
      label: {
        en: 'The accessibility level the interface must reach:',
        fr: "Le niveau d'accessibilité que l'interface doit atteindre :",
      },
      options: [
        { value: 'wcag-aa', label: { en: 'WCAG 2.2 AA', fr: 'WCAG 2.2 AA' } },
        {
          value: 'basics',
          label: {
            en: 'The basics: labels, keyboard, visible focus',
            fr: 'Les bases : labels, clavier, focus visible',
          },
        },
        { value: 'none', label: { en: 'No stated goal', fr: 'Aucun objectif fixé' } },
      ],
      required: false,
      fragments: [
        {
          when: { equals: 'wcag-aa' },
          text: 'Meet WCAG 2.2 AA: contrast of 4.5:1 for text and 3:1 for large text and interface elements, targets of at least 24 x 24 px, a `<label>` for every field, an `aria-label` on every icon button, and no state shown by colour alone.',
        },
        {
          when: { equals: 'wcag-aa' },
          text: 'Everything must be reachable and usable with the keyboard, in a logical Tab order, with a visible focus: never write `outline: none` without a replacement focus style.',
        },
        {
          when: { equals: 'basics' },
          text: 'Keep the accessibility basics: a label for every field, an accessible name on every icon button, everything reachable with Tab, and never `outline: none` without a replacement focus style.',
        },
        {
          when: { equals: 'none' },
          text: 'Accessibility has no stated goal here: do not rework markup or add ARIA attributes for it unasked, and never remove the labels, roles or focus styles that exist.',
        },
      ],
    },
    {
      id: 'fe-css',
      type: 'multi',
      slot: 'frontend.css',
      section: 'HTML, CSS and accessibility',
      label: { en: 'In its styles, the project:', fr: 'Dans ses styles, le projet :' },
      options: [
        {
          value: 'tokens',
          label: {
            en: 'Takes colours, spacing and sizes from design tokens',
            fr: 'Prend couleurs, espacements et tailles dans des design tokens',
          },
        },
        {
          value: 'flex-grid',
          label: {
            en: 'Lays out with flexbox and grid only',
            fr: 'Met en page avec flexbox et grid uniquement',
          },
        },
        {
          value: 'mobile-first',
          label: { en: 'Is written mobile first', fr: "Est écrit d'abord pour mobile" },
        },
        {
          value: 'dark-mode',
          label: { en: 'Has a dark theme', fr: 'A un thème sombre' },
        },
      ],
      required: false,
      fragments: [
        {
          when: { includes: 'tokens' },
          text: 'Take every colour, spacing and font size from the design tokens (CSS variables or the theme configuration); never write a raw hex colour or a one-off pixel value, and add a token when one is missing.',
        },
        {
          when: { includes: 'flex-grid' },
          text: 'Lay out with flexbox for one axis and grid for rows and columns together; never floats, tables for layout, or absolute positioning and fixed pixel widths to place page content.',
        },
        {
          when: { includes: 'mobile-first' },
          text: 'Write styles for the narrow screen first and add wider breakpoints on top with the breakpoints the project defines; check every new screen at phone width.',
        },
        {
          when: { includes: 'dark-mode' },
          text: 'Every screen has a light and a dark theme: use the theme variables for colours, never a colour that only works on one background, and check both themes after a visual change.',
        },
      ],
    },
    {
      id: 'fe-runtime-validation',
      type: 'single',
      slot: 'frontend.runtime-validation',
      section: 'TypeScript',
      label: {
        en: 'Data that enters the front end (API responses, forms, URL, storage) is checked at runtime with:',
        fr: "Les données qui entrent dans le front (réponses d'API, formulaires, URL, stockage) sont vérifiées à l'exécution avec :",
      },
      options: [
        { value: 'zod', label: { en: 'Zod', fr: 'Zod' } },
        { value: 'valibot', label: { en: 'Valibot', fr: 'Valibot' } },
        {
          value: 'generated',
          label: {
            en: 'Nothing: types are generated from the API schema',
            fr: "Rien : les types sont générés depuis le schéma de l'API",
          },
        },
        { value: 'none', label: { en: 'Nothing', fr: 'Rien' } },
        { value: 'other', label: { en: 'Something else', fr: 'Autre chose' }, freeText: true },
      ],
      required: false,
      fragments: [
        {
          when: { equals: 'zod' },
          text: 'Validate data that enters the front end (API responses, form values, URL parameters, storage, environment) with a Zod schema at the boundary, and infer the TypeScript type from the schema; never type such data with `as`.',
        },
        {
          when: { equals: 'valibot' },
          text: 'Validate data that enters the front end (API responses, form values, URL parameters, storage, environment) with a Valibot schema at the boundary, and infer the TypeScript type from the schema; never type such data with `as`.',
        },
        {
          when: { equals: 'generated' },
          text: 'API types are generated from the API schema: regenerate them when the API changes, never edit them or redeclare a response type by hand, and do not add a runtime validation library unasked.',
        },
        {
          when: { equals: 'none' },
          text: 'External data is not validated at runtime: do not add a validation library unasked, but narrow by hand where a wrong shape would break the screen, since a type written with `as` proves nothing about the data.',
        },
        {
          when: { other: true },
          text: 'Validate data that enters the front end with {value} at the boundary; never type such data with `as`.',
        },
      ],
    },
    {
      id: 'fe-state-modeling',
      type: 'scale',
      slot: 'typescript.state-modeling',
      section: 'TypeScript',
      label: {
        en: 'A value with several states is a discriminated union, not an object of optional fields and booleans.',
        fr: 'Une valeur à plusieurs états est une union discriminée, pas un objet de champs optionnels et de booléens.',
      },
      required: false,
      fragments: [
        {
          when: { scaleAtLeast: 4 },
          text: 'Model a value with several states as a discriminated union on a literal field such as `status`, so that a field exists only in the state that has it; narrow on that field, check exhaustiveness with `never`, and never use `as` or `!` to reach a field.',
        },
        {
          when: { scaleAtMost: 2 },
          text: 'Keep the object shapes the code base uses, with optional fields and flags; do not rewrite them into discriminated unions unasked.',
        },
      ],
    },
    {
      id: 'fe-request-cancellation',
      type: 'scale',
      slot: 'frontend.request-cancellation',
      section: 'Data and API',
      label: {
        en: 'A request whose answer is no longer needed is cancelled.',
        fr: "Une requête dont la réponse n'est plus utile est annulée.",
      },
      required: false,
      fragments: [
        {
          when: { scaleAtLeast: 4 },
          text: 'Pass an `AbortSignal` to every `fetch` started from a component, a hook or a query function, and abort when the component unmounts or its inputs change, so that a late answer never writes stale state.',
        },
        {
          when: { scaleAtMost: 2 },
          text: 'Do not add request cancellation everywhere; at least ignore the answer of a request whose component unmounted or whose inputs changed since it started.',
        },
      ],
    },
    {
      id: 'fe-hooks',
      type: 'scale',
      slot: 'react.hooks',
      section: 'React',
      label: {
        en: 'The rules of React are never bent: pure render, hooks at the top level, stable keys.',
        fr: 'Les règles de React ne sont jamais contournées : rendu pur, hooks au premier niveau, clés stables.',
      },
      required: false,
      fragments: [
        {
          when: { scaleAtLeast: 4 },
          text: 'Keep render pure and never mutate props or state; call hooks at the top level, never in a condition, a loop or after an early return; key every list item with a stable id from the data, never the array index or a random value.',
        },
        {
          when: { scaleAtMost: 2 },
          text: 'An index key is accepted for a static list that is never sorted, filtered or edited; everywhere else use a stable id from the data, and always call hooks at the top level.',
        },
      ],
    },
    {
      id: 'fe-effects',
      type: 'scale',
      slot: 'react.effects',
      section: 'React',
      label: {
        en: '`useEffect` only synchronises with something outside React, never derives or copies data.',
        fr: "`useEffect` sert seulement à se synchroniser avec l'extérieur de React, jamais à dériver ou copier des données.",
      },
      required: false,
      fragments: [
        {
          when: { scaleAtLeast: 4 },
          text: 'Use `useEffect` only to synchronise with an external system (subscription, timer, DOM API) and return its cleanup; compute derived values during render, react to user actions in event handlers, and never copy props or server data into state through an effect.',
        },
        {
          when: { scaleAtMost: 2 },
          text: 'An effect that derives or copies state is accepted where the code already works that way; list every dependency, return a cleanup when it subscribes, and never silence the hooks lint rule.',
        },
      ],
    },
    {
      id: 'fe-forms',
      type: 'single',
      slot: 'react.forms',
      section: 'React',
      label: { en: 'Forms are built with:', fr: 'Les formulaires sont construits avec :' },
      options: [
        { value: 'tanstack-form', label: { en: 'TanStack Form', fr: 'TanStack Form' } },
        { value: 'react-hook-form', label: { en: 'React Hook Form', fr: 'React Hook Form' } },
        { value: 'formik', label: { en: 'Formik', fr: 'Formik' } },
        {
          value: 'native',
          label: {
            en: 'React state or native forms, no library',
            fr: 'L’état React ou les formulaires natifs, sans bibliothèque',
          },
        },
        { value: 'other', label: { en: 'Something else', fr: 'Autre chose' }, freeText: true },
      ],
      required: false,
      fragments: [
        {
          when: { equals: 'tanstack-form' },
          text: 'Build forms with TanStack Form and validate them with a schema; do not keep field values in `useState` or add another form library.',
        },
        {
          when: { equals: 'react-hook-form' },
          text: 'Build forms with React Hook Form and its schema resolver; do not keep field values in `useState` or add another form library.',
        },
        {
          when: { equals: 'formik' },
          text: 'Build forms with Formik and its validation schema, as the existing forms do; do not add another form library.',
        },
        {
          when: { equals: 'native' },
          text: 'Build forms with React state or native form submission and `FormData`, as the existing forms do; do not add a form library.',
        },
        {
          when: { other: true },
          text: 'Build forms with {value}; do not add another form library.',
        },
        {
          when: { answered: true },
          text: 'Keep client-side validation in line with the rules the server enforces, show each error next to its field, keep what the user typed after a failed submit, and still handle the errors the server returns.',
        },
      ],
    },
    {
      id: 'fe-error-boundaries',
      type: 'single',
      slot: 'react.error-boundaries',
      section: 'React',
      label: {
        en: 'A rendering error is caught by an error boundary:',
        fr: 'Une erreur de rendu est attrapée par un error boundary :',
      },
      options: [
        { value: 'route', label: { en: 'Around each route', fr: 'Autour de chaque route' } },
        {
          value: 'section',
          label: {
            en: 'Around each independent part of a screen',
            fr: "Autour de chaque partie indépendante d'un écran",
          },
        },
        { value: 'root', label: { en: 'Once, at the root', fr: 'Une seule fois, à la racine' } },
        { value: 'none', label: { en: 'Nowhere', fr: 'Nulle part' } },
      ],
      required: false,
      fragments: [
        {
          when: { equals: 'route' },
          text: "Each route has an error boundary (or the router's error element): give a new route one, with a message and a way to retry; a boundary does not catch errors from event handlers or asynchronous code, so handle those where they happen.",
        },
        {
          when: { equals: 'section' },
          text: 'Wrap each independent part of a screen in its own error boundary so that one failing widget leaves the rest usable, with a fallback and a retry; handle errors from event handlers and asynchronous code where they happen.',
        },
        {
          when: { equals: 'root' },
          text: 'One error boundary at the root catches rendering errors: do not add finer ones unasked, and handle errors from event handlers and asynchronous code where they happen, since a boundary does not catch them.',
        },
        {
          when: { equals: 'none' },
          text: 'The app has no error boundary: do not add one unasked, and say so when a change makes a rendering error likely.',
        },
      ],
    },
    {
      id: 'fe-framework',
      type: 'single',
      slot: 'frontend.framework',
      section: 'Framework and rendering',
      label: { en: 'The application is built with:', fr: "L'application est construite avec :" },
      options: [
        {
          value: 'vite-spa',
          label: {
            en: 'React and Vite, no application framework',
            fr: 'React et Vite, sans framework applicatif',
          },
        },
        { value: 'next', label: { en: 'Next.js', fr: 'Next.js' } },
        {
          value: 'react-router',
          label: {
            en: 'React Router in framework mode (or Remix)',
            fr: 'React Router en mode framework (ou Remix)',
          },
        },
        { value: 'tanstack-start', label: { en: 'TanStack Start', fr: 'TanStack Start' } },
        { value: 'astro', label: { en: 'Astro', fr: 'Astro' } },
        { value: 'other', label: { en: 'Something else', fr: 'Autre chose' }, freeText: true },
      ],
      required: false,
      fragments: [
        {
          when: { equals: 'vite-spa' },
          text: 'The app is a client-side React application built with Vite: do not introduce an application framework, server components or code that needs a server at runtime.',
        },
        {
          when: { equals: 'next' },
          text: 'The app runs on Next.js: follow its file conventions and the router the project already uses, keep server-only code out of client components, and make a component a client one only when it needs state, effects or browser APIs.',
        },
        {
          when: { equals: 'react-router' },
          text: 'The app runs on React Router in framework mode: load data in route loaders and write it in actions, following the route modules already there; do not fetch in an effect what a loader can provide.',
        },
        {
          when: { equals: 'tanstack-start' },
          text: 'The app runs on TanStack Start: load data in route loaders, put server logic in server functions with validated input, and never edit the generated route tree by hand.',
        },
        {
          when: { equals: 'astro' },
          text: 'The site is built with Astro: render to static HTML by default, add client JavaScript only for an interactive island with the lightest `client:` directive that works, and do not turn pages into a single-page application.',
        },
        {
          when: { other: true },
          text: 'The app is built with {value}: follow its conventions and do not introduce another framework.',
        },
        {
          when: { answered: true },
          text: 'Never propose to change the UI library or the application framework to solve a task, and never on the strength of a benchmark; when the current one cannot do something, say so and ask.',
        },
      ],
    },
    {
      id: 'fe-routing',
      type: 'single',
      slot: 'frontend.routing',
      section: 'Framework and rendering',
      label: { en: 'Routes are defined with:', fr: 'Les routes sont définies avec :' },
      options: [
        {
          value: 'framework',
          label: {
            en: 'The file-based routing of the framework',
            fr: 'Le routage par fichiers du framework',
          },
        },
        { value: 'react-router', label: { en: 'React Router', fr: 'React Router' } },
        { value: 'tanstack-router', label: { en: 'TanStack Router', fr: 'TanStack Router' } },
        { value: 'none', label: { en: 'No router', fr: 'Aucun routeur' } },
        { value: 'other', label: { en: 'Something else', fr: 'Autre chose' }, freeText: true },
      ],
      required: false,
      fragments: [
        {
          when: { equals: 'framework' },
          text: "Routes come from the framework's file-based routing: add a route by adding a file where the others are, navigate with the framework's link component, and never add a second router.",
        },
        {
          when: { equals: 'react-router' },
          text: 'Routes are declared with React Router: add a route next to the existing ones, and navigate with `<Link>` or `useNavigate`, never `window.location` or a plain `<a>` to an internal page.',
        },
        {
          when: { equals: 'tanstack-router' },
          text: 'Routes are declared with TanStack Router: keep them typed, validate search params in the route definition, load data in the route loader, and navigate with its `Link` and `useNavigate`, never `window.location`.',
        },
        {
          when: { equals: 'none' },
          text: 'The app has no router: do not add one unasked; say so when a change needs a screen with its own URL.',
        },
        {
          when: { other: true },
          text: 'Routes are declared with {value}: add a route next to the existing ones and never add a second router.',
        },
      ],
    },
    {
      id: 'fe-url-state',
      type: 'scale',
      slot: 'frontend.url-state',
      section: 'Framework and rendering',
      label: {
        en: 'Filters, sorting, pagination and the open tab live in the URL.',
        fr: "Les filtres, le tri, la pagination et l'onglet ouvert vivent dans l'URL.",
      },
      required: false,
      fragments: [
        {
          when: { scaleAtLeast: 4 },
          text: 'Keep filters, sorting, pagination and the selected tab in the URL search params, validated when read, so that a reload or a shared link restores the screen; never mirror them in component state.',
        },
        {
          when: { scaleAtMost: 2 },
          text: 'Keep view state (filters, sorting, open tab) in component state; put in the URL only what identifies the page.',
        },
      ],
    },
    {
      id: 'fe-rendering',
      type: 'single',
      slot: 'frontend.rendering',
      section: 'Framework and rendering',
      label: { en: 'Pages are rendered:', fr: 'Les pages sont rendues :' },
      options: [
        {
          value: 'client',
          label: {
            en: 'In the browser only (single-page application)',
            fr: 'Dans le navigateur seulement (application monopage)',
          },
        },
        {
          value: 'server',
          label: {
            en: 'On the server at each request, then hydrated',
            fr: 'Sur le serveur à chaque requête, puis hydratées',
          },
        },
        {
          value: 'static',
          label: { en: 'At build time (static generation)', fr: 'Au build (génération statique)' },
        },
        {
          value: 'mixed',
          label: { en: 'In a mode chosen per route', fr: 'Dans un mode choisi par route' },
        },
      ],
      required: false,
      fragments: [
        {
          when: { equals: 'client' },
          text: 'Pages render in the browser only: do not add server rendering, static generation or server-only code unasked, and say so when a page needs to be indexed by search engines.',
        },
        {
          when: { equals: 'server' },
          text: 'Pages are rendered on the server at each request, then hydrated: code that runs during render must work without `window`, `document` or storage, and data needed for the first paint is loaded on the server, not in an effect.',
        },
        {
          when: { equals: 'static' },
          text: 'Pages are generated at build time: read their data at build, not per request, ship client JavaScript only for the interactive parts, and say when a change needs per-request rendering or a revalidation rule.',
        },
        {
          when: { equals: 'mixed' },
          text: 'The rendering mode is chosen per route: keep the mode a route already has; for a new one, pick static for content that rarely changes, server rendering for public dynamic content, client rendering behind sign-in, and say which you picked.',
        },
      ],
    },
    {
      id: 'fe-hydration',
      type: 'scale',
      slot: 'frontend.hydration',
      section: 'Framework and rendering',
      label: {
        en: 'When a page is rendered on the server, the first client render produces exactly the same HTML.',
        fr: 'Quand une page est rendue côté serveur, le premier rendu client produit exactement le même HTML.',
      },
      required: false,
      fragments: [
        {
          when: { scaleAtLeast: 4 },
          text: 'In server-rendered code, never read `Date.now()`, `Math.random()`, the locale or time zone, `window` or storage during render: pass the value from the server or set it in an effect, and fix a hydration warning instead of silencing it.',
        },
        {
          when: { scaleAtMost: 2 },
          text: 'A hydration mismatch is accepted on a leaf text node such as a date, marked with `suppressHydrationWarning`; never on an element that has children or changes the layout.',
        },
      ],
    },
    {
      id: 'fe-bundler',
      type: 'single',
      slot: 'frontend.bundler',
      section: 'Tooling',
      label: { en: 'The front end is built with:', fr: 'Le front est construit avec :' },
      options: [
        { value: 'vite', label: { en: 'Vite', fr: 'Vite' } },
        { value: 'webpack', label: { en: 'webpack', fr: 'webpack' } },
        {
          value: 'framework',
          label: { en: 'The build of the framework', fr: 'Le build du framework' },
        },
        { value: 'other', label: { en: 'Something else', fr: 'Autre chose' }, freeText: true },
      ],
      required: false,
      fragments: [
        {
          when: { equals: 'vite' },
          text: 'The build is Vite: put build settings in the existing Vite configuration, import assets through the bundler so that their file names are hashed, and never add a second bundler.',
        },
        {
          when: { equals: 'webpack' },
          text: 'The build is webpack: change the existing configuration and its loaders rather than adding a tool beside it, and do not migrate to another bundler unasked.',
        },
        {
          when: { equals: 'framework' },
          text: "The framework's own build is used: configure it through the framework's configuration file only, and never add a bundler or a custom build step beside it.",
        },
        {
          when: { other: true },
          text: 'The build is {value}: change its existing configuration and never add a second bundler.',
        },
        {
          when: { answered: true },
          text: 'A passing build does not prove the types: the transpiler strips them unchecked, so run the type checker (`tsc --noEmit` or the project script) as well as the build, and check a build-related change in a production build, not only in the dev server.',
        },
      ],
    },
    {
      id: 'fe-lint-format',
      type: 'single',
      slot: 'frontend.lint-format',
      section: 'Tooling',
      label: {
        en: 'Linting and formatting are done by:',
        fr: 'Le lint et la mise en forme sont faits par :',
      },
      options: [
        {
          value: 'eslint-prettier',
          label: { en: 'ESLint and Prettier', fr: 'ESLint et Prettier' },
        },
        { value: 'biome', label: { en: 'Biome', fr: 'Biome' } },
        { value: 'eslint', label: { en: 'ESLint alone', fr: 'ESLint seul' } },
        { value: 'none', label: { en: 'Nothing', fr: 'Rien' } },
        { value: 'other', label: { en: 'Something else', fr: 'Autre chose' }, freeText: true },
      ],
      required: false,
      fragments: [
        {
          when: { equals: 'eslint-prettier' },
          text: 'ESLint reports problems and Prettier formats: run both on the files you change, never format by hand against Prettier, never add a formatting rule to ESLint, and add no other linter or formatter.',
        },
        {
          when: { equals: 'biome' },
          text: 'Biome lints and formats: run it on the files you change and fix what it reports; do not add ESLint, Prettier or their configuration files.',
        },
        {
          when: { equals: 'eslint' },
          text: 'ESLint lints and no formatter runs: fix what it reports, follow the formatting of the surrounding code, and do not reformat lines you do not otherwise change.',
        },
        {
          when: { equals: 'none' },
          text: 'No linter or formatter is set up: follow the style of the surrounding code, do not reformat lines you do not otherwise change, and do not add a tool unasked.',
        },
        {
          when: { other: true },
          text: 'Lint and format with {value}: run it on the files you change and add no other linter or formatter.',
        },
      ],
    },
    {
      id: 'fe-lint-suppressions',
      type: 'scale',
      slot: 'frontend.lint-suppressions',
      section: 'Tooling',
      label: {
        en: 'A lint error is fixed, never silenced with a disable comment.',
        fr: 'Une erreur de lint se corrige, elle ne se fait jamais taire par un commentaire.',
      },
      required: false,
      fragments: [
        {
          when: { scaleAtLeast: 4 },
          text: 'Fix the code a lint rule reports: never add a disable or ignore comment, and never turn a rule off or loosen the configuration to make a change pass.',
        },
        {
          when: { scaleAtMost: 2 },
          text: 'A lint rule may be disabled on one line when following it makes the code worse: put the reason in the same comment, and never disable a rule for a whole file or in the configuration.',
        },
      ],
    },
    {
      id: 'fe-test-runner',
      type: 'single',
      slot: 'frontend.test-runner',
      section: 'Testing',
      label: {
        en: 'Unit and component tests run with:',
        fr: 'Les tests unitaires et de composants tournent avec :',
      },
      options: [
        { value: 'vitest', label: { en: 'Vitest', fr: 'Vitest' } },
        { value: 'jest', label: { en: 'Jest', fr: 'Jest' } },
        { value: 'none', label: { en: 'No test runner', fr: 'Aucun lanceur de tests' } },
        { value: 'other', label: { en: 'Something else', fr: 'Autre chose' }, freeText: true },
      ],
      required: false,
      fragments: [
        {
          when: { equals: 'vitest' },
          text: 'Tests run with Vitest: write them like the existing ones (same file naming, same imports or globals), mock with `vi`, and never add Jest or its configuration.',
        },
        {
          when: { equals: 'jest' },
          text: 'Tests run with Jest: write them like the existing ones, mock with `jest`, and do not migrate to another runner or add one beside it.',
        },
        {
          when: { equals: 'none' },
          text: 'No test runner is installed: do not add one unasked; say which logic would deserve a test.',
        },
        {
          when: { other: true },
          text: 'Tests run with {value}: write them like the existing ones and add no other runner.',
        },
      ],
    },
    {
      id: 'fe-test-style',
      type: 'scale',
      slot: 'frontend.test-style',
      section: 'Testing',
      label: {
        en: 'A test asserts what the user sees, never the implementation.',
        fr: "Un test vérifie ce que voit l'utilisateur, jamais l'implémentation.",
      },
      required: false,
      fragments: [
        {
          when: { scaleAtLeast: 4 },
          text: 'Test through what the user sees and does: find elements by role, label or text, drive them with user events, and assert on what is displayed, including the empty, loading and error states; never assert on internal state or on a call to an internal function.',
        },
        {
          when: { scaleAtMost: 2 },
          text: 'A test may check internals (state, calls to collaborators) when the visible result is hard to reach; prefer a test id to a CSS selector or a class name.',
        },
      ],
    },
    {
      id: 'fe-test-network',
      type: 'single',
      slot: 'frontend.test-network',
      section: 'Testing',
      label: {
        en: 'In tests, calls to the API are:',
        fr: "Dans les tests, les appels à l'API sont :",
      },
      options: [
        {
          value: 'msw',
          label: {
            en: 'Intercepted at the network level (MSW)',
            fr: 'Interceptés au niveau du réseau (MSW)',
          },
        },
        {
          value: 'module-mocks',
          label: {
            en: 'Replaced by a mock of the API client module',
            fr: "Remplacés par un mock du module client de l'API",
          },
        },
        {
          value: 'real',
          label: { en: 'Sent to a real test API', fr: 'Envoyés à une vraie API de test' },
        },
        { value: 'other', label: { en: 'Something else', fr: 'Autre chose' }, freeText: true },
      ],
      required: false,
      fragments: [
        {
          when: { equals: 'msw' },
          text: 'In tests, intercept network calls with MSW handlers kept with the existing ones; never mock `fetch` or the API client module, and cover the success, refused and server-error answers of a call.',
        },
        {
          when: { equals: 'module-mocks' },
          text: 'In tests, replace the API client module with a mock as the existing tests do, type the mocked answers with the real response types, and cover the success and error answers of a call.',
        },
        {
          when: { equals: 'real' },
          text: 'Tests call a real test API: create the data a test needs and clean it up, never depend on data another test left, and never point a test at a shared or production environment.',
        },
        {
          when: { other: true },
          text: 'In tests, handle calls to the API with {value}, as the existing tests do, and cover the success and error answers of a call.',
        },
      ],
    },
    {
      id: 'fe-e2e-tool',
      type: 'single',
      slot: 'frontend.e2e-tool',
      section: 'Testing',
      label: {
        en: 'End-to-end tests run with:',
        fr: 'Les tests de bout en bout tournent avec :',
      },
      options: [
        { value: 'playwright', label: { en: 'Playwright', fr: 'Playwright' } },
        { value: 'cypress', label: { en: 'Cypress', fr: 'Cypress' } },
        {
          value: 'none',
          label: { en: 'There are none', fr: "Il n'y en a pas" },
        },
        { value: 'other', label: { en: 'Something else', fr: 'Autre chose' }, freeText: true },
      ],
      required: false,
      fragments: [
        {
          when: { equals: 'playwright' },
          text: 'End-to-end tests run with Playwright: locate by role, label or test id, rely on its auto-waiting assertions and never a fixed `waitForTimeout`, give each test its own data, and keep them for the critical journeys only.',
        },
        {
          when: { equals: 'cypress' },
          text: 'End-to-end tests run with Cypress: select by role, label or a `data-` test attribute, wait on an assertion or an intercepted request and never a fixed `cy.wait(ms)`, give each test its own data, and keep them for the critical journeys only.',
        },
        {
          when: { equals: 'none' },
          text: 'There is no end-to-end suite: do not add a browser test tool unasked; cover the behaviour with component tests instead.',
        },
        {
          when: { other: true },
          text: 'End-to-end tests run with {value}: no fixed waits, its own data for each test, and the critical journeys only.',
        },
      ],
    },
    {
      id: 'fe-raw-html',
      type: 'single',
      slot: 'frontend.raw-html',
      section: 'Front-end security',
      label: {
        en: 'HTML that comes from a user or from the server is rendered:',
        fr: "Du HTML qui vient d'un utilisateur ou du serveur est affiché :",
      },
      options: [
        {
          value: 'never',
          label: { en: 'Never: as text only', fr: 'Jamais : seulement comme du texte' },
        },
        {
          value: 'sanitized',
          label: {
            en: 'After sanitising it (DOMPurify or equivalent)',
            fr: "Après l'avoir assaini (DOMPurify ou équivalent)",
          },
        },
        {
          value: 'own-content',
          label: {
            en: 'Only when the project produced it itself',
            fr: "Seulement quand le projet l'a produit lui-même",
          },
        },
      ],
      required: false,
      fragments: [
        {
          when: { equals: 'never' },
          text: 'Never use `dangerouslySetInnerHTML`, `innerHTML` or a ref to inject markup: render every user or server value as text and let React escape it.',
        },
        {
          when: { equals: 'sanitized' },
          text: 'Raw HTML reaches the page only through the existing sanitising helper (DOMPurify or equivalent), called right where `dangerouslySetInnerHTML` is used; never inject a string that skipped it, and render everything else as text.',
        },
        {
          when: { equals: 'own-content' },
          text: 'Raw HTML is injected only when the project itself produced it (compiled content, static templates): never pass a value that a user or an external service can influence to `dangerouslySetInnerHTML` or `innerHTML`.',
        },
        {
          when: { answered: true },
          text: 'Before putting a URL taken from data into `href` or `src`, check that it is relative or starts with `https:`; never let a `javascript:` URL through, and never build code from data with `eval` or `new Function`.',
        },
      ],
    },
    {
      id: 'fe-token-storage',
      type: 'single',
      slot: 'frontend.token-storage',
      section: 'Front-end security',
      label: {
        en: 'The session or access token is kept:',
        fr: "Le jeton de session ou d'accès est gardé :",
      },
      options: [
        {
          value: 'httponly-cookie',
          label: { en: 'In an `HttpOnly` cookie', fr: 'Dans un cookie `HttpOnly`' },
        },
        {
          value: 'memory',
          label: {
            en: 'In memory, renewed through an `HttpOnly` refresh cookie',
            fr: 'En mémoire, renouvelé par un cookie de rafraîchissement `HttpOnly`',
          },
        },
        {
          value: 'web-storage',
          label: {
            en: 'In `localStorage` or `sessionStorage`',
            fr: 'Dans `localStorage` ou `sessionStorage`',
          },
        },
        {
          value: 'none',
          label: {
            en: 'Nowhere: the app has no sign-in',
            fr: "Nulle part : l'appli n'a pas de connexion",
          },
        },
      ],
      required: false,
      fragments: [
        {
          when: { equals: 'httponly-cookie' },
          text: 'The session lives in an `HttpOnly` cookie that scripts cannot read: never store a token in `localStorage`, `sessionStorage` or a readable cookie, send requests with credentials, and keep the `SameSite` or anti-CSRF token protection on every state-changing request.',
        },
        {
          when: { equals: 'memory' },
          text: 'The access token lives in memory only and is renewed through the `HttpOnly` refresh cookie: never write it to `localStorage`, `sessionStorage`, a readable cookie or a URL, and expect it to be gone after a reload.',
        },
        {
          when: { equals: 'web-storage' },
          text: 'The token is kept in web storage today: do not move it unasked, read and write it through the existing helper only, never log it or put it in a URL, and say that any injected script can read it when you touch that code.',
        },
        {
          when: { equals: 'none' },
          text: 'The app has no sign-in: do not add authentication, token handling or storage of credentials unasked.',
        },
        {
          when: { answered: true },
          text: 'Hiding a button or a route is not access control, and CORS only restrains browsers: the server must refuse what the user may not do, so never treat a client-side check as the protection.',
        },
        {
          when: { answered: true },
          text: 'Never put a private key or a secret in front-end code or in a bundled environment variable (`VITE_*`, `NEXT_PUBLIC_*`): everything shipped to the browser is public.',
        },
      ],
    },
    {
      id: 'fe-csp',
      type: 'single',
      slot: 'frontend.csp',
      section: 'Front-end security',
      label: {
        en: 'A Content-Security-Policy is served:',
        fr: 'Une Content-Security-Policy est servie :',
      },
      options: [
        {
          value: 'strict',
          label: {
            en: 'Strict: no inline script, listed sources only',
            fr: 'Stricte : aucun script en ligne, seulement les sources listées',
          },
        },
        {
          value: 'loose',
          label: {
            en: 'With exceptions (`unsafe-inline`, wide sources)',
            fr: 'Avec des exceptions (`unsafe-inline`, sources larges)',
          },
        },
        { value: 'none', label: { en: 'None', fr: 'Aucune' } },
      ],
      required: false,
      fragments: [
        {
          when: { equals: 'strict' },
          text: 'A strict Content-Security-Policy is served: never add an inline script, an inline event handler, `eval` or a resource from an unlisted origin; when a new source is truly needed, change the policy in the same change and say so.',
        },
        {
          when: { equals: 'loose' },
          text: 'The Content-Security-Policy still allows inline code or wide sources: never rely on that allowance in new code (no inline script or handler, no `eval`), and never widen the policy further without asking.',
        },
        {
          when: { equals: 'none' },
          text: 'No Content-Security-Policy is served: do not add one unasked, and still write code that would pass a strict one (no inline script, no inline event handler, no `eval`).',
        },
      ],
    },
    {
      id: 'fe-api-client',
      type: 'single',
      slot: 'frontend.api-client',
      section: 'Data and API',
      label: {
        en: 'Server data is read and written through:',
        fr: 'Les données du serveur sont lues et écrites via :',
      },
      options: [
        { value: 'tanstack-query', label: { en: 'TanStack Query', fr: 'TanStack Query' } },
        { value: 'swr', label: { en: 'SWR', fr: 'SWR' } },
        { value: 'rtk-query', label: { en: 'RTK Query', fr: 'RTK Query' } },
        {
          value: 'apollo',
          label: { en: 'Apollo Client (GraphQL)', fr: 'Apollo Client (GraphQL)' },
        },
        { value: 'relay', label: { en: 'Relay (GraphQL)', fr: 'Relay (GraphQL)' } },
        {
          value: 'plain-fetch',
          label: { en: 'Plain `fetch`, no library', fr: '`fetch` seul, sans bibliothèque' },
        },
        { value: 'other', label: { en: 'Something else', fr: 'Autre chose' }, freeText: true },
      ],
      required: false,
      fragments: [
        {
          when: { equals: 'tanstack-query' },
          text: 'Read and write server data through TanStack Query hooks: one key per resource and its parameters, invalidate the keys a mutation changes, set `staleTime` on purpose (the default of 0 refetches at once), and never copy query data into `useState` or fetch in an effect.',
        },
        {
          when: { equals: 'swr' },
          text: 'Read server data through SWR hooks with one key per resource and its parameters, revalidate with `mutate` after a write, and never copy the data into `useState` or fetch in an effect.',
        },
        {
          when: { equals: 'rtk-query' },
          text: 'Read and write server data through RTK Query endpoints in the existing API slices, invalidate with tags after a mutation, and never fetch in an effect or keep a copy of the answer in another slice.',
        },
        {
          when: { equals: 'apollo' },
          text: 'Read and write server data through Apollo Client hooks: ask only for the fields the screen shows, always select `id` so that the normalised cache can update, and update or refetch the affected queries after a mutation.',
        },
        {
          when: { equals: 'relay' },
          text: 'Read server data through Relay: each component declares the fields it needs in its own fragment, queries sit at the route, and the compiler output is regenerated, never edited by hand.',
        },
        {
          when: { equals: 'plain-fetch' },
          text: 'Server data is fetched with plain `fetch` through the existing helper: check `response.ok` before reading the body, handle failure, and do not add a data-fetching library unasked.',
        },
        {
          when: { other: true },
          text: 'Read and write server data through {value}, as the existing calls do; do not add another data-fetching library.',
        },
        {
          when: { answered: true },
          text: "Start the requests of a screen together (route loader or parallel queries); never make a component wait for its parent's request when it does not need its result.",
        },
      ],
    },
    {
      id: 'fe-async-states',
      type: 'scale',
      slot: 'frontend.async-states',
      section: 'Data and API',
      label: {
        en: 'Every view that loads data shows its own loading, empty and error states.',
        fr: 'Chaque vue qui charge des données affiche ses propres états de chargement, vide et erreur.',
      },
      required: false,
      fragments: [
        {
          when: { scaleAtLeast: 4 },
          text: 'For every view that loads data, render the loading, empty, error and success states explicitly, with a way to retry after an error; never leave a blank area or an endless spinner, and keep showing the previous data while it refreshes.',
        },
        {
          when: { scaleAtMost: 2 },
          text: 'Loading and errors are handled by the shared layout or boundary: do not add per-component loading or error states unasked.',
        },
      ],
    },
    {
      id: 'fe-optimistic-updates',
      type: 'single',
      slot: 'frontend.optimistic-updates',
      section: 'Data and API',
      label: {
        en: 'After the user changes something, the interface:',
        fr: "Après une modification de l'utilisateur, l'interface :",
      },
      options: [
        {
          value: 'optimistic',
          label: {
            en: 'Updates at once, and rolls back on failure',
            fr: "Se met à jour tout de suite, et revient en arrière en cas d'échec",
          },
        },
        {
          value: 'wait',
          label: {
            en: 'Waits for the answer of the server',
            fr: 'Attend la réponse du serveur',
          },
        },
        {
          value: 'case-by-case',
          label: { en: 'Depends on the action', fr: "Dépend de l'action" },
        },
      ],
      required: false,
      fragments: [
        {
          when: { equals: 'optimistic' },
          text: 'Apply a mutation to the interface at once: snapshot the cached data, update it, roll back to the snapshot on failure with a visible message, then refetch so that the screen ends on the server state.',
        },
        {
          when: { equals: 'wait' },
          text: 'Do not update optimistically: disable the control and show progress while a mutation runs, then invalidate or refetch the data it changed, and show the server error on failure.',
        },
        {
          when: { equals: 'case-by-case' },
          text: 'Update optimistically only for cheap, reversible actions (toggle, rename, reorder), with a rollback on failure; wait for the server for anything that creates, deletes, pays or changes rights.',
        },
      ],
    },
    {
      id: 'fe-realtime',
      type: 'single',
      slot: 'frontend.realtime',
      section: 'Data and API',
      label: {
        en: 'Data that changes on the server reaches the screen by:',
        fr: "Les données qui changent côté serveur arrivent à l'écran par :",
      },
      options: [
        {
          value: 'refetch',
          label: {
            en: 'Refetching on action or on focus only',
            fr: 'Un rechargement sur action ou au retour sur la page seulement',
          },
        },
        { value: 'polling', label: { en: 'Polling', fr: 'Des appels périodiques (polling)' } },
        { value: 'sse', label: { en: 'Server-Sent Events', fr: 'Server-Sent Events' } },
        { value: 'websocket', label: { en: 'A WebSocket', fr: 'Un WebSocket' } },
      ],
      required: false,
      fragments: [
        {
          when: { equals: 'refetch' },
          text: 'There is no real-time channel: refresh data on user action, navigation or window focus, and do not add polling, Server-Sent Events or a WebSocket unasked.',
        },
        {
          when: { equals: 'polling' },
          text: 'Live data is polled: set the interval on the query rather than with a hand-written timer, stop while the tab is hidden or the component is unmounted, and do not add a push channel unasked.',
        },
        {
          when: { equals: 'sse' },
          text: 'Live data arrives by Server-Sent Events: reuse the existing stream hook, close the `EventSource` on unmount, and use an event to invalidate or update the data cache rather than keeping a second copy in state.',
        },
        {
          when: { equals: 'websocket' },
          text: 'Live data arrives over a WebSocket: reuse the existing connection, reconnect with a growing delay, unsubscribe on unmount, and write messages into the data cache rather than a second copy in state.',
        },
      ],
    },
    {
      id: 'fe-web-components',
      type: 'single',
      slot: 'frontend.web-components',
      section: 'Framework and rendering',
      label: {
        en: 'Web Components (custom elements):',
        fr: 'Les Web Components (custom elements) :',
      },
      options: [
        { value: 'not-used', label: { en: 'Are not used', fr: 'Ne sont pas utilisés' } },
        {
          value: 'consumed',
          label: { en: 'Are used, from a library', fr: 'Sont utilisés, depuis une bibliothèque' },
        },
        {
          value: 'authored',
          label: {
            en: 'Are written here, to share across frameworks',
            fr: 'Sont écrits ici, pour être partagés entre frameworks',
          },
        },
      ],
      required: false,
      fragments: [
        {
          when: { equals: 'not-used' },
          text: 'Do not introduce custom elements or Shadow DOM: build interface parts as components of the framework in use.',
        },
        {
          when: { equals: 'consumed' },
          text: 'The app uses custom elements from a library: pass rich data as properties rather than attributes, listen to their custom events explicitly, and style them only through the parts and CSS variables they expose.',
        },
        {
          when: { equals: 'authored' },
          text: 'Shared widgets are written as custom elements: give them a hyphenated prefixed name, keep markup and styles in Shadow DOM, expose attributes, properties, events, slots and CSS variables as the API, and depend on no framework inside.',
        },
      ],
    },
    {
      id: 'fe-service-worker',
      type: 'single',
      slot: 'frontend.service-worker',
      section: 'Framework and rendering',
      label: {
        en: 'The app registers a service worker:',
        fr: "L'appli enregistre un service worker :",
      },
      options: [
        { value: 'none', label: { en: 'No', fr: 'Non' } },
        {
          value: 'shell',
          label: {
            en: 'Yes, to install the app and cache its shell',
            fr: "Oui, pour installer l'appli et mettre sa coquille en cache",
          },
        },
        {
          value: 'offline',
          label: {
            en: 'Yes, and the app works offline with its data',
            fr: "Oui, et l'appli fonctionne hors ligne avec ses données",
          },
        },
      ],
      required: false,
      fragments: [
        {
          when: { equals: 'none' },
          text: 'There is no service worker: do not add one, a web app manifest or offline caching unasked.',
        },
        {
          when: { equals: 'shell' },
          text: 'The service worker caches the application shell only: serve hashed assets cache-first and API calls from the network, never cache live data, and keep the update flow so that a new build replaces the old one instead of leaving clients on a stale bundle.',
        },
        {
          when: { equals: 'offline' },
          text: 'The app works offline: read API data network-first with the cache as fallback, never cache-first, show when data is stale or the app is offline, and keep the update flow so that clients never stay on an old bundle.',
        },
      ],
    },
    {
      id: 'fe-platforms',
      type: 'multi',
      slot: 'frontend.platforms',
      section: 'Framework and rendering',
      label: {
        en: 'Besides the browser, the front-end code also runs in:',
        fr: 'En plus du navigateur, le code du front tourne aussi dans :',
      },
      options: [
        {
          value: 'mobile-shell',
          label: {
            en: 'A mobile shell (Capacitor, Ionic)',
            fr: 'Une coque mobile (Capacitor, Ionic)',
          },
        },
        { value: 'electron', label: { en: 'Electron', fr: 'Electron' } },
        { value: 'tauri', label: { en: 'Tauri', fr: 'Tauri' } },
        {
          value: 'react-native',
          label: {
            en: 'A React Native app that shares its logic',
            fr: 'Une appli React Native qui partage sa logique',
          },
        },
        {
          value: 'browser-only',
          label: { en: 'Nothing else', fr: 'Rien d’autre' },
          exclusive: true,
        },
      ],
      required: false,
      fragments: [
        {
          when: { includes: 'mobile-shell' },
          text: "The app also ships in a mobile web view shell: reach device features through the shell's plugins, behind a check that the platform has them, respect safe-area insets, and keep every screen usable by touch.",
        },
        {
          when: { includes: 'electron' },
          text: 'The app also ships in Electron: keep Node access out of the renderer (context isolation on, `nodeIntegration` off), go through the preload bridge for anything native, and validate what crosses it.',
        },
        {
          when: { includes: 'tauri' },
          text: 'The app also ships in Tauri: call native code only through its commands with the narrowest permissions, and avoid web features that the system web views do not all support.',
        },
        {
          when: { includes: 'react-native' },
          text: 'Logic is shared with a React Native app: keep shared modules free of DOM, `window` and CSS, and put anything that renders in the platform-specific code.',
        },
        {
          when: { includes: 'browser-only' },
          text: 'The code runs in browsers only: do not add a mobile or desktop shell, and do not abstract browser APIs for another platform.',
        },
      ],
    },
    {
      id: 'fe-hosting',
      type: 'single',
      slot: 'frontend.hosting',
      section: 'Tooling',
      label: { en: 'The front end is deployed as:', fr: 'Le front est déployé sous forme de :' },
      options: [
        {
          value: 'static',
          label: {
            en: 'Static files on a CDN or a static host',
            fr: 'Fichiers statiques sur un CDN ou un hébergeur statique',
          },
        },
        {
          value: 'platform',
          label: {
            en: 'A platform with serverless or edge functions',
            fr: 'Une plateforme avec fonctions serverless ou edge',
          },
        },
        {
          value: 'server',
          label: { en: 'Our own server or container', fr: 'Notre propre serveur ou conteneur' },
        },
        { value: 'other', label: { en: 'Something else', fr: 'Autre chose' }, freeText: true },
      ],
      required: false,
      fragments: [
        {
          when: { equals: 'static' },
          text: "The front end ships as static files: nothing may need a server at runtime, and a client route must survive a reload through the host's rewrite of unknown paths to `index.html`; check that rewrite when routing changes.",
        },
        {
          when: { equals: 'platform' },
          text: "The front end is deployed on a platform with serverless or edge functions: keep functions short and stateless, check that an API exists in that runtime before using a Node one, and keep configuration in the platform's environment settings.",
        },
        {
          when: { equals: 'server' },
          text: "The front end is served by the project's own server or container: change its configuration (rewrites, headers, runtime settings) in the repository, in the same change as the code that needs it.",
        },
        {
          when: { other: true },
          text: 'The front end is deployed with {value}: keep to what that host supports and do not add a second deployment target.',
        },
      ],
    },
    {
      id: 'fe-preview-deploys',
      type: 'single',
      slot: 'frontend.preview-deploys',
      section: 'Workflow',
      label: {
        en: 'Each pull request gets its own preview deployment:',
        fr: 'Chaque pull request a son propre déploiement de prévisualisation :',
      },
      options: [
        { value: 'yes', label: { en: 'Yes', fr: 'Oui' } },
        { value: 'no', label: { en: 'No', fr: 'Non' } },
      ],
      required: false,
      fragments: [
        {
          when: { equals: 'yes' },
          text: 'Each pull request is deployed to its own preview URL: never hard-code the production origin or base path, and list in the pull request the screens and steps to check on the preview.',
        },
        {
          when: { equals: 'no' },
          text: 'There is no preview deployment: say in the pull request how to run the change locally and which screens to check.',
        },
      ],
    },
    {
      id: 'fe-browser-check',
      type: 'scale',
      slot: 'frontend.browser-check',
      section: 'Workflow',
      label: {
        en: 'The assistant checks a change to the interface in a real browser before handing back.',
        fr: "L'assistant vérifie un changement d'interface dans un vrai navigateur avant de rendre la main.",
      },
      required: false,
      fragments: [
        {
          when: { scaleAtLeast: 4 },
          text: 'After a change to the interface, run the app and check the changed screen in a browser before handing back: no error or warning in the console, the expected network requests, and the keyboard path; say what you checked.',
        },
        {
          when: { scaleAtMost: 2 },
          text: 'Do not start the app or a browser to check a change: rely on types, lint and tests, and say what was not verified on screen.',
        },
      ],
    },
    {
      id: 'fe-api-verification',
      type: 'scale',
      slot: 'frontend.api-verification',
      section: 'Workflow',
      label: {
        en: 'The assistant checks that an API exists in the installed version before using it.',
        fr: "L'assistant vérifie qu'une API existe dans la version installée avant de l'utiliser.",
      },
      required: false,
      fragments: [
        {
          when: { scaleAtLeast: 4 },
          text: 'Before using a library or browser API, check that it exists in the installed version (type definitions, package source or official documentation); never write a call from memory alone, and say what could not be verified.',
        },
        {
          when: { scaleAtMost: 2 },
          text: 'Write library and browser API calls from what you know and let the type checker and the tests catch a wrong one; look an API up only when a check fails.',
        },
      ],
    },
  ],
} satisfies Questionnaire
