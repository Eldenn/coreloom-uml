import { ArrowDownIcon, ArrowUpIcon, EllipsisIcon, PlusIcon, Trash2Icon } from 'lucide-react'
import * as React from 'react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import type { Messages } from '@/lib/i18n'
import type { ClassMember, ClassVisibility } from '@/lib/uml'
import { memberFromText } from '@/lib/uml-edit-fields'
import { cn } from '@/lib/utils'

type PropertiesText = Messages['diagramTools']['properties'] &
  Pick<Messages['diagramTools']['steps'], 'moveUp' | 'moveDown'>

const SIGN: Record<ClassVisibility, string> = {
  public: '+',
  private: '-',
  protected: '#',
  package: '~',
}
const VISIBILITIES = ['none', 'public', 'private', 'protected', 'package'] as const
type VisibilityChoice = (typeof VISIBILITIES)[number]

const isMethod = (m: ClassMember) => m.text.includes('(')

function withVisibility(m: ClassMember, choice: VisibilityChoice): ClassMember {
  const { visibility: _old, ...rest } = m
  return choice === 'none' ? rest : { ...rest, visibility: choice }
}

function flag(m: ClassMember, key: 'static' | 'abstract', on: boolean): ClassMember {
  const { static: _s, abstract: _a, ...rest } = m
  // A member is static or abstract, not both (Mermaid has one mark for it).
  return on ? { ...rest, [key]: true } : rest
}

function move<T>(list: readonly T[], from: number, to: number): T[] {
  const out = [...list]
  const [item] = out.splice(from, 1)
  if (item !== undefined) out.splice(to, 0, item)
  return out
}

function RowMenu({
  member,
  index,
  count,
  disabled,
  onChange,
  onMove,
  onRemove,
  p,
}: {
  member: ClassMember
  index: number
  count: number
  disabled: boolean
  onChange: (member: ClassMember) => void
  onMove: (to: number) => void
  onRemove: () => void
  p: PropertiesText
}) {
  const choice: VisibilityChoice = member.visibility ?? 'none'
  const name = member.text || p.member(index + 1)
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`${p.visibilities[choice]}: ${p.memberActions(name)}`}
          className="w-7 shrink-0 font-mono text-[13px]"
        >
          {member.visibility ? SIGN[member.visibility] : <EllipsisIcon aria-hidden />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52">
        <DropdownMenuLabel>{p.visibility}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={choice}
          onValueChange={(v) => {
            const next = VISIBILITIES.find((x) => x === v)
            if (next) onChange(withVisibility(member, next))
          }}
        >
          {VISIBILITIES.map((v) => (
            <DropdownMenuRadioItem key={v} value={v}>
              {p.visibilities[v]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        {(['static', 'abstract'] as const).map((key) => (
          <DropdownMenuCheckboxItem
            key={key}
            checked={Boolean(member[key])}
            onCheckedChange={(on) => {
              onChange(flag(member, key, on))
            }}
          >
            {p[key]}
          </DropdownMenuCheckboxItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={index === 0}
          onSelect={() => {
            onMove(index - 1)
          }}
        >
          <ArrowUpIcon aria-hidden />
          {p.moveUp}
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={index === count - 1}
          onSelect={() => {
            onMove(index + 1)
          }}
        >
          <ArrowDownIcon aria-hidden />
          {p.moveDown}
        </DropdownMenuItem>
        <DropdownMenuItem variant="destructive" onSelect={onRemove}>
          <Trash2Icon aria-hidden />
          {p.remove}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Attributes and methods of a class, one editable row each, plus buttons to add one. */
function MemberList({
  members,
  disabled,
  onChange,
  p,
}: {
  members: readonly ClassMember[]
  disabled: boolean
  onChange: (members: ClassMember[]) => void
  p: PropertiesText
}) {
  const id = React.useId()
  const [drafts, setDrafts] = React.useState<Record<number, string>>({})
  const inputs = React.useRef<(HTMLInputElement | null)[]>([])
  // A row just added (or moved): its field takes focus once the diagram shows it.
  const focusRow = React.useRef<number | null>(null)

  React.useEffect(() => {
    const row = focusRow.current
    if (row === null) return
    focusRow.current = null
    inputs.current[row]?.focus()
    inputs.current[row]?.select()
  }, [members])

  const commit = (index: number) => {
    const text = drafts[index] as string | undefined
    const member = members.at(index)
    if (text === undefined || !member) return
    setDrafts({})
    if (text === member.text) return
    onChange(members.map((m, i) => (i === index ? memberFromText(text, m) : m)))
  }
  const add = (method: boolean) => {
    const member: ClassMember = {
      text: method ? p.newMethod : p.newAttribute,
      visibility: 'public',
    }
    // Attributes stay before methods, as the class box shows them.
    const at = method ? members.length : members.filter((m) => !isMethod(m)).length
    focusRow.current = at
    onChange([...members.slice(0, at), member, ...members.slice(at)])
  }

  return (
    <div role="group" aria-labelledby={`${id}-label`} className="grid gap-1.5">
      <p id={`${id}-label`} className="text-[13px] leading-none font-medium text-foreground">
        {p.members}
      </p>
      {members.length ? (
        <ul className="grid gap-1">
          {members.map((m, i) => (
            // eslint-disable-next-line @eslint-react/no-array-index-key -- members have no ids; the row is its place
            <li key={i} className="flex items-center gap-1">
              <RowMenu
                member={m}
                index={i}
                count={members.length}
                disabled={disabled}
                p={p}
                onChange={(next) => {
                  onChange(members.map((x, k) => (k === i ? next : x)))
                }}
                onMove={(to) => {
                  focusRow.current = to
                  onChange(move(members, i, to))
                }}
                onRemove={() => {
                  onChange(members.filter((_, k) => k !== i))
                }}
              />
              <Input
                ref={(el) => {
                  inputs.current[i] = el
                }}
                aria-label={p.member(i + 1)}
                value={drafts[i] ?? m.text}
                readOnly={disabled}
                spellCheck={false}
                className={cn(
                  'h-8 min-w-0 flex-1 font-mono text-[12px]',
                  m.static && 'underline',
                  m.abstract && 'italic',
                )}
                onChange={(e) => {
                  setDrafts({ [i]: e.target.value })
                }}
                onBlur={() => {
                  commit(i)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commit(i)
                }}
              />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[12px] text-muted-foreground">{p.noMembers}</p>
      )}
      <div className="flex flex-wrap gap-1.5">
        {[false, true].map((method) => (
          <Button
            key={String(method)}
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={() => {
              add(method)
            }}
          >
            <PlusIcon aria-hidden />
            {method ? p.addMethod : p.addAttribute}
          </Button>
        ))}
      </div>
    </div>
  )
}

export { MemberList }
