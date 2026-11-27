import { describe, expect, it } from 'vitest'

import { researchScreen } from './research-screen'

describe('researchScreen', () => {
  it('shows a page as a curl, a command as typed, and how each ended', () => {
    const screen = researchScreen(
      [
        { kind: 'page', label: 'https://example.com/guide', state: 'done' },
        { kind: 'command', label: 'git ls-remote x', state: 'failed' },
        { kind: 'command', label: 'ls', state: 'running' },
      ],
      'Failed',
    )
    expect(screen).toBe(
      [
        '\x1b[2m$\x1b[0m curl https://example.com/guide',
        '\x1b[32m✓\x1b[0m',
        '\x1b[2m$\x1b[0m git ls-remote x',
        '\x1b[31m✗ Failed\x1b[0m',
        '\x1b[2m$\x1b[0m ls',
        '▍',
      ].join('\n'),
    )
  })

  it('shows a search as `search` and its query', () => {
    expect(
      researchScreen([{ kind: 'search', label: 'adonis queues', state: 'done' }], 'Failed'),
    ).toBe('\x1b[2m$\x1b[0m search adonis queues\n\x1b[32m✓\x1b[0m')
  })

  it('leaves no control character of a label on the screen', () => {
    const screen = researchScreen(
      [{ kind: 'command', label: 'echo \x1b[2J\x1b[31mred\r\x9b1A\x07', state: 'running' }],
      'Failed',
    )
    expect(screen).toBe('\x1b[2m$\x1b[0m echo [2J[31mred1A\n▍')
  })
})
