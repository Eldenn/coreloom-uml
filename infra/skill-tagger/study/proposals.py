"""Point 4: how many validation proposals on the current catalog.
A pair (skill, rule) is proposed when the skill is in the rule's top 3 or the rule in the skill's
top 10, minus {value} rules, refusal rules (neg-labels.json when present) and pairs a written
affinity already names. Also: near-duplicate skills (cosine >= 0.95 between skills).
Usage: python -I proposals.py <study dir>"""
import json, sys
from pathlib import Path
import numpy as np

D = Path(sys.argv[1])
inp = json.loads((D / "js/embed-input.json").read_text())
S = np.load(D / "qwen-onnx-fp32-all.npy")
rules = {r["slot"] + "/" + r["rule"]: r for r in json.loads((D / "rules.json").read_text())}
skills = json.loads((D / "skills.json").read_text())
keys, slugs = inp["rule_keys"], inp["slugs"]
assert [s["slug"] for s in skills] == slugs
neg_file = D / "neg-labels.json"
neg = {k for k, v in json.loads(neg_file.read_text()).items() if v["refusal"]} if neg_file.exists() else set()
keep = np.array([("{value}" not in " ".join(rules[k]["lines"])) and k not in neg for k in keys])
written = np.zeros(S.shape, bool)
for j, s in enumerate(skills):
    for a in s["affinities"] or []:
        if "slot" in a:
            for i, k in enumerate(keys):
                sl, r = k.split("/", 1)
                if sl == a["slot"] and (r in a["values"] or r in (a.get("against") or [])):
                    written[i, j] = True
M = np.where(keep[:, None], S, -np.inf)
top3 = np.zeros(S.shape, bool)
for i in np.where(keep)[0]:
    top3[i, np.argsort(-M[i])[:3]] = True
top10 = np.zeros(S.shape, bool)
for j in range(S.shape[1]):
    top10[np.argsort(-M[:, j])[:10], j] = True
prop = (top3 | top10) & ~written & keep[:, None]
print(f"rules kept {keep.sum()} of {len(keys)} (refusals excluded: {len(neg)}), skills {len(slugs)}")
print(f"proposals {prop.sum()}: from rule top 3 {(top3 & prop).sum()}, from skill top 10 {(top10 & prop).sum()}, both {(top3 & top10 & prop).sum()}")
for floor in (0.5, 0.55, 0.6, 0.656):
    print(f"  with cosine >= {floor}: {(prop & (S >= floor)).sum()}")
no_written = np.array([not any("slot" in a for a in (s["affinities"] or [])) for s in skills])
print(f"skills without any written slot affinity: {no_written.sum()}, their proposals {prop[:, no_written].sum()}")
E = np.load(D / "skill-emb.npy")
C = E @ E.T
pairs = [(slugs[a], slugs[b], round(float(C[a, b]), 3)) for a in range(len(slugs)) for b in range(a + 1, len(slugs)) if C[a, b] >= 0.95]
print("near duplicates >= 0.95:", pairs)
