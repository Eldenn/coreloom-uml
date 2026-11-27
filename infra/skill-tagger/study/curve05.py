"""Point 4: Qwen alone. Threshold = lowest cosine at which at most TARGET of the 'nothing' rules
get a suggestion, chosen on 4 folds of those rules and checked on the 5th (20 x 5). Prints the full
curve (false-suggestion rate on 'nothing' rules vs share of positive rules served).
Usage: python -I curve.py <study dir>"""
import json, sys, random
from pathlib import Path
import numpy as np

D = Path(sys.argv[1])
truth = json.loads((D / "truth.json").read_text())
kinds = json.loads((D / "empty-kinds.json").read_text())
slugs = [s["slug"] for s in json.loads((D / "skills.json").read_text())]
keys = list(truth)
qw = np.load(D / "scores.npz")["qwen"]
K, TARGET = 5, 0.05

nothing = [i for i, k in enumerate(keys) if k in set(kinds["nothing"])]
pos = [i for i, k in enumerate(keys) if truth[k]]
top1 = qw.max(1)


def at(t):
    """false rate on nothing rules, positives served (>=1 shown), served right (>=1 right), precision"""
    fr = np.mean([top1[i] >= t for i in nothing])
    shown = right = tp = 0
    nshown = 0
    for i in pos:
        top = [j for j in np.argsort(-qw[i])[:K] if qw[i, j] >= t]
        hits = sum(slugs[j] in truth[keys[i]] for j in top)
        shown += bool(top); right += hits > 0; tp += hits; nshown += len(top)
    return fr, shown / len(pos), right / len(pos), tp / nshown if nshown else float("nan")


def pick(rows):
    """lowest threshold among the rows' top-1 scores with false rate <= TARGET on those rows"""
    s = np.sort(top1[rows])
    allowed = int(np.floor(TARGET * len(rows)))  # rules allowed above the threshold
    return s[len(s) - allowed - 1] + 1e-9 if allowed < len(s) else s[0]


ths, test_fr = [], []
for seed in range(20):
    idx = nothing[:]; random.Random(seed).shuffle(idx)
    for f in range(5):
        test = idx[f::5]; train = [i for i in idx if i not in test]
        t = pick(train); ths.append(t)
        test_fr += [top1[i] >= t for i in test]
ths = np.array(ths)
t_med = float(np.median(ths))
print(f"nothing rules {len(nothing)}, positives {len(pos)}")
print(f"chosen threshold: median {t_med:.4f}  min {ths.min():.4f}  max {ths.max():.4f}  sd {ths.std():.4f}")
print(f"held-out false rate over 100 folds: {np.mean(test_fr):.3f}")
fr, sv, rt, pr = at(t_med)
print(f"at the median threshold: false {fr:.3f}  positives served {sv:.3f}  served right {rt:.3f}  precision {pr:.3f}")
print("\ncurve: threshold  false-rate(nothing)  positives-served  served-right  precision")
for t in np.unique(np.round(np.concatenate([top1[nothing], np.linspace(0.55, 0.75, 21)]), 4)):
    fr, sv, rt, pr = at(t)
    print(f"{t:.4f}  {fr:.3f}  {sv:.3f}  {rt:.3f}  {pr:.3f}")
