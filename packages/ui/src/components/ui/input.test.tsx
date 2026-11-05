import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { Input } from './input'

describe('Input', () => {
  it('accepts typed text', async () => {
    const user = userEvent.setup()
    render(<Input aria-label="Email" />)
    const input = screen.getByLabelText('Email')
    await user.type(input, 'hello')
    expect(input).toHaveValue('hello')
  })

  it('respects the disabled state', () => {
    render(<Input aria-label="Email" disabled />)
    expect(screen.getByLabelText('Email')).toBeDisabled()
  })
})
