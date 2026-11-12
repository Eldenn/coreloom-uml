import { RIGHTS, type Right, ROLE_LINE_MAX_LENGTH, type Role } from '../roles/role.ts'
import { blockMarkdown, inlineMarkdown, stripMarkers } from './markdown.ts'

/** How a right the tool does not refuse by itself reads after "You must not". Reading is never forbidden. */
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
 * break. `checks` are the commands the repository runs: a done command outside them is left out.
 * `instructionRights` are the rights the role lacks and the tool does not refuse by itself.
 */
export function renderRoleBody(
  role: Role,
  options: { checks: readonly string[]; instructionRights: readonly Right[] },
): string {
  const forbidden = [
    ...role.forbidden.map((line) => inlineMarkdown(line, ROLE_LINE_MAX_LENGTH)),
    ...RIGHTS.flatMap((right) =>
      right !== 'read' && options.instructionRights.includes(right)
        ? [`You must not ${RIGHT_PHRASES[right]}.`]
        : [],
    ),
  ]
  const done = [
    ...role.done.commands
      // A backtick would close the code span the command is written in.
      .filter((command) => options.checks.includes(command) && !command.includes('`'))
      .map((command) => `\`${stripMarkers(command)}\` passes.`),
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
