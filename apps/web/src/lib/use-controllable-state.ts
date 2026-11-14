// Coreloom UI — useControllableState. One value that the parent may own (`value` + `onChange`) or
// leave to the component (`defaultValue`), so a component offers both without two code paths.
import * as React from 'react'

interface ControllableState<T> {
  /** The parent's value. `undefined` leaves the value to the component. */
  value: T | undefined
  /** The first value when the parent doesn't own it. */
  defaultValue: T
  /** Called with every new value, owned or not. */
  onChange?: ((value: T) => void) | undefined
}

/**
 * `[value, setValue]`, like `useState`. With a `value` from the parent it shows that value and only
 * reports changes; without one it keeps its own, starting from `defaultValue`.
 */
function useControllableState<T>({
  value,
  defaultValue,
  onChange,
}: ControllableState<T>): readonly [T, (next: T) => void] {
  const [own, setOwn] = React.useState(defaultValue)
  const controlled = value !== undefined
  const setValue = (next: T) => {
    if (!controlled) setOwn(next)
    onChange?.(next)
  }
  return [controlled ? value : own, setValue] as const
}

export { type ControllableState, useControllableState }
