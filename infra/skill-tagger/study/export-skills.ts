import { readFileSync, writeFileSync } from 'node:fs'
import { SKILLS } from '../../../packages/catalog/src/skills.ts'

// rows: the suggestable search rows (eligible, active, copied, checked) in catalog order, plus manual rows.
const rows = JSON.parse(readFileSync(process.argv[2], 'utf8'))
const manualRows = new Map(rows.filter((r) => r.origin === 'manual').map((r) => [r.slug, r]))
const out = [
  ...SKILLS.filter((s) => manualRows.get(s.id)?.status !== 'blocked').map((s) => ({
    slug: s.id,
    name: s.name,
    description: s.description.en,
    affinities: s.affinities,
    topics: manualRows.get(s.id)?.topics ?? s.topics ?? [],
    registry_id: null,
    source: 'manual',
  })),
  ...rows
    .filter((r) => r.origin === 'search')
    .map((r) => ({
      slug: r.slug,
      name: r.name,
      description: r.description?.en ?? '',
      affinities: r.affinities,
      topics: r.topics,
      registry_id: r.registry_id,
      source: r.sources,
    })),
]
writeFileSync(process.argv[3], JSON.stringify(out, null, 1))
console.log(
  out.length,
  'skills;',
  out.filter((s) => s.affinities.length || s.topics.length).length,
  'suggestable today',
)
