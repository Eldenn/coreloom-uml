# Skill tagger

The skills of the catalog are tagged (`Topic`, `packages/catalog/src/topics.ts`) by a classifier
that learns from tags set by hand. An embedding model reads each skill's name and description
into a vector once; a small softmax regression, fitted on every label at each run, picks the tags.
No text is generated, no account's model is called, and nothing leaves the worker but the model's
download.

## What it is

- **Code**: `apps/api/app/skills/services/skill-topics.ts` (`classifySkillTopics`),
  `skill-embedder.ts` (the model, through transformers.js on the CPU) and `topic-head.ts` (the
  regression, pure TypeScript), then `skill-rule-scores.ts` (`scoreSkillRules`, the computed
  skill affinities). Run by `ClassifySkillTopicsJob` on the `skill-topics` queue, after each
  skills refresh, each tag the admin sets, each copy captured and each skill blocked or suggested
  again, and queued by `node ace skills:classify` and, when the scores are not current,
  `skills:setup`. The job loads the model once and runs, in this order: the skills' classification
  vectors and tags, the search vectors of the suggestable skills and of the rules, the scores, then
  the watch's articles.
- **Model**: `SKILL_EMBEDDING_MODEL` in `app/skills/constants/skill-topics.ts`:
  `onnx-community/Qwen3-Embedding-0.6B-ONNX`, its fp32 build, pinned to a commit of its
  Hugging Face repository. Downloaded on first use into `SKILL_TAGGER_CACHE` (2.4 GB, the
  `skill-tagger-models` volume), read in batches of 2 and freed after each run. The 8-bit build
  tagged as well but lost 0.067 nDCG@5 finding the skills of a rule (`study/`).
- **Memory**: the model alone reading 1,096 texts peaks at 2.6 GB. In the worker, where each
  batch's vectors are written to the database, a run peaks at 4.8 GB: onnxruntime's output
  buffers are memory V8 collects late (they reached 1.8 GB before a full collection), and the
  process keeps what it freed. Measured on 2026-11-27 on the first run of a deployment (2,729 skills
  tagged, then 215 skills and 844 rules for the search, 7 minutes): it rises to 4.7 GB within the
  first 800 texts and stays there. Neither freeing the tensors, onnxruntime's arena off, fewer
  malloc arenas nor a forced collection after each batch brought it down. `mem_limit: 6g` on the
  service is a guard against a leak, not the expected size.
- **Vectors**: `skill_embeddings` keeps one per skill and purpose (`EMBEDDING_PURPOSES`):
  `classification`, with the tagger's instruction, and `retrieval`, a suggestable skill's
  `name: description` with no instruction; `rule_embeddings` each ready-made rule's text but the
  `{value}` ones, with the rule instruction. The texts and the instruction are the study's, to the
  character: `COMPUTED_AFFINITY_THRESHOLD` (0.656) was measured for them and this model only.
- **Image**: stage `skill-tagger` of `apps/api/Dockerfile`, published as
  `coreloom-uml-skill-tagger` by `release.yml`, service `skill-tagger` of every compose file
  (behind the `skills` profile locally). It is the API's build on Debian slim rather than Alpine:
  onnxruntime's prebuilt binary needs glibc, and Alpine's compatibility layer is not enough. It
  runs `queue:work --queues=skill-topics` and nothing else; no other worker listens to that
  queue, and no other process imports transformers.js.
- **What it holds**: its own `APP_KEY`, the database and Redis. No GitHub, E2B, Drive, account or
  mail setting.

## How it learns

The labels are the main tag of each skill with a description: the admin's (`reviewed_topics`,
set from the skill's sheet), else the one `SEED_TOPICS` gives it
(`apps/api/app/skills/constants/seed-topics.ts`, 224 skills tagged by hand, by skills.sh id).
Each run:

1. embeds every skill whose text or model changed (`embeddingHash`), into `skill_embeddings`;
2. fits the regression on every label (a few seconds), once there are `minLabels` of two tags;
3. tags every skill with a description: the tags given at least
   `SKILL_TOPIC_LIMITS.minProbability`, three at most, plus the narrow tags its text names
   (`NAMED_TOPICS`), and writes only the rows whose tags changed.

The first run reads the whole catalog (a few minutes); later runs read only the new and changed
skills, so a correction from the admin reaches every skill within seconds. A skill keeps the
admin's tags, else the tagger's, else those of the search queries that found it
(`effectiveTopics`). A wrong tag is fixed on the skill's sheet, never in the database.

## How well it tags

Measured on 224 skills tagged by hand, main tag right in 10-fold cross-validation:

| Method | Right | Time a skill | Weights |
| --- | --- | --- | --- |
| laya 0.5.3 (vega + its learnt head) | 0.786 | about 800 ms | 3.5 GB |
| vega's features + this regression | 0.821 | about 800 ms | 3.5 GB |
| **Qwen3-Embedding-0.6B q8 + this regression** | **0.830** | **50 to 90 ms** | **600 MB** |

On 53 skills held out from the first 161 labels, it gets the main tag right for 40 (laya: 37),
and the right tag is among its first two for 50. Giving the model a longer instruction that lists
the tags made it worse and slower. The labels matter more than the model: 63 labels added on
the rare tags raised it from 0.776 to 0.830.

## Running it

- Locally, on a Linux or macOS host: `pnpm --filter @coreloom-uml/api queue:tag` (the worker);
  `node ace skills:classify` queues one run for it, so no second model is ever loaded. In Docker:
  `docker compose -f infra/docker-compose.yml --profile skills up -d skill-tagger`.
- Staging and production: the `skill-tagger` service.

## Raising a version

- **The model** (`SKILL_EMBEDDING_MODEL`: its commit or build, or an instruction of
  `EMBEDDING_PURPOSES`): every skill, rule and article is embedded again at the next run, and the
  computed affinities turn themselves off until `COMPUTED_AFFINITY_THRESHOLD` is measured again
  for the new model (`study/`). Measure the tags first on the labels: 10-fold cross-validation and
  the 53 held out, against the figures above, and the watch's articles each feed held out.
- **transformers.js** (`@huggingface/transformers` in `apps/api/package.json`, and the
  onnxruntime it brings): build the `skill-tagger` image, start its worker and queue a run
  (`node ace skills:classify`) before relying on it, since only that shows the binary loads.

## Articles of the tech watch

The same worker tags the Watch page's articles (`classifyWatchArticles`,
`apps/api/app/watch/services/watch-topics.ts`, run by `ClassifySkillTopicsJob` after the skills):
each article's title and excerpt is embedded once (`watch_article_embeddings`), and the head is
fitted on the skills' labels plus the main tag the admin set on articles.

Measured on 2026-11-27 on 106 articles from 14 public feeds (AI, architecture, security,
databases, TypeScript, React, Kubernetes, CSS, Android...), main tag set by hand, six left
without one (gift guides, conference calls):

| Head fitted on | Skill instruction | Article instruction |
| --- | --- | --- |
| the skills' 224 labels only | 0.642 (in the first two: 0.745) | 0.557 |
| the skills plus the other feeds' articles, each feed held out | 0.670 | 0.698 |

Shuffled 5-fold folds gave 0.82 to 0.86, but articles of one feed then sit on both sides: the
held-out-feed figure is the one to trust. Misses are mostly general AI essays read as
`workflow` or `docs`, and modernization or incident posts. Below the 0.7 the plan asked for, so
an article keeps its source's tags and takes the tagger's only when its source has none, until
the admin has tagged `WATCH_TAGGER.minArticleLabels` articles (`articleTopics`); the instruction
stays the skills' one (the article instruction is no better within this sample). Measure again,
leaving each feed out, before lowering that threshold or changing the instruction.
