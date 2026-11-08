import { expect, it } from 'vitest'
import { lineDiff } from '../src/diff.ts'

it('shows removed and added lines with their context', () => {
  const before = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].join('\n')
  const after = ['a', 'b', 'c', 'D', 'e', 'f', 'g'].join('\n')
  expect(lineDiff(before, after)).toBe(
    ['  …', '  b', '  c', '- d', '+ D', '  e', '  f', '  …'].join('\n'),
  )
})

it('handles empty sides', () => {
  expect(lineDiff('', 'x\ny')).toBe(['+ x', '+ y'].join('\n'))
  expect(lineDiff('x', '')).toBe('- x')
})
