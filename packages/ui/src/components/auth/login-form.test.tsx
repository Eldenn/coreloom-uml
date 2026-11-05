import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { LoginForm } from './login-form'

describe('LoginForm', () => {
  it('submits the entered email and password', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<LoginForm onSubmit={onSubmit} />)
    await user.type(screen.getByLabelText('Email'), 'jane@example.com')
    await user.type(screen.getByLabelText('Password'), 'secret123')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(onSubmit).toHaveBeenCalledWith({ email: 'jane@example.com', password: 'secret123' })
  })

  it('renders an error alert', () => {
    render(<LoginForm onSubmit={vi.fn()} error="Invalid credentials" />)
    expect(screen.getByRole('alert')).toHaveTextContent('Invalid credentials')
  })

  it('disables the submit button while loading', () => {
    render(<LoginForm onSubmit={vi.fn()} isLoading />)
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeDisabled()
  })

  it('renders the social slot', () => {
    render(<LoginForm onSubmit={vi.fn()} social={<span data-testid="social" />} />)
    expect(screen.getByTestId('social')).toBeInTheDocument()
  })
})

describe('LoginForm password policy', () => {
  it('does not render requirements or gate submit by default', () => {
    render(<LoginForm onSubmit={vi.fn()} submitLabel="Create account" />)
    expect(screen.queryByText('At least 12 characters')).toBeNull()
    expect(screen.getByRole('button', { name: 'Create account' })).toBeEnabled()
  })

  it('gates submit until the password satisfies the policy', async () => {
    const user = userEvent.setup()
    render(<LoginForm onSubmit={vi.fn()} submitLabel="Create account" enforcePasswordPolicy />)
    const submit = screen.getByRole('button', { name: 'Create account' })
    expect(screen.getByText('At least 12 characters')).toBeInTheDocument()
    expect(submit).toBeDisabled()

    await user.type(screen.getByLabelText('Password'), 'Wm9!qpXz74te')
    expect(submit).toBeEnabled()
  })
})
