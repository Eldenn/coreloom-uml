import { cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'

afterEach(() => {
  cleanup()
})

// jsdom lacks these APIs that Radix menus rely on; provide no-op shims.
if (typeof Element !== 'undefined') {
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView ?? (() => {})
  Element.prototype.hasPointerCapture = Element.prototype.hasPointerCapture ?? (() => false)
  Element.prototype.releasePointerCapture = Element.prototype.releasePointerCapture ?? (() => {})
}
