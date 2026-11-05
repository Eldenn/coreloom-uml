import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { SignInButton } from './sign-in-button'

describe('SignInButton', () => {
  it('renders its label and icon slot', () => {
    render(<SignInButton icon={<span data-testid="icon" />}>Continue with Logto</SignInButton>)
    expect(screen.getByRole('button', { name: 'Continue with Logto' })).toBeInTheDocument()
    expect(screen.getByTestId('icon')).toBeInTheDocument()
  })

  it('calls onClick when pressed', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(<SignInButton onClick={onClick}>Continue</SignInButton>)
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('is disabled and does not fire onClick while loading', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(
      <SignInButton isLoading onClick={onClick}>
        Continue
      </SignInButton>,
    )
    const button = screen.getByRole('button', { name: 'Continue' })
    expect(button).toBeDisabled()
    await user.click(button)
    expect(onClick).not.toHaveBeenCalled()
  })
})
