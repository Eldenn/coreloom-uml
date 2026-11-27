"""Write reranker prompts (rerank.py's format) for the Node scorer.

python -I js-prompts.py <dir>       -> js/prompts.json: the 20 pairs of the first positive rule
python -I js-prompts.py <dir> all   -> js/all-prompts.json: every non-refusal rule x its Qwen top 20
Each comes with <name>-meta.json holding the (row, col) of every prompt.
"""
import json, sys
from pathlib import Path
import numpy as np

D = Path(sys.argv[1])
ALL = len(sys.argv) > 2 and sys.argv[2] == "all"
rules = {f"{r['slot']}/{r['rule']}": r for r in json.loads((D / "rules.json").read_text())}
skills = json.loads((D / "skills.json").read_text())
truth = json.loads((D / "truth.json").read_text())
keys = list(truth)
ref = set(json.loads((D / "empty-kinds.json").read_text())["refusal"])
q = np.load(D / "scores.npz")["qwen"]
rows = [n for n, k in enumerate(keys) if k not in ref]
if not ALL:
    rows = [next(n for n in rows if truth[keys[n]])]
TASK = "Given a coding convention rule, retrieve the agent skills that help a coding agent follow it"
pre = ('<|im_start|>system\nJudge whether the Document meets the requirements based on the Query and the Instruct '
       'provided. Note that the answer can only be "yes" or "no".<|im_end|>\n<|im_start|>user\n')
suf = "<|im_end|>\n<|im_start|>assistant\n<think>\n\n</think>\n\n"
ps, pairs = [], []
for i in rows:
    r = rules[keys[i]]
    rt = r["group"] + (f" {r['label']}" if r["label"] else "") + "\n" + " ".join(r["lines"])
    for j in [int(j) for j in np.argsort(-q[i])[:20]]:
        ps.append(pre + f"<Instruct>: {TASK}\n<Query>: {rt}\n<Document>: "
                  + f"{skills[j]['name']}: {skills[j]['description'] or ''}"[:2000] + suf)
        pairs.append([i, j])
name = "all-prompts" if ALL else "prompts"
(D / f"js/{name}.json").write_text(json.dumps(ps))
(D / f"js/{name}-meta.json").write_text(json.dumps(
    {"row": rows[0], "key": keys[rows[0]], "cols": [j for _, j in pairs], "pairs": pairs}))
print(len(ps))
