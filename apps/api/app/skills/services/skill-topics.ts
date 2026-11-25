import { createHash } from 'node:crypto'
import app from '@adonisjs/core/services/app'
import db from '@adonisjs/lucid/services/db'
import { isTopic, type Topic } from '@coreloom-uml/catalog'
import { SEED_TOPICS } from '#app/skills/constants/seed-topics'
import {
  NAMED_TOPICS,
  SKILL_EMBEDDING_MODEL,
  SKILL_TOPIC_LIMITS,
} from '#app/skills/constants/skill-topics'
import CatalogSkill from '#app/skills/models/catalog-skill'
import SkillEmbedder from '#app/skills/services/skill-embedder'
import { trainTopicHead } from '#app/skills/services/topic-head'

/**
 * A skill's tags: those the admin set, else those the tagger gave, else (not tagged yet, or no
 * tag given) those of the search queries that found it. Written to `topics`, which every reader
 * of the catalog reads.
 */
export function effectiveTopics(
  search: string[],
  tagger: string[] | null,
  reviewed: string[] | null = null,
): string[] {
  if (reviewed && reviewed.length > 0) return reviewed
  return tagger && tagger.length > 0 ? tagger : search
}

/** What the tagger reads of a skill: its name and English description, cut. */
export function classificationText(skill: Pick<CatalogSkill, 'name' | 'description'>): string {
  return `${skill.name}\n${skill.description.en ?? ''}`.slice(0, SKILL_TOPIC_LIMITS.textMaxLength)
}

function hasText(skill: CatalogSkill): boolean {
  return (skill.description.en ?? '').trim().length >= SKILL_TOPIC_LIMITS.minDescriptionLength
}

/** The hash of what a skill's vector depends on: its text and the model that read it. */
export function embeddingHash(text: string): string {
  return createHash('sha256')
    .update(JSON.stringify([text, SKILL_EMBEDDING_MODEL]))
    .digest('hex')
}

/** The narrow tags a text names (`NAMED_TOPICS`). */
export function namedTopics(text: string): Topic[] {
  return Object.entries(NAMED_TOPICS)
    .filter((entry): entry is [Topic, RegExp] => isTopic(entry[0]) && entry[1].test(text))
    .map(([topic]) => topic)
}

/** The tags given at least `minProbability`, the likeliest first, `maxTopics` at most. */
export function topicsFromProbabilities(probabilities: Record<string, number>): Topic[] {
  return Object.entries(probabilities)
    .filter(
      (entry): entry is [Topic, number] =>
        isTopic(entry[0]) && entry[1] >= SKILL_TOPIC_LIMITS.minProbability,
    )
    .sort((a, b) => b[1] - a[1])
    .slice(0, SKILL_TOPIC_LIMITS.maxTopics)
    .map(([topic]) => topic)
}

/**
 * What the tagger learns from: each skill's main tag, the admin's (`reviewedTopics[0]`) else the
 * one `SEED_TOPICS` gives it, for the skills with a description.
 */
export function trainingLabels(skills: CatalogSkill[]): Map<number, Topic> {
  const labels = new Map<number, Topic>()
  for (const skill of skills) {
    if (!hasText(skill)) continue
    const topic =
      skill.reviewedTopics?.find(isTopic) ??
      (skill.registryId ? SEED_TOPICS[skill.registryId] : undefined)
    if (topic) labels.set(skill.id, topic)
  }
  return labels
}

export type ClassifyReport = {
  /** Skills read by the model this run: new, or whose text changed. */
  embedded: number
  /** Labels the head was fitted on (0: too few, and no skill was tagged). */
  labels: number
  /** Skills whose tagger tags changed. */
  tagged: number
  /** Too short a description to read: they keep their search tags. */
  skipped: number
}

/**
 * Embeds every skill whose text changed since it was last read (`embeddingHash`, kept in
 * `skill_embeddings`), `SKILL_TOPIC_LIMITS.batch` at a time and saved as it comes, so a run that
 * fails halfway keeps what it read. Then fits the head on every label (`trainingLabels`) and tags
 * the whole catalog with it: a few seconds, so a correction from the admin reaches every skill at
 * the next run. Only the rows whose tags changed are written.
 */
export async function classifySkillTopics(
  options: { onProgress?: (message: string) => void } = {},
): Promise<ClassifyReport> {
  const report: ClassifyReport = { embedded: 0, labels: 0, tagged: 0, skipped: 0 }
  const skills = await CatalogSkill.query().orderBy('id')
  const readable = skills.filter(hasText)
  report.skipped = skills.length - readable.length

  const stored = new Map<number, string>(
    (await db.from('skill_embeddings').select('skill_id', 'hash')).map(
      (row: { skill_id: number; hash: string }) => [row.skill_id, row.hash],
    ),
  )
  const todo = readable
    .map((skill) => {
      const text = classificationText(skill)
      return { skill, text, hash: embeddingHash(text) }
    })
    .filter(({ skill, hash }) => stored.get(skill.id) !== hash)

  if (todo.length > 0) {
    const embedder = await app.container.make(SkillEmbedder)
    try {
      for (let start = 0; start < todo.length; start += SKILL_TOPIC_LIMITS.batch) {
        const batch = todo.slice(start, start + SKILL_TOPIC_LIMITS.batch)
        const vectors = await embedder.embed(batch.map((item) => item.text))
        for (const [index, item] of batch.entries()) {
          await db.rawQuery(
            `insert into skill_embeddings (skill_id, hash, vector, created_at) values (?, ?, ?, now())
             on conflict (skill_id) do update
             set hash = excluded.hash, vector = excluded.vector, created_at = excluded.created_at`,
            [item.skill.id, item.hash, vectors[index]],
          )
        }
        report.embedded += batch.length
        options.onProgress?.(`read ${report.embedded} of ${todo.length} skills`)
      }
    } finally {
      await embedder.close()
    }
  }

  const vectors = new Map<number, number[]>(
    (
      await db
        .from('skill_embeddings')
        .whereIn(
          'skill_id',
          readable.map((skill) => skill.id),
        )
        .select('skill_id', 'vector')
    ).map((row: { skill_id: number; vector: number[] }) => [row.skill_id, row.vector]),
  )
  const labels = [...trainingLabels(skills)]
    .filter(([id]) => vectors.has(id))
    .map(([id, topic]) => ({ vector: vectors.get(id) as number[], topic }))
  if (
    labels.length < SKILL_TOPIC_LIMITS.minLabels ||
    new Set(labels.map((label) => label.topic)).size < 2
  ) {
    return report
  }
  report.labels = labels.length
  options.onProgress?.(`learning from ${labels.length} labels`)
  const head = trainTopicHead(labels)

  for (const skill of skills) {
    const vector = vectors.get(skill.id)
    const text = classificationText(skill)
    const topics = vector
      ? [...new Set([...topicsFromProbabilities(head(vector)), ...namedTopics(text)])]
      : null
    if (JSON.stringify(topics) === JSON.stringify(skill.taggerTopics)) continue
    await skill
      .merge({
        taggerTopics: topics,
        topics: effectiveTopics(skill.searchTopics, topics, skill.reviewedTopics),
      })
      .save()
    report.tagged += 1
  }
  return report
}
