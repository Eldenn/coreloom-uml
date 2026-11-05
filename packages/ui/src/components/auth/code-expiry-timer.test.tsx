import { render, screen } from '@testing-library/react'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { CodeExpiryTimer } from './code-expiry-timer'

const START = new Date('2026-01-01T00:00:00.000Z').getTime()

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(START)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('CodeExpiryTimer', () => {
  it('renders the initial remaining time via renderLabel', () => {
    render(
      <CodeExpiryTimer
        expiresAt={START + 65_000}
        renderLabel={({ remainingSeconds }) => `${remainingSeconds}s left`}
      />,
    )
    expect(screen.getByRole('status')).toHaveTextContent('65s left')
  })

  it('ticks the remaining time down every second', () => {
    render(
      <CodeExpiryTimer
        expiresAt={START + 65_000}
        renderLabel={({ remainingSeconds }) => `${remainingSeconds}s left`}
      />,
    )
    act(() => {
      vi.advanceTimersByTime(5_000)
    })
    expect(screen.getByRole('status')).toHaveTextContent('60s left')
  })

  it('switches to the destructive style once 60 seconds remain', () => {
    render(
      <CodeExpiryTimer
        expiresAt={START + 61_000}
        renderLabel={({ remainingSeconds, isExpired }) =>
          isExpired ? 'expired' : `${remainingSeconds}s`
        }
      />,
    )
    expect(screen.getByRole('status')).not.toHaveClass('text-destructive')
    act(() => {
      vi.advanceTimersByTime(1_000)
    })
    expect(screen.getByRole('status')).toHaveClass('text-destructive')
  })

  it('reports isExpired once the remaining time hits zero', () => {
    render(
      <CodeExpiryTimer
        expiresAt={START + 2_000}
        renderLabel={({ isExpired }) => (isExpired ? 'expired' : 'active')}
      />,
    )
    expect(screen.getByRole('status')).toHaveTextContent('active')
    act(() => {
      vi.advanceTimersByTime(2_000)
    })
    expect(screen.getByRole('status')).toHaveTextContent('expired')
  })

  it('calls onExpire exactly once when the countdown reaches zero', () => {
    const onExpire = vi.fn()
    render(
      <CodeExpiryTimer expiresAt={START + 3_000} onExpire={onExpire} renderLabel={() => null} />,
    )
    act(() => {
      vi.advanceTimersByTime(3_000)
    })
    expect(onExpire).toHaveBeenCalledTimes(1)
    act(() => {
      vi.advanceTimersByTime(5_000)
    })
    expect(onExpire).toHaveBeenCalledTimes(1)
  })
})
