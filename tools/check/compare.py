"""Compares two recordings from record.sh step by step and prints the first differences.

    uv run python tools/check/compare.py <baseline> <new>

Whitespace is collapsed (a reformatted template is not a change); page titles are skipped.
Exit code 1 when anything differs.
"""
import re
import sys

A, B = open(sys.argv[1]).read(), open(sys.argv[2]).read()
for name, s in (("baseline", A), ("new", B)):
    if "\n### {" not in "\n" + s:
        sys.exit(f"the {name} recording has no views: the page or the browser did not start")
print("load failures:", A.count("could not be loaded"), "->", B.count("could not be loaded"),
      "| code errors:", B.count("title: ERR"))
A = re.sub(r"title: [^\n]*\n", "", A)
B = re.sub(r"title: [^\n]*\n", "", B)
squash = lambda s: re.sub(r"\s+", " ", s)
sa, sb = re.split(r"\n(?=##)", A), re.split(r"\n(?=##)", B)
bad = [(x, y) for x, y in zip(sa, sb) if squash(x) != squash(y)]
if len(sa) != len(sb):
    print(f"different number of steps: {len(sa)} -> {len(sb)} (views or clicks changed?)")
print(f"{len(sb)} steps, {len(bad)} differ")
for x, y in bad[:5]:
    print(" ", x.split("\n")[0][:100])
    lines = [(p, q) for p, q in zip(x.split("\n"), y.split("\n")) if squash(p) != squash(q)]
    for p, q in lines[:2]:
        p, q = squash(p), squash(q)
        i = next((i for i, (c, d) in enumerate(zip(p, q)) if c != d), min(len(p), len(q)))
        print("    OLD", p[:25], "...", p[max(0, i - 120):i + 120])
        print("    NEW", q[:25], "...", q[max(0, i - 120):i + 120])
sys.exit(1 if bad or len(sa) != len(sb) else 0)
