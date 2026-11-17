import { skillAffinitySchema } from '@coreloom-uml/catalog'
import { test } from '@japa/runner'
import {
  convertScaleAffinity,
  restoreScaleAffinity,
} from '#database/migrations/1732200000001_convert-skill-scale-affinities'

test.group('Skills - scale affinities migration', () => {
  test('rewrites a scale affinity against the rules that replace the scale', ({ assert }) => {
    const scale = (slot: string, min: number, max: number) => ({ slot, scale: { min, max } })

    assert.deepEqual(convertScaleAffinity(scale('typescript.any', 4, 5)), {
      slot: 'typescript.any',
      values: ['agree'],
      against: ['disagree'],
    })
    assert.deepEqual(convertScaleAffinity(scale('workflow.autonomy', 5, 5)), {
      slot: 'workflow.autonomy',
      values: ['agree', 'ask-before-writing'],
      against: ['disagree'],
    })
    assert.deepEqual(convertScaleAffinity(scale('react.granularity', 1, 2)), {
      slot: 'react.granularity',
      values: ['disagree'],
      against: ['agree'],
    })
    for (const [min, max] of [
      [3, 5],
      [1, 3],
      [3, 3],
    ]) {
      assert.isNull(convertScaleAffinity(scale('workflow.changes', min, max)))
    }

    // What it writes is an affinity of the current catalog.
    for (const slot of ['typescript.any', 'workflow.autonomy']) {
      assert.isTrue(skillAffinitySchema.safeParse(convertScaleAffinity(scale(slot, 4, 5))).success)
    }
  })

  test('keeps any other affinity, and restores what it converted', ({ assert }) => {
    const values = { slot: 'testing.levels', values: ['e2e'] }
    const diagrams = { diagramKinds: ['c4'] }
    assert.deepEqual(convertScaleAffinity(values), values)
    assert.deepEqual(convertScaleAffinity(diagrams), diagrams)
    assert.deepEqual(restoreScaleAffinity(values), values)
    assert.deepEqual(restoreScaleAffinity(diagrams), diagrams)

    const agree = convertScaleAffinity({ slot: 'workflow.autonomy', scale: { min: 4, max: 5 } })
    assert.deepEqual(restoreScaleAffinity(agree ?? {}), {
      slot: 'workflow.autonomy',
      scale: { min: 4, max: 5 },
    })
    const disagree = convertScaleAffinity({ slot: 'typescript.any', scale: { min: 1, max: 2 } })
    assert.deepEqual(restoreScaleAffinity(disagree ?? {}), {
      slot: 'typescript.any',
      scale: { min: 1, max: 2 },
    })
  })
})
