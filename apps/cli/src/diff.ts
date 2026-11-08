/** Beyond this many lines on either side, the diff only says the blocks differ. */
const MAX_DIFF_LINES = 2_000

/** Unchanged lines shown around each change. */
const CONTEXT_LINES = 2

type Line = { sign: ' ' | '-' | '+'; text: string }

/** A unified-style line diff of two texts (`-` before, `+` after), for the terminal. */
export function lineDiff(before: string, after: string): string {
  const a = before === '' ? [] : before.split('\n')
  const b = after === '' ? [] : after.split('\n')
  if (a.length > MAX_DIFF_LINES || b.length > MAX_DIFF_LINES) {
    return `  (${a.length} lines → ${b.length} lines; too long to show)`
  }

  // Longest common subsequence, from the end, so the walk below goes forward.
  const lcs: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  )
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      const row = lcs[i] as number[]
      row[j] =
        a[i] === b[j]
          ? ((lcs[i + 1] as number[])[j + 1] as number) + 1
          : Math.max((lcs[i + 1] as number[])[j] as number, row[j + 1] as number)
    }
  }

  const lines: Line[] = []
  let i = 0
  let j = 0
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      lines.push({ sign: ' ', text: a[i] as string })
      i++
      j++
    } else if (
      i < a.length &&
      (j >= b.length ||
        ((lcs[i + 1] as number[])[j] as number) >= ((lcs[i] as number[])[j + 1] as number))
    ) {
      lines.push({ sign: '-', text: a[i] as string })
      i++
    } else {
      lines.push({ sign: '+', text: b[j] as string })
      j++
    }
  }

  const shown = lines.map((_line, index) =>
    lines
      .slice(Math.max(0, index - CONTEXT_LINES), index + CONTEXT_LINES + 1)
      .some((near) => near.sign !== ' '),
  )
  const out: string[] = []
  let skipped = false
  lines.forEach((line, index) => {
    if (!shown[index]) {
      if (!skipped) out.push('  …')
      skipped = true
      return
    }
    skipped = false
    out.push(`${line.sign} ${line.text}`)
  })
  return out.join('\n')
}
