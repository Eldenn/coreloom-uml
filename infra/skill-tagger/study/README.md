# Skill suggestion study (2026-11-27)

The record behind computed skill affinities: which retrieval method, which threshold, measured on
which labels. It is frozen: the threshold (cosine 0.656, Qwen3-Embedding-0.6B in fp32) and its
fallback (0.672) were derived from these files, and the confirmation was run once on them. Change
nothing here to tune the product; a new measure gets a new folder.

Nothing in this folder runs in CI or in the product. Every script is replayed by hand.

## Data

| File | What it is |
| --- | --- |
| `rules.json` | The 881 ready-made rules of the catalog at the time (`export-rules.ts`). |
| `skills.json` | The 215 suggestable skills of the local catalog after a full refresh (`export-skills.ts`, from the `skills` rows). |
| `slot-topics.json` | Each slot's tags (`export-topics.ts`). |
| `truth.json` | The first set: 184 rules, each with the skills expected (`[]`: none should come). Chosen by hand towards the rules the catalog covers (124 positive): biased, see below. |
| `empty-kinds.json` | The first set's 60 empty rules split into `refusal` (27) and `nothing` (33). |
| `confirm.json`, `confirm-labels.json` | The confirmation set: 100 rules drawn at random (`random.Random(20261127)`, `{value}` rules left out), and their reviewed labels (12 positive, 7 refusals, 81 empty). |
| `agree.json`, `agree-labels-a.json`, `agree-labels-b.json` | The agreement set: the next 30 rules of the same draw, labelled twice blind. |
| `relabel30.json`, `relabel30-labels.json` | 30 rules of the first set relabelled blind under the strict instruction. |
| `scores.npz` | Rule x skill scores on the first set: `qwen` (PyTorch), `sparseup`, `qwen_onnx_q8`, `qwen_onnx_fp16`, `qwen_onnx_fp32`. |
| `qwen-onnx-{q8,fp16,fp32}-all.npy` | Cosines of all 881 rules x 215 skills from transformers.js, rows in `js/embed-input.json`'s `rule_keys` order. |
| `skill-emb.npy` | The skills' document vectors (for near duplicates). |
| `*results*.json`, `confirm-run.log` | Outputs kept as they were printed. |
| `tagger/seed.tsv` | `SEED_TOPICS` at the time, for the tagger's re-measure. |

A label lists the skills that would help a coding agent follow the rule in a project holding it;
`refusal` marks a rule whose project does not use or must not add the thing a skill would be about.

**Limit.** The first set holds 67 % positive rules against about 10 % among rules drawn at random:
its thresholded figures do not hold in production. The confirmation set measures false suggestions
only (81 empty rules); its precision is indicative.

## Replaying

Python 3.12 with `requirements.txt` (`torch` CPU build), and Node 22+ in `js/` (`npm ci`) for
transformers.js. Models are pinned by revision in the scripts and downloaded on first use.

| Step | Command | Model |
| --- | --- | --- |
| Rank every method on the first set, write `scores.npz` (`qwen`, `sparseup` only: re-add the ONNX keys after) | `python -I bench.py .` | yes |
| Threshold under repeated CV, BM25 and fusions | `python -I threshold.py .`, `fusion.py .`, `lexical.py .` | no |
| Reranker (rejected) | `python -I rerank.py .`; the ONNX builds through `js-prompts.py`, `js/score.mjs`, `js-to-npz.py` | yes |
| Tags as a condition (rejected) | `python -I tags.py .` | no |
| Threshold rule: at most 10 % (or 5 %) of the `nothing` rules get a suggestion, 20 x 5 CV, median | `python -I curve.py .`, `curve05.py .` | no |
| Embed in the deployed stack (q8, fp16, fp32) | `node js/embed.mjs <dtype>`, then `python -I onnx-to-npy.py . <dtype>` | yes |
| Configurations, and the system as shipped against `matchSkills` | `python -I configs.py .`, `shipped.py .` | no |
| Per-skill centring (rejected) | `python -I centering.py .` | no |
| The confirmation (run once) | `python -I confirm-run.py .` | no |
| Validation proposals and near duplicates | `python -I proposals.py .` (`dedup.py .` writes `skill-emb.npy`) | no |
| The tagger in fp32 against q8 (224 skills, 10-fold CV) | `node tagger/embed-seed.mjs q8 8`, `… fp32 2`, then `node tagger/cv.ts` (needs `tagger/skills-db.json`, the `skills` rows exported as JSON) | yes |

## Results kept

- Qwen3-Embedding-0.6B alone, no fusion: SparseUp-v2, BM25, the reranker, the name bonus, tags as a
  condition and per-skill centring were each measured and rejected.
- Threshold 0.656 (fallback 0.672). Confirmation: 4 of 81 empty rules got a suggestion (4.9 %,
  Wilson 95 % [1.9, 12.0]), and none of its 12 positive rules was served.
- The 8-bit build loses 0.067 nDCG@5 [-0.121, -0.013] against PyTorch; fp32 and fp16 match it.
- The tagger: main tag right 0.825 in fp32 against 0.813 in q8 on the same folds, +0.012
  [-0.020, +0.044].
