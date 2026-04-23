#!/usr/bin/env python3
"""Second pass: propagate bucket labels to unclassified functions via the
call graph in an `index.json` produced by `split_c_by_vocab.py`.

Usage:
    propagate_buckets.py [path/to/<input>_split]

Defaults to ../GameServer.c_split if no argument is given.

Seeds are all functions that already have a domain bucket (anything except
`unclassified` and `crt_stl`). A multi-source BFS on the undirected call
graph assigns the nearest seed's bucket to each unclassified node. We do
NOT traverse THROUGH crt_stl nodes: the C++ runtime/STL is a cross-cutting
utility layer; letting BFS hop through it would fuse all domain clusters
into one blob.

Writes the result back into `index.json` as two new fields per entry:
  bucket_inferred   — propagated bucket, or null if unreachable
  inference_distance — BFS hop count to the nearest seed (0 for seeds)

Safe to re-run; overwrites those fields only.
"""

from __future__ import annotations

import json
import sys
from collections import Counter, deque
from pathlib import Path

HERE = Path(__file__).resolve().parent

# Buckets that should NOT propagate AND should not be traversed through.
# Everything else is a propagation seed.
TERMINAL_BUCKETS = {"crt_stl"}
# Nothing to do from these (yet).
IGNORED_BUCKETS = {"unclassified"}


def main() -> int:
    split_dir = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else HERE.parent / "GameServer.c_split"
    index_path = split_dir / "index.json"

    if not index_path.exists():
        print(f"index not found: {index_path} (run split_c_by_vocab.py first)", file=sys.stderr)
        return 1

    entries = json.loads(index_path.read_text(encoding="utf-8"))
    by_name = {e["name"]: e for e in entries}

    # Undirected adjacency. Only include edges where BOTH endpoints are in the index.
    adj: dict[str, set[str]] = {n: set() for n in by_name}
    for e in entries:
        src = e["name"]
        for callee in e["calls"]:
            if callee in by_name and callee != src:
                adj[src].add(callee)
                adj[callee].add(src)

    # Multi-source BFS from every domain-seed.
    # label[name] = (bucket, distance, seed_strength)
    labels: dict[str, tuple[str, int, int]] = {}
    q: deque[str] = deque()
    for e in entries:
        b = e["bucket"]
        if b in IGNORED_BUCKETS or b in TERMINAL_BUCKETS:
            continue
        strength = sum(e.get("hits", {}).values()) or 1
        labels[e["name"]] = (b, 0, strength)
        q.append(e["name"])

    # BFS. Don't propagate INTO already-classified nodes (their bucket stands).
    # Don't propagate THROUGH crt_stl nodes.
    while q:
        node = q.popleft()
        bucket, dist, strength = labels[node]
        node_entry = by_name[node]
        if node_entry["bucket"] in TERMINAL_BUCKETS:
            continue  # don't spread from a crt_stl node, even if we somehow labeled it
        for nb in adj[node]:
            nb_entry = by_name[nb]
            if nb_entry["bucket"] not in IGNORED_BUCKETS:
                continue  # only overwrite unclassified
            new_dist = dist + 1
            existing = labels.get(nb)
            # Score key: shorter distance first, then stronger seed.
            new_key = (new_dist, -strength)
            if existing is None or new_key < (existing[1], -existing[2]):
                labels[nb] = (bucket, new_dist, strength)
                q.append(nb)

    # Apply results.
    inferred_counts: Counter = Counter()
    dist_histogram: Counter = Counter()
    for e in entries:
        name = e["name"]
        if e["bucket"] in IGNORED_BUCKETS:
            if name in labels and labels[name][1] > 0:
                b, d, _ = labels[name]
                e["bucket_inferred"] = b
                e["inference_distance"] = d
                inferred_counts[b] += 1
                dist_histogram[d] += 1
            else:
                e["bucket_inferred"] = None
                e["inference_distance"] = None
        else:
            # Seeds and crt_stl: distance 0, same bucket.
            e["bucket_inferred"] = e["bucket"] if e["bucket"] not in TERMINAL_BUCKETS else None
            e["inference_distance"] = 0 if name in labels else None

    index_path.write_text(json.dumps(entries, indent=2), encoding="utf-8")

    unreached = sum(1 for e in entries
                    if e["bucket"] in IGNORED_BUCKETS and e["bucket_inferred"] is None)
    total_unc = sum(1 for e in entries if e["bucket"] in IGNORED_BUCKETS)

    print(f"propagated labels to {total_unc - unreached} / {total_unc} unclassified functions")
    print(f"  still unreachable (isolated or only linked via crt_stl): {unreached}")
    print()
    print("inferred bucket distribution:")
    for b, c in inferred_counts.most_common():
        print(f"  {b:20s} {c}")
    print()
    print("hop distance to nearest seed (for inferred nodes):")
    for d in sorted(dist_histogram):
        print(f"  d={d:<2d}  {dist_histogram[d]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())