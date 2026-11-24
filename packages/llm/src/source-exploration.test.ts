import { describe, expect, it } from 'vitest'
import { exploreSource, SOURCE_EXPLORATION } from './source-exploration.ts'
import { failingModel, toolCallingModel } from './testing/mock-model.ts'

const input = (run: (command: string) => { exitCode: number; output: string }) => ({
  task: 'A sequence diagram will be drawn.',
  subject: ['function src/orders.ts:2'],
  files: ['src/orders.ts'],
  run: async (command: string) => run(command),
})
const run = (command: string) => ({ calls: [{ tool: 'run', input: { command } }] })

describe('exploreSource', () => {
  it('answers what the commands printed, never what the model says', async () => {
    const commands: string[] = []
    const model = toolCallingModel([
      run('grep -rn charge src'),
      run('true'),
      { text: 'DONE, and the ledger is charged twice.' },
    ])
    const outputs = await exploreSource(
      model,
      input((command) => {
        commands.push(command)
        return command === 'true'
          ? { exitCode: 0, output: '' }
          : { exitCode: 0, output: 'src/ledger.ts:4: charge()\n' }
      }),
    )
    expect(commands).toEqual(['grep -rn charge src', 'true'])
    // A command that printed nothing is no source.
    expect(outputs).toEqual([
      { path: '$ grep -rn charge src', text: 'src/ledger.ts:4: charge()\n', partial: false },
    ])
    const prompt = JSON.stringify(model.doGenerateCalls[0]?.prompt)
    expect(prompt).toContain('src/orders.ts')
    expect(prompt).toContain('A sequence diagram will be drawn.')
  })

  it('cuts one output and stops keeping them past the total', async () => {
    const steps = Array.from({ length: 5 }, (_, index) => run(`cat ${String(index)}`))
    const outputs = await exploreSource(
      toolCallingModel([...steps, { text: 'DONE' }]),
      input(() => ({ exitCode: 0, output: 'x'.repeat(SOURCE_EXPLORATION.outputChars * 2) })),
    )
    expect(outputs).toHaveLength(SOURCE_EXPLORATION.totalChars / SOURCE_EXPLORATION.outputChars)
    expect(outputs.every((output) => output.partial)).toBe(true)
    expect(outputs.every((output) => output.text.length <= SOURCE_EXPLORATION.outputChars)).toBe(
      true,
    )
  })

  it('never throws: a failing model or a failing sandbox answers what was printed so far', async () => {
    expect(
      await exploreSource(
        failingModel(new Error('boom')),
        input(() => ({ exitCode: 0, output: 'x' })),
      ),
    ).toEqual([])
    let count = 0
    const outputs = await exploreSource(
      toolCallingModel([run('ls'), run('ls -a'), { text: 'DONE' }]),
      input(() => {
        count += 1
        if (count === 2) throw new Error('sandbox gone')
        return { exitCode: 0, output: 'src\n' }
      }),
    )
    expect(outputs).toEqual([{ path: '$ ls', text: 'src\n', partial: false }])
  })
})
