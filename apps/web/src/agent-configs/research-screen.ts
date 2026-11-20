import type { ResearchStep } from '@/lib/llm-provider'

const DIM = '\x1b[2m'
const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const RESET = '\x1b[0m'

/**
 * An address or a command comes from the model, which read untrusted pages: every control
 * character but the line feed goes, so nothing in it can recolour, move or erase the screen.
 */
function plain(label: string): string {
  // eslint-disable-next-line no-control-regex -- matching control characters is the point
  return label.replace(/[\x00-\x09\x0b-\x1f\x7f-\x9f]/g, '')
}

/**
 * The steps of a research as the screen of a terminal (ANSI): one prompt line per step, then how
 * it ended, or a cursor while it runs. A page is read with curl in the sandbox, so it is shown as
 * one (the options of the real command line are left out).
 */
export function researchScreen(steps: readonly ResearchStep[], failed: string): string {
  return steps
    .map((step) => {
      const command = plain(step.kind === 'page' ? `curl ${step.label}` : step.label)
      const end = {
        running: '▍',
        done: `${GREEN}✓${RESET}`,
        failed: `${RED}✗ ${failed}${RESET}`,
      }[step.state]
      return `${DIM}$${RESET} ${command}\n${end}`
    })
    .join('\n')
}
