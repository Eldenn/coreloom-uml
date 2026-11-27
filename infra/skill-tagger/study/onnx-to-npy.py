"""Turn js/embed-output-<dtype>.json (js/embed.mjs) into the rule x skill cosine matrix
qwen-onnx-<dtype>-all.npy (881 x 215, rows in js/embed-input.json's rule_keys order), and store its
rows for the first set's rules in scores.npz as qwen_onnx_<dtype>.
Usage: python -I onnx-to-npy.py <study dir> <dtype>"""
import json, sys
from pathlib import Path
import numpy as np

D, dtype = Path(sys.argv[1]), sys.argv[2]
out = json.loads((D / f"js/embed-output-{dtype}.json").read_text())
inp = json.loads((D / "js/embed-input.json").read_text())
S = np.array(out["queries"]) @ np.array(out["docs"]).T
np.save(D / f"qwen-onnx-{dtype}-all.npy", S)
keys = list(json.loads((D / "truth.json").read_text()))
scores = dict(np.load(D / "scores.npz"))
scores[f"qwen_onnx_{dtype}"] = S[[inp["rule_keys"].index(k) for k in keys]]
np.savez(D / "scores.npz", **scores)
print(dtype, S.shape, f"{out['msPerQuery']:.0f} ms a rule")
