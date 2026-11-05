'use client'

// Coreloom UI — RichTextField: RichTextEditor in the form kit. Use it inside <form.AppField>:
//
//   <form.AppField name="body">{() => <RichTextField label="Description" />}</form.AppField>
//
// It lives apart from form.tsx so the form kit doesn't pull in the editor. The value is HTML ("" when
// empty); sanitize it on the server.
import { useSelector } from '@tanstack/react-form'
import * as React from 'react'

import {
  describedBy,
  useFieldMeta,
  VerticalShell,
  type VerticalShellProps,
} from '@/components/ui/form'
import { RichTextEditor } from '@/components/ui/rich-text-editor'

function RichTextField({
  label,
  description,
  className,
  labelAction,
  hideLabel,
  ...props
}: VerticalShellProps &
  Omit<
    React.ComponentProps<typeof RichTextEditor>,
    | 'value'
    | 'defaultValue'
    | 'onValueChange'
    | 'onBlur'
    | 'id'
    | 'className'
    | 'aria-invalid'
    | 'aria-describedby'
    | 'aria-labelledby'
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
      <RichTextEditor
        id={meta.id}
        value={value ?? ''}
        onValueChange={(html) => {
          field.handleChange(html)
        }}
        onBlur={field.handleBlur}
        // The writing area is a contenteditable, which a <label for> can't name: point at the label.
        aria-labelledby={meta.labelId}
        aria-invalid={meta.invalid || undefined}
        aria-describedby={describedBy(meta, description)}
        {...props}
      />
    </VerticalShell>
  )
}

export { RichTextField }
