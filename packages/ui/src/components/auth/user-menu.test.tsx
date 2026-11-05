import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { UserMenu } from './user-menu'

describe('UserMenu', () => {
  it('renders initials derived from the name', () => {
    render(<UserMenu user={{ name: 'Jane Doe', email: 'jane@example.com' }} onSignOut={vi.fn()} />)
    expect(screen.getByText('JD')).toBeInTheDocument()
  })

  it('shows name and email when opened and fires onSignOut', async () => {
    const user = userEvent.setup()
    const onSignOut = vi.fn()
    render(
      <UserMenu user={{ name: 'Jane Doe', email: 'jane@example.com' }} onSignOut={onSignOut} />,
    )
    await user.click(screen.getByRole('button', { name: 'Open user menu' }))
    expect(await screen.findByText('jane@example.com')).toBeInTheDocument()
    await user.click(screen.getByRole('menuitem', { name: 'Sign out' }))
    expect(onSignOut).toHaveBeenCalledOnce()
  })

  it('renders a custom sign-out label when provided', async () => {
    const user = userEvent.setup()
    render(
      <UserMenu
        user={{ name: 'Ada', email: 'ada@example.com' }}
        onSignOut={vi.fn()}
        signOutLabel="Se déconnecter"
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Open user menu' }))
    expect(await screen.findByText('Se déconnecter')).toBeInTheDocument()
  })
})
