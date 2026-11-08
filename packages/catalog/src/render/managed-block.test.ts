import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  findManagedBlock,
  hashManagedBlock,
  MANAGED_BLOCK_BEGIN,
  MANAGED_BLOCK_END,
  wrapManagedBlock,
} from './managed-block.ts'
import { sha256Hex } from './sha256.ts'

describe('sha256Hex', () => {
  it.each([
    '',
    'abc',
    'é ✓ 漢字 🧶',
    'x'.repeat(55),
    'x'.repeat(56),
    'x'.repeat(64),
    'y'.repeat(1000),
  ])('matches node:crypto for %j', (text) => {
    expect(sha256Hex(text)).toBe(createHash('sha256').update(text, 'utf8').digest('hex'))
  })
})

describe('managed block', () => {
  const block = wrapManagedBlock('\n## Testing\n\n- Test it.\n')

  it('wraps a trimmed body between the markers', () => {
    expect(block).toBe(`${MANAGED_BLOCK_BEGIN}\n## Testing\n\n- Test it.\n${MANAGED_BLOCK_END}`)
  })

  it('hashes the block, markers included, whatever trailing line breaks follow', () => {
    const expected = `sha256:${createHash('sha256').update(block).digest('hex')}`
    expect(hashManagedBlock(block)).toBe(expected)
    expect(hashManagedBlock(`${block}\n\n`)).toBe(expected)
  })

  it('finds the block in a file and leaves the rest around it', () => {
    const text = `---\ntitle: x\n---\n# Mine\n\n${block}\n\nAfter.\n`
    const found = findManagedBlock(text)
    expect(found?.block).toBe(block)
    expect(text.slice(0, found?.start)).toBe('---\ntitle: x\n---\n# Mine\n\n')
    expect(text.slice(found?.end)).toBe('\n\nAfter.\n')
  })

  it('returns null without markers and throws on unbalanced or repeated ones', () => {
    expect(findManagedBlock('# Mine\n')).toBeNull()
    expect(() => findManagedBlock(MANAGED_BLOCK_BEGIN)).toThrow()
    expect(() => findManagedBlock(`${MANAGED_BLOCK_END}\n${MANAGED_BLOCK_BEGIN}`)).toThrow()
    expect(() => findManagedBlock(`${block}\n${block}`)).toThrow()
  })
})
