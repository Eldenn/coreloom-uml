"""Cheap lexical signals against SparseUp: BM25 fused by scores, and a bonus when the skill's
name appears in the rule. Each candidate's config is picked on 4 folds, scored on the 5th
(nested), and the threshold is tuned for F0.5 as well as F1. Usage: python -I lexical.py <dir>"""
import sys, random, math, re
import numpy as np

src = open(__file__.replace("lexical.py", "bench.py")).read()
exec(src.split("TIMES, EXPLAIN = {}, {}")[0])  # data, methods, metrics; runs no model

S = np.load(D / "scores.npz")
qw, sp = S["qwen"], S["sparseup"]
bm = bm25()
z = lambda m: (m - m.mean()) / m.std()

# 1 when the skill's name (or its slug's distinctive words) appears as a word in the rule.
STOP = {"best", "practices", "patterns", "pro", "expert", "skill", "design", "code", "testing", "guide", "github", "anthropics", "development", "management"}
def name_terms(s):
    words = set(re.findall(r"[a-z0-9]+", f"{s['slug']} {s['name']}".lower())) - STOP
    return {w for w in words if len(w) >= 3 and not w.isdigit()}
rule_words = [set(re.findall(r"[a-z0-9]+", q.lower())) for q in Q]
bonus = np.array([[1.0 if name_terms(s) & rw else 0.0 for s in skills] for rw in rule_words])

cands = {}
for a in (0.5, 0.7, 0.85):
    cands[f"Qwen+SparseUp a={a}"] = a * z(qw) + (1 - a) * z(sp)
    cands[f"Qwen+BM25 a={a}"] = a * z(qw) + (1 - a) * z(bm)
for b in (0.5, 1.0, 2.0):
    cands[f"Qwen+bonus b={b}"] = z(qw) + b * bonus
    cands[f"Qwen+SparseUp 0.7+bonus b={b}"] = 0.7 * z(qw) + 0.3 * z(sp) + b * bonus
    cands[f"Qwen+BM25 0.7+bonus b={b}"] = 0.7 * z(qw) + 0.3 * z(bm) + b * bonus


def ndcg_rows(mat, rows):
    tot = 0
    for i in rows:
        rel = set(truth[keys[i]])
        top = ranked(mat[i])
        tot += sum((s in rel) / math.log2(n + 2) for n, s in enumerate(top)) / sum(
            1 / math.log2(n + 2) for n in range(min(len(rel), K)))
    return tot / len(rows)


def nested(prefix):
    pool = {k: v for k, v in cands.items() if k.startswith(prefix)}
    idx = list(range(len(keys)))
    random.Random(7).shuffle(idx)
    out = np.zeros_like(qw)
    for f in range(5):
        test = set(idx[f::5])
        train = [i for i in range(len(keys)) if i not in test and truth[keys[i]]]
        best = max(pool, key=lambda c: ndcg_rows(pool[c], train))
        for i in test:
            out[i] = pool[best][i]
    return out


def f_beta_at_th(mat, beta, folds=5):
    """thresholded() with F-beta as the tuning target; returns F-beta, precision, empty-rule rate."""
    idx = list(range(len(keys)))
    random.Random(0).shuffle(idx)
    tp = fp = fn = neg = neg_hit = 0
    fb = lambda a, b, c: (1 + beta**2) * a / ((1 + beta**2) * a + beta**2 * c + b) if a else 0
    def outcome(i, th):
        row = mat[i]
        top = [slugs[j] for j in np.argsort(-row)[:K] if row[j] >= th]
        rel = set(truth[keys[i]])
        t = sum(s in rel for s in top)
        return t, len(top) - t, min(len(rel), K) - t, len(top)
    for f in range(folds):
        test = idx[f::folds]
        train = [i for i in idx if i not in test]
        cand = np.unique(np.concatenate([np.sort(mat[i])[-K:] for i in train]))
        best, best_s = None, -1
        for th in np.quantile(cand, np.linspace(0, 1, 101)):
            a = b = c = 0
            for i in train:
                t, p, n, _ = outcome(i, th)
                a, b, c = a + t, b + p, c + n
            if fb(a, b, c) > best_s:
                best, best_s = th, fb(a, b, c)
        for i in test:
            t, p, n, shown = outcome(i, best)
            tp, fp, fn = tp + t, fp + p, fn + n
            if not truth[keys[i]]:
                neg += 1
                neg_hit += shown > 0
    return fb(tp, fp, fn), tp / (tp + fp) if tp + fp else 0, neg_hit / neg


pos = [i for i, k in enumerate(keys) if truth[k]]
def per_rule(mat):
    return np.array([ndcg_rows(mat, [i]) for i in pos])
def ci(mat, ref):
    d = per_rule(mat) - per_rule(ref)
    rng = np.random.default_rng(1)
    b = np.sort([rng.choice(d, len(d)).mean() for _ in range(5000)])
    return f"{d.mean():+.3f} [{b[125]:+.3f}, {b[4874]:+.3f}]"

methods = {
    "Qwen alone": qw,
    "nested Qwen+SparseUp": nested("Qwen+SparseUp a="),
    "nested Qwen+BM25": nested("Qwen+BM25 a="),
    "nested Qwen+bonus": nested("Qwen+bonus"),
    "nested Qwen+SparseUp+bonus": nested("Qwen+SparseUp 0.7+bonus"),
    "nested Qwen+BM25+bonus": nested("Qwen+BM25 0.7+bonus"),
}
print("rules where a skill name appears:", int((bonus.sum(1) > 0).sum()), "of", len(keys))
for name, mat in methods.items():
    m = metrics(mat)
    f1 = f_beta_at_th(mat, 1.0)
    f05 = f_beta_at_th(mat, 0.5)
    print(f"{name:28s} nDCG@5 {m['nDCG@5']:.3f}  R@5 {m['R@5']:.3f}  vs Qwen {ci(mat, qw)}  "
          f"F1 {f1[0]:.3f} (prec {f1[1]:.2f}, empty {f1[2]:.0%})  F0.5 {f05[0]:.3f} (prec {f05[1]:.2f}, empty {f05[2]:.0%})")
print("vs nested Qwen+SparseUp:", {n: ci(m, methods['nested Qwen+SparseUp']) for n, m in methods.items() if 'BM25' in n or 'bonus' in n})
