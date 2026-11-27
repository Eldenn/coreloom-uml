"""Point 4 (declared in section 9.15 before running): per-skill centering of the cosines.
Usage: python -I centering.py <study dir>"""
import json, sys
from pathlib import Path
import numpy as np

D = Path(sys.argv[1])
truth = json.loads((D / "truth.json").read_text())
kinds = json.loads((D / "empty-kinds.json").read_text())
inp = json.loads((D / "js/embed-input.json").read_text())
keys = list(truth)
ALL = np.load(D / "qwen-onnx-fp32-all.npy")  # 881 x 215
idx = [inp["rule_keys"].index(k) for k in keys]
raw = ALL[idx]
cen = raw - ALL.mean(0, keepdims=True)

pos = np.array([i for i, k in enumerate(keys) if truth[k]])
nth = np.array([i for i, k in enumerate(keys) if k in set(kinds["nothing"])])


def auc(a, b):
    return float((a[:, None] > b[None, :]).mean() + 0.5 * (a[:, None] == b[None, :]).mean())


def served(m, p, n):
    top_n = np.sort(m[n].max(1))
    allowed = int(np.floor(0.10 * len(n)))
    t = top_n[len(top_n) - allowed - 1] + 1e-9
    return float((m[p].max(1) >= t).mean()), t


def crit(m, p, n):
    return auc(m[p].max(1), m[n].max(1)), served(m, p, n)[0]


base = {"raw": crit(raw, pos, nth), "centered": crit(cen, pos, nth)}
print("raw      AUC %.3f  served@10%% %.3f  threshold %.4f" % (*base["raw"], served(raw, pos, nth)[1]))
print("centered AUC %.3f  served@10%% %.3f  threshold %.4f" % (*base["centered"], served(cen, pos, nth)[1]))
rng = np.random.default_rng(1)
d = []
for _ in range(5000):
    p = rng.choice(pos, len(pos)); n = rng.choice(nth, len(nth))
    a, b = crit(raw, p, n), crit(cen, p, n)
    d.append((b[0] - a[0], b[1] - a[1]))
d = np.array(d)
for j, name in enumerate(("AUC", "served@10%")):
    lo, hi = np.percentile(d[:, j], [2.5, 97.5])
    print(f"centered - raw {name}: {base['centered'][j] - base['raw'][j]:+.3f} [{lo:+.3f}, {hi:+.3f}]")
gen = np.argsort(-ALL.mean(0))[:8]
print("most generic skills (highest mean cosine):", [(inp["slugs"][j], round(float(ALL.mean(0)[j]), 3)) for j in gen])
