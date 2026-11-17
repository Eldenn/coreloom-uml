// The fields of one agent role: who it is, its mission, its rights, where it works and when it
// is done. Ticking a right adds the ones it needs and unticking one drops those that needed it,
// so the rights always pass the catalog's check; the API checks the whole role again.
import * as React from 'react'
import { z } from 'zod'

import { Button } from '@/components/ui/button'
import { DialogFooter } from '@/components/ui/dialog'
import { useAppForm } from '@/components/ui/form'
import { toast } from '@/components/ui/sonner'
import {
  type Right,
  RIGHTS,
  ROLE_DESCRIPTION_MAX_LENGTH,
  ROLE_FOLDER,
  ROLE_LINE_MAX_LENGTH,
  ROLE_LIST_MAX,
  ROLE_MISSION_MAX_LENGTH,
  ROLE_NAME_MAX_LENGTH,
  ROLE_SLUG,
  ROLE_SLUG_MAX_LENGTH,
  slugify,
  splitLines,
  toggleRight,
} from '@/lib/agent-role-fields'
import {
  type AgentRole,
  roleErrorMessage,
  type RoleFields,
  useCreateRole,
  useUpdateRole,
} from '@/lib/agent-roles'
import { useT } from '@/lib/locale'

/** The rights after a checkbox group change: the one right that moved, with what it implies. */
function settleRights(before: readonly Right[], after: readonly Right[]): Right[] {
  const added = after.find((right) => !before.includes(right))
  if (added) return toggleRight(before, added, true)
  const removed = before.find((right) => !after.includes(right))
  if (removed) return toggleRight(before, removed, false)
  return [...before]
}

function useRoleSchema() {
  const t = useT()
  const required = (max: number) =>
    z.string().trim().min(1, t.roles.required).max(max, t.roles.tooLong(max))
  const optionalLine = z
    .string()
    .trim()
    .max(ROLE_LINE_MAX_LENGTH, t.roles.tooLong(ROLE_LINE_MAX_LENGTH))
  const lines = z
    .string()
    .refine((text) => splitLines(text).length <= ROLE_LIST_MAX, t.roles.tooManyLines(ROLE_LIST_MAX))
    .refine(
      (text) => splitLines(text).every((line) => line.length <= ROLE_LINE_MAX_LENGTH),
      t.roles.lineTooLong(ROLE_LINE_MAX_LENGTH),
    )
  return z.object({
    name: required(ROLE_NAME_MAX_LENGTH),
    slug: required(ROLE_SLUG_MAX_LENGTH).regex(ROLE_SLUG, t.roles.slugInvalid),
    description: required(ROLE_DESCRIPTION_MAX_LENGTH),
    mission: z
      .string()
      .refine((text) => text.trim() !== '', t.roles.required)
      .refine(
        (text) => text.length <= ROLE_MISSION_MAX_LENGTH,
        t.roles.tooLong(ROLE_MISSION_MAX_LENGTH),
      ),
    rights: z.array(z.enum(RIGHTS)),
    scope: z
      .array(z.string())
      .max(ROLE_LIST_MAX, t.roles.tooManyLines(ROLE_LIST_MAX))
      .superRefine((folders, ctx) => {
        const wrong = folders.find(
          (folder) =>
            !ROLE_FOLDER.test(folder) ||
            folder.split('/').some((part) => part === '.' || part === '..'),
        )
        if (wrong) ctx.addIssue({ code: 'custom', message: t.roles.scopeInvalid(wrong) })
      }),
    forbidden: lines,
    doneCommands: lines,
    doneText: optionalLine,
    escalation: optionalLine,
  })
}

type RoleValues = z.infer<ReturnType<typeof useRoleSchema>>

const EMPTY_VALUES: RoleValues = {
  name: '',
  slug: '',
  description: '',
  mission: '',
  rights: ['read', 'write', 'run-checks'],
  scope: [],
  forbidden: '',
  doneCommands: '',
  doneText: '',
  escalation: '',
}

function toValues(role: AgentRole | null): RoleValues {
  if (!role) return EMPTY_VALUES
  return {
    name: role.name,
    slug: role.slug,
    description: role.description,
    mission: role.mission,
    rights: role.rights,
    scope: role.scope,
    forbidden: role.forbidden.join('\n'),
    doneCommands: role.done.commands.join('\n'),
    doneText: role.done.text ?? '',
    escalation: role.escalation ?? '',
  }
}

function toFields(value: RoleValues): RoleFields {
  return {
    name: value.name.trim(),
    slug: value.slug.trim(),
    description: value.description.trim(),
    mission: value.mission,
    rights: value.rights,
    scope: value.scope,
    forbidden: splitLines(value.forbidden),
    done: { commands: splitLines(value.doneCommands), text: value.doneText.trim() || null },
    escalation: value.escalation.trim() || null,
  }
}

/** The rights as cards; `read` stays ticked, every role has it. */
function useRightOptions() {
  const t = useT()
  return RIGHTS.map((right) => ({
    value: right,
    title: t.roles.rightNames[right],
    description: t.roles.rightDescriptions[right],
    disabled: right === 'read',
  }))
}

/** The form of one role, saved through the API: a new role, or a change to a stored one. */
function useRoleForm({
  configId,
  role,
  onDone,
}: {
  configId: number
  role: AgentRole | null
  onDone: () => void
}) {
  const t = useT()
  const schema = useRoleSchema()
  const create = useCreateRole(configId)
  const update = useUpdateRole(configId)
  return useAppForm({
    defaultValues: toValues(role),
    validators: { onSubmit: schema },
    onSubmit: async ({ value }) => {
      try {
        const fields = toFields(value)
        if (role) await update.mutateAsync({ roleId: role.id, ...fields })
        else await create.mutateAsync(fields)
        toast.success(t.roles.saved)
        onDone()
      } catch (error) {
        toast.error(roleErrorMessage(error, t.roles.failed))
      }
    },
  })
}

export function RoleForm({
  configId,
  role,
  onDone,
}: {
  configId: number
  /** `null` for a new role. */
  role: AgentRole | null
  onDone: () => void
}) {
  const t = useT()
  const form = useRoleForm({ configId, role, onDone })
  // A new role's identifier follows its name until the user types one.
  const slugEdited = React.useRef(role !== null)
  const rights = React.useRef<Right[]>(toValues(role).rights)

  const rightOptions = useRightOptions()

  return (
    <form
      noValidate
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault()
        void form.handleSubmit()
      }}
    >
      <form.AppForm>
        <div className="grid gap-4 sm:grid-cols-2">
          <form.AppField
            name="name"
            listeners={{
              onChange: ({ value }) => {
                if (!slugEdited.current) form.setFieldValue('slug', slugify(value))
              },
            }}
          >
            {(field) => <field.TextField label={t.roles.name} maxLength={ROLE_NAME_MAX_LENGTH} />}
          </form.AppField>
          <form.AppField
            name="slug"
            listeners={{
              onChange: () => {
                slugEdited.current = true
              },
            }}
          >
            {(field) => (
              <field.TextField
                label={t.roles.slug}
                description={t.roles.slugHint}
                maxLength={ROLE_SLUG_MAX_LENGTH}
                autoComplete="off"
                spellCheck={false}
              />
            )}
          </form.AppField>
        </div>
        <form.AppField name="description">
          {(field) => (
            <field.TextareaField
              label={t.roles.description}
              description={t.roles.descriptionHint}
              rows={2}
              maxCount={ROLE_DESCRIPTION_MAX_LENGTH}
            />
          )}
        </form.AppField>
        <form.AppField name="mission">
          {(field) => (
            <field.TextareaField
              label={t.roles.mission}
              description={t.roles.missionHint}
              rows={10}
            />
          )}
        </form.AppField>
        <form.AppField
          name="rights"
          listeners={{
            onChange: ({ value }) => {
              const settled = settleRights(rights.current, value)
              rights.current = settled
              if (settled.join() !== value.join()) form.setFieldValue('rights', settled)
            },
          }}
        >
          {(field) => (
            <field.CheckboxCardField
              label={t.roles.rights}
              description={t.roles.rightsHint}
              orientation="horizontal"
              options={rightOptions}
            />
          )}
        </form.AppField>
        <form.AppField name="scope">
          {(field) => (
            <field.TagsField
              label={t.roles.scope}
              description={t.roles.scopeHint}
              placeholder={t.roles.scopePlaceholder}
              maxTags={ROLE_LIST_MAX}
              transform={(tag) => tag.trim().replace(/^\.?\/+|\/+$/g, '')}
            />
          )}
        </form.AppField>
        <form.AppField name="forbidden">
          {(field) => (
            <field.TextareaField
              label={t.roles.forbidden}
              description={t.roles.forbiddenHint}
              rows={3}
            />
          )}
        </form.AppField>
        <div className="grid gap-4 sm:grid-cols-2">
          <form.AppField name="doneCommands">
            {(field) => (
              <field.TextareaField
                label={t.roles.doneCommands}
                description={t.roles.doneCommandsHint}
                rows={3}
                spellCheck={false}
              />
            )}
          </form.AppField>
          <div className="flex flex-col gap-4">
            {(['doneText', 'escalation'] as const).map((name) => (
              <form.AppField key={name} name={name}>
                {(field) => (
                  <field.TextField
                    label={t.roles[name]}
                    description={t.roles[`${name}Hint`]}
                    maxLength={ROLE_LINE_MAX_LENGTH}
                  />
                )}
              </form.AppField>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onDone}>
            {t.roles.cancel}
          </Button>
          <form.SubmitButton>{t.roles.save}</form.SubmitButton>
        </DialogFooter>
      </form.AppForm>
    </form>
  )
}
