import { describe, expect, it } from 'vitest'

import { pairFiles } from './skill-version-files'

const file = (path: string, content: string, executable = false) => ({ path, content, executable })

describe('pairFiles', () => {
  it('pairs both copies by path and says what changed', () => {
    const pairs = pairFiles(
      [file('SKILL.md', 'same'), file('run.sh', 'new', true), file('added.md', 'a')],
      [file('SKILL.md', 'same'), file('run.sh', 'old', true), file('gone.md', 'g')],
    )
    expect(pairs.map((pair) => [pair.path, pair.status, pair.executable])).toEqual([
      ['SKILL.md', null, false],
      ['added.md', 'added', false],
      ['gone.md', 'removed', false],
      ['run.sh', 'changed', true],
    ])
    expect(pairs.find((pair) => pair.path === 'gone.md')).toMatchObject({ before: 'g', after: '' })
  })

  it('reads every file of a first copy as added', () => {
    expect(pairFiles([file('SKILL.md', 'x')], undefined).map((pair) => pair.status)).toEqual([
      'added',
    ])
  })
})
