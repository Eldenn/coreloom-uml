"""Points 1-2: the system as it will ship, on the configs of configs.py (same draws, both rates).
a. matchSkills today: +1 per written affinity naming a held rule, -1 = conflict (left out of the
   compatible list), compatible at score >= 1 or a shared tag, sorted by score, tags, catalog order.
b. a + computed affinities: a held rule also counts +1 for a skill when their cosine >= TH
   (once per rule, written or computed), never a conflict.
c. b without the tag-only fill: compatible only at score >= 1 (tags still break ties).
Plus 'Qwen max' (configs.py, no matchSkills) for reference. Bootstrap over rules for the CIs.
Usage: python -I shipped.py <study dir>"""
import json, sys, random
from pathlib import Path
import numpy as np

__file__ = __file__.replace("shipped.py", "configs.py")
exec(open(__file__).read().split("\nfor variant, real in")[0])

slot_topics = json.loads((D / "slot-topics.json").read_text())
qw = np.load(D / "scores.npz")["qwen_onnx_fp32"]  # identical to PyTorch (section 9.14)
written = np.zeros((len(keys), len(skills)), int)  # +1 fits, -1 against
for j, s in enumerate(skills):
    for a in s["affinities"] or []:
        if "slot" not in a:
            continue
        for i, k in enumerate(keys):
            sl, r = k.split("/", 1)
            if a["slot"] != sl:
                continue
            if r in (a.get("against") or []):
                written[i, j] = -1
            elif r in a.get("values", []) and written[i, j] == 0:
                written[i, j] = 1
stopics = [set(s["topics"] or []) for s in skills]


def match(cfg, mode):
    if mode == "qwen":
        return shown(cfg, TH, "max")
    w = written[cfg]
    conflict = (w == -1).any(0)
    fits = (w == 1)
    if mode in ("b", "c"):
        fits = fits | (qw[cfg] >= TH)
    score = fits.sum(0)
    held = set(t for i in cfg for t in slot_topics.get(slot[i], []))
    tags = np.array([len(st & held) for st in stopics])
    ok = ~conflict & ((score >= 1) | ((tags > 0) if mode in ("a", "b") else False))
    cand = [j for j in range(len(skills)) if ok[j]]
    cand.sort(key=lambda j: (-score[j], -tags[j], j))  # stable catalog order last
    return cand[:K]


def measure2(cfgs, mode):
    tp = n = 0; hit = []; false = []
    for cfg in cfgs:
        want = set().union(*(rel[i] for i in cfg))
        s = match(cfg, mode)
        good = sum(j in want for j in s)
        tp += good; n += len(s)
        (hit if want else false).append(good > 0 if want else len(s) > 0)
    return {"precision": tp / n if n else float("nan"),
            "expected: >=1 good": float(np.mean(hit)) if hit else float("nan"),
            "nothing expected: >=1 shown": float(np.mean(false)) if false else float("nan"),
            "n with / without": f"{len(hit)}/{len(false)}"}


MODES = {"a": "matchSkills today", "b": "+ computed affinities", "c": "+ computed, no tag fill", "qwen": "Qwen max alone"}
for variant, real in (("labeled set as is", False), (f"real rate ({POS_RATE:.0%})", True)):
    cfgs = draw(random.Random(20261128), pool, real)
    print(f"\n##### {variant}")
    res = {m: measure2(cfgs, m) for m in MODES}
    for m, r in res.items():
        print(f"{MODES[m]:26s} " + "  ".join(f"{k} {v:.3f}" if isinstance(v, float) else f"{k} {v}" for k, v in r.items()))
    rng = np.random.default_rng(1)
    boots = {m: [] for m in MODES}
    for b in range(200):
        ids = list(rng.choice(pool, len(pool)))
        cb = draw(random.Random(b), ids, real)
        for m in MODES:
            boots[m].append(measure2(cb, m))
    for m in MODES:
        print(f"  CI {MODES[m]:24s} " + "  ".join(
            f"{k} [{np.nanpercentile([x[k] for x in boots[m]], 2.5):.3f}, {np.nanpercentile([x[k] for x in boots[m]], 97.5):.3f}]"
            for k in ("precision", "expected: >=1 good", "nothing expected: >=1 shown")))
    for m in ("b", "c", "qwen"):
        diffs = {k: [x[k] - y[k] for x, y in zip(boots[m], boots["a"])] for k in ("precision", "expected: >=1 good", "nothing expected: >=1 shown")}
        print(f"  {MODES[m]} - today: " + "  ".join(
            f"{k} {res[m][k] - res['a'][k]:+.3f} [{np.nanpercentile(v, 2.5):+.3f}, {np.nanpercentile(v, 97.5):+.3f}]" for k, v in diffs.items()))
