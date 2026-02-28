"""I/O helpers for crawler output."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Dict

from models import TechRecord


def write_jsonl(records_by_id: Dict[str, TechRecord], output_path: Path) -> None:
    """
    Write normalized research records to a JSONL file.

    Args:
        records_by_id: Mapping of internal name to normalized record.
        output_path: Output file path.

    Returns:
        None

    Raises:
        ValueError: If output_path is an existing directory.
    """
    if output_path.exists() and output_path.is_dir():
        raise ValueError(f"Output path is a directory: {output_path}")

    output_path.parent.mkdir(parents=True, exist_ok=True)

    with open(output_path, "w", encoding="utf-8") as handle:
        for node_id in sorted(records_by_id.keys()):
            record = records_by_id[node_id].to_dict()
            handle.write(json.dumps(record, ensure_ascii=False) + "\n")
