"""Compare the Node scores (js/<name>.json) with rerank.py's PyTorch fp32 scores on the same 20 pairs."""
import json, sys
from pathlib import Path
import numpy as np
from scipy.stats import spearmanr

D = Path(sys.argv[1])
m = json.loads((D / "js/prompts-meta.json").read_text())
py = np.load(D / "rerank-scores.npz")["rr"][m["row"], m["cols"]]
out = {}
for name in sys.argv[2:]:
    js = np.array(json.loads((D / f"js/{name}.json").read_text())["scores"])
    out[name] = {"spearman": float(spearmanr(py, js)[0]), "max_abs": float(abs(py - js).max()),
                 "top5_overlap": len(set(np.argsort(-py)[:5]) & set(np.argsort(-js)[:5]))}
    print(name, out[name])
(D / "js/compare.json").write_text(json.dumps(out, indent=1))
