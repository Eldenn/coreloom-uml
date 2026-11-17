// What each tool does with each role of a generation: the command that starts it, and for every
// right whether the role has it, the tool refuses it by itself, or only the role's text asks the
// agent not to use it.
import { BanIcon, CheckIcon, MessageSquareTextIcon } from 'lucide-react'

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { CodeViewer } from '@/components/ui/code-viewer'
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { type AgentGeneration, TARGETS, useAgentConfig } from '@/lib/agent-configs'
import { RIGHTS } from '@/lib/agent-role-fields'
import { type GenerationRole, type RightStatus } from '@/lib/agent-roles'
import { useT } from '@/lib/locale'

const STATUS_BADGE = {
  granted: { variant: 'success', icon: <CheckIcon aria-hidden /> },
  enforced: { variant: 'secondary', icon: <BanIcon aria-hidden /> },
  instruction: { variant: 'warning', icon: <MessageSquareTextIcon aria-hidden /> },
} as const satisfies Record<RightStatus, { variant: string; icon: React.ReactNode }>

function StatusBadge({ status }: { status: RightStatus }) {
  const t = useT()
  const { variant, icon } = STATUS_BADGE[status]
  return (
    <Badge variant={variant} className="font-normal whitespace-nowrap">
      {icon}
      {t.roles.status[status]}
    </Badge>
  )
}

/** The generation's roles grouped by slug, in its order; targets in the screen's order. */
function bySlug(roles: GenerationRole[]): [string, GenerationRole[]][] {
  const groups = new Map<string, GenerationRole[]>()
  for (const role of roles) groups.set(role.slug, [...(groups.get(role.slug) ?? []), role])
  const rank = (role: GenerationRole) => TARGETS.indexOf(role.target)
  return [...groups].map(([slug, targets]) => [slug, targets.sort((a, b) => rank(a) - rank(b))])
}

export function RoleMatrixCard({
  configId,
  generation,
}: {
  configId: number
  generation: AgentGeneration
}) {
  const t = useT()
  const config = useAgentConfig(configId)
  if (generation.roles.length === 0) return null
  const groups = bySlug(generation.roles)
  const nameOf = (slug: string) =>
    config.data?.config.roles.find((role) => role.slug === slug)?.name ?? slug

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.roles.matrixTitle}</CardTitle>
        <CardDescription>{t.roles.matrixHint}</CardDescription>
      </CardHeader>
      <CardContent>
        <Accordion type="multiple" defaultValue={groups.slice(0, 1).map(([slug]) => slug)}>
          {groups.map(([slug, targets]) => (
            <AccordionItem key={slug} value={slug}>
              <AccordionTrigger>
                <span className="flex flex-wrap items-center gap-2">
                  {nameOf(slug)}
                  <code className="font-mono text-[12px] font-normal text-muted-foreground">
                    {slug}
                  </code>
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <RoleMatrix name={nameOf(slug)} targets={targets} />
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </CardContent>
    </Card>
  )
}

function RoleMatrix({ name, targets }: { name: string; targets: GenerationRole[] }) {
  const t = useT()
  const launched = targets.filter((target) => target.launch !== null)
  const unlaunched = targets.filter((target) => target.launch === null)
  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-x-auto">
        <Table>
          <TableCaption className="sr-only">{t.roles.matrixCaption(name)}</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">{t.roles.matrixRight}</TableHead>
              {targets.map((target) => (
                <TableHead key={target.target} scope="col">
                  {t.agents.targetNames[target.target]}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {RIGHTS.map((right) => (
              <TableRow key={right}>
                <TableHead scope="row" className="font-normal text-foreground">
                  {t.roles.rightNames[right]}
                </TableHead>
                {targets.map((target) => (
                  <TableCell key={target.target}>
                    <StatusBadge status={target.matrix[right]} />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {launched.map((target) => (
        <div key={target.target} className="flex min-w-0 flex-col gap-1.5">
          <p className="m-0 text-[13px] text-muted-foreground">
            {t.roles.launch(t.agents.targetNames[target.target])}
          </p>
          <CodeViewer code={target.launch ?? ''} language="shell" wrap />
        </div>
      ))}
      {unlaunched.map((target) => (
        <p key={target.target} className="m-0 text-[13px] text-muted-foreground">
          {t.roles.noLaunch(t.agents.targetNames[target.target])}
        </p>
      ))}
    </div>
  )
}
