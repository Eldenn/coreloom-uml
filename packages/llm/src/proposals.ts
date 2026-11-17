import { MARKER_PREFIX } from '@coreloom-uml/catalog'

/** Past this estimate of the input (characters / 4), what the model reads is cut. */
export const PROPOSALS_MAX_INPUT_TOKENS = 8000
export const PROPOSALS_MAX_OUTPUT_TOKENS = 2000
export const PROPOSALS_TEMPERATURE = 0.2
export const PROPOSALS_TIMEOUT_MS = 60_000
/** Proposals kept from one answer of the model. */
export const PROPOSALS_MAX = 20
/** Longest proposal kept, as for an accepted rule. */
export const PROPOSAL_TEXT_MAX_LENGTH = 300

export type RuleProposal = {
  section: string
  text: string
  /** What the rule comes from (`diagram:<id>`), if the model said. */
  basedOn: string | null
}

export type ProposalsResult = {
  proposals: RuleProposal[]
  /** What the model read was cut to fit the input budget. */
  truncated: boolean
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

/** Compared case- and punctuation-insensitively, so a rephrased copy is still a duplicate. */
function duplicateKey(text: string): string {
  return oneLine(text)
    .toLowerCase()
    .replace(/[`*_.!;:,]+$/g, '')
    .replace(/[`*_]/g, '')
}

/** One line, no HTML tag, no managed-block marker, at most `PROPOSAL_TEXT_MAX_LENGTH`. */
export function cleanProposalText(text: string): string {
  const line = oneLine(text.replace(/<[^>]*>/g, ' ').replaceAll(MARKER_PREFIX, ' '))
  return line.length <= PROPOSAL_TEXT_MAX_LENGTH
    ? line
    : `${line.slice(0, PROPOSAL_TEXT_MAX_LENGTH - 1).trimEnd()}…`
}

/**
 * What the model answered, checked: an unknown section or an empty text is dropped, the text is
 * cleaned, a duplicate of an existing rule or of an earlier proposal is dropped, and an
 * unknown `basedOn` becomes `null`.
 */
export function cleanProposals(
  raw: readonly { section: string; text: string; basedOn?: string | null }[],
  sections: readonly string[],
  existing: readonly string[],
  sourceIds: readonly string[],
): RuleProposal[] {
  const seen = new Set(existing.map(duplicateKey))
  const proposals: RuleProposal[] = []
  for (const item of raw) {
    if (proposals.length >= PROPOSALS_MAX) break
    const section = sections.find((name) => name === item.section.trim())
    if (!section) continue
    const text = cleanProposalText(item.text)
    if (!text) continue
    const key = duplicateKey(text)
    if (seen.has(key)) continue
    seen.add(key)
    const basedOn = item.basedOn && sourceIds.includes(item.basedOn) ? item.basedOn : null
    proposals.push({ section, text, basedOn })
  }
  return proposals
}
