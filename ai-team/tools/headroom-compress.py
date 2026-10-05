#!/usr/bin/env python3
"""Headroom bridge for large AI-Team reviewer context.

Reads one JSON object from stdin:
  {"content": "<json string>", "query": "<task>"}

Writes one JSON object to stdout. Any failure exits non-zero so the Node
adapter can fail open to the original content.
"""

from __future__ import annotations

import json
import sys

from headroom.transforms.smart_crusher import SmartCrusher, SmartCrusherConfig


def main() -> int:
    payload = json.load(sys.stdin)
    content = payload.get("content")
    query = payload.get("query") or ""

    if not isinstance(content, str) or not content:
        raise ValueError("content must be a non-empty string")
    if not isinstance(query, str):
        raise ValueError("query must be a string")

    # Parse first so Headroom is only used for structured internal context.
    json.loads(content)

    crusher = SmartCrusher(
        SmartCrusherConfig(
            min_tokens_to_crush=50,
            max_items_after_crush=30,
        ),
        with_compaction=False,
    )
    result = crusher.crush(content, query=query)

    print(
        json.dumps(
            {
                "content": result.compressed,
                "modified": bool(result.was_modified),
                "strategy": result.strategy,
            },
            separators=(",", ":"),
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
