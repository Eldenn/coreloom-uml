import { cva, type VariantProps } from 'class-variance-authority'
import { CheckIcon, CopyIcon, EyeIcon, EyeOffIcon, SearchIcon, XIcon } from 'lucide-react'
import * as React from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useCoreloomI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

function InputGroup({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="input-group"
      role="group"
      className={cn(
        'group/input-group relative flex h-[42px] w-full min-w-0 items-center rounded-md border border-input bg-inset font-sans text-[14px] transition-[border-color,box-shadow] duration-base ease-out outline-none',
        'has-[>textarea]:h-auto',
        // Addons on the sides take the field's own padding.
        'has-[>[data-align=inline-end]]:[&>input]:pr-2 has-[>[data-align=inline-start]]:[&>input]:pl-2',
        // Addons above or below stack the group.
        'has-[>[data-align=block-end]]:h-auto has-[>[data-align=block-end]]:flex-col has-[>[data-align=block-start]]:h-auto has-[>[data-align=block-start]]:flex-col has-[>[data-align=block-end]]:[&>input]:pt-3 has-[>[data-align=block-start]]:[&>input]:pb-3',
        'has-[[data-slot=input-group-control]:focus-visible]:border-primary has-[[data-slot=input-group-control]:focus-visible]:ring-[3px] has-[[data-slot=input-group-control]:focus-visible]:ring-ring',
        'has-[[data-slot][aria-invalid=true]]:border-destructive has-[[data-slot][aria-invalid=true]]:ring-[3px] has-[[data-slot][aria-invalid=true]]:ring-destructive-subtle',
        'has-[[data-slot=input-group-control]:disabled]:cursor-not-allowed has-[[data-slot=input-group-control]:disabled]:opacity-55',
        className,
      )}
      {...props}
    />
  )
}

const inputGroupAddonVariants = cva(
  "flex h-auto cursor-text items-center justify-center gap-2 py-1.5 text-[13px] font-medium text-muted-foreground select-none [&>kbd]:rounded-[4px] [&>svg:not([class*='size-'])]:size-4",
  {
    variants: {
      align: {
        'inline-start': 'order-first pl-[13px] has-[>button]:-ml-1.5 has-[>kbd]:-ml-1',
        'inline-end': 'order-last pr-[13px] has-[>button]:-mr-1.5 has-[>kbd]:-mr-1',
        'block-start':
          'order-first w-full justify-start px-[13px] pt-2.5 group-has-[>input]/input-group:pt-2.5 [.border-b]:pb-2.5',
        'block-end':
          'order-last w-full justify-start px-[13px] pb-2.5 group-has-[>input]/input-group:pb-2.5 [.border-t]:pt-2.5',
      },
    },
    defaultVariants: { align: 'inline-start' },
  },
)

function InputGroupAddon({
  className,
  align = 'inline-start',
  onClick,
  ...props
}: React.ComponentProps<'div'> & VariantProps<typeof inputGroupAddonVariants>) {
  return (
    // A click on the addon's padding focuses the field, like a click on a label; the control
    // itself stays the only tab stop, so the div needs no key handler.
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- pointer convenience only; keyboard users reach the field directly.
    <div
      data-slot="input-group-addon"
      data-align={align}
      className={cn(inputGroupAddonVariants({ align }), className)}
      onClick={(e) => {
        onClick?.(e)
        if ((e.target as HTMLElement).closest('button, a, input, textarea, select')) return
        e.currentTarget.parentElement
          ?.querySelector<HTMLElement>('[data-slot=input-group-control]')
          ?.focus()
      }}
      {...props}
    />
  )
}

const inputGroupButtonVariants = cva('flex items-center gap-2 shadow-none', {
  variants: {
    size: {
      xs: "h-6 gap-1 rounded-[4px] px-2 text-[12.5px] has-[>svg]:px-2 [&>svg:not([class*='size-'])]:size-3.5",
      sm: 'h-8 gap-1.5 rounded-sm px-2.5 text-[13px] has-[>svg]:px-2.5',
      'icon-xs': 'size-6 rounded-[4px] p-0 has-[>svg]:p-0',
      'icon-sm': 'size-8 rounded-sm p-0 has-[>svg]:p-0',
    },
  },
  defaultVariants: { size: 'xs' },
})

function InputGroupButton({
  className,
  type = 'button',
  variant = 'ghost',
  size = 'xs',
  ...props
}: Omit<React.ComponentProps<typeof Button>, 'size'> &
  VariantProps<typeof inputGroupButtonVariants>) {
  return (
    <Button
      type={type}
      data-size={size}
      variant={variant}
      className={cn(inputGroupButtonVariants({ size }), className)}
      {...props}
    />
  )
}

function InputGroupText({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      data-slot="input-group-text"
      className={cn(
        "flex items-center gap-2 text-[13px] text-muted-foreground [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    />
  )
}

function InputGroupInput({ className, ...props }: React.ComponentProps<'input'>) {
  return (
    <Input
      data-slot="input-group-control"
      className={cn(
        'h-full flex-1 rounded-none border-0 bg-transparent shadow-none focus-visible:ring-0 aria-invalid:ring-0',
        className,
      )}
      {...props}
    />
  )
}

function InputGroupTextarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <Textarea
      data-slot="input-group-control"
      className={cn(
        'flex-1 resize-none rounded-none border-0 bg-transparent py-3 shadow-none focus-visible:ring-0 aria-invalid:ring-0',
        className,
      )}
      {...props}
    />
  )
}

/** A password field with a show/hide button. The button is a toggle (`aria-pressed`). */
function PasswordInput({
  className,
  showLabel,
  ...props
}: Omit<React.ComponentProps<'input'>, 'type'> & {
  /** Accessible name of the show/hide button; defaults to the i18n text ("Show password"). */
  showLabel?: string
}) {
  const t = useCoreloomI18n().messages.inputs
  const [visible, setVisible] = React.useState(false)
  return (
    <InputGroup className={className} data-slot="password-input">
      <InputGroupInput
        type={visible ? 'text' : 'password'}
        autoComplete="current-password"
        spellCheck={false}
        {...props}
      />
      <InputGroupAddon align="inline-end">
        <InputGroupButton
          size="icon-sm"
          aria-label={showLabel ?? t.showPassword}
          aria-pressed={visible}
          disabled={props.disabled}
          onClick={() => {
            setVisible((v) => !v)
          }}
        >
          {visible ? <EyeOffIcon /> : <EyeIcon />}
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  )
}

/**
 * A search field with a magnifier and a clear button that shows once there is text. Escape clears
 * it too (the browser's own behaviour for `type="search"`). Controlled with `value` + `onValueChange`.
 */
function SearchInput({
  className,
  value,
  defaultValue = '',
  onValueChange,
  clearLabel,
  onKeyDown,
  ...props
}: Omit<React.ComponentProps<'input'>, 'type' | 'value' | 'defaultValue' | 'onChange'> & {
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  /** Accessible name of the clear button; defaults to the i18n text ("Clear search"). */
  clearLabel?: string
}) {
  const t = useCoreloomI18n().messages.inputs
  const [inner, setInner] = React.useState(defaultValue)
  const current = value ?? inner
  const inputRef = React.useRef<HTMLInputElement>(null)
  const set = (next: string) => {
    if (value === undefined) setInner(next)
    onValueChange?.(next)
  }
  return (
    <InputGroup className={className} data-slot="search-input">
      <InputGroupAddon>
        <SearchIcon />
      </InputGroupAddon>
      <InputGroupInput
        ref={inputRef}
        type="search"
        autoComplete="off"
        value={current}
        onChange={(e) => {
          set(e.target.value)
        }}
        onKeyDown={(e) => {
          onKeyDown?.(e)
          if (e.key === 'Escape' && current) {
            e.preventDefault()
            set('')
          }
        }}
        // The browser's own clear cross would double ours.
        className="[&::-webkit-search-cancel-button]:appearance-none"
        {...props}
      />
      {current && (
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            size="icon-xs"
            aria-label={clearLabel ?? t.clearSearch}
            disabled={props.disabled}
            onClick={() => {
              set('')
              // The button disappears with the text; keep focus in the field.
              inputRef.current?.focus()
            }}
          >
            <XIcon />
          </InputGroupButton>
        </InputGroupAddon>
      )}
    </InputGroup>
  )
}

/**
 * A read-only value with a copy button: an API key, an invite link, a webhook URL. Clicking the
 * field selects all of it; the button copies it, shows a tick and says "Copied" to screen readers.
 */
function CopyInput({
  className,
  value,
  copyLabel,
  onCopy,
  onFocus,
  ...props
}: Omit<
  React.ComponentProps<'input'>,
  'type' | 'value' | 'defaultValue' | 'onChange' | 'readOnly'
> & {
  value: string
  /** Accessible name of the copy button; defaults to the i18n text ("Copy"). */
  copyLabel?: string
  /** Called after the value was copied (to log it, or show a toast). */
  onCopy?: () => void
}) {
  const t = useCoreloomI18n().messages.inputs
  const [copied, setCopied] = React.useState(false)
  React.useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => {
      setCopied(false)
    }, 1600)
    return () => {
      clearTimeout(timer)
    }
  }, [copied])
  return (
    <InputGroup className={className} data-slot="copy-input">
      <InputGroupInput
        type="text"
        readOnly
        value={value}
        spellCheck={false}
        className="font-mono text-[13px]"
        onFocus={(e) => {
          e.currentTarget.select()
          onFocus?.(e)
        }}
        {...props}
      />
      <InputGroupAddon align="inline-end">
        <InputGroupButton
          size="icon-sm"
          aria-label={copyLabel ?? t.copy}
          disabled={props.disabled}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value)
              setCopied(true)
              onCopy?.()
            } catch {
              /* clipboard unavailable: the field is selectable, people can copy by hand */
            }
          }}
        >
          {copied ? <CheckIcon className="text-success" /> : <CopyIcon />}
        </InputGroupButton>
      </InputGroupAddon>
      <span role="status" className="sr-only">
        {copied ? t.copied : ''}
      </span>
    </InputGroup>
  )
}

export {
  CopyInput,
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
  InputGroupTextarea,
  PasswordInput,
  SearchInput,
}
