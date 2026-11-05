import { Button } from './button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from './dropdown-menu'

type LanguageOption = { code: string; label: string }

type LanguageSwitcherProps = {
  value: string
  onChange: (code: string) => void
  options: LanguageOption[]
  label?: string
  className?: string
}

function LanguageSwitcher({ value, onChange, options, label, className }: LanguageSwitcherProps) {
  const current = options.find((option) => option.code === value)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="sm" aria-label={label} className={className}>
          {current?.label ?? value}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup value={value} onValueChange={onChange}>
          {options.map((option) => (
            <DropdownMenuRadioItem key={option.code} value={option.code}>
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export type { LanguageOption, LanguageSwitcherProps }
export { LanguageSwitcher }
