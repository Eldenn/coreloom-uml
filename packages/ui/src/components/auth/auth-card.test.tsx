import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { AuthCard } from './auth-card'

describe('AuthCard', () => {
  it('renders the provided slots', () => {
    render(
      <AuthCard
        logo={<span data-testid="logo" />}
        title="Welcome back"
        description="Sign in to continue"
        footer={<span data-testid="footer" />}
      >
        <span data-testid="body" />
      </AuthCard>,
    )
    expect(screen.getByTestId('logo')).toBeInTheDocument()
    expect(screen.getByText('Welcome back')).toBeInTheDocument()
    expect(screen.getByText('Sign in to continue')).toBeInTheDocument()
    expect(screen.getByTestId('body')).toBeInTheDocument()
    expect(screen.getByTestId('footer')).toBeInTheDocument()
  })

  it('omits optional slots when not provided', () => {
    render(
      <AuthCard title="Welcome">
        <span data-testid="body" />
      </AuthCard>,
    )
    expect(screen.queryByTestId('logo')).not.toBeInTheDocument()
    expect(screen.getByTestId('body')).toBeInTheDocument()
  })
})
