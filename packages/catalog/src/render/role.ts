import { RIGHTS, type Right, ROLE_LINE_MAX_LENGTH, type Role } from '../roles/role.ts'
import { blockMarkdown, inlineMarkdown, stripMarkers } from './markdown.ts'

/** How a right the tool does not refuse by itself reads after "You must not". Reading is never forbidden. */
/** What a tool that reads files with commands adds to the two phrases that would forbid reading. */
const READING: Partial<Record<Right, string>> = {
  'run-checks': ', except to read the repository',
  shell: ' and those that read the repository',
}

const RIGHT_PHRASES: Record<Exclude<Right, 'read'>, string> = {
  write: 'edit or create files',
  'run-checks': 'run commands',
  shell: 'run commands other than the checks listed under "Done when"',
  commit: 'commit',
  push: 'push to any remote',
  network: 'access the network',
}

/**
 * The Markdown every tool's role file shares, without block markers and without a final line
 * break. `checks` are the commands the repository runs: a done command outside them is left out,
 * and so is every done command of a role without `run-checks`.
 * `instructionRights` are the rights the role lacks and the tool does not refuse by itself.
 * `readsWithCommands` is for a tool whose only way to read a file is a command: a role that runs
 * no check, or only the checks, still has to read.
 */
export function renderRoleBody(
  role: Role,
  options: {
    checks: readonly string[]
    instructionRights: readonly Right[]
    readsWithCommands?: boolean
  },
): string {
  // A role that cannot run commands is not asked to make one pass.
  const commands = (role.rights.includes('run-checks') ? role.done.commands : [])
    // A backtick would close the code span the command is written in.
    .filter((command) => options.checks.includes(command) && !command.includes('`'))
  const phrase = (right: Exclude<Right, 'read'>) => {
    // Without a check listed under "Done when", "other than the checks" would point at nothing.
    const worded = right === 'shell' && commands.length === 0 ? 'run-checks' : right
    return RIGHT_PHRASES[worded] + ((options.readsWithCommands && READING[worded]) || '')
  }
  // "Run commands" already covers the shell, whose phrase points at commands this role cannot run.
  const stated = options.instructionRights.includes('run-checks')
    ? options.instructionRights.filter((right) => right !== 'shell')
    : options.instructionRights
  const forbidden = [
    ...role.forbidden.map((line) => inlineMarkdown(line, ROLE_LINE_MAX_LENGTH)),
    ...RIGHTS.flatMap((right) =>
      right !== 'read' && stated.includes(right) ? [`You must not ${phrase(right)}.`] : [],
    ),
  ]
  const done = [
    ...commands.map((command) => `\`${stripMarkers(command)}\` passes.`),
    ...(role.done.text === null ? [] : [inlineMarkdown(role.done.text)]),
  ]
  const list = (lines: string[]) => lines.map((line) => `- ${line}`).join('\n')
  const sections: [title: string, body: string][] = [
    ['Mission', blockMarkdown(role.mission)],
    [
      'Scope',
      role.scope.length === 0
        ? ''
        : `Only change files under: ${role.scope.map((folder) => `\`${folder}\``).join(', ')}.`,
    ],
    ['Forbidden', list(forbidden)],
    ['Done when', list(done)],
    ['Escalate', role.escalation === null ? '' : inlineMarkdown(role.escalation)],
  ]

  return [
    'Read and follow AGENTS.md at the repository root; this file only adds your role.',
    ...sections.filter(([, body]) => body !== '').map(([title, body]) => `## ${title}\n\n${body}`),
  ].join('\n\n')
}
