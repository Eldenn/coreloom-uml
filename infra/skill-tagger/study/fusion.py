"""Score-level fusion of Qwen and SparseUp: each rule's scores normalized, then
alpha * qwen + (1 - alpha) * sparseup. Two normalizations:
- z: per rule, (score - mean) / std over every skill (keeps 'how far above the crowd');
- global: one scale for the whole matrix (keeps the absolute level, so a rule nothing
  matches stays low, which is what a threshold needs).
Reuses bench.py's metrics on scores.npz. Usage: python -I fusion.py <study dir>"""
import sys, random, math
import numpy as np

sys.argv = [sys.argv[0], sys.argv[1]]
src = open(__file__.replace("fusion.py", "bench.py")).read()
head = src.split("TIMES, EXPLAIN = {}, {}")[0]  # data, metrics, no model run
exec(head)

S = np.load(D / "scores.npz")
qw, sp = S["qwen"], S["sparseup"]


def z_rows(m):
    return (m - m.mean(1, keepdims=True)) / m.std(1, keepdims=True)


def z_global(m):
    return (m - m.mean()) / m.std()


def per_rule_ndcg(mat):
    out = []
    for i, k in enumerate(keys):
        rel = set(truth[k])
        if not rel:
            continue
        top = ranked(mat[i])
        d = sum((s in rel) / math.log2(n + 2) for n, s in enumerate(top))
        ideal = sum(1 / math.log2(n + 2) for n in range(min(len(rel), K)))
        out.append(d / ideal)
    return np.array(out)


def ci(a, b, n=5000):
    d = per_rule_ndcg(a) - per_rule_ndcg(b)
    rnd = np.random.default_rng(1)
    boots = np.sort([rnd.choice(d, len(d)).mean() for _ in range(n)])
    return f"{d.mean():+.3f} [{boots[int(.025 * n)]:+.3f}, {boots[int(.975 * n)]:+.3f}]"


rows = {"Qwen alone": qw, "SparseUp alone": sp}
for norm_name, norm in [("z per rule", z_rows), ("global", z_global)]:
    for alpha in (0.3, 0.5, 0.7):
        rows[f"{norm_name} a={alpha}"] = alpha * norm(qw) + (1 - alpha) * norm(sp)

for name, mat in rows.items():
    r = metrics(mat) | thresholded(mat)
    print(f"{name:20s} " + "  ".join(f"{k} {v:.3f}" for k, v in r.items()) + f"  vs Qwen nDCG {ci(mat, qw)}")

# Nested: each fold's rows come from the fusion (normalization, alpha) chosen on the other folds.
configs = {name: mat for name, mat in rows.items() if name not in ("Qwen alone", "SparseUp alone")}
idx = list(range(len(keys)))
random.Random(7).shuffle(idx)
nested = np.zeros_like(qw)
picked = []
for f in range(5):
    test = set(idx[f::5])
    train = [i for i in range(len(keys)) if i not in test and truth[keys[i]]]

    def train_ndcg(mat):
        sub = mat[train]
        tot = 0
        for row, i in zip(sub, train):
            rel = set(truth[keys[i]])
            top = ranked(row)
            tot += sum((s in rel) / math.log2(n + 2) for n, s in enumerate(top)) / sum(
                1 / math.log2(n + 2) for n in range(min(len(rel), K)))
        return tot / len(train)

    best = max(configs, key=lambda c: train_ndcg(configs[c]))
    picked.append(best)
    for i in test:
        nested[i] = configs[best][i]
r = metrics(nested) | thresholded(nested)
print(f"{'nested fusion':20s} " + "  ".join(f"{k} {v:.3f}" for k, v in r.items()) + f"  vs Qwen nDCG {ci(nested, qw)}")
print("configs picked per fold:", picked)
