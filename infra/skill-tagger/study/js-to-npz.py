"""Turn a Node run over js/all-prompts.json into a rerank.py cache: python -I js-to-npz.py <dir> <name>
-> rerank-scores-<name>.npz (then RR_CACHE=rerank-scores-<name>.npz RR_RESULTS=... python -I rerank.py <dir>)."""
import json, sys
from pathlib import Path
import numpy as np

D, name = Path(sys.argv[1]), sys.argv[2]
pairs = json.loads((D / "js/all-prompts-meta.json").read_text())["pairs"]
run = json.loads((D / f"js/{name}.json").read_text())
qwen = np.load(D / "scores.npz")["qwen"]
rr = np.full(qwen.shape, -1e9)
for (i, j), p in zip(pairs, run["scores"]):
    rr[i, j] = p
np.savez(D / f"rerank-scores-{name}.npz", rr=rr, per_pair=run["cpu_ms_per_pair"] / 1000, threads=8)
