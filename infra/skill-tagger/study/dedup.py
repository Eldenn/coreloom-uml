"""Skill-skill cosine (Qwen, document side, no instruction) for de-duplication. Saves skill-emb.npy.
Usage: python -I dedup.py <study dir>"""
import json, sys
from pathlib import Path
import numpy as np
from sentence_transformers import SentenceTransformer

D = Path(sys.argv[1])
skills = json.loads((D / "skills.json").read_text())
docs = [f"{s['name']}: {s['description'] or ''}"[:2000] for s in skills]
m = SentenceTransformer("Qwen/Qwen3-Embedding-0.6B", revision="97b0c614be4d77ee51c0cef4e5f07c00f9eb65b3", device="cpu")
e = m.encode(docs, batch_size=16, normalize_embeddings=True)
np.save(D / "skill-emb.npy", e)
c = e @ e.T
for i, j in sorted(zip(*np.where(np.triu(c, 1) >= 0.90)), key=lambda p: -c[p]):
    print(f"{c[i, j]:.3f}  {skills[i]['slug']}  ~  {skills[j]['slug']}")
