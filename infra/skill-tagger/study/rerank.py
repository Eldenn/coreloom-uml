"""Throwaway study: rerank Qwen3-Embedding's top 20 with Qwen3-Reranker-0.6B and compare.

Usage: HF_HOME=<dir>/hf python -I rerank.py <study dir>
Reranker scores are cached in rerank-scores.npz (delete it to score again).
"""
import json, math, os, sys, time
from pathlib import Path

import numpy as np
import torch

D = Path(sys.argv[1])
REV = "e61197ed45024b0ed8a2d74b80b4d909f1255473"
TASK = "Given a coding convention rule, retrieve the agent skills that help a coding agent follow it"
TOP, K, BATCH, BETA = 20, 5, 16, 0.5
torch.set_num_threads(8)

rules = {f"{r['slot']}/{r['rule']}": r for r in json.loads((D / "rules.json").read_text())}
skills = json.loads((D / "skills.json").read_text())
truth = json.loads((D / "truth.json").read_text())
refusal = set(json.loads((D / "empty-kinds.json").read_text())["refusal"])
keys = list(truth)
slugs = [s["slug"] for s in skills]
qwen = np.load(D / "scores.npz")["qwen"]
rows = [i for i, k in enumerate(keys) if k not in refusal]
assert len(rows) == 157, len(rows)


def rule_text(r):  # same as bench.py
    head = r["group"] + (f" {r['label']}" if r["label"] else "")
    return head + "\n" + " ".join(r["lines"])


def skill_text(s):
    return f"{s['name']}: {s['description'] or ''}"[:2000]


cand = {i: np.argsort(-qwen[i])[:TOP] for i in rows}

cache = D / os.environ.get("RR_CACHE", "rerank-scores.npz")  # js-to-npz.py writes others
if cache.exists():
    z = np.load(cache)
    rr, per_pair, nthreads = z["rr"], float(z["per_pair"]), int(z["threads"])
else:
    from transformers import AutoModelForCausalLM, AutoTokenizer

    tok = AutoTokenizer.from_pretrained("Qwen/Qwen3-Reranker-0.6B", revision=REV, padding_side="left")
    model = AutoModelForCausalLM.from_pretrained("Qwen/Qwen3-Reranker-0.6B", revision=REV, dtype=torch.float32).eval()
    # Template from the model card.
    prefix = ('<|im_start|>system\nJudge whether the Document meets the requirements based on the Query and the '
              'Instruct provided. Note that the answer can only be "yes" or "no".<|im_end|>\n<|im_start|>user\n')
    suffix = "<|im_end|>\n<|im_start|>assistant\n<think>\n\n</think>\n\n"
    pre, suf = tok.encode(prefix, add_special_tokens=False), tok.encode(suffix, add_special_tokens=False)
    yes, no = tok.convert_tokens_to_ids("yes"), tok.convert_tokens_to_ids("no")
    pairs = [(i, j) for i in rows for j in cand[i]]
    texts = [f"<Instruct>: {TASK}\n<Query>: {rule_text(rules[keys[i]])}\n<Document>: {skill_text(skills[j])}"
             for i, j in pairs]
    out = []
    t = time.process_time(); w = time.time()
    with torch.inference_mode():
        for b in range(0, len(texts), BATCH):
            enc = tok(texts[b:b + BATCH], padding=False, truncation="longest_first",
                      return_attention_mask=False, max_length=8192 - len(pre) - len(suf))
            enc["input_ids"] = [pre + ids + suf for ids in enc["input_ids"]]
            enc = tok.pad(enc, padding=True, return_tensors="pt")
            logits = model(**enc).logits[:, -1, :]
            two = torch.stack([logits[:, no], logits[:, yes]], dim=1)
            out += torch.softmax(two, dim=1)[:, 1].tolist()
    per_pair = (time.process_time() - t) / len(pairs)
    print(f"CPU {per_pair*1000:.1f} ms/pair, wall {(time.time()-w)/len(pairs)*1000:.1f} ms/pair, {len(pairs)} pairs")
    rr = np.full(qwen.shape, -1e9)
    for (i, j), p in zip(pairs, out):
        rr[i, j] = p
    nthreads = torch.get_num_threads()
    np.savez(cache, rr=rr, per_pair=per_pair, threads=nthreads)

# Qwen alone: its scores on its own top 20, nothing else reachable.
qw = np.full(qwen.shape, -1e9)
for i in rows:
    qw[i, cand[i]] = qwen[i, cand[i]]
methods = {"qwen": qw, "reranker": rr}


def order(mat, i):
    return [j for j in np.argsort(-mat[i]) if mat[i, j] > -1e8]


def ranking(mat):
    pos = [i for i in rows if truth[keys[i]]]
    per = []
    for i in pos:
        rel = set(truth[keys[i]])
        full = [slugs[j] for j in order(mat, i)]
        hits = [s in rel for s in full[:K]]
        first = next((n for n, s in enumerate(full) if s in rel), None)
        ideal = sum(1 / math.log2(n + 2) for n in range(min(len(rel), K)))
        per.append((sum(h / math.log2(n + 2) for n, h in enumerate(hits)) / ideal,
                    sum(hits) / min(len(rel), K), 1 / (first + 1) if first is not None else 0.0))
    return np.array(per)  # columns nDCG@5, R@5, MRR (over the top 20)


def outcome(mat, i, th):
    top = [slugs[j] for j in order(mat, i)[:K] if mat[i, j] >= th]
    rel = set(truth[keys[i]])
    t = sum(s in rel for s in top)
    return t, len(top) - t, min(len(rel), K) - t, len(top)


def fbeta(tp, fp, fn):
    b2 = BETA ** 2
    return (1 + b2) * tp / ((1 + b2) * tp + b2 * fn + fp) if tp else 0.0


def summary(c):  # c: per-rule [tp, fp, fn, shown==0] arrays over `rows`
    tp, fp, fn, empty = c[:, 0].sum(), c[:, 1].sum(), c[:, 2].sum(), c[:, 3]
    pos = np.array([bool(truth[keys[i]]) for i in rows])
    return {"precision": tp / (tp + fp) if tp + fp else 0.0, "recall": tp / (tp + fn), "F0.5": fbeta(tp, fp, fn),
            "positive rules with no suggestion": empty[pos].mean(),
            "nothing rules suggested": 1 - empty[~pos].mean()}


def cv(mat, seed):
    idx = np.random.default_rng(seed).permutation(rows)
    per, ths = {}, []
    for f in range(5):
        test = set(idx[f::5].tolist())
        train = [i for i in rows if i not in test]
        grid = np.unique(np.concatenate([np.sort(mat[i][mat[i] > -1e8])[-K:] for i in train]))
        best, best_f = None, -1
        for th in grid:  # every distinct train score is a candidate cut
            a = b = c = 0
            for i in train:
                t, p, n, _ = outcome(mat, i, th)
                a, b, c = a + t, b + p, c + n
            f = fbeta(a, b, c)
            if f > best_f:
                best, best_f = th, f
        ths.append(best)
        for i in test:
            t, p, n, shown = outcome(mat, i, best)
            per[i] = (t, p, n, shown == 0)
    return np.array([per[i] for i in rows], float), ths


res = {"revision": REV, "instruction": TASK, "candidates": TOP, "batch": BATCH, "torch_threads": nthreads,
       "cpu_ms_per_pair": per_pair * 1000, "rules": len(rows), "methods": {}}
per_rule = {}
for name, mat in methods.items():
    rk = ranking(mat)
    reps = [cv(mat, s) for s in range(20)]
    sums = [summary(c) for c, _ in reps]
    ths = [t for _, ts in reps for t in ts]
    per_rule[name] = (rk, np.mean([c for c, _ in reps], axis=0))
    res["methods"][name] = {
        "nDCG@5": rk[:, 0].mean(), "R@5": rk[:, 1].mean(), "MRR@20": rk[:, 2].mean(),
        "threshold": {m: {"mean": float(np.mean([s[m] for s in sums])), "std": float(np.std([s[m] for s in sums]))}
                      for m in sums[0]},
        "chosen threshold": {"min": float(min(ths)), "max": float(max(ths)), "median": float(np.median(ths))},
    }

# Paired bootstrap over rules: reranker - qwen.
rng = np.random.default_rng(1)
(rk_q, c_q), (rk_r, c_r) = per_rule["qwen"], per_rule["reranker"]
npos = len(rk_q)
pos_rows = [n for n, i in enumerate(rows) if truth[keys[i]]]
diffs = {"nDCG@5": [], **{m: [] for m in summary(c_q)}}
for _ in range(5000):
    s = rng.integers(0, len(rows), len(rows))
    sp = rng.integers(0, npos, npos)  # nDCG is defined on positives only
    diffs["nDCG@5"].append(rk_r[sp, 0].mean() - rk_q[sp, 0].mean())
    a, b = summary(c_r[s]), summary(c_q[s])
    for m in a:
        diffs[m].append(a[m] - b[m])
res["bootstrap reranker-qwen"] = {m: {"point": float(np.mean(v)), "ci95": [float(np.percentile(v, 2.5)),
                                                                          float(np.percentile(v, 97.5))]}
                                  for m, v in diffs.items()}
res["bootstrap reranker-qwen"]["nDCG@5"]["point"] = float(rk_r[:, 0].mean() - rk_q[:, 0].mean())
for m in summary(c_q):
    res["bootstrap reranker-qwen"][m]["point"] = float(summary(c_r)[m] - summary(c_q)[m])
res["reranked tops"] = {keys[i]: [slugs[j] for j in order(rr, i)[:K]] for i in rows}
(D / os.environ.get("RR_RESULTS", "rerank-results.json")).write_text(json.dumps(res, indent=1, default=float))
print(json.dumps({k: v for k, v in res.items() if k != "reranked tops"}, indent=1, default=float))
