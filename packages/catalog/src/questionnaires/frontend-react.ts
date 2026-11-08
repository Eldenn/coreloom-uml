import type { Questionnaire } from '../schemas.ts'

/**
 * Front-end work on a React and TypeScript code base. Questions 2, 4, 5, 10 and 11 record facts
 * about the repository; 1, 3, 7, 8 and 9 are preferences on a 1–5 agreement scale, where 3
 * produces nothing.
 *
 * Bump `version` on any change to a question, an option or a fragment; never reuse a removed
 * question id; declare a removed option in `migrations`.
 */
export const frontendReact = {
  id: 'frontend-react',
  version: '1.0.0',
  title: { en: 'Front end: React and TypeScript', fr: 'Front : React et TypeScript' },
  description: {
    en: 'How you write and ship a React and TypeScript front end, and what your coding assistant should do the same way.',
    fr: 'Comment vous écrivez et livrez un front React et TypeScript, et ce que votre assistant de code doit faire de la même façon.',
  },
  sections: ['TypeScript', 'React'],
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
  ],
} satisfies Questionnaire
