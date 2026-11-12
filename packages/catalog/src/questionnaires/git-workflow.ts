import type { Questionnaire } from '../schemas.ts'

/**
 * How the assistant uses Git. Questions 1 to 5 record how the repository is worked on; 6 and 7
 * are preferences on a 1–5 agreement scale, where 3 produces nothing. It feeds only its own
 * `git.*` slots, so it combines with any other questionnaire. Question 8 is optional: its
 * `github-actions` answer also renders the CI workflow (`render/gates.ts`).
 *
 * Bump `version` on any change to a question, an option or a fragment; never reuse a removed
 * question id; declare a removed option in `migrations`.
 */
export const gitWorkflow = {
  id: 'git-workflow',
  version: '1.1.0',
  title: { en: 'Git workflow', fr: 'Travail avec Git' },
  description: {
    en: 'Branches, commit messages, what your coding assistant may commit and push, and what never goes into the repository.',
    fr: 'Les branches, les messages de commit, ce que votre assistant de code peut committer et pousser, et ce qui n’entre jamais dans le dépôt.',
  },
  sections: ['Git'],
  questions: [
    {
      id: 'branching',
      type: 'single',
      slot: 'git.branching',
      section: 'Git',
      label: { en: 'Each task is done:', fr: 'Chaque tâche se fait :' },
      options: [
        {
          value: 'worktree',
          label: {
            en: 'In its own worktree, on its own branch',
            fr: 'Dans son propre worktree, sur sa propre branche',
          },
        },
        { value: 'branch', label: { en: 'On its own branch', fr: 'Sur sa propre branche' } },
        {
          value: 'trunk',
          label: { en: 'Directly on the main branch', fr: 'Directement sur la branche principale' },
        },
      ],
      required: true,
      fragments: [
        {
          when: { equals: 'worktree' },
          text: 'Before the first edit, create a git worktree with its own branch from the up-to-date main branch, and work only there; never create or switch branches in the main checkout.',
        },
        {
          when: { equals: 'branch' },
          text: 'Before the first edit, create a branch from the up-to-date main branch; never work on the main branch itself.',
        },
        {
          when: { equals: 'trunk' },
          text: 'Work on the main branch; do not create a branch unless asked to.',
        },
      ],
    },
    {
      id: 'commit-messages',
      type: 'single',
      slot: 'git.commit-messages',
      section: 'Git',
      label: { en: 'Commit messages follow:', fr: 'Les messages de commit suivent :' },
      options: [
        {
          value: 'conventional',
          label: {
            en: 'Conventional Commits (`feat:`, `fix:`…)',
            fr: 'Conventional Commits (`feat:`, `fix:`…)',
          },
        },
        {
          value: 'imperative',
          label: {
            en: 'A short imperative sentence, without prefix',
            fr: 'Une courte phrase à l’impératif, sans préfixe',
          },
        },
        {
          value: 'other',
          label: { en: 'Another convention', fr: 'Une autre convention' },
          freeText: true,
        },
      ],
      required: true,
      fragments: [
        {
          when: { equals: 'conventional' },
          text: 'Write commit messages as Conventional Commits: `type(scope): summary` in the imperative, with the reason in the body when it is not obvious.',
        },
        {
          when: { equals: 'imperative' },
          text: 'Write the commit subject as a short imperative sentence without a prefix, with the reason in the body when it is not obvious.',
        },
        {
          when: { other: true },
          text: 'Commit messages follow this convention: {value}.',
        },
      ],
    },
    {
      id: 'commit-permission',
      type: 'single',
      slot: 'git.commit-permission',
      section: 'Git',
      label: { en: 'On its own, the assistant may:', fr: "De lui-même, l'assistant peut :" },
      options: [
        {
          value: 'nothing',
          label: { en: 'Neither commit nor push', fr: 'Ni committer ni pousser' },
        },
        {
          value: 'commit',
          label: { en: 'Commit, but not push', fr: 'Committer, mais pas pousser' },
        },
        {
          value: 'commit-push',
          label: {
            en: 'Commit and push its branch',
            fr: 'Committer et pousser sa branche',
          },
        },
      ],
      required: true,
      fragments: [
        {
          when: { equals: 'nothing' },
          text: 'Never commit or push unless asked to; leave the changes in the working tree and summarize them.',
        },
        {
          when: { equals: 'commit' },
          text: 'Commit finished work in coherent commits; never push unless asked to.',
        },
        {
          when: { equals: 'commit-push' },
          text: 'Commit finished work in coherent commits and push the task’s branch; never push to the main branch and never merge.',
        },
      ],
    },
    {
      id: 'pull-request-size',
      type: 'single',
      slot: 'git.pull-request-size',
      section: 'Git',
      label: {
        en: 'A pull request stays reviewable up to about:',
        fr: 'Une pull request reste relisible jusqu’à environ :',
      },
      options: [
        { value: '200', label: { en: '200 changed lines', fr: '200 lignes modifiées' } },
        { value: '400', label: { en: '400 changed lines', fr: '400 lignes modifiées' } },
        { value: '800', label: { en: '800 changed lines', fr: '800 lignes modifiées' } },
        { value: 'no-limit', label: { en: 'No limit', fr: 'Pas de limite' } },
      ],
      required: true,
      fragments: [
        {
          when: { equals: '200' },
          text: 'Keep a pull request under about 200 changed lines, generated files aside; past that, propose how to split it before going on.',
        },
        {
          when: { equals: '400' },
          text: 'Keep a pull request under about 400 changed lines, generated files aside; past that, propose how to split it before going on.',
        },
        {
          when: { equals: '800' },
          text: 'Keep a pull request under about 800 changed lines, generated files aside; past that, propose how to split it before going on.',
        },
        {
          when: { equals: 'no-limit' },
          text: 'A pull request has no size limit, but covers one subject: leave unrelated fixes for another one.',
        },
      ],
    },
    {
      id: 'never-commit',
      type: 'multi',
      slot: 'git.never-commit',
      section: 'Git',
      label: { en: 'Never committed:', fr: 'Ne sont jamais committés :' },
      options: [
        {
          value: 'secrets',
          label: {
            en: 'Secrets and `.env` files',
            fr: 'Les secrets et les fichiers `.env`',
          },
        },
        {
          value: 'generated',
          label: {
            en: 'Build output and generated files',
            fr: 'Les sorties de build et les fichiers générés',
          },
        },
        {
          value: 'binaries',
          label: { en: 'Large binary files', fr: 'Les gros fichiers binaires' },
        },
        {
          value: 'debug',
          label: {
            en: 'Debug statements and commented-out code',
            fr: 'Le code de débogage et le code commenté',
          },
        },
        {
          value: 'unrelated',
          label: {
            en: 'Changes unrelated to the task (formatting, lockfile churn)',
            fr: 'Les changements sans rapport avec la tâche (formatage, lockfile)',
          },
        },
      ],
      required: false,
      fragments: [
        {
          when: { answered: true },
          text: 'Read the staged diff before every commit and stage files by name, never with `git add -A`.',
        },
        {
          when: { includes: 'secrets' },
          text: 'Never commit a secret, a key, a token or a `.env` file; if one is staged, unstage it and say so.',
        },
        {
          when: { includes: 'generated' },
          text: 'Never commit build output or generated files that the repository ignores or rebuilds.',
        },
        {
          when: { includes: 'binaries' },
          text: 'Never commit a large binary file; ask where it should live instead.',
        },
        {
          when: { includes: 'debug' },
          text: 'Never commit debug statements, temporary files or commented-out code.',
        },
        {
          when: { includes: 'unrelated' },
          text: 'Never commit changes unrelated to the task: no reformatting of untouched code, no lockfile change without a dependency change.',
        },
      ],
    },
    {
      id: 'history',
      type: 'scale',
      slot: 'git.history',
      section: 'Git',
      label: {
        en: 'Pushed history is never rewritten: no amend, no rebase, no force-push.',
        fr: 'L’historique poussé n’est jamais réécrit : ni amend, ni rebase, ni force-push.',
      },
      required: true,
      fragments: [
        {
          when: { scaleAtLeast: 4 },
          text: 'Never rewrite pushed history: no amend, rebase or force-push; fix with a new commit.',
        },
        {
          when: { scaleAtMost: 2 },
          text: 'Tidy a task’s branch with amend or rebase before review when it helps; never rewrite the main branch.',
        },
      ],
    },
    {
      id: 'attribution',
      type: 'scale',
      slot: 'git.attribution',
      section: 'Git',
      label: {
        en: 'Commits and pull requests never mention the assistant.',
        fr: "Les commits et les pull requests ne mentionnent jamais l'assistant.",
      },
      required: true,
      fragments: [
        {
          when: { scaleAtLeast: 4 },
          text: 'Never credit a coding assistant in a commit, a pull request or a comment: no co-author trailer, no "generated with" footer.',
        },
        {
          when: { scaleAtMost: 2 },
          text: 'Add a co-author trailer naming the assistant to every commit it writes.',
        },
      ],
    },
    {
      id: 'ci-workflow',
      type: 'single',
      slot: 'git.ci-workflow',
      section: 'Git',
      label: {
        en: 'Every pull request is checked in CI:',
        fr: 'Chaque pull request est vérifiée en CI :',
      },
      options: [
        {
          value: 'github-actions',
          label: {
            en: 'By a generated GitHub Actions workflow (adds `.github/workflows/agent-conventions.yml`)',
            fr: 'Par un workflow GitHub Actions généré (ajoute `.github/workflows/agent-conventions.yml`)',
          },
        },
        {
          value: 'none',
          label: { en: 'No generated workflow', fr: 'Pas de workflow généré' },
        },
      ],
      required: false,
      fragments: [
        {
          when: { equals: 'github-actions' },
          text: 'The `.github/workflows/agent-conventions.yml` workflow runs the checks on every pull request: never edit, skip or disable it; fix what it reports.',
        },
      ],
    },
  ],
} satisfies Questionnaire
