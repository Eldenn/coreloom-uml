import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { AvatarUpload } from './avatar-upload'

function pngFile(name = 'a.png', size = 10) {
  const file = new File(['x'.repeat(size)], name, { type: 'image/png' })
  Object.defineProperty(file, 'size', { value: size })
  return file
}

describe('AvatarUpload', () => {
  it('shows the fallback when there is no value', () => {
    render(<AvatarUpload value={null} fallback="AB" onFileSelected={() => {}} />)
    expect(screen.getByText('AB')).toBeInTheDocument()
  })

  it('calls onFileSelected with a valid image', async () => {
    const onFileSelected = vi.fn()
    render(<AvatarUpload value={null} onFileSelected={onFileSelected} />)
    await userEvent.upload(screen.getByLabelText('Upload avatar'), pngFile())
    expect(onFileSelected).toHaveBeenCalledTimes(1)
    expect(onFileSelected.mock.calls[0]?.[0]).toBeInstanceOf(File)
  })

  it('rejects a disallowed file type without calling back', () => {
    const onFileSelected = vi.fn()
    render(<AvatarUpload value={null} onFileSelected={onFileSelected} accept={['image/png']} />)
    const gif = new File(['x'], 'a.gif', { type: 'image/gif' })
    // Inject past the input's `accept` filter (which user-event enforces) to exercise the
    // component's own type guard — mirrors a drag-drop or "All files" picker override.
    fireEvent.change(screen.getByLabelText('Upload avatar'), { target: { files: [gif] } })
    expect(onFileSelected).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('Unsupported file type')
  })

  it('rejects a file over maxSize', async () => {
    const onFileSelected = vi.fn()
    render(<AvatarUpload value={null} onFileSelected={onFileSelected} maxSize={5} />)
    await userEvent.upload(screen.getByLabelText('Upload avatar'), pngFile('big.png', 6))
    expect(onFileSelected).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('File is too large')
  })

  it('shows an uploading state and disables the button', () => {
    render(<AvatarUpload value={null} onFileSelected={() => {}} uploading />)
    expect(screen.getByRole('button')).toBeDisabled()
    expect(screen.getByRole('button')).toHaveTextContent('Uploading')
  })

  it('shows a disabled reason when disabled', () => {
    render(
      <AvatarUpload
        value={null}
        onFileSelected={() => {}}
        disabled
        disabledReason="Storage not configured"
      />,
    )
    expect(screen.getByRole('button')).toBeDisabled()
    expect(screen.getByText('Storage not configured')).toBeInTheDocument()
  })
})
