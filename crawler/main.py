"""
Crawl Factorio research pages and export a JSONL tech tree.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from config import DEFAULT_OUTPUT_JSONL, ROOTS
from crawl import (
    convert_edges_to_internal_names,
    crawl_research_graph,
    invert_edges,
)
from http_client import make_session
from io_utils import write_jsonl


def parse_args() -> argparse.Namespace:
    """
    Parse command line arguments.

    Args:
        None

    Returns:
        Parsed argparse namespace.

    Raises:
        None
    """
    parser = argparse.ArgumentParser(
        description=(
            "Recursively scrape Factorio research pages and store the tech graph as JSONL."
        )
    )
    parser.add_argument(
        "--output-jsonl",
        type=str,
        default=DEFAULT_OUTPUT_JSONL,
        help=f"Path to output JSONL file (default: {DEFAULT_OUTPUT_JSONL})",
    )
    parser.add_argument(
        "--sleep",
        type=float,
        default=0.1,
        help="Delay in seconds between page fetches (default: 0.5)",
    )
    parser.add_argument(
        "--quiet",
        action="store_true",
        help="Suppress progress logs to stderr",
    )
    return parser.parse_args()


def validate_args(args: argparse.Namespace) -> None:
    """
    Validate CLI arguments before running the crawler.

    Args:
        args: Parsed CLI arguments.

    Returns:
        None

    Raises:
        ValueError: If any argument is invalid.
    """
    if args.sleep < 0:
        raise ValueError("--sleep must be non-negative.")
    if not args.output_jsonl:
        raise ValueError("--output-jsonl must not be empty.")

    output_path = Path(args.output_jsonl)
    if output_path.exists() and output_path.is_dir():
        raise ValueError(f"Output path is a directory: {output_path}")


def run(args: argparse.Namespace) -> int:
    """
    Execute the crawler workflow from parsed arguments.

    Args:
        args: Parsed CLI arguments.

    Returns:
        Exit code for the process.

    Raises:
        ValueError: If arguments fail validation.
        RuntimeError: If session creation fails.
    """
    validate_args(args)
    verbose = not args.quiet

    session = make_session()

    records_by_url = crawl_research_graph(
        session=session,
        roots=ROOTS,
        sleep_seconds=args.sleep,
        verbose=verbose,
    )

    records_by_id = convert_edges_to_internal_names(records_by_url)
    invert_edges(records_by_id)

    write_jsonl(records_by_id, Path(args.output_jsonl))

    if verbose:
        print(f"[DONE] Wrote {len(records_by_id)} records to {args.output_jsonl}", file=sys.stderr)

    return 0


def main() -> None:
    """
    CLI entry point.

    Args:
        None

    Returns:
        None

    Raises:
        SystemExit: If the crawler fails.
    """
    args = parse_args()

    try:
        exit_code = run(args)
    except KeyboardInterrupt:
        print("[ERROR] Interrupted by user.", file=sys.stderr)
        raise SystemExit(130)
    except (ValueError, RuntimeError) as exc:
        print(f"[ERROR] {exc}", file=sys.stderr)
        raise SystemExit(2)

    raise SystemExit(exit_code)


if __name__ == "__main__":
    main()
