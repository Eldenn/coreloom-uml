"""Point 2: tags as a condition. A pair is kept only when the skill shares a tag with the rule's
slot (slot-topics.json, skills.json topics) AND passes the threshold, tuned under the same
repeated CV as threshold.py. Usage: python -I tags.py <study dir>"""
import numpy as np

__file__ = __file__.replace("tags.py", "threshold.py")
src = open(__file__).read()
exec(src.split("\nout = {}\n")[0])  # data, matrices, repeated(), summary(), boot_diff()

share = np.array([[bool(set(slot_topics.get(k.split("/", 1)[0], [])) & set(s["topics"] or []))
                   for s in skills] for k in keys])
gate = lambda m: np.where(share, m, -1e9)

pairs = [(i, slugs.index(s)) for i, k in enumerate(keys) for s in truth[k]]
print(f"expected pairs sharing a tag: {np.mean([share[i, j] for i, j in pairs]):.3f} of {len(pairs)}")
print(f"skills sharing a tag with a rule, mean per rule: {share.sum(1).mean():.1f} of {len(skills)}")

T = {
    "Qwen": qw, "Qwen & tags": gate(qw),
    "Qwen+SparseUp": M["Qwen+SparseUp a=0.7"], "Qwen+SparseUp & tags": gate(M["Qwen+SparseUp a=0.7"]),
}
for beta in (1.0, 0.5):
    print(f"\n=== F{beta:g}, 20 x 5-fold CV ===")
    res = {}
    for name, mat in T.items():
        res[name], ths = repeated(mat, beta)
        print(f"{name:22s} " + "  ".join(f"{k} {v:.3f}" for k, v in summary(res[name], beta).items())
              + f"  | th sd {ths.std():.3f}")
    for a, b in (("Qwen & tags", "Qwen"), ("Qwen+SparseUp & tags", "Qwen+SparseUp")):
        d = boot_diff(res[a], res[b], beta)
        print(f"  {a} - {b}: " + "  ".join(f"{k} {v[0]:+.3f} [{v[1]:+.3f}, {v[2]:+.3f}]" for k, v in d.items()))
