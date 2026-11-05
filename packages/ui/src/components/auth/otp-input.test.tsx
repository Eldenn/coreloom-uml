import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { OtpInput } from './otp-input'

function Harness({ onComplete }: { onComplete?: (value: string) => void }) {
  const [value, setValue] = useState('')
  return (
    <OtpInput
      length={4}
      value={value}
      onChange={setValue}
      // Spread conditionally rather than `onComplete={onComplete}`: under this repo's
      // `exactOptionalPropertyTypes`, an optional prop rejects an explicit `undefined`
      // value, so the key must be omitted entirely when there is no handler.
      {...(onComplete ? { onComplete } : {})}
      aria-label="Code"
    />
  )
}

// `getAllByRole` returns `HTMLElement[]`, but this repo's `noUncheckedIndexedAccess`
// makes every index access `HTMLElement | undefined`. The tests below always render
// exactly four boxes, so this local helper asserts that known, fixed shape once.
function getBoxes(): [HTMLElement, HTMLElement, HTMLElement, HTMLElement] {
  return screen.getAllByRole('textbox') as [HTMLElement, HTMLElement, HTMLElement, HTMLElement]
}

describe('OtpInput', () => {
  it('renders one box per digit with the group aria-label and per-box labels', () => {
    render(<Harness />)
    expect(screen.getByRole('group', { name: 'Code' })).toBeInTheDocument()
    expect(screen.getAllByRole('textbox')).toHaveLength(4)
    expect(screen.getByLabelText('Digit 1 of 4')).toBeInTheDocument()
    expect(screen.getByLabelText('Digit 4 of 4')).toBeInTheDocument()
  })

  it('typing a digit auto-advances focus to the next box', async () => {
    render(<Harness />)
    const boxes = getBoxes()
    await userEvent.type(boxes[0], '12')
    expect(boxes[0]).toHaveValue('1')
    expect(boxes[1]).toHaveValue('2')
    expect(boxes[2]).toHaveFocus()
  })

  it('backspace on an empty box moves focus to and clears the previous box', async () => {
    render(<Harness />)
    const boxes = getBoxes()
    await userEvent.type(boxes[0], '1')
    boxes[1].focus()
    await userEvent.keyboard('{Backspace}')
    expect(boxes[0]).toHaveValue('')
    expect(boxes[0]).toHaveFocus()
  })

  it('pastes digits across boxes starting at the focused index', async () => {
    render(<Harness />)
    const boxes = getBoxes()
    boxes[0].focus()
    await userEvent.paste('1234')
    boxes.forEach((box, index) => {
      expect(box).toHaveValue(String(index + 1))
    })
  })

  it('calls onComplete once all boxes are filled', async () => {
    const onComplete = vi.fn()
    render(<Harness onComplete={onComplete} />)
    const boxes = getBoxes()
    await userEvent.type(boxes[0], '1234')
    expect(onComplete).toHaveBeenCalledTimes(1)
    expect(onComplete).toHaveBeenCalledWith('1234')
  })

  it('ignores non-digit input', async () => {
    render(<Harness />)
    const boxes = getBoxes()
    await userEvent.type(boxes[0], 'a1b')
    expect(boxes[0]).toHaveValue('1')
    expect(boxes[1]).toHaveValue('')
  })

  it('disables every box when disabled', () => {
    render(<OtpInput length={4} value="" onChange={() => {}} disabled aria-label="Code" />)
    for (const box of screen.getAllByRole('textbox')) {
      expect(box).toBeDisabled()
    }
  })
})
