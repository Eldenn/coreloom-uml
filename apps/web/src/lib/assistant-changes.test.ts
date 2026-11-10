import { describe, expect, it } from 'vitest'

import { applyChange, budgetLevel } from './assistant-changes'

const budget = (history: number) => ({
  system: 100,
  diagrams: 600,
  history,
  max: 1000,
  skipped: [],
})

describe('budgetLevel', () => {
  it('is ok below the warning ratio', () => {
    expect(budgetLevel(budget(99))).toBe('ok')
  })

  it('warns from 80% of the maximum', () => {
    expect(budgetLevel(budget(100))).toBe('warn')
    expect(budgetLevel(budget(300))).toBe('warn')
  })

  it('is full only past the maximum', () => {
    expect(budgetLevel(budget(301))).toBe('full')
  })
})

function fakeAutosave(flushResult: boolean) {
  const calls: string[] = []
  return {
    calls,
    flushDiagram: (id: number) => {
      calls.push(`flush ${id}`)
      return Promise.resolve(flushResult)
    },
    reset: (id: number) => {
      calls.push(`reset ${id}`)
    },
  }
}

describe('applyChange', () => {
  it('flushes before and resets after', async () => {
    const autosave = fakeAutosave(true)
    const result = await applyChange(autosave, 'accept', { diagramId: 7 }, () => {
      autosave.calls.push('action')
      return Promise.resolve('done')
    })
    expect(result).toBe('done')
    expect(autosave.calls).toEqual(['flush 7', 'action', 'reset 7'])
  })

  it('does not call the action when the flush fails', async () => {
    const autosave = fakeAutosave(false)
    const result = await applyChange(autosave, 'undo', { diagramId: 7 }, () => {
      autosave.calls.push('action')
      return Promise.resolve('done')
    })
    expect(result).toBeNull()
    expect(autosave.calls).toEqual(['flush 7'])
  })

  it('leaves the editor alone for a reject or a view not created yet', async () => {
    const autosave = fakeAutosave(false)
    const action = () => {
      autosave.calls.push('action')
      return Promise.resolve('done')
    }
    await applyChange(autosave, 'reject', { diagramId: 7 }, action)
    await applyChange(autosave, 'accept', { diagramId: null }, action)
    expect(autosave.calls).toEqual(['action', 'action'])
  })
})
