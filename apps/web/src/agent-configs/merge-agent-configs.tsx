// Merges several agent conventions into new ones: pick them, name the result and, when the API
// answers conflicts, choose which source's version to keep before sending again.
import { useNavigate } from '@tanstack/react-router'
import * as React from 'react'
import { z } from 'zod'

import { useLocalized } from '@/agent-configs/catalog'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { useAppForm } from '@/components/ui/form'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { toast } from '@/components/ui/sonner'
import {
  type MergeConflicts,
  NAME_MAX_LENGTH,
  useAgentConfigs,
  useMergeAgentConfigs,
  useRulePacks,
} from '@/lib/agent-configs'
import { getErrorMessage } from '@/lib/client'
import { useT } from '@/lib/locale'

/** One conflict as radios: `key` names it among the choices, each option is a source. */
interface Conflict {
  key: string
  label: string
  options: { sourceId: number; label: string }[]
}

const ruleKey = (slot: string) => `rule:${slot}`
const roleKey = (slug: string) => `role:${slug}`

/** The conflicts the API answered, worded for the screen. */
function useShownConflicts(conflicts: MergeConflicts | null): Conflict[] {
  const t = useT()
  const localized = useLocalized()
  const configs = useAgentConfigs({}).data?.data ?? []
  const packs = useRulePacks().data ?? []
  const sourceName = (sourceId: number) =>
    configs.find((config) => config.id === sourceId)?.name ?? String(sourceId)
  const groups = packs.flatMap((pack) => pack.groups)
  return conflicts
    ? [
        ...conflicts.readyRules.map(({ slot, options }) => {
          const group = groups.find((item) => item.slot === slot)
          return {
            key: ruleKey(slot),
            label: group
              ? `${localized(group.label)} (${t.agents.mergeOneRule})`
              : `${slot} (${t.agents.mergeOneRule})`,
            options: options.map(({ sourceId, rules }) => ({
              sourceId,
              label: t.agents.mergeFrom(
                rules
                  .map(({ rule, value }) => {
                    const known = group?.rules.find((item) => item.id === rule)
                    const title = known ? localized(known.title) : rule
                    return value ? `${title}: ${value}` : title
                  })
                  .join(', '),
                sourceName(sourceId),
              ),
            })),
          }
        }),
        ...conflicts.roles.map(({ slug, options }) => ({
          key: roleKey(slug),
          label: t.agents.mergeRole(slug),
          options: options.map(({ sourceId, name, description }) => ({
            sourceId,
            label: t.agents.mergeFrom(`${name}: ${description}`, sourceName(sourceId)),
          })),
        })),
      ]
    : []
}

function ConflictChoices({
  conflicts,
  choices,
  onChoose,
}: {
  conflicts: Conflict[]
  choices: Partial<Record<string, number>>
  onChoose: (key: string, sourceId: number) => void
}) {
  const t = useT()
  const id = React.useId()
  if (conflicts.length === 0) return null
  return (
    <div className="flex max-h-80 flex-col gap-4 overflow-y-auto" aria-live="polite">
      <div>
        <p className="font-medium text-foreground">{t.agents.mergeConflicts(conflicts.length)}</p>
        <FieldDescription>{t.agents.mergeConflictsHelp}</FieldDescription>
      </div>
      {conflicts.map((conflict) => (
        <Field key={conflict.key}>
          <FieldLabel id={`${id}-${conflict.key}`}>{conflict.label}</FieldLabel>
          <RadioGroup
            aria-labelledby={`${id}-${conflict.key}`}
            value={String(choices[conflict.key] ?? '')}
            onValueChange={(value) => {
              onChoose(conflict.key, Number(value))
            }}
          >
            {conflict.options.map((option) => (
              <Field key={option.sourceId} orientation="horizontal">
                <RadioGroupItem
                  id={`${id}-${conflict.key}-${option.sourceId}`}
                  value={String(option.sourceId)}
                />
                <FieldLabel htmlFor={`${id}-${conflict.key}-${option.sourceId}`}>
                  {option.label}
                </FieldLabel>
              </Field>
            ))}
          </RadioGroup>
        </Field>
      ))}
    </div>
  )
}

export function MergeAgentConfigsDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useT()
  const navigate = useNavigate()
  const configs = useAgentConfigs({}).data?.data ?? []
  const merge = useMergeAgentConfigs()
  const [conflicts, setConflicts] = React.useState<MergeConflicts | null>(null)
  /** The source kept for each conflict, by the conflict's key. */
  const [choices, setChoices] = React.useState<Partial<Record<string, number>>>({})

  const shown = useShownConflicts(conflicts)

  const form = useAppForm({
    defaultValues: { name: '', sourceIds: [] as string[] },
    validators: {
      onSubmit: z.object({
        name: z.string().trim().min(1, t.agents.nameRequired).max(NAME_MAX_LENGTH),
        sourceIds: z.array(z.string()).min(2, t.agents.mergeNeedTwo),
      }),
    },
    onSubmit: async ({ value }) => {
      if (shown.some((conflict) => choices[conflict.key] === undefined)) {
        toast.error(t.agents.mergeChoose)
        return
      }
      try {
        const body = await merge.mutateAsync({
          name: value.name.trim(),
          sourceIds: value.sourceIds.map(Number),
          choices: {
            readyRules: (conflicts?.readyRules ?? []).map(({ slot }) => ({
              slot,
              sourceId: choices[ruleKey(slot)] ?? 0,
            })),
            roles: (conflicts?.roles ?? []).map(({ slug }) => ({
              slug,
              sourceId: choices[roleKey(slug)] ?? 0,
            })),
          },
        })
        if ('conflicts' in body) {
          setConflicts(body.conflicts)
          return
        }
        close()
        toast.success(t.agents.merged)
        void navigate({ to: '/agent-configs/$id', params: { id: body.config.id } })
      } catch (error) {
        toast.error(getErrorMessage(error, t.agents.failed))
      }
    },
  })

  function close() {
    form.reset()
    setConflicts(null)
    setChoices({})
    onOpenChange(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) onOpenChange(true)
        else close()
      }}
    >
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t.agents.mergeTitle}</DialogTitle>
          <DialogDescription>{t.agents.mergeDescription}</DialogDescription>
        </DialogHeader>
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            void form.handleSubmit()
          }}
        >
          <form.AppForm>
            <form.AppField
              name="sourceIds"
              listeners={{
                // Other sources, other conflicts: the API answers them again on the next send.
                onChange: () => {
                  setConflicts(null)
                  setChoices({})
                },
              }}
            >
              {(field) => (
                <field.MultiSelectField
                  label={t.agents.mergeSources}
                  placeholder={t.agents.mergeSourcesPlaceholder}
                  options={configs.map((config) => ({
                    value: String(config.id),
                    label: config.name,
                  }))}
                />
              )}
            </form.AppField>
            <form.AppField name="name">
              {(field) => <field.TextField label={t.agents.nameLabel} autoComplete="off" />}
            </form.AppField>
            <ConflictChoices
              conflicts={shown}
              choices={choices}
              onChoose={(key, sourceId) => {
                setChoices((current) => ({ ...current, [key]: sourceId }))
              }}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={close}>
                {t.agents.cancel}
              </Button>
              <form.SubmitButton>{t.agents.merge}</form.SubmitButton>
            </DialogFooter>
          </form.AppForm>
        </form>
      </DialogContent>
    </Dialog>
  )
}
