import type { RulePack } from '../schemas.ts'

/**
 * Git workflow: ready-made rules, one group per slot. Never reuse a removed rule id within
 * its slot, and bump `CATALOG_VERSION` on any change to a rule, a label or a line.
 */
export const gitWorkflow: RulePack = {
  id: 'git-workflow',
  title: {
    en: 'Git workflow',
    fr: 'Travail avec Git',
  },
  description: {
    en: 'Branches, commit messages, what your coding assistant may commit and push, and what never goes into the repository.',
    fr: 'Les branches, les messages de commit, ce que votre assistant de code peut committer et pousser, et ce qui n’entre jamais dans le dépôt.',
  },
  sections: ['Git'],
  groups: [
    {
      slot: 'git.branching',
      section: 'Git',
      label: {
        en: 'Each task is done:',
        fr: 'Chaque tâche se fait :',
      },
      pick: 'one',
      rules: [
        {
          id: 'worktree',
          label: {
            en: 'In its own worktree, on its own branch',
            fr: 'Dans son propre worktree, sur sa propre branche',
          },
          lines: [
            'Before the first edit, create a git worktree with its own branch from the up-to-date main branch, and work only there; never create or switch branches in the main checkout.',
          ],
        },
        {
          id: 'branch',
          label: {
            en: 'On its own branch',
            fr: 'Sur sa propre branche',
          },
          lines: [
            'Before the first edit, create a branch from the up-to-date main branch; never work on the main branch itself.',
          ],
        },
        {
          id: 'trunk',
          label: {
            en: 'Directly on the main branch',
            fr: 'Directement sur la branche principale',
          },
          lines: ['Work on the main branch; do not create a branch unless asked to.'],
        },
      ],
    },
    {
      slot: 'git.commit-messages',
      section: 'Git',
      label: {
        en: 'Commit messages follow:',
        fr: 'Les messages de commit suivent :',
      },
      pick: 'one',
      rules: [
        {
          id: 'conventional',
          label: {
            en: 'Conventional Commits (`feat:`, `fix:`…)',
            fr: 'Conventional Commits (`feat:`, `fix:`…)',
          },
          lines: [
            'Write commit messages as Conventional Commits: `type(scope): summary` in the imperative, with the reason in the body when it is not obvious.',
          ],
        },
        {
          id: 'imperative',
          label: {
            en: 'A short imperative sentence, without prefix',
            fr: 'Une courte phrase à l’impératif, sans préfixe',
          },
          lines: [
            'Write the commit subject as a short imperative sentence without a prefix, with the reason in the body when it is not obvious.',
          ],
        },
        {
          id: 'other',
          label: {
            en: 'Another convention',
            fr: 'Une autre convention',
          },
          input: true,
          lines: ['Commit messages follow this convention: {value}.'],
        },
      ],
    },
    {
      slot: 'git.commit-permission',
      section: 'Git',
      label: {
        en: 'On its own, the assistant may:',
        fr: "De lui-même, l'assistant peut :",
      },
      pick: 'one',
      rules: [
        {
          id: 'nothing',
          label: {
            en: 'Neither commit nor push',
            fr: 'Ni committer ni pousser',
          },
          lines: [
            'Never commit or push unless asked to; leave the changes in the working tree and summarize them.',
          ],
        },
        {
          id: 'commit',
          label: {
            en: 'Commit, but not push',
            fr: 'Committer, mais pas pousser',
          },
          lines: ['Commit finished work in coherent commits; never push unless asked to.'],
        },
        {
          id: 'commit-push',
          label: {
            en: 'Commit and push its branch',
            fr: 'Committer et pousser sa branche',
          },
          lines: [
            'Commit finished work in coherent commits and push the task’s branch; never push to the main branch and never merge.',
          ],
        },
      ],
    },
    {
      slot: 'git.pull-request-size',
      section: 'Git',
      label: {
        en: 'A pull request stays reviewable up to about:',
        fr: 'Une pull request reste relisible jusqu’à environ :',
      },
      pick: 'one',
      rules: [
        {
          id: '200',
          label: {
            en: '200 changed lines',
            fr: '200 lignes modifiées',
          },
          lines: [
            'Keep a pull request under about 200 changed lines, generated files aside; past that, propose how to split it before going on.',
          ],
        },
        {
          id: '400',
          label: {
            en: '400 changed lines',
            fr: '400 lignes modifiées',
          },
          lines: [
            'Keep a pull request under about 400 changed lines, generated files aside; past that, propose how to split it before going on.',
          ],
        },
        {
          id: '800',
          label: {
            en: '800 changed lines',
            fr: '800 lignes modifiées',
          },
          lines: [
            'Keep a pull request under about 800 changed lines, generated files aside; past that, propose how to split it before going on.',
          ],
        },
        {
          id: 'no-limit',
          label: {
            en: 'No limit',
            fr: 'Pas de limite',
          },
          lines: [
            'A pull request has no size limit, but covers one subject: leave unrelated fixes for another one.',
          ],
        },
      ],
    },
    {
      slot: 'git.never-commit',
      section: 'Git',
      label: {
        en: 'Never committed:',
        fr: 'Ne sont jamais committés :',
      },
      pick: 'many',
      rules: [
        {
          id: 'secrets',
          label: {
            en: 'Secrets and `.env` files',
            fr: 'Les secrets et les fichiers `.env`',
          },
          lines: [
            'Never commit a secret, a key, a token or a `.env` file; if one is staged, unstage it and say so.',
          ],
        },
        {
          id: 'generated',
          label: {
            en: 'Build output and generated files',
            fr: 'Les sorties de build et les fichiers générés',
          },
          lines: [
            'Never commit build output or generated files that the repository ignores or rebuilds.',
          ],
        },
        {
          id: 'binaries',
          label: {
            en: 'Large binary files',
            fr: 'Les gros fichiers binaires',
          },
          lines: ['Never commit a large binary file; ask where it should live instead.'],
        },
        {
          id: 'debug',
          label: {
            en: 'Debug statements and commented-out code',
            fr: 'Le code de débogage et le code commenté',
          },
          lines: ['Never commit debug statements, temporary files or commented-out code.'],
        },
        {
          id: 'unrelated',
          label: {
            en: 'Changes unrelated to the task (formatting, lockfile churn)',
            fr: 'Les changements sans rapport avec la tâche (formatage, lockfile)',
          },
          lines: [
            'Never commit changes unrelated to the task: no reformatting of untouched code, no lockfile change without a dependency change.',
          ],
        },
      ],
      lines: [
        'Read the staged diff before every commit and stage files by name, never with `git add -A`.',
      ],
    },
    {
      slot: 'git.history',
      section: 'Git',
      label: {
        en: 'Pushed history is never rewritten: no amend, no rebase, no force-push.',
        fr: 'L’historique poussé n’est jamais réécrit : ni amend, ni rebase, ni force-push.',
      },
      pick: 'one',
      rules: [
        {
          id: 'agree',
          lines: [
            'Never rewrite pushed history: no amend, rebase or force-push; fix with a new commit.',
          ],
        },
        {
          id: 'disagree',
          lines: [
            'Tidy a task’s branch with amend or rebase before review when it helps; never rewrite the main branch.',
          ],
        },
      ],
    },
    {
      slot: 'git.attribution',
      section: 'Git',
      label: {
        en: 'Commits and pull requests never mention the assistant.',
        fr: "Les commits et les pull requests ne mentionnent jamais l'assistant.",
      },
      pick: 'one',
      rules: [
        {
          id: 'agree',
          lines: [
            'Never credit a coding assistant in a commit, a pull request or a comment: no co-author trailer, no "generated with" footer.',
          ],
        },
        {
          id: 'disagree',
          lines: ['Add a co-author trailer naming the assistant to every commit it writes.'],
        },
      ],
    },
    {
      slot: 'git.ci-workflow',
      section: 'Git',
      label: {
        en: 'Every pull request is checked in CI:',
        fr: 'Chaque pull request est vérifiée en CI :',
      },
      pick: 'one',
      rules: [
        {
          id: 'github-actions',
          label: {
            en: 'By a generated GitHub Actions workflow (adds `.github/workflows/agent-conventions.yml`)',
            fr: 'Par un workflow GitHub Actions généré (ajoute `.github/workflows/agent-conventions.yml`)',
          },
          lines: [
            'The `.github/workflows/agent-conventions.yml` workflow runs the checks on every pull request: never edit, skip or disable it; fix what it reports.',
          ],
        },
      ],
    },
  ],
}
