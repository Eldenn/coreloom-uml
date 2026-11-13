import { describe, expect, it } from 'vitest'
import { blockMarkdown, MARKER_PREFIX } from './markdown.ts'

describe('blockMarkdown', () => {
  it('keeps a tag inside a top-level fenced code block as written', () => {
    expect(blockMarkdown('Build:\n\n```tsx\n<div>{items as Array<string>}</div>\n```')).toBe(
      'Build:\n\n```tsx\n<div>{items as Array<string>}</div>\n```',
    )
    expect(blockMarkdown('~~~~\n<div>\n~~~\n<br>\n  ~~~~~')).toBe('~~~~\n<div>\n~~~\n<br>\n  ~~~~~')
  })

  it('escapes a tag outside a fenced code block', () => {
    expect(blockMarkdown('```\n<b>\n```\n<div>')).toBe('```\n<b>\n```\n\\<div>')
    expect(blockMarkdown('Use `<div>` here')).toBe('Use `\\<div>` here')
  })

  it('protects nothing in a fence that never closes', () => {
    expect(blockMarkdown('```\n<div>\n<br>')).toBe('```\n\\<div>\n\\<br>')
  })

  it('does not close a fence on a line indented by four spaces or more', () => {
    expect(blockMarkdown('```\n<div>\n    ```')).toBe('```\n\\<div>\n    ```')
  })

  it('protects no fence opened inside a list item or a quote', () => {
    expect(blockMarkdown('- a\n  ```\n  x\n     ```\n  <div>\n  ```')).toBe(
      '- a\n  ```\n  x\n     ```\n  \\<div>\n  ```',
    )
    expect(blockMarkdown('1. a\n   ```\n   x\n      ```\n   <div>\n   ```')).toBe(
      '1. a\n   ```\n   x\n      ```\n   \\<div>\n   ```',
    )
    expect(blockMarkdown('> ```\n> <div>\n> ```')).toBe('> ```\n> \\<div>\n> ```')
  })

  it('protects nothing after a fence it does not protect, which a column-0 line could close', () => {
    expect(blockMarkdown('a\n  ```\n```\n<div>\n```')).toBe('a\n  ```\n```\n\\<div>\n```')
    expect(blockMarkdown('> ```\n```\n<div>\n```')).toBe('> ```\n```\n\\<div>\n```')
  })

  it('removes markers inside a fenced code block', () => {
    expect(blockMarkdown(`\`\`\`\n${MARKER_PREFIX}begin\n\`\`\``)).not.toContain(MARKER_PREFIX)
  })
})
