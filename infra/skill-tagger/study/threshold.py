"""Points 1-5 of the review: thresholded metrics under repeated CV (20 x 5 folds), their paired
bootstrap CIs, threshold spread, cross-rule calibration, the CI discrepancy of the SparseUp
fusion, and the empty rules split by kind. Usage: python -I threshold.py <study dir>"""
import json, sys, random, math
import numpy as np

src = open(__file__.replace("threshold.py", "bench.py")).read()
exec(src.split("TIMES, EXPLAIN = {}, {}")[0])  # data, current(), bm25(), metrics; runs no model

S = np.load(D / "scores.npz")
qw, sp, bm = S["qwen"], S["sparseup"], bm25()
cur = current()
zg = lambda m: (m - m.mean()) / m.std()
zr = lambda m: (m - m.mean(1, keepdims=True)) / m.std(1, keepdims=True)
kinds = json.loads((D / "empty-kinds.json").read_text())
refusal, nothing = set(kinds["refusal"]), set(kinds["nothing"])
pos = [i for i, k in enumerate(keys) if truth[k]]
N = len(keys)

# Fixed configurations for every thresholded measure (alpha = 0.7, global z): a nested matrix
# mixes the scales of the configurations picked per fold, which a single threshold cannot read.
M = {
    "BM25": bm,
    "SparseUp-v2": sp,
    "Qwen": qw,
    "Qwen+BM25 a=0.7": 0.7 * zg(qw) + 0.3 * zg(bm),
    "Qwen+SparseUp a=0.7": 0.7 * zg(qw) + 0.3 * zg(sp),
}


def counts(row, rel, th):
    top = [slugs[j] for j in np.argsort(-row)[:K] if row[j] > -1e8 and row[j] >= th]
    t = sum(s in rel for s in top)
    return t, len(top) - t, min(len(rel), K) - t, len(top)


def fb(tp, fp, fn, beta):
    return (1 + beta**2) * tp / ((1 + beta**2) * tp + beta**2 * fn + fp) if tp else 0.0


def repeated(mat, beta, reps=20):
    """Per-rule expected (tp, fp, fn, shown) over reps x 5-fold CV, and the thresholds chosen."""
    acc = np.zeros((N, 4))
    ths = []
    rels = [set(truth[k]) for k in keys]
    tops = [np.sort(mat[i])[-K:] for i in range(N)]
    for seed in range(reps):
        idx = list(range(N))
        random.Random(seed).shuffle(idx)
        for f in range(5):
            test = idx[f::5]
            tset = set(test)
            train = [i for i in idx if i not in tset]
            cand = np.unique(np.concatenate([tops[i] for i in train]))
            cand = cand[cand > -1e8]
            best, best_s = None, -1.0
            for th in np.quantile(cand, np.linspace(0, 1, 201)):
                c = np.array([counts(mat[i], rels[i], th)[:3] for i in train]).sum(0)
                s = fb(*c, beta)
                if s > best_s:
                    best, best_s = th, s
            ths.append(best)
            for i in test:
                acc[i] += counts(mat[i], rels[i], best)
    return acc / reps, np.array(ths)


def summary(c, beta, rows=None):
    rows = range(N) if rows is None else rows
    rows = list(rows)
    tp, fp, fn = c[rows, 0].sum(), c[rows, 1].sum(), c[rows, 2].sum()
    p_rows = [i for i in rows if truth[keys[i]]]
    e_ref = [i for i in rows if keys[i] in refusal]
    e_not = [i for i in rows if keys[i] in nothing]
    # shown is an expectation over reps: a rule "gets a suggestion" with probability ~ min(shown, 1)
    hit = lambda rs: float(np.mean([min(c[i, 3], 1.0) for i in rs])) if rs else float("nan")
    return {
        "precision": tp / (tp + fp) if tp + fp else 0.0,
        "recall": tp / (tp + fn) if tp + fn else 0.0,
        f"F{beta:g}": fb(tp, fp, fn, beta),
        "positives with none": float(np.mean([c[i, 3] < 0.5 for i in p_rows])),
        "refusal suggested": hit(e_ref),
        "nothing suggested": hit(e_not),
    }


def boot_diff(ca, cb, beta, n=5000):
    rng = np.random.default_rng(1)
    names = list(summary(ca, beta))
    base = {k: summary(ca, beta)[k] - summary(cb, beta)[k] for k in names}
    draws = {k: [] for k in names}
    for _ in range(n):
        s = rng.integers(0, N, N)
        a, b = summary(ca, beta, s), summary(cb, beta, s)
        for k in names:
            draws[k].append(a[k] - b[k])
    return {k: (base[k], *np.nanpercentile(draws[k], [2.5, 97.5])) for k in names}


out = {}
for beta in (1.0, 0.5):
    print(f"\n=== threshold tuned for F{beta:g}, 20 x 5-fold CV (mean over repetitions) ===")
    res = {}
    for name, mat in M.items():
        c, ths = repeated(mat, beta)
        res[name] = c
        s = summary(c, beta)
        print(f"{name:22s} " + "  ".join(f"{k} {v:.3f}" for k, v in s.items())
              + f"  | threshold mean {ths.mean():.3f} sd {ths.std():.3f} min {ths.min():.3f} max {ths.max():.3f}")
        out[f"F{beta:g} {name}"] = s
    for other in ("Qwen+BM25 a=0.7", "Qwen+SparseUp a=0.7"):
        d = boot_diff(res[other], res["Qwen"], beta)
        print(f"  {other} - Qwen: " + "  ".join(f"{k} {v[0]:+.3f} [{v[1]:+.3f}, {v[2]:+.3f}]" for k, v in d.items()))
print("\nmatchSkills (no threshold): refusal suggested",
      np.mean([(cur[i] > -1e8).any() for i, k in enumerate(keys) if k in refusal]).round(3),
      " nothing suggested", np.mean([(cur[i] > -1e8).any() for i, k in enumerate(keys) if k in nothing]).round(3))


# 3. Why a fusion that ranks better can threshold worse: a global threshold needs scores that
# mean the same across rules. AUC of the best score: rules with a right top-1 vs empty rules.
def auc(a, b):
    a, b = np.asarray(a), np.asarray(b)
    return float(((a[:, None] > b[None, :]).mean() + 0.5 * (a[:, None] == b[None, :]).mean()))

print("\n=== cross-rule calibration ===")
for name, mat in M.items():
    good_top = [mat[i].max() for i in pos if slugs[int(np.argmax(mat[i]))] in truth[keys[i]]]
    empty_top = [mat[i].max() for i, k in enumerate(keys) if not truth[k]]
    pairs_rel, pairs_irr = [], []
    for i in pos:
        for j in np.argsort(-mat[i])[:K]:
            (pairs_rel if slugs[j] in truth[keys[i]] else pairs_irr).append(mat[i, j])
    print(f"{name:22s} AUC top-1 right vs empty-rule top-1 {auc(good_top, empty_top):.3f}   "
          f"AUC relevant vs irrelevant pairs in top 5 {auc(pairs_rel, pairs_irr):.3f}")


# 4. The two CIs of the SparseUp fusion: same bootstrap, two candidate grids for the nested pick.
def ndcg_rule(mat, i):
    rel = set(truth[keys[i]]); top = ranked(mat[i])
    return sum((s in rel) / math.log2(n + 2) for n, s in enumerate(top)) / sum(1 / math.log2(n + 2) for n in range(min(len(rel), K)))

def nested(grid):
    idx = list(range(N)); random.Random(7).shuffle(idx)
    res = np.zeros_like(qw); picks = []
    for f in range(5):
        test = set(idx[f::5]); train = [i for i in range(N) if i not in test and truth[keys[i]]]
        best = max(grid, key=lambda g: np.mean([ndcg_rule(grid[g], i) for i in train]))
        picks.append(best)
        for i in test:
            res[i] = grid[best][i]
    return res, picks

def ci(mat):
    d = np.array([ndcg_rule(mat, i) - ndcg_rule(qw, i) for i in pos])
    b = np.sort([np.random.default_rng(1).choice(d, len(d)).mean() for _ in range(1)])  # placeholder
    rng = np.random.default_rng(1)
    b = np.sort([rng.choice(d, len(d)).mean() for _ in range(5000)])
    return f"{d.mean():+.4f} [{np.percentile(b, 2.5):+.4f}, {np.percentile(b, 97.5):+.4f}]"

grid_doc = {f"{n} a={a}": a * f(qw) + (1 - a) * f(sp) for n, f in (("row", zr), ("global", zg)) for a in (0.3, 0.5, 0.7)}
grid_lex = {f"global a={a}": a * zg(qw) + (1 - a) * zg(sp) for a in (0.5, 0.7, 0.85)}
print("\n=== Qwen + SparseUp, nDCG@5 minus Qwen, one bootstrap (5000, default_rng(1), percentiles) ===")
print("fixed global a=0.7      ", ci(M["Qwen+SparseUp a=0.7"]))
for name, grid in (("nested, document grid", grid_doc), ("nested, lexical.py grid", grid_lex)):
    mat, picks = nested(grid)
    print(f"{name:24s}", ci(mat), picks)

(D / "threshold-results.json").write_text(json.dumps(out, indent=1))
