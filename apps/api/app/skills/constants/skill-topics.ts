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
 * The embedding model skills, rules and articles are read with (`SkillEmbedder`), pinned to a
 * commit of its Hugging Face repository and downloaded once into `SKILL_TAGGER_CACHE` (2.4 GB in
 * fp32). Measured against laya's learner on 224 skills tagged by hand: 0.830 of main tags right in
 * 10-fold cross-validation against 0.786, at about a tenth of the time a skill
 * (`infra/skill-tagger/README.md`). fp32, not the 8-bit build: q8 loses 0.067 nDCG@5 on finding the
 * skills of a rule, and fp32 tags no worse (0.825 against 0.813 on the same folds; the watch's
 * articles 0.736 against 0.698, `infra/skill-tagger/study/`). Changing any of these embeds
 * everything again, and turns the computed affinities off until `COMPUTED_AFFINITY_THRESHOLD`
 * names the new model.
 */
export const SKILL_EMBEDDING_MODEL = {
  id: 'onnx-community/Qwen3-Embedding-0.6B-ONNX',
  revision: 'c25a394dd583836952667c12f008335071b3f43d',
  dtype: 'fp32',
} as const

/** The model as `COMPUTED_AFFINITY_THRESHOLD.model` names it. */
export const SKILL_EMBEDDING_MODEL_KEY =
  `${SKILL_EMBEDDING_MODEL.id}@${SKILL_EMBEDDING_MODEL.revision}:${SKILL_EMBEDDING_MODEL.dtype}` as const

/**
 * What a vector is for, and the instruction put before its text (none for a document). A skill
 * has one vector per purpose (`skill_embeddings`): the tagger's never serve the search. The rule
 * instruction and both texts (`retrievalSkillText`, `ruleText`) are the study's, to the character,
 * since the threshold was measured for them only.
 */
export const EMBEDDING_PURPOSES = {
  /** A skill or a watch article, read by the tagger. */
  classification: 'Classify what this coding agent skill is mainly about',
  /** A skill as the document a rule looks for. */
  retrieval: null,
  /** A ready-made rule, the query. */
  rule: 'Given a coding convention rule, retrieve the agent skills that help a coding agent follow it',
} as const

export type EmbeddingPurpose = keyof typeof EMBEDDING_PURPOSES

/** The purposes a skill has a vector for (`skill_embeddings.purpose`). */
export const SkillEmbeddingPurpose = {
  Classification: 'classification',
  Retrieval: 'retrieval',
} as const satisfies Record<string, EmbeddingPurpose>

export type SkillEmbeddingPurpose =
  (typeof SkillEmbeddingPurpose)[keyof typeof SkillEmbeddingPurpose]

/**
 * How the skills are tagged (`skill-topics.ts`). `batch` texts embedded at a time (2: the fastest
 * on a CPU; with 8, every text is padded to the longest and the model alone peaks at 3.2 GB in
 * fp32 instead of 2.4), each cut to
 * `textMaxLength` characters; one whose description is shorter than `minDescriptionLength` is
 * neither embedded nor learnt from (there is nothing to read) and keeps its search tags. The head
 * is a softmax regression (`topic-head.ts`) fitted on every label each run, once there are
 * `minLabels` of at least two tags; a skill takes the tags given at least `minProbability`,
 * `maxTopics` at most.
 */
export const SKILL_TOPIC_LIMITS = {
  batch: 2,
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
