import { describe, expect, it } from 'vitest'

import { parseSourceUrl } from './skill-source-url'

describe('parseSourceUrl', () => {
  it('reads a repository URL, with or without its scheme, www or .git', () => {
    const repo = { owner: 'anthropics', repo: 'skills' }
    expect(parseSourceUrl('https://github.com/anthropics/skills')).toEqual(repo)
    expect(parseSourceUrl(' github.com/anthropics/skills/ ')).toEqual(repo)
    expect(parseSourceUrl('https://www.github.com/anthropics/skills.git')).toEqual(repo)
    expect(parseSourceUrl('https://github.com/anthropics/skills?tab=readme#top')).toEqual(repo)
  })

  it('reads the folder of a tree URL, leaving the branch out', () => {
    expect(parseSourceUrl('https://github.com/anthropics/skills/tree/main/skills/pdf')).toEqual({
      owner: 'anthropics',
      repo: 'skills',
      path: 'skills/pdf',
    })
    expect(parseSourceUrl('https://github.com/anthropics/skills/tree/main')).toEqual({
      owner: 'anthropics',
      repo: 'skills',
    })
  })

  it('reads owner/repo and owner/repo/folder', () => {
    expect(parseSourceUrl('anthropics/skills')).toEqual({ owner: 'anthropics', repo: 'skills' })
    expect(parseSourceUrl('anthropics/skills/skills')).toEqual({
      owner: 'anthropics',
      repo: 'skills',
      path: 'skills',
    })
  })

  it('refuses what names no repository folder', () => {
    for (const input of [
      '',
      'anthropics',
      'https://gitlab.com/anthropics/skills',
      'https://github.com/anthropics/skills/blob/main/README.md',
      'https://github.com/anthropics/skills/issues',
      'https://github.com/anthropics/skills/tree',
      'anthropics/skills/../secrets',
      'anthropics/..',
      'bad owner/skills',
    ]) {
      expect(parseSourceUrl(input), input).toBeNull()
    }
  })
})
