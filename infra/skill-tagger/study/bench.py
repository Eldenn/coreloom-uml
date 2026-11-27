"""Throwaway study: rank suggestable skills against ready-made rules, per method, and score
against a hand-made reference (truth.json: {"slot/rule": [slug, ...]}, [] = nothing should come).

Usage: python -I bench.py <study dir>
"""
import json, math, sys, time, random
from pathlib import Path

import numpy as np
import torch

D = Path(sys.argv[1])
rules = {f"{r['slot']}/{r['rule']}": r for r in json.loads((D / "rules.json").read_text())}
skills = json.loads((D / "skills.json").read_text())
slot_topics = json.loads((D / "slot-topics.json").read_text())
truth = json.loads((D / "truth.json").read_text())
keys = list(truth)
slugs = [s["slug"] for s in skills]
K = 5
torch.set_num_threads(8)


def rule_text(r):
    head = r["group"] + (f" {r['label']}" if r["label"] else "")
    return head + "\n" + " ".join(r["lines"])


def skill_text(s):
    return f"{s['name']}: {s['description'] or ''}"[:2000]


Q = [rule_text(rules[k]) for k in keys]
DOCS = [skill_text(s) for s in skills]


# --- methods: each returns a [len(keys), len(skills)] score matrix -----------------------

def current():
    """matchSkills for one held rule: +1 per affinity naming it, ties by shared tags, catalog order."""
    m = np.full((len(keys), len(skills)), -1e9)
    for i, k in enumerate(keys):
        slot, rule = k.split("/", 1)
        topics = set(slot_topics.get(slot, []))
        for j, s in enumerate(skills):
            score = 0
            conflict = False
            for a in s["affinities"] or []:
                if a.get("slot") != slot:
                    continue
                if rule in (a.get("against") or []):
                    conflict = True
                elif rule in a.get("values", []):
                    score += 1
            tags = len(topics & set(s["topics"] or []))
            if conflict or (score < 1 and tags == 0):
                continue
            m[i, j] = score * 100 + tags - j * 1e-6  # stable: catalog order breaks ties
    return m


def bm25():
    from rank_bm25 import BM25Okapi
    import re
    tok = lambda t: re.findall(r"[a-z0-9]+", t.lower())
    bm = BM25Okapi([tok(d) for d in DOCS])
    return np.array([bm.get_scores(tok(q)) for q in Q])


QWEN_TASK = "Given a coding convention rule, retrieve the agent skills that help a coding agent follow it"


def qwen():
    from sentence_transformers import SentenceTransformer
    m = SentenceTransformer(
        "Qwen/Qwen3-Embedding-0.6B", revision="97b0c614be4d77ee51c0cef4e5f07c00f9eb65b3", device="cpu"
    )
    t = time.time()
    d = m.encode(DOCS, batch_size=16, normalize_embeddings=True)
    TIMES["qwen"] = (time.time() - t) / len(DOCS)
    q = m.encode([f"Instruct: {QWEN_TASK}\nQuery: {x}" for x in Q], batch_size=16, normalize_embeddings=True)
    return q @ d.T


def sparseup():
    from transformers import AutoModel
    m = AutoModel.from_pretrained(
        "Linkup-Platform/linkup-sparseup-embed-v2",
        revision="7165075edb8c7e5e6d1125aa8a6a753d3c50c5d8",
        trust_remote_code=True,
        dtype=torch.float32,
    ).eval()
    t = time.time()
    d = m.encode(DOCS, kind="document", batch_size=16)
    TIMES["sparseup"] = (time.time() - t) / len(DOCS)
    q = m.encode(Q, kind="query", batch_size=16)
    EXPLAIN["sparseup"] = (m, q, d)
    return (q @ d.T).numpy()


def rrf(*mats, k=60):
    out = np.zeros_like(mats[0])
    for mat in mats:
        ranks = (-mat).argsort(axis=1).argsort(axis=1)
        out += 1.0 / (k + ranks + 1)
    return out


# --- metrics ----------------------------------------------------------------------------

def ranked(row):
    return [slugs[j] for j in np.argsort(-row)[:K] if row[j] > -1e8]


def metrics(mat):
    pos = [i for i, k in enumerate(keys) if truth[k]]
    p5 = r5 = mrr = ndcg = 0.0
    for i in pos:
        rel = set(truth[keys[i]])
        top = ranked(mat[i])
        hits = [s in rel for s in top]
        p5 += sum(hits) / K
        r5 += sum(hits) / min(len(rel), K)
        full = [slugs[j] for j in np.argsort(-mat[i]) if mat[i, j] > -1e8]
        first = next((n for n, s in enumerate(full) if s in rel), None)
        mrr += 1 / (first + 1) if first is not None else 0
        dcg = sum(h / math.log2(n + 2) for n, h in enumerate(hits))
        ideal = sum(1 / math.log2(n + 2) for n in range(min(len(rel), K)))
        ndcg += dcg / ideal
    n = len(pos)
    return {"P@5": p5 / n, "R@5": r5 / n, "MRR": mrr / n, "nDCG@5": ndcg / n}


def thresholded(mat, folds=5, seed=0):
    """Suggest the top-5 above a threshold learnt on the other folds; F1 over every rule,
    and the share of 'nothing should come' rules that still get a suggestion."""
    idx = list(range(len(keys)))
    random.Random(seed).shuffle(idx)
    tp = fp = fn = 0
    neg_hit = neg = 0

    def outcome(i, th):
        row = mat[i]
        top = [slugs[j] for j in np.argsort(-row)[:K] if row[j] > -1e8 and row[j] >= th]
        rel = set(truth[keys[i]])
        t = sum(s in rel for s in top)
        return t, len(top) - t, min(len(rel), K) - t, len(top)

    for f in range(folds):
        test = idx[f::folds]
        train = [i for i in idx if i not in test]
        cand = np.unique(np.concatenate([np.sort(mat[i])[-K:] for i in train]))
        cand = cand[cand > -1e8]
        best, best_f1 = None, -1
        for th in np.quantile(cand, np.linspace(0, 1, 101)):
            a = b = c = 0
            for i in train:
                t, p, n, _ = outcome(i, th)
                a, b, c = a + t, b + p, c + n
            f1 = 2 * a / (2 * a + b + c) if a else 0
            if f1 > best_f1:
                best, best_f1 = th, f1
        for i in test:
            t, p, n, shown = outcome(i, best)
            tp, fp, fn = tp + t, fp + p, fn + n
            if not truth[keys[i]]:
                neg += 1
                neg_hit += shown > 0
    return {"F1@th": 2 * tp / (2 * tp + fp + fn) if tp else 0, "precision@th": tp / (tp + fp) if tp + fp else 0,
            "empty rules suggested": neg_hit / neg if neg else float("nan")}


def anthropic_recall(mat):
    """Of the reference pairs naming an anthropics/skills skill, how many reach the top 5."""
    ids = {s["slug"] for s in skills if (s["registry_id"] or "").lower().startswith("anthropics/skills/")}
    want = found = 0
    for i, k in enumerate(keys):
        top = set(ranked(mat[i]))
        for s in truth[k]:
            if s in ids:
                want += 1
                found += s in top
    return found / want if want else float("nan")


TIMES, EXPLAIN = {}, {}
methods = {"current matchSkills": current(), "BM25": bm25()}
methods["Qwen3-Embedding-0.6B"] = qwen()
methods["SparseUp-v2"] = sparseup()
methods["RRF Qwen + SparseUp"] = rrf(methods["Qwen3-Embedding-0.6B"], methods["SparseUp-v2"])
methods["RRF Qwen + BM25"] = rrf(methods["Qwen3-Embedding-0.6B"], methods["BM25"])

results = {}
for name, mat in methods.items():
    r = metrics(mat) | thresholded(mat) | {"anthropics/skills R@5": anthropic_recall(mat)}
    results[name] = r
    print(f"{name:24s} " + "  ".join(f"{k} {v:.3f}" for k, v in r.items()))
print("seconds per skill text:", {k: round(v, 4) for k, v in TIMES.items()})

np.savez(D / "scores.npz", qwen=methods["Qwen3-Embedding-0.6B"], sparseup=methods["SparseUp-v2"])
tops = {name: {k: ranked(mat[i]) for i, k in enumerate(keys)} for name, mat in methods.items()}
(D / "results.json").write_text(json.dumps({"metrics": results, "times": TIMES, "tops": tops}, indent=1))
