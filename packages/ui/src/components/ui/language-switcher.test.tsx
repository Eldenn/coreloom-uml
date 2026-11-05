import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { LanguageSwitcher } from './language-switcher'

const options = [
  { code: 'en', label: 'English' },
  { code: 'fr', label: 'Français' },
]

describe('LanguageSwitcher', () => {
  it('shows the current language label on the trigger', () => {
    render(<LanguageSwitcher value="en" onChange={() => {}} options={options} />)
    expect(screen.getByRole('button')).toHaveTextContent('English')
  })

  it('calls onChange with the selected code', async () => {
    const onChange = vi.fn()
    render(<LanguageSwitcher value="en" onChange={onChange} options={options} />)
    await userEvent.click(screen.getByRole('button'))
    await userEvent.click(await screen.findByText('Français'))
    expect(onChange).toHaveBeenCalledWith('fr')
  })
})
