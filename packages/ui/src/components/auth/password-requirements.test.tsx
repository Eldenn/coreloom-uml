import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PasswordRequirements } from './password-requirements'

describe('PasswordRequirements', () => {
  it('shows every rule unmet for an empty password', () => {
    render(<PasswordRequirements password="" />)
    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(4)
    for (const item of items) expect(item).toHaveAttribute('data-met', 'false')
  })

  it('marks all rules met for a strong password', () => {
    render(<PasswordRequirements password="Wm9!qpXz74te" />)
    const items = screen.getAllByRole('listitem')
    for (const item of items) expect(item).toHaveAttribute('data-met', 'true')
  })

  it('marks the user-info rule unmet when the password contains the email', () => {
    render(<PasswordRequirements password="matthieuXY99!" context={{ email: 'matthieu@x.io' }} />)
    const userInfo = screen.getByText('Does not contain your email or name').closest('li')
    expect(userInfo).toHaveAttribute('data-met', 'false')
  })
})
