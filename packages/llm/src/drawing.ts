import { type UmlProblem, type UmlSpec, validateDiagram, withoutLayout } from '@coreloom-uml/uml'
import { generateText, type LanguageModel, Output } from 'ai'
import { z } from 'zod'
import { ASSISTANT_FORMAT } from './assistant.ts'
import { failureReason, LlmCallError } from './failure.ts'

/**
 * What every "draw a new view from the code map" call shares: the answer's shape (title, summary,
 * diagram, links to the code), the check against the schema with one more call to repair it, and
 * the links cleaned down to elements drawn and code nodes given.
 */

export const DRAWING_TITLE_MAX_LENGTH = 120
export const DRAWING_SUMMARY_MAX_LENGTH = 1500
/** Places of the code kept per diagram element. */
export const DRAWING_LINKS_PER_ELEMENT_MAX = 3
const DRAWING_TEMPERATURE = 0.2

export const DRAWING_LANGUAGES = { en: 'English', fr: 'French' } as const
export type DrawingLocale = keyof typeof DRAWING_LANGUAGES

/** A diagram element and the places of the code it stands for, all of them given in the input. */
export type DrawingLink = { elementId: string; codeKeys: string[] }

export type DrawingResult =
  | {
      title: string
      summary: string
      diagram: UmlSpec
      links: DrawingLink[]
      /** Code nodes left out to fit the budget. */
      omittedNodes: number
    }
  | { title: string; summary: string; failed: UmlProblem[]; omittedNodes: number }

export const drawingOutputSchema = z.object({
  title: z.string().describe('A short title for the new view'),
  summary: z
    .string()
    .describe('Two or three sentences for the developer: what the view shows, what is unsure'),
  diagram: z.string().describe('The whole diagram as compact JSON, in the format given'),
  links: z
    .array(
      z.object({
        element: z.string().describe('The id of an element of the diagram'),
        nodes: z.array(z.string()).describe('Ids of the code nodes (n1, n2…) it stands for'),
      }),
    )
    .describe('For each element drawn from the code, the code nodes it stands for'),
})
export type DrawingOutput = z.infer<typeof drawingOutputSchema>

/** The format of one diagram kind, by example, as the assistant knows it. */
export function formatBlock(kind: UmlSpec['kind']): string {
  const { example, values } = ASSISTANT_FORMAT[kind]
  return `The ${kind} diagram format, by example: ${JSON.stringify(example)}\n${values}`
}

/** Names, paths and titles on one line, without what could pass for a tag or a column. */
export function cleanLine(text: string): string {
  return text.replace(/[\s|<>]+/g, ' ').trim()
}

export const problem = (code: UmlProblem['code'], text: string): UmlProblem => ({
  line: 0,
  severity: 'error',
  code,
  text,
})

/** The ids of a diagram's elements, from whatever lists its kind has. */
export function diagramElementIds(diagram: UmlSpec): Set<string> {
  const ids = new Set<string>()
  for (const value of Object.values(diagram)) {
    if (!Array.isArray(value)) continue
    for (const item of value as unknown[]) {
      if (typeof item === 'object' && item !== null && 'id' in item) {
        const { id } = item
        if (typeof id === 'string') ids.add(id)
      }
    }
  }
  return ids
}

function readDiagram(text: string, kind: UmlSpec['kind']) {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return { diagram: null, problems: [problem('json', 'diagram is not valid JSON')] }
  }
  const result = validateDiagram(value)
  if (result.diagram && result.diagram.kind !== kind) {
    return { diagram: null, problems: [problem('schema', `kind must be ${kind}`)] }
  }
  return result
}

/**
 * The links the model gave, checked: an element of the diagram, and code nodes cited by id (`n3`)
 * or by key, all of them given; anything else is dropped. One entry per element.
 */
export function cleanLinks(
  raw: DrawingOutput['links'],
  elementIds: ReadonlySet<string>,
  nodeKeys: readonly string[],
): DrawingLink[] {
  const known = new Set(nodeKeys)
  const resolve = (cited: string): string | null => {
    const value = cited.trim().replace(/^`|`$/g, '')
    const id = /^n(\d+)$/.exec(value)
    if (id) return nodeKeys[Number(id[1]) - 1] ?? null
    return known.has(value) ? value : null
  }
  const byElement = new Map<string, Set<string>>()
  for (const item of raw) {
    const element = item.element.trim()
    if (!elementIds.has(element)) continue
    const keys = byElement.get(element) ?? new Set<string>()
    for (const cited of item.nodes) {
      const key = resolve(cited)
      if (key && keys.size < DRAWING_LINKS_PER_ELEMENT_MAX) keys.add(key)
    }
    if (keys.size) byElement.set(element, keys)
  }
  return [...byElement].map(([elementId, keys]) => ({ elementId, codeKeys: [...keys] }))
}

function cleanText(text: string, max: number): string {
  const line = text
    .replace(/<[^>]*>/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim()
  return line.length <= max ? line : `${line.slice(0, max - 1).trimEnd()}…`
}

export type DrawingCall = {
  kind: UmlSpec['kind']
  instructions: string
  prompt: string
  /** The code nodes in the order they are numbered (n1, n2…). */
  keys: readonly string[]
  omittedNodes: number
  timeoutMs: number
  maxOutputTokens: number
  /** The structured output's name. */
  name: string
}

async function call(model: LanguageModel, drawing: DrawingCall, prompt: string) {
  try {
    const result = await generateText({
      model,
      instructions: drawing.instructions,
      prompt,
      output: Output.object({ schema: drawingOutputSchema, name: drawing.name }),
      temperature: DRAWING_TEMPERATURE,
      maxOutputTokens: drawing.maxOutputTokens,
      timeout: drawing.timeoutMs,
      maxRetries: 0,
      telemetry: { isEnabled: false },
    })
    return result.output
  } catch (error) {
    throw new LlmCallError(failureReason(error))
  }
}

/**
 * Draws one new view. When the diagram fails the schema, the model gets one more call with the
 * problems; what still fails comes back as `failed`, and the first answer stands if that call
 * fails. Nothing is stored. Throws `LlmCallError` when the first call fails.
 */
export async function drawDiagram(
  model: LanguageModel,
  drawing: DrawingCall,
): Promise<DrawingResult> {
  const omitted = drawing.omittedNodes
  const finish = (output: DrawingOutput): DrawingResult => {
    const title = cleanText(output.title, DRAWING_TITLE_MAX_LENGTH).replace(/\s+/g, ' ')
    const summary = cleanText(output.summary, DRAWING_SUMMARY_MAX_LENGTH)
    const { diagram, problems } = readDiagram(output.diagram, drawing.kind)
    if (!title) problems.push(problem('schema', 'title is required'))
    if (!diagram || problems.length > 0) {
      return { title, summary, failed: problems, omittedNodes: omitted }
    }
    const spec = withoutLayout(diagram)
    return {
      title,
      summary,
      diagram: spec,
      links: cleanLinks(output.links, diagramElementIds(spec), drawing.keys),
      omittedNodes: omitted,
    }
  }

  const first = await call(model, drawing, drawing.prompt)
  const answered = finish(first)
  if (!('failed' in answered)) return answered

  const problems = answered.failed.map((item) => `- ${item.text ?? item.code}`).join('\n')
  const retry = [
    drawing.prompt,
    `<previous_answer>\n${JSON.stringify(first)}\n</previous_answer>`,
    `<problems>\n${problems}\n</problems>`,
    'Your previous diagram is invalid. Answer again in full, fixing these problems.',
  ].join('\n')
  try {
    return finish(await call(model, drawing, retry))
  } catch (error) {
    if (error instanceof LlmCallError) return answered
    throw error
  }
}
