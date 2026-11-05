import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { AuthStatus } from './auth-status'

describe('AuthStatus', () => {
  it('renders a polite status region with a spinner for the loading variant', () => {
    render(<AuthStatus variant="loading" title="Signing you in" description="Hold on a moment." />)
    const status = screen.getByRole('status')
    expect(status).toHaveAttribute('aria-live', 'polite')
    expect(status).toHaveTextContent('Signing you in')
    expect(status).toHaveTextContent('Hold on a moment.')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('defaults to the loading variant', () => {
    render(<AuthStatus title="Working" />)
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('renders an alert region and the action for the error variant', () => {
    render(
      <AuthStatus
        variant="error"
        title="Sign-in failed"
        description="Something went wrong."
        action={<button type="button">Back to sign in</button>}
      />,
    )
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('Sign-in failed')
    expect(screen.getByRole('button', { name: 'Back to sign in' })).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('omits the description and action when not provided', () => {
    render(<AuthStatus variant="loading" title="Just a title" />)
    const status = screen.getByRole('status')
    expect(status).toHaveTextContent('Just a title')
    expect(status.querySelectorAll('p')).toHaveLength(0)
  })
})
