// Agent roles of a configuration (behind the `agent-roles` flag): copied from the catalog's
// ready-made roles or written by hand, then edited and deleted one by one. Each role becomes one
// file per tool that can run it at the next generation.
import { BookCopyIcon, PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react'
import * as React from 'react'

import { RoleForm } from '@/agent-configs/agent-config-role-form'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  CommandDialog,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Empty, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from '@/components/ui/item'
import { Popconfirm } from '@/components/ui/popconfirm'
import { toast } from '@/components/ui/sonner'
import { Spinner } from '@/components/ui/spinner'
import type { AgentConfig } from '@/lib/agent-configs'
import { presetRank, ROLES_MAX } from '@/lib/agent-role-fields'
import {
  type AgentRole,
  roleErrorMessage,
  type RolePreset,
  useCreateRole,
  useDeleteRole,
  useRolePresets,
  useRoleSuggestions,
} from '@/lib/agent-roles'
import { useT } from '@/lib/locale'
import { topicLabel } from '@/skills/skill-values'

/** What the role dialog edits: a stored role, or a new one. */
type RoleDraft = { role: AgentRole } | 'new'

export function AgentConfigRoles({ configId, config }: { configId: number; config: AgentConfig }) {
  const t = useT()
  const [draft, setDraft] = React.useState<RoleDraft | null>(null)
  const [picking, setPicking] = React.useState(false)
  const addRef = React.useRef<HTMLButtonElement>(null)
  const full = config.roles.length >= ROLES_MAX

  return (
    <Card>
      <CardHeader>
        <CardTitle id="agent-roles-title">{t.roles.title}</CardTitle>
        <CardDescription>{t.roles.hint(ROLES_MAX)}</CardDescription>
        <CardAction className="flex flex-wrap justify-end gap-2 max-sm:col-span-2 max-sm:col-start-1 max-sm:row-span-1 max-sm:row-start-3 max-sm:justify-start">
          <Button
            ref={addRef}
            variant="outline"
            size="sm"
            disabled={full}
            onClick={() => {
              setPicking(true)
            }}
          >
            <BookCopyIcon /> {t.roles.addPreset}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={full}
            onClick={() => {
              setDraft('new')
            }}
          >
            <PlusIcon /> {t.roles.create}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {full && <p className="m-0 text-[13px] text-muted-foreground">{t.roles.full(ROLES_MAX)}</p>}
        {config.roles.length === 0 ? (
          <Empty className="border border-dashed border-border py-6">
            <EmptyHeader>
              <EmptyTitle className="text-[14px] font-normal text-muted-foreground">
                {t.roles.empty}
              </EmptyTitle>
            </EmptyHeader>
          </Empty>
        ) : (
          <ItemGroup aria-labelledby="agent-roles-title" className="gap-2">
            {config.roles.map((role) => (
              <RoleItem
                key={role.id}
                configId={configId}
                role={role}
                onEdit={() => {
                  setDraft({ role })
                }}
                onDeleted={() => addRef.current?.focus()}
              />
            ))}
          </ItemGroup>
        )}
      </CardContent>
      <PresetPicker
        configId={configId}
        roles={config.roles}
        open={picking}
        onOpenChange={setPicking}
      />
      <RoleDialog
        configId={configId}
        draft={draft}
        onClose={() => {
          setDraft(null)
        }}
      />
    </Card>
  )
}

function RoleItem({
  configId,
  role,
  onEdit,
  onDeleted,
}: {
  configId: number
  role: AgentRole
  onEdit: () => void
  onDeleted: () => void
}) {
  const t = useT()
  const remove = useDeleteRole(configId)
  const readOnly = !role.rights.includes('write')
  return (
    <Item variant="outline" size="sm" className="items-start">
      <ItemContent className="min-w-0 gap-1.5">
        <ItemTitle className="flex flex-wrap items-center gap-2">
          {role.name}
          <code className="font-mono text-[12px] font-normal text-muted-foreground">
            {role.slug}
          </code>
          <Badge variant={readOnly ? 'secondary' : 'outline'}>
            {readOnly ? t.roles.readOnly : t.roles.implementer}
          </Badge>
        </ItemTitle>
        <ItemDescription className="line-clamp-2">{role.description}</ItemDescription>
        <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0" aria-label={t.roles.rights}>
          {role.rights.map((right) => (
            <li key={right}>
              <Badge variant="outline" className="font-normal">
                {t.roles.rightNames[right]}
              </Badge>
            </li>
          ))}
        </ul>
        <p className="m-0 text-[13px] text-muted-foreground">
          {role.scope.length > 0
            ? t.roles.scopeValue(role.scope.join(', '))
            : t.roles.wholeRepository}
          {role.source && <> · {t.roles.fromPreset(role.source.preset)}</>}
        </p>
      </ItemContent>
      <ItemActions>
        <Button variant="ghost" size="sm" aria-label={t.roles.editRole(role.name)} onClick={onEdit}>
          <PencilIcon /> {t.roles.edit}
        </Button>
        <Popconfirm
          title={t.roles.deleteTitle(role.name)}
          description={t.roles.deleteText}
          confirmLabel={t.roles.delete}
          cancelLabel={t.roles.cancel}
          destructive
          align="end"
          onConfirm={async () => {
            try {
              await remove.mutateAsync(role.id)
              toast.success(t.roles.deleted)
              onDeleted()
            } catch (error) {
              toast.error(roleErrorMessage(error, t.roles.failed))
            }
          }}
        >
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label={t.roles.deleteRole(role.name)}
          >
            <Trash2Icon />
          </Button>
        </Popconfirm>
      </ItemActions>
    </Item>
  )
}

/** cmdk keeps every item, in the order they come: `shown` is already filtered and ranked. */
const keepOrder = () => 1

/** The catalog's ready-made roles, searchable; picking one copies it into the configuration. */
function PresetPicker({
  configId,
  roles,
  open,
  onOpenChange,
}: {
  configId: number
  roles: AgentRole[]
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useT()
  const presets = useRolePresets(open)
  const suggestions = useRoleSuggestions(configId, open)
  const create = useCreateRole(configId)
  const taken = new Set(roles.flatMap((role) => [role.slug, role.source?.preset ?? '']))
  const [search, setSearch] = React.useState('')
  const list = presets.data ?? []
  // Ranked here rather than by cmdk, so names come before descriptions whatever the order.
  const shown = list
    .map((preset) => ({
      preset,
      rank: presetRank(`${preset.name} ${preset.slug}`, search, [preset.description]),
    }))
    .filter(({ rank }) => rank > 0)
    .sort((a, b) => b.rank - a.rank)
    .map(({ preset }) => preset)
  const suggested = new Map((suggestions.data ?? []).map((item, index) => [item.preset, index]))
  // Before a search, the suggested roles come first, in their order.
  if (search.trim() === '') {
    shown.sort((a, b) => (suggested.get(a.slug) ?? Infinity) - (suggested.get(b.slug) ?? Infinity))
  }
  const suggestionOf = (slug: string) => suggestions.data?.find((item) => item.preset === slug)

  const add = (preset: RolePreset) => {
    create.mutate(
      { preset: preset.slug },
      {
        onSuccess: () => {
          toast.success(t.roles.added(preset.name))
          onOpenChange(false)
        },
        onError: (error) => toast.error(roleErrorMessage(error, t.roles.failed)),
      },
    )
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setSearch('')
        onOpenChange(next)
      }}
      title={t.roles.presetsTitle}
      description={t.roles.presetsDescription}
      className="sm:max-w-[640px]"
      filter={keepOrder}
    >
      <CommandInput placeholder={t.roles.presetsSearch} value={search} onValueChange={setSearch} />
      {/* A new list per search: cmdk moves the nodes it sorts, which React would then misplace. */}
      <CommandList
        key={search}
        className="max-h-[min(60vh,32rem)]"
        aria-busy={create.isPending || undefined}
      >
        {presets.isPending && (
          <p className="m-0 flex items-center gap-2 px-4 py-6 text-[13px] text-muted-foreground">
            <Spinner /> {t.roles.presetsLoading}
          </p>
        )}
        {presets.isError && (
          <p className="m-0 px-4 py-6 text-[13px] text-destructive">{t.roles.presetsFailed}</p>
        )}
        {presets.isSuccess && <CommandEmpty>{t.roles.presetsEmpty}</CommandEmpty>}
        {shown.map((preset) => {
          const added = taken.has(preset.slug)
          const suggestion = suggestionOf(preset.slug)
          return (
            <CommandItem
              key={preset.slug}
              value={`${preset.name} ${preset.slug}`}
              disabled={added || create.isPending}
              onSelect={() => {
                add(preset)
              }}
              className="flex-col items-start gap-0.5"
            >
              <span className="flex w-full flex-wrap items-center gap-2">
                <span className="font-medium text-foreground">{preset.name}</span>
                {preset.readOnly && <Badge variant="outline">{t.roles.readOnly}</Badge>}
                {suggestion && (
                  <Badge variant="success">
                    {t.roles.suggested(
                      suggestion.topics.map((topic) => topicLabel(t.skills, topic)).join(', '),
                    )}
                  </Badge>
                )}
                {added && (
                  <Badge variant="secondary" className="ml-auto">
                    {t.roles.presetAdded}
                  </Badge>
                )}
              </span>
              <span className="line-clamp-2 text-[12.5px] text-muted-foreground">
                {preset.description}
              </span>
              {suggestion && suggestion.skills.length > 0 && (
                <span className="text-[12px] text-muted-foreground">
                  {t.roles.suggestedSkills(suggestion.skills.map((skill) => skill.name).join(', '))}
                </span>
              )}
            </CommandItem>
          )
        })}
      </CommandList>
      {list[0] && (
        <p className="m-0 border-t border-border px-4 py-2 text-[12px] text-muted-foreground">
          {t.roles.presetsSource(list[0].source.repository.replace(/^https:\/\/github\.com\//, ''))}
        </p>
      )}
    </CommandDialog>
  )
}

function RoleDialog({
  configId,
  draft,
  onClose,
}: {
  configId: number
  draft: RoleDraft | null
  onClose: () => void
}) {
  const t = useT()
  const role = draft !== null && draft !== 'new' ? draft.role : null
  return (
    <Dialog
      open={draft !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{role ? t.roles.editTitle : t.roles.createTitle}</DialogTitle>
          <DialogDescription>{t.roles.formHint}</DialogDescription>
        </DialogHeader>
        {draft !== null && (
          <RoleForm key={role?.id ?? 'new'} configId={configId} role={role} onDone={onClose} />
        )}
      </DialogContent>
    </Dialog>
  )
}
