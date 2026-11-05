import type {
  ErAttribute,
  ErCardinality,
  ErDiagram,
  ErEntity,
  ErKey,
  ErRelation,
  UmlDirection,
  UmlProblem,
} from '@/lib/uml'
import {
  type Groups,
  match,
  problem,
  quote,
  type SourceLine,
  STYLING,
  titleBlock,
  unquote,
} from '@/lib/uml-text'

const ID = '[A-Za-z_][\\w-]*'
const ENTITY = new RegExp(`^(${ID})(?:\\["([^"]*)"\\])?\\s*(\\{)?\\s*(\\})?$`)
const RELATION = new RegExp(
  `^(${ID})\\s*(\\|o|\\|\\||\\}o|\\}\\|)(--|\\.\\.)(o\\||\\|\\||o\\{|\\|\\{)\\s*(${ID})\\s*:\\s*(.*)$`,
)
const ATTRIBUTE =
  /^([\w\-[\]()<>,]+)\s+([\w\-*]+)(?:\s+((?:PK|FK|UK)(?:\s*,\s*(?:PK|FK|UK))*))?(?:\s+"([^"]*)")?$/
const DIRECTION = /^direction\s+(TB|TD|BT|LR|RL)$/

const LEFT: Partial<Record<string, ErCardinality>> = {
  '|o': 'zeroOrOne',
  '||': 'exactlyOne',
  '}o': 'zeroOrMore',
  '}|': 'oneOrMore',
}
const RIGHT: Partial<Record<string, ErCardinality>> = {
  'o|': 'zeroOrOne',
  '||': 'exactlyOne',
  'o{': 'zeroOrMore',
  '|{': 'oneOrMore',
}

interface ErParse {
  entities: Map<string, ErEntity>
  relations: ErRelation[]
  problems: UmlProblem[]
  open?: { entity: ErEntity; line: SourceLine }
  direction?: UmlDirection
}

function ensureEntity(p: ErParse, id: string): ErEntity {
  let entity = p.entities.get(id)
  if (!entity) {
    entity = { id }
    p.entities.set(id, entity)
  }
  return entity
}

/** One attribute line, `string email UK "comment"`; null when it isn't one. */
function parseErAttribute(text: string): ErAttribute | null {
  const m = match(ATTRIBUTE, text.trim())
  if (!m) return null
  const [, type = '', name = '', keys, comment] = m
  const attribute: ErAttribute = { type, name }
  if (keys) attribute.keys = keys.split(',').map((k) => k.trim() as ErKey)
  if (comment) attribute.comment = comment
  return attribute
}

function readAttribute(entity: ErEntity, line: SourceLine, p: ErParse) {
  const attribute = parseErAttribute(line.text)
  if (!attribute) {
    p.problems.push(problem(line, 'syntax'))
    return
  }
  entity.attributes = [...(entity.attributes ?? []), attribute]
}

function readRelation(p: ErParse, m: Groups) {
  const [, from = '', left = '', line, right = '', to = '', label = ''] = m
  ensureEntity(p, from)
  ensureEntity(p, to)
  p.relations.push({
    from,
    to,
    fromCardinality: LEFT[left] ?? 'exactlyOne',
    toCardinality: RIGHT[right] ?? 'exactlyOne',
    label: unquote(label),
    ...(line === '..' ? { identifying: false } : {}),
  })
}

function readStatement(p: ErParse, line: SourceLine): boolean {
  let m: Groups | null
  if ((m = match(DIRECTION, line.text))) p.direction = m[1] === 'TD' ? 'TB' : (m[1] as UmlDirection)
  else if ((m = match(RELATION, line.text))) readRelation(p, m)
  else if ((m = match(ENTITY, line.text))) {
    const [, id = '', label, open, close] = m
    const entity = ensureEntity(p, id)
    if (label) entity.label = label
    if (open && !close) p.open = { entity, line }
  } else if (STYLING.test(line.text)) p.problems.push(problem(line, 'unsupported', 'warning'))
  else return false
  return true
}

/** The lines after `erDiagram`. */
function parseErDiagram(
  lines: readonly SourceLine[],
  title?: string,
): { diagram: ErDiagram; problems: UmlProblem[] } {
  const p: ErParse = { entities: new Map(), relations: [], problems: [] }
  for (const line of lines) {
    if (line.text === '}') {
      if (p.open) delete p.open
      else p.problems.push(problem(line, 'unexpected'))
    } else if (p.open) readAttribute(p.open.entity, line, p)
    else if (!readStatement(p, line)) p.problems.push(problem(line, 'syntax'))
  }
  if (p.open) p.problems.push(problem(p.open.line, 'unclosed'))
  const diagram: ErDiagram = {
    kind: 'er',
    ...(title ? { title } : {}),
    ...(p.direction ? { direction: p.direction } : {}),
    entities: [...p.entities.values()],
    relations: p.relations,
  }
  return { diagram, problems: p.problems }
}

// ── Writing ─────────────────────────────────────────────────────────────────────────────────────

const LEFT_OF = Object.fromEntries(Object.entries(LEFT).map(([k, v]) => [v, k])) as Record<
  ErCardinality,
  string
>
const RIGHT_OF = Object.fromEntries(Object.entries(RIGHT).map(([k, v]) => [v, k])) as Record<
  ErCardinality,
  string
>

/** An attribute as one Mermaid line. */
function erAttributeText(a: ErAttribute): string {
  const keys = a.keys?.length ? ` ${a.keys.join(', ')}` : ''
  const comment = a.comment ? ` ${quote(a.comment)}` : ''
  return `${a.type.replace(/\s+/g, '_')} ${a.name.replace(/\s+/g, '_')}${keys}${comment}`
}

/** A relation's crow's feet and line, `||--o{` (PlantUML writes them the same way). */
function erRelationMarks(r: ErRelation): string {
  const line = r.identifying === false ? '..' : '--'
  return `${LEFT_OF[r.fromCardinality]}${line}${RIGHT_OF[r.toCardinality]}`
}

/** The diagram as Mermaid `erDiagram` text. */
function erToMermaid(diagram: ErDiagram): string {
  const out = [...titleBlock(diagram.title), 'erDiagram']
  if (diagram.direction && diagram.direction !== 'TB') out.push(`  direction ${diagram.direction}`)
  for (const e of diagram.entities) {
    const head = `${e.id}${e.label ? `[${quote(e.label)}]` : ''}`
    if (!e.attributes?.length) {
      out.push(`  ${head}`)
      continue
    }
    out.push(`  ${head} {`, ...e.attributes.map((a) => `    ${erAttributeText(a)}`), '  }')
  }
  for (const r of diagram.relations)
    out.push(`  ${r.from} ${erRelationMarks(r)} ${r.to} : ${quote(r.label)}`)
  return out.join('\n')
}

export { erAttributeText, erRelationMarks, erToMermaid, parseErAttribute, parseErDiagram }
