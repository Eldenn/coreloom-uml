// Accepted rules: lines added to a section of AGENTS.md, written by hand here or accepted from a
// model's proposals (`RuleProposals`). Ordered, edited and deleted one by one.
import { PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react'
import * as React from 'react'
import { z } from 'zod'

import { AgentFileImport } from '@/agent-configs/agent-config-import'
import { RuleProposals } from '@/agent-configs/agent-config-proposals'
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Empty, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { useAppForm } from '@/components/ui/form'
import { toast } from '@/components/ui/sonner'
import { SortableList } from '@/components/ui/sortable-list'
import {
  type AgentConfig,
  type AgentRule,
  type Questionnaire,
  RULE_TEXT_MAX_LENGTH,
  RULES_MAX,
  useCreateRule,
  useDeleteRule,
  useUpdateRule,
} from '@/lib/agent-configs'
import { getErrorMessage } from '@/lib/client'
import { useT } from '@/lib/locale'

/** What the rule dialog opens with: a rule to edit, or the fields of a new one. */
export type RuleDraft = { rule: AgentRule } | { section: string; text: string }

/** The rule that moved between two orders of the same ids, and where it went. */
function movedRule(before: string[], after: string[]): { id: string; position: number } | null {
  const first = before.findIndex((id, index) => after[index] !== id)
  if (first < 0) return null
  const last = before.findLastIndex((id, index) => after[index] !== id)
  const forward = before.at(first) === after.at(last)
  const id = forward ? before.at(first) : before.at(last)
  return id === undefined ? null : { id, position: forward ? last : first }
}

export function AgentConfigRules({
  projectId,
  config,
  questionnaires,
  draft,
  onDraftChange,
}: {
  projectId: number
  config: AgentConfig
  /** Names the answer a proposed rule comes from. */
  questionnaires: Questionnaire[]
  /** The open dialog, if any; the answers can open it to turn their details into a rule. */
  draft: RuleDraft | null
  onDraftChange: (draft: RuleDraft | null) => void
}) {
  const t = useT()
  const update = useUpdateRule(projectId)
  const remove = useDeleteRule(projectId)
  const addRef = React.useRef<HTMLButtonElement>(null)
  // Shown while a move is saved, so the list does not jump back first.
  const [moving, setMoving] = React.useState<string[] | null>(null)
  const ids = config.rules.map((rule) => String(rule.id))
  const full = config.rules.length >= RULES_MAX

  const sourceLabel = (rule: AgentRule) =>
    rule.source === 'llm' ? t.agents.ruleSourceLlm : t.agents.ruleSourceManual

  const options = config.rules.map((rule) => ({
    value: String(rule.id),
    label: rule.text,
    description: `${rule.section} · ${sourceLabel(rule)}`,
    actions: (
      <>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label={`${t.agents.editRule}: ${rule.text}`}
          onClick={() => {
            onDraftChange({ rule })
          }}
        >
          <PencilIcon />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label={`${t.agents.remove}: ${rule.text}`}
          disabled={remove.isPending}
          onClick={() => {
            remove.mutate(rule.id, {
              onSuccess: () => {
                toast.success(t.agents.ruleDeleted)
                addRef.current?.focus()
              },
              onError: (error) => toast.error(getErrorMessage(error, t.agents.failed)),
            })
          }}
        >
          <Trash2Icon />
        </Button>
      </>
    ),
  }))

  return (
    <Card>
      <CardHeader>
        <CardTitle id="agent-rules-title">{t.agents.rulesTitle}</CardTitle>
        <CardDescription>{t.agents.rulesHint(RULES_MAX)}</CardDescription>
        <CardAction className="flex flex-wrap justify-end gap-2">
          <AgentFileImport projectId={projectId} config={config} questionnaires={questionnaires} />
          <RuleProposals projectId={projectId} config={config} questionnaires={questionnaires} />
          <Button
            ref={addRef}
            variant="outline"
            size="sm"
            disabled={full}
            onClick={() => {
              onDraftChange({
                // `Project` holds the project's context; a new rule rarely belongs there.
                section:
                  config.ruleSections.find((section) => section !== 'Project') ??
                  config.ruleSections.at(0) ??
                  '',
                text: '',
              })
            }}
          >
            <PlusIcon /> {t.agents.addRule}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {full && (
          <p className="m-0 text-[13px] text-muted-foreground">{t.agents.rulesFull(RULES_MAX)}</p>
        )}
        {config.rules.length === 0 ? (
          <Empty className="border border-dashed border-border py-6">
            <EmptyHeader>
              <EmptyTitle className="text-[14px] font-normal text-muted-foreground">
                {t.agents.rulesEmpty}
              </EmptyTitle>
            </EmptyHeader>
          </Empty>
        ) : (
          <SortableList
            aria-labelledby="agent-rules-title"
            numbered={false}
            wrap
            disabled={update.isPending}
            options={options}
            value={moving ?? ids}
            onValueChange={(order) => {
              const moved = movedRule(ids, order)
              if (!moved) return
              setMoving(order)
              update.mutate(
                { ruleId: Number(moved.id), position: moved.position },
                {
                  onError: (error) => toast.error(getErrorMessage(error, t.agents.failed)),
                  onSettled: () => {
                    setMoving(null)
                  },
                },
              )
            }}
          />
        )}
      </CardContent>
      <RuleDialog
        projectId={projectId}
        sections={config.ruleSections}
        draft={draft}
        onClose={() => {
          onDraftChange(null)
        }}
      />
    </Card>
  )
}

function RuleDialog({
  projectId,
  sections,
  draft,
  onClose,
}: {
  projectId: number
  sections: string[]
  draft: RuleDraft | null
  onClose: () => void
}) {
  const t = useT()
  return (
    <Dialog
      open={draft !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {draft && 'rule' in draft ? t.agents.editRule : t.agents.addRule}
          </DialogTitle>
          <DialogDescription>{t.agents.ruleTextHint}</DialogDescription>
        </DialogHeader>
        {draft && (
          <RuleForm projectId={projectId} sections={sections} draft={draft} onDone={onClose} />
        )}
      </DialogContent>
    </Dialog>
  )
}

function RuleForm({
  projectId,
  sections,
  draft,
  onDone,
}: {
  projectId: number
  sections: string[]
  draft: RuleDraft
  onDone: () => void
}) {
  const t = useT()
  const create = useCreateRule(projectId)
  const update = useUpdateRule(projectId)
  const rule = 'rule' in draft ? draft.rule : null
  const form = useAppForm({
    defaultValues: {
      section: rule?.section ?? ('section' in draft ? draft.section : ''),
      text: rule?.text ?? ('text' in draft ? draft.text : ''),
    },
    validators: {
      onSubmit: z.object({
        section: z.string().min(1, t.agents.ruleSectionRequired),
        text: z
          .string()
          .trim()
          .min(1, t.agents.ruleTextRequired)
          .max(RULE_TEXT_MAX_LENGTH, t.agents.textTooLong(RULE_TEXT_MAX_LENGTH)),
      }),
    },
    onSubmit: async ({ value }) => {
      const body = { section: value.section, text: value.text.trim() }
      try {
        if (rule) await update.mutateAsync({ ruleId: rule.id, ...body })
        else await create.mutateAsync(body)
        toast.success(t.agents.ruleSaved)
        onDone()
      } catch (error) {
        toast.error(getErrorMessage(error, t.agents.failed))
      }
    },
  })

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        void form.handleSubmit()
      }}
    >
      <form.AppForm>
        <form.AppField name="section">
          {(field) => (
            <field.SelectField
              label={t.agents.ruleSection}
              options={sections.map((section) => ({ value: section, label: section }))}
            />
          )}
        </form.AppField>
        <form.AppField name="text">
          {(field) => (
            <field.TextareaField
              label={t.agents.ruleText}
              rows={3}
              maxCount={RULE_TEXT_MAX_LENGTH}
            />
          )}
        </form.AppField>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onDone}>
            {t.agents.cancel}
          </Button>
          <form.SubmitButton>{t.agents.save}</form.SubmitButton>
        </DialogFooter>
      </form.AppForm>
    </form>
  )
}
