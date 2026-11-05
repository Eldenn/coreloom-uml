import { useSelector } from '@tanstack/react-form'
import * as React from 'react'

import {
  describedBy,
  useFieldMeta,
  VerticalShell,
  type VerticalShellProps,
} from '@/components/ui/form'
import { ModelPicker } from '@/components/ui/model-picker'

function ModelField({
  label,
  description,
  className,
  labelAction,
  hideLabel,
  ...props
}: VerticalShellProps &
  Omit<
    React.ComponentProps<typeof ModelPicker>,
    | 'value'
    | 'defaultValue'
    | 'onValueChange'
    | 'onBlur'
    | 'id'
    | 'className'
    | 'aria-invalid'
    | 'aria-describedby'
    | 'aria-labelledby'
    | 'variant'
  >) {
  const meta = useFieldMeta()
  const field = meta.field
  const value = useSelector(field.store, (s) => s.value) as string | undefined
  return (
    <VerticalShell
      meta={meta}
      label={label}
      description={description}
      className={className}
      labelAction={labelAction}
      hideLabel={hideLabel}
    >
      <ModelPicker
        variant="outline"
        id={meta.id}
        value={value ?? ''}
        onValueChange={(id) => {
          field.handleChange(id)
        }}
        onBlur={field.handleBlur}
        aria-labelledby={meta.labelId}
        aria-invalid={meta.invalid || undefined}
        aria-describedby={describedBy(meta, description)}
        {...props}
      />
    </VerticalShell>
  )
}

export { ModelField }
