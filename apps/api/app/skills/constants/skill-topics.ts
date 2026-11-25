import type { Topic } from '@coreloom-uml/catalog'

/**
 * Narrow tags the tagger, picking among all of them, may lose to the broad tag that holds them
 * (a React animation skill reads as `frontend`): a skill also takes one when its name or
 * description names it. Matched on whole words, case aside.
 */
export const NAMED_TOPICS: Partial<Record<Topic, RegExp>> = {
  react: /\b(react|next\.?js|remix|react[- ]native)\b/i,
  typescript: /\b(typescript|tsx?|tsconfig)\b/i,
  mobile: /\b(ios|android|swift ?ui|kotlin|react[- ]native|expo|flutter)\b/i,
}

/** The queue `ClassifySkillTopicsJob` runs on: the `skill-tagger` worker's only queue. */
export const SKILL_TOPICS_QUEUE = 'skill-topics' as const

/**
 * The embedding model each skill's text is read with (`SkillEmbedder`), pinned to a commit of its
 * Hugging Face repository and downloaded once into `SKILL_TAGGER_CACHE`, with the instruction put
 * before each text. Measured against laya's learner on 224 skills tagged by hand: 0.830 of main
 * tags right in 10-fold cross-validation against 0.786, at about a tenth of the time a skill
 * (`infra/skill-tagger/README.md`). Changing any of these embeds every skill again.
 */
export const SKILL_EMBEDDING_MODEL = {
  id: 'onnx-community/Qwen3-Embedding-0.6B-ONNX',
  revision: 'c25a394dd583836952667c12f008335071b3f43d',
  dtype: 'q8',
  instruction: 'Classify what this coding agent skill is mainly about',
} as const

/**
 * How the skills are tagged (`skill-topics.ts`). `batch` texts embedded at a time, each cut to
 * `textMaxLength` characters; one whose description is shorter than `minDescriptionLength` is
 * neither embedded nor learnt from (there is nothing to read) and keeps its search tags. The head
 * is a softmax regression (`topic-head.ts`) fitted on every label each run, once there are
 * `minLabels` of at least two tags; a skill takes the tags given at least `minProbability`,
 * `maxTopics` at most.
 */
export const SKILL_TOPIC_LIMITS = {
  batch: 8,
  textMaxLength: 2000,
  minDescriptionLength: 40,
  minLabels: 10,
  minProbability: 0.3,
  maxTopics: 3,
} as const

/** The softmax regression's training (`trainTopicHead`): L2 penalty, full-batch steps, step size. */
export const TOPIC_HEAD_TRAINING = { l2: 1e-4, epochs: 500, learningRate: 5 } as const

/** Where a skill's `topics` come from (`effectiveTopics`): the admin, the tagger or the search. */
export const TopicsSource = {
  Reviewed: 'reviewed',
  Tagger: 'tagger',
  Search: 'search',
} as const

export type TopicsSource = (typeof TopicsSource)[keyof typeof TopicsSource]
