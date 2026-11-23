// Above the prompt: the context of the next message, one chip per item the owner added from an
// item's menu, each with its way out. With no item, the architecture whose page this is (what a
// message is about there), else how to add one.
import {
  BotIcon,
  FolderIcon,
  MousePointerClickIcon,
  NetworkIcon,
  ShapesIcon,
  XIcon,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { useAssistant } from '@/lib/assistant-context'
import { type ContextItem, sameItem } from '@/lib/assistant-subject'
import { useT } from '@/lib/locale'

const ICONS = {
  project: FolderIcon,
  architecture: NetworkIcon,
  'agent-config': BotIcon,
  view: ShapesIcon,
  element: MousePointerClickIcon,
}

export function ContextChips({ disabled }: { disabled: boolean }) {
  const t = useT().assistant
  const { items, setItems, workspace } = useAssistant()
  if (items.length === 0)
    return (
      <p className="m-0 flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground">
        {workspace ? (
          <>
            {t.context}
            <Chip
              item={{
                kind: 'architecture',
                id: workspace.architecture.id,
                label: workspace.architecture.title,
              }}
            />
          </>
        ) : (
          t.contextEmpty
        )}
      </p>
    )
  return (
    <ul aria-label={t.context} className="m-0 flex list-none flex-wrap items-center gap-1.5 p-0">
      {items.map((item) => (
        <li key={items.findIndex((other) => sameItem(other, item))} className="min-w-0">
          <Chip
            item={item}
            remove={
              <button
                type="button"
                disabled={disabled}
                aria-label={t.removeItem(item.label)}
                className="-mr-1 inline-flex size-4 shrink-0 cursor-pointer items-center justify-center rounded-sm outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring disabled:cursor-default disabled:opacity-50"
                onClick={() => {
                  setItems(items.filter((other) => other !== item))
                }}
              >
                <XIcon className="size-3" />
              </button>
            }
          />
        </li>
      ))}
    </ul>
  )
}

function Chip({ item, remove }: { item: ContextItem; remove?: React.ReactNode }) {
  const kinds = useT().assistant.contextKinds
  const Icon = ICONS[item.kind]
  return (
    <Badge variant="secondary" className="max-w-full gap-1" title={kinds[item.kind]}>
      <Icon aria-hidden className="size-3 shrink-0" />
      <span className="sr-only">{kinds[item.kind]}: </span>
      <span className="truncate">{item.label}</span>
      {remove}
    </Badge>
  )
}
