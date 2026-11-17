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
    expect(blockMarkdown('`a` <div> `b`')).toBe('`a` \\<div> `b`')
  })

  it('keeps a tag inside a code span as written, where a backslash would show', () => {
    expect(blockMarkdown('Use `<div>` here')).toBe('Use `<div>` here')
    expect(blockMarkdown('Run ``tool <file> `x` `` and `a<b>`')).toBe(
      'Run ``tool <file> `x` `` and `a<b>`',
    )
    expect(blockMarkdown('```\n<b>\n```\nSee `<b>`')).toBe('```\n<b>\n```\nSee `<b>`')
  })

  it('reads an escaped backtick as plain text, not as a code span', () => {
    expect(blockMarkdown('\\`<div>`')).toBe('\\`\\<div>`')
    expect(blockMarkdown('\\``<div>`')).toBe('\\``<div>`')
    // Inside a span a backslash is plain text, so it does not stop the span from closing.
    expect(blockMarkdown('`<div>\\` <b>')).toBe('`<div>\\` \\<b>')
  })

  it('trusts no code span once a backtick run is left unpaired', () => {
    // The unpaired run may pair with one on the next line, which puts `<script>` outside code.
    expect(blockMarkdown('a `b\nc` <script> `d`')).toBe('a `b\nc` \\<script> `d`')
    expect(blockMarkdown('`a`` <b>\n`<i>`')).toBe('`a`` \\<b>\n`\\<i>`')
  })

  it('keeps no code span on a line that a table could split into cells', () => {
    expect(blockMarkdown('| `a | ` `<b>` |')).toBe('| `a | ` `\\<b>` |')
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

  it('lets no backslash cancel the escape of a tag', () => {
    // Each backslash before the tag is doubled, so the added one always escapes `<`.
    expect(blockMarkdown('\\<div>')).toBe('\\\\\\<div>')
    expect(blockMarkdown('\\\\<div>')).toBe('\\\\\\\\\\<div>')
    expect(blockMarkdown('```\n<b>\n```\n\\<div>')).toBe('```\n<b>\n```\n\\\\\\<div>')
    // A backslash elsewhere is kept as written.
    expect(blockMarkdown('a\\b <= c')).toBe('a\\b <= c')
  })

  it('opens no fence on a backtick line whose info string holds a backtick', () => {
    expect(blockMarkdown('``` a`b\n<div>\n```')).toBe('``` a`b\n\\<div>\n```')
  })

  it('removes markers inside a fenced code block', () => {
    expect(blockMarkdown(`\`\`\`\n${MARKER_PREFIX}begin\n\`\`\``)).not.toContain(MARKER_PREFIX)
  })
})
