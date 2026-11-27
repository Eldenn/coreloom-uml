import { SkillSourceKind } from '#app/skills/constants/skill'
import type SkillSource from '#app/skills/models/skill-source'
import type { SkillSourceOutput } from '#app/skills/validators/skill-sources-output'

/** `skills.sh`, `smithery.ai`, or `owner/repo[/path]`. */
export function sourceLabel(source: Pick<SkillSource, 'kind' | 'owner' | 'repo' | 'path'>) {
  if (source.kind === SkillSourceKind.SkillsSh) return 'skills.sh'
  if (source.kind === SkillSourceKind.Smithery) return 'smithery.ai'
  return [source.owner, source.repo, source.path].filter(Boolean).join('/')
}

/** A row loaded with `withCount('skills')`. */
export function serializeSkillSource(source: SkillSource): SkillSourceOutput {
  return {
    id: source.id,
    kind: source.kind,
    owner: source.owner,
    repo: source.repo,
    path: source.path,
    label: sourceLabel(source),
    enabled: source.enabled,
    skills: Number(source.$extras.skills_count ?? 0),
    lastRunAt: source.lastRunAt?.toUTC().toISO() ?? null,
    lastError: source.lastError,
  }
}
