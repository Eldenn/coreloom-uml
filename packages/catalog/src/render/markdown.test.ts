import { describe, expect, it } from 'vitest'
import { blockMarkdown } from './markdown.ts'

const lines = (...text: string[]) => text.join('\n')

/** A tag no backslash escapes: raw HTML to a Markdown reader, unless a code block holds it. */
const RAW_TAG = /(?<!\\)<[a-z]/

describe('blockMarkdown', () => {
  it('escapes a tag outside a code block', () => {
    expect(blockMarkdown('Use <div> here.\n<!-- note -->\n</p>')).toBe(
      'Use \\<div> here.\n\\<!-- note -->\n\\</p>',
    )
    expect(blockMarkdown('a < b and 1 <2')).toBe('a < b and 1 <2')
  })

  it('keeps a tag inside a fenced code block as written', () => {
    for (const fence of ['```', '~~~', '````']) {
      const code = [`${fence}tsx`, 'const a: Array<string> = <div />', fence]

      expect(blockMarkdown(lines('Before <b>.', ...code, 'After <i>.')), fence).toBe(
        lines('Before \\<b>.', ...code, 'After \\<i>.'),
      )
    }
  })

  it('ends a fence only at one of the same character and at least as long', () => {
    expect(blockMarkdown(lines('````', '```', '<a>', '~~~', '<b>', '`````', '<c>'))).toBe(
      lines('````', '```', '<a>', '~~~', '<b>', '`````', '\\<c>'),
    )
    // A closing fence carries no text.
    expect(blockMarkdown(lines('```', '<a>', '``` js', '<b>', '```', '<c>'))).toBe(
      lines('```', '<a>', '``` js', '<b>', '```', '\\<c>'),
    )
  })

  it('escapes after a fence that never closes', () => {
    expect(blockMarkdown(lines('```', '<div>'))).toBe(lines('```', '\\<div>'))
    expect(blockMarkdown(lines('```', '<a>', '```', '~~~', '<b>', '```'))).toBe(
      lines('```', '<a>', '```', '~~~', '\\<b>', '```'),
    )
  })

  it('does not take three backticks that open a code span for a fence', () => {
    expect(blockMarkdown(lines('```a``` b', '<div>', '```'))).toBe(
      lines('```a``` b', '\\<div>', '```'),
    )
  })

  it('escapes from the first fence a list or a quote may hold to the end', () => {
    // Where such a fence ends depends on its block, which is not read here.
    for (const opening of ['- ```', '> ```', '1. ```', '    ```', '\t```', '- > ~~~']) {
      const text = lines(opening, 'code', '  ```', '  <div>', '  ```', '', '```', '<p>', '```')

      expect(blockMarkdown(text), opening).not.toMatch(RAW_TAG)
    }
  })

  it('escapes when an indented fence could end with its list item', () => {
    // In a list item, `<div>` would leave the item, close the fence and be read as HTML.
    const item = lines('- item', '  ```', '  code', '<div>', '  ```', '', '```', '<p>', '```')
    expect(blockMarkdown(item)).not.toMatch(RAW_TAG)

    const lower = lines('- item', '  ```', '  code', '```', '```', '<div>', '```')
    expect(blockMarkdown(lower)).not.toMatch(RAW_TAG)

    const inside = lines('- item', '', '  ```', '  <div>', '', '   <p>', '  ```')
    expect(blockMarkdown(inside)).toBe(inside)
  })

  it('removes markers inside a fence too', () => {
    expect(
      blockMarkdown(lines('```', '<!-- coreloom-uml:end -->', '```', 'coreloom-uml:start')),
    ).toBe(lines('```', '<!-- coreloom-uml end -->', '```', 'coreloom-uml start'))
  })

  it('normalises line endings, trailing spaces and blank runs', () => {
    expect(blockMarkdown('\r\n a  \r\n\r\n\r\n\r\nb\r\n```\r\n<c>  \r\n```\r\n')).toBe(
      'a\n\nb\n```\n<c>\n```',
    )
  })
})
