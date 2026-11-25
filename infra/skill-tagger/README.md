# Skill tagger

The skills of the catalog are tagged (`Topic`, `packages/catalog/src/topics.ts`) by a classifier
that learns from tags set by hand. An embedding model reads each skill's name and description
into a vector once; a small softmax regression, fitted on every label at each run, picks the tags.
No text is generated, no account's model is called, and nothing leaves the worker but the model's
download.

## What it is

- **Code**: `apps/api/app/skills/services/skill-topics.ts` (`classifySkillTopics`),
  `skill-embedder.ts` (the model, through transformers.js on the CPU) and `topic-head.ts` (the
  regression, pure TypeScript). Run by `ClassifySkillTopicsJob` on the `skill-topics` queue, after
  each skills refresh and each tag the admin sets, and by `node ace skills:classify`.
- **Model**: `SKILL_EMBEDDING_MODEL` in `app/skills/constants/skill-topics.ts`:
  `onnx-community/Qwen3-Embedding-0.6B-ONNX`, its 8-bit build, pinned to a commit of its
  Hugging Face repository. Downloaded on first use into `SKILL_TAGGER_CACHE` (about 600 MB, the
  `skill-tagger-models` volume); about 1.5 GB of memory while it reads, freed after each run.
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

- Locally, on a Linux or macOS host: `pnpm --filter @coreloom-uml/api queue:tag` (the worker)
  or `node ace skills:classify` (one run now). In Docker:
  `docker compose -f infra/docker-compose.yml --profile skills up -d skill-tagger`.
- Staging and production: the `skill-tagger` service.

## Raising a version

- **The model** (`SKILL_EMBEDDING_MODEL`: its commit, build or instruction): every skill is
  embedded again at the next run. Measure it first on the labels: 10-fold cross-validation and the
  53 held out, against the figures above.
- **transformers.js** (`@huggingface/transformers` in `apps/api/package.json`, and the
  onnxruntime it brings): build the `skill-tagger` image and run `node ace skills:classify` in it
  before relying on it, since only that shows the binary loads.
