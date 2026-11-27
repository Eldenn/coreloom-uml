"""The confirmation, run once under the protocol frozen in section 9.10.
Primary: Qwen3-Embedding ONNX fp32 (transformers.js), threshold 0.656, fallback 0.672.
For information only: the same with the q8 build (SKILL_EMBEDDING_MODEL as it is today).
Usage: python -I confirm-run.py <study dir>"""
import json, sys, math
from pathlib import Path
import numpy as np

D = Path(sys.argv[1])
labels = json.loads((D / "confirm-labels.json").read_text())  # reloaded from the document
inp = json.loads((D / "js/embed-input.json").read_text())
slugs = inp["slugs"]
TH, FALLBACK, K = 0.656, 0.672, 5


def wilson(k, n, z=1.959964):
    p = k / n; d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d; h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return c - h, c + h


def run(name, S):
    idx = {k: inp["rule_keys"].index(k) for k in labels}
    empty = [k for k, v in labels.items() if not v["skills"] and not v["refusal"]]
    refusal = [k for k, v in labels.items() if v["refusal"]]
    positive = [k for k, v in labels.items() if v["skills"]]
    print(f"\n=== {name}: {len(empty)} empty (non-refusal), {len(refusal)} refusals, {len(positive)} positive")
    for th in (TH, FALLBACK):
        hit = sum(S[idx[k]].max() >= th for k in empty)
        lo, hi = wilson(hit, len(empty))
        ref = sum(S[idx[k]].max() >= th for k in refusal)
        tp = n = served = right = 0
        for k in positive:
            row = S[idx[k]]
            top = [j for j in np.argsort(-row)[:K] if row[j] >= th]
            good = sum(slugs[j] in labels[k]["skills"] for j in top)
            tp += good; n += len(top); served += bool(top); right += good > 0
        print(f"threshold {th}: false-suggestion rate {hit}/{len(empty)} = {hit / len(empty):.3f} "
              f"[Wilson {lo:.3f}, {hi:.3f}]  | refusals suggested {ref}/{len(refusal)}  | positives served "
              f"{served}/{len(positive)}, well served {right}, precision {tp}/{n}")


run("PRIMARY - ONNX fp32", np.load(D / "qwen-onnx-fp32-all.npy"))
run("information only - ONNX q8", np.load(D / "qwen-onnx-q8-all.npy"))
