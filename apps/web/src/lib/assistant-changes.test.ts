import { describe, expect, it } from 'vitest'

import { applyChange, budgetLevel, type FlushResult } from './assistant-changes'

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

function fakeAutosave(flushResult: FlushResult) {
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
    exclusive: async <T>(task: () => Promise<T>) => {
      calls.push('hold')
      try {
        return await task()
      } finally {
        calls.push('release')
      }
    },
  }
}

describe('applyChange', () => {
  it('flushes before and resets after', async () => {
    const autosave = fakeAutosave('saved')
    const result = await applyChange(autosave, 'accept', { diagramId: 7 }, () => {
      autosave.calls.push('action')
      return Promise.resolve('done')
    })
    expect(result).toEqual({ done: 'done' })
    expect(autosave.calls).toEqual(['flush 7', 'hold', 'action', 'reset 7', 'release'])
  })

  it('holds saves back from the action until the reset', async () => {
    const autosave = fakeAutosave('saved')
    let saveRanDuringAction = false
    await applyChange(autosave, 'accept', { diagramId: 7 }, () => {
      // What the debounce timer would see while the accept is in flight.
      saveRanDuringAction = !autosave.calls.includes('hold') || autosave.calls.includes('release')
      return Promise.resolve('done')
    })
    expect(saveRanDuringAction).toBe(false)
    expect(autosave.calls.indexOf('reset 7')).toBeLessThan(autosave.calls.indexOf('release'))
  })

  it('does not reset and passes the error on when the action fails', async () => {
    const autosave = fakeAutosave('saved')
    const stale = new Error('409 stale change')
    await expect(
      applyChange(autosave, 'accept', { diagramId: 7 }, () => Promise.reject(stale)),
    ).rejects.toBe(stale)
    expect(autosave.calls).toEqual(['flush 7', 'hold', 'release'])
  })

  it('does not call the action when the flush fails', async () => {
    const autosave = fakeAutosave('failed')
    const result = await applyChange(autosave, 'undo', { diagramId: 7 }, () => {
      autosave.calls.push('action')
      return Promise.resolve('done')
    })
    expect(result).toEqual({ refused: 'failed' })
    expect(autosave.calls).toEqual(['flush 7'])
  })

  it('does not send the action nor reset the view when its text does not read', async () => {
    const autosave = fakeAutosave('unreadable')
    const result = await applyChange(autosave, 'accept', { diagramId: 7 }, () => {
      autosave.calls.push('action')
      return Promise.resolve('done')
    })
    expect(result).toEqual({ refused: 'unreadable' })
    expect(autosave.calls).toEqual(['flush 7'])
  })

  it('leaves the editor alone for a reject or a view not created yet', async () => {
    const autosave = fakeAutosave('failed')
    const action = () => {
      autosave.calls.push('action')
      return Promise.resolve('done')
    }
    await applyChange(autosave, 'reject', { diagramId: 7 }, action)
    await applyChange(autosave, 'accept', { diagramId: null }, action)
    expect(autosave.calls).toEqual(['action', 'action'])
  })
})
