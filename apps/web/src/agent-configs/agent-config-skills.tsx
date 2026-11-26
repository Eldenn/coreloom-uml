// The skills a configuration holds, which `coreloom-uml pull` installs: chosen freely among the
// skills with an approved copy, suggested or not.
import { XIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from '@/components/ui/item'
import { MultiSelect } from '@/components/ui/multi-select'
import { toast } from '@/components/ui/sonner'
import { type AgentConfig, useSaveSkills } from '@/lib/agent-configs'
import { getErrorMessage } from '@/lib/client'
import { useLocale, useT } from '@/lib/locale'
import { useSkills } from '@/lib/skills'

/** Every skill with an approved copy fits in one page (the catalog holds a few dozen). */
const INSTALLABLE = { installable: true, perPage: 100, sort: 'name' } as const

export function AgentConfigSkills({ configId, config }: { configId: number; config: AgentConfig }) {
  const t = useT()
  const { locale } = useLocale()
  const installable = useSkills(INSTALLABLE)
  const save = useSaveSkills(configId)
  // While a save runs, the last choice shows, so a second change builds on it.
  const held = save.isPending ? save.variables : config.skills.map((skill) => skill.slug)

  // A held skill whose copy is no longer served stays in the list, so it can be removed.
  const options = [
    ...(installable.data?.data ?? []).map((skill) => ({ value: skill.slug, label: skill.name })),
    ...config.skills
      .filter((skill) => !installable.data?.data.some((item) => item.slug === skill.slug))
      .map((skill) => ({ value: skill.slug, label: skill.name })),
  ]
  const change = (skills: string[]) => {
    save.mutate(skills, {
      onError: (error) => toast.error(getErrorMessage(error, t.agents.failed)),
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.agents.heldSkillsTitle}</CardTitle>
        <CardDescription>{t.agents.heldSkillsHint}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <MultiSelect
          options={options}
          value={held}
          onValueChange={change}
          placeholder={t.agents.heldSkillsPick}
          searchPlaceholder={t.agents.heldSkillsSearch}
          emptyText={t.agents.heldSkillsEmpty}
          aria-label={t.agents.heldSkillsPick}
        />
        {config.skills.length === 0 ? (
          <p className="m-0 text-sm text-muted-foreground">{t.agents.heldSkillsNone}</p>
        ) : (
          <ItemGroup className="gap-2">
            {config.skills.map((skill) => (
              <Item key={skill.slug} variant="outline" size="sm">
                <ItemContent>
                  <ItemTitle>
                    <a href={skill.url} target="_blank" rel="noreferrer noopener">
                      {skill.name}
                    </a>
                  </ItemTitle>
                  <ItemDescription>
                    {(locale === 'fr' ? skill.description.fr : undefined) ?? skill.description.en}
                  </ItemDescription>
                </ItemContent>
                <ItemActions>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t.agents.heldSkillRemove(skill.name)}
                    onClick={() => {
                      change(held.filter((slug) => slug !== skill.slug))
                    }}
                  >
                    <XIcon />
                  </Button>
                </ItemActions>
              </Item>
            ))}
          </ItemGroup>
        )}
      </CardContent>
    </Card>
  )
}
