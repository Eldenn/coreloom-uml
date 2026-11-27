"""Point 6: Qwen alone, measured per configuration (at most 5 suggestions for the whole config).
Configs: 1-3 packs (weighted by labeled slots), each labeled slot of those packs kept with p=0.5,
one labeled rule per slot (refusals excluded). Variant 'real rate': each kept slot holds a positive
rule with probability POS_RATE, else a 'nothing' rule from the same packs. Scores of a config: per
skill, max (or sum) of its above-threshold cosines over the config's rules; near-duplicates
(cosine >= 0.95 between skills) dropped after the better one. Bootstrap over rules.
Usage: python -I configs.py <study dir>"""
import json, sys, random
from pathlib import Path
import numpy as np

D = Path(sys.argv[1])
rules = {f"{r['slot']}/{r['rule']}": r for r in json.loads((D / "rules.json").read_text())}
truth = json.loads((D / "truth.json").read_text())
kinds = json.loads((D / "empty-kinds.json").read_text())
skills = json.loads((D / "skills.json").read_text())
slugs = [s["slug"] for s in skills]
keys = list(truth)
qw = np.load(D / "scores.npz")["qwen"]
emb = np.load(D / "skill-emb.npy")
dup = (emb @ emb.T) >= 0.95
np.fill_diagonal(dup, False)
K, N, POS_RATE, TH = 5, 1000, 0.20, 0.656
rel = [{slugs.index(s) for s in truth[k]} for k in keys]

pool = [i for i, k in enumerate(keys) if k not in set(kinds["refusal"])]
pack = {i: rules[keys[i]]["pack"] for i in pool}
slot = {i: rules[keys[i]]["slot"] for i in pool}
nothing = set(i for i in pool if not truth[keys[i]])


def draw(rng, ids, real_rate):
    """configs as lists of rule indices, drawn from the rule pool `ids` (a multiset under bootstrap)"""
    by_pack = {}
    for i in ids:
        by_pack.setdefault(pack[i], {}).setdefault(slot[i], []).append(i)
    packs = sorted(by_pack)
    w = [len(by_pack[p]) for p in packs]
    out = []
    for _ in range(N):
        chosen = set()
        while len(chosen) < rng.randint(1, 3):
            chosen.add(rng.choices(packs, w)[0])
        cfg, used = [], set()
        slots = [(p, s) for p in sorted(chosen) for s in sorted(by_pack[p]) if rng.random() < 0.5]
        if real_rate:
            nth = [i for p in chosen for s in by_pack[p].values() for i in s if i in nothing]
        for p, s in slots:
            cands = by_pack[p][s]
            if real_rate:
                want_pos = rng.random() < POS_RATE
                c = [i for i in cands if (i not in nothing) == want_pos]
                if not c and not want_pos:  # this slot has no 'nothing' rule: take one from the packs
                    c = [i for i in nth if slot[i] not in used]
                if not c:
                    continue
                i = rng.choice(c)
            else:
                i = rng.choice(cands)
            if slot[i] in used:
                continue
            used.add(slot[i]); cfg.append(i)
        if cfg:
            out.append(cfg)
    return out


def shown(cfg, th, agg):
    m = qw[cfg]
    m = np.where(m >= th, m, 0.0)
    score = m.max(0) if agg == "max" else m.sum(0)
    picked = []
    for j in np.argsort(-score):
        if score[j] <= 0 or len(picked) == K:
            break
        if not any(dup[j, p] for p in picked):
            picked.append(j)
    return picked


def measure(cfgs, th, agg):
    tp = n = few = none = 0
    for cfg in cfgs:
        want = set().union(*(rel[i] for i in cfg))
        s = shown(cfg, th, agg)
        tp += sum(j in want for j in s); n += len(s); few += len(s) < 3; none += not s
    return {"precision": tp / n if n else float("nan"), "<3": few / len(cfgs), "none": none / len(cfgs)}


def by_size(cfgs, th, agg):
    return {lab: measure([c for c in cfgs if lo <= len(c) <= hi], th, agg)
            for lab, lo, hi in (("<=8", 1, 8), ("9-16", 9, 16), (">16", 17, 999))}


for variant, real in (("labeled set as is", False), (f"real rate ({POS_RATE:.0%} positive rules)", True)):
    cfgs = draw(random.Random(20261128), pool, real)
    sizes = np.array([len(c) for c in cfgs])
    pos_share = np.mean([i not in nothing for c in cfgs for i in c])
    print(f"\n##### {variant}: {len(cfgs)} configs, rules per config median {np.median(sizes):.0f} "
          f"(min {sizes.min()}, max {sizes.max()}), positive rules {pos_share:.0%}")
    for agg in ("max", "sum"):
        print(f"--- aggregation {agg}: threshold  precision  <3 shown  none shown")
        for th in (0.55, 0.58, 0.60, 0.62, 0.64, TH, 0.67, 0.70):
            r = measure(cfgs, th, agg)
            print(f"{th:.3f}  {r['precision']:.3f}  {r['<3']:.3f}  {r['none']:.3f}")
        print(f"by size at {TH}: " + "  ".join(f"{k}: prec {v['precision']:.2f} <3 {v['<3']:.2f} none {v['none']:.2f}"
                                             for k, v in by_size(cfgs, TH, agg).items()))
        # bootstrap over rules: resample the rule pool, redraw the configs
        rng = np.random.default_rng(1)
        boots = []
        for b in range(200):
            ids = list(rng.choice(pool, len(pool)))
            boots.append(measure(draw(random.Random(b), ids, real), TH, agg))
        for k in ("precision", "<3", "none"):
            lo, hi = np.nanpercentile([x[k] for x in boots], [2.5, 97.5])
            print(f"  CI at {TH} {k}: [{lo:.3f}, {hi:.3f}]")
