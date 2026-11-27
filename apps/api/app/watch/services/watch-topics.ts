import app from '@adonisjs/core/services/app'
import db from '@adonisjs/lucid/services/db'
import { isTopic, type Topic } from '@coreloom-uml/catalog'
import { SKILL_TOPIC_LIMITS } from '#app/skills/constants/skill-topics'
import CatalogSkill from '#app/skills/models/catalog-skill'
import SkillEmbedder from '#app/skills/services/skill-embedder'
import {
  effectiveTopics,
  embeddingHash,
  namedTopics,
  topicsFromProbabilities,
  trainingLabels,
} from '#app/skills/services/skill-topics'
import { type LabelledVector, trainTopicHead } from '#app/skills/services/topic-head'
import WatchArticle from '#app/watch/models/watch-article'

/** What the tagger reads of an article: its title and excerpt, cut. */
export function articleText(article: Pick<WatchArticle, 'title' | 'excerpt'>): string {
  return `${article.title}\n${article.excerpt}`.slice(0, SKILL_TOPIC_LIMITS.textMaxLength)
}

export type ArticleTopicsReport = {
  /** Articles read by the model this run: new, or whose text changed. */
  embedded: number
  /** Labels the head was fitted on: the skills' and the articles the admin tagged. */
  labels: number
  /** Articles whose tagger tags changed. */
  tagged: number
}

/**
 * Tags the watch's articles with the skill tagger (run in the `skill-tagger` worker only, after
 * `classifySkillTopics` in `ClassifySkillTopicsJob`): embeds every article whose text changed
 * (`watch_article_embeddings`, keyed by `embeddingHash`), fits the head on the skills' labels plus
 * the main tag the admin set on articles, and writes each article's `tagger_topics` and `topics`
 * (`effectiveTopics`: the admin's, else the tagger's, else the feed's).
 */
export async function classifyWatchArticles(): Promise<ArticleTopicsReport> {
  const report: ArticleTopicsReport = { embedded: 0, labels: 0, tagged: 0 }
  const articles = await WatchArticle.query().orderBy('id')
  if (articles.length === 0) return report

  const stored = new Map<number, string>(
    (await db.from('watch_article_embeddings').select('article_id', 'hash')).map(
      (row: { article_id: number; hash: string }) => [row.article_id, row.hash],
    ),
  )
  const todo = articles
    .map((article) => {
      const text = articleText(article)
      return { article, text, hash: embeddingHash(text) }
    })
    .filter(({ article, hash }) => stored.get(article.id) !== hash)

  if (todo.length > 0) {
    const embedder = await app.container.make(SkillEmbedder)
    try {
      for (let start = 0; start < todo.length; start += SKILL_TOPIC_LIMITS.batch) {
        const batch = todo.slice(start, start + SKILL_TOPIC_LIMITS.batch)
        const vectors = await embedder.embed(batch.map((item) => item.text))
        for (const [index, item] of batch.entries()) {
          await db.rawQuery(
            `insert into watch_article_embeddings (article_id, hash, vector, created_at)
             values (?, ?, ?, now())
             on conflict (article_id) do update
             set hash = excluded.hash, vector = excluded.vector, created_at = excluded.created_at`,
            [item.article.id, item.hash, vectors[index]],
          )
        }
        report.embedded += batch.length
      }
    } finally {
      await embedder.close()
    }
  }

  const articleVectors = new Map<number, number[]>(
    (await db.from('watch_article_embeddings').select('article_id', 'vector')).map(
      (row: { article_id: number; vector: number[] }) => [row.article_id, row.vector],
    ),
  )
  const labels: LabelledVector[] = []
  const skills = await CatalogSkill.query()
  const skillLabels = trainingLabels(skills)
  if (skillLabels.size > 0) {
    const rows = await db
      .from('skill_embeddings')
      .whereIn('skill_id', [...skillLabels.keys()])
      .select('skill_id', 'vector')
    for (const row of rows as { skill_id: number; vector: number[] }[]) {
      labels.push({ vector: row.vector, topic: skillLabels.get(row.skill_id) as Topic })
    }
  }
  for (const article of articles) {
    const topic = article.reviewedTopics?.find(isTopic)
    const vector = articleVectors.get(article.id)
    if (topic && vector) labels.push({ vector, topic })
  }
  if (
    labels.length < SKILL_TOPIC_LIMITS.minLabels ||
    new Set(labels.map((label) => label.topic)).size < 2
  ) {
    return report
  }
  report.labels = labels.length
  const head = trainTopicHead(labels)

  for (const article of articles) {
    const vector = articleVectors.get(article.id)
    const topics = vector
      ? [
          ...new Set([
            ...topicsFromProbabilities(head(vector)),
            ...namedTopics(articleText(article)),
          ]),
        ]
      : null
    if (JSON.stringify(topics) === JSON.stringify(article.taggerTopics)) continue
    await article
      .merge({
        taggerTopics: topics,
        topics: effectiveTopics(article.sourceTopics, topics, article.reviewedTopics),
      })
      .save()
    report.tagged += 1
  }
  return report
}
