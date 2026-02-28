"""Graph crawling and normalization logic."""

from __future__ import annotations

import sys
import time
from collections import deque
from typing import Deque, Dict, Iterable, List, Set

import requests

from http_client import fetch_html
from models import RawResearchRecord, TechRecord
from parsing import parse_research_page
from utils import fallback_name_from_title, normalize_research_url


def crawl_research_graph(
    session: requests.Session,
    roots: Iterable[str],
    sleep_seconds: float = 0.5,
    verbose: bool = True,
) -> Dict[str, RawResearchRecord]:
    """
    Crawl all reachable research pages and parse their content.

    Args:
        session: Requests session to use for fetching.
        roots: Iterable of root research URLs.
        sleep_seconds: Delay between page fetches.
        verbose: Whether to log progress to stderr.

    Returns:
        Mapping of URL to parsed raw record.

    Raises:
        ValueError: If no roots are provided or sleep_seconds is negative.
    """
    if sleep_seconds < 0:
        raise ValueError("sleep_seconds must be non-negative.")

    root_list = [normalize_research_url(root) for root in roots]
    if not root_list:
        raise ValueError("At least one root URL is required.")

    visited: Set[str] = set()
    queue: Deque[str] = deque(root_list)
    records_by_url: Dict[str, RawResearchRecord] = {}

    while queue:
        url = queue.popleft()
        if url in visited:
            continue
        visited.add(url)

        if verbose:
            print(f"[FETCH] {url}", file=sys.stderr)

        try:
            html = fetch_html(session, url)
            rec = parse_research_page(html, url)
            records_by_url[url] = rec

            for child_url, _ in rec.allows_links_raw:
                if child_url not in visited:
                    queue.append(child_url)
        except Exception as exc:
            if verbose:
                print(f"[ERROR] Failed to parse {url}: {exc}", file=sys.stderr)

            fallback = fallback_name_from_title(None, url)
            records_by_url[url] = RawResearchRecord(
                id=fallback,
                title=None,
                internal_name=fallback,
                url=url,
                allows_links_raw=[],
                required_links_raw=[],
                is_space_age_exclusive=False,
                selected_variant="unknown",
                research_type=None,
                research_science=None,
                research_condition_text=None,
                error=str(exc),
            )

        time.sleep(sleep_seconds)

    return records_by_url


def convert_edges_to_internal_names(
    records_by_url: Dict[str, RawResearchRecord],
) -> Dict[str, TechRecord]:
    """
    Convert URL-based edges to internal name references.

    Args:
        records_by_url: Mapping of URL to raw records.

    Returns:
        Mapping of internal name to normalized record.

    Raises:
        ValueError: If an invalid internal name is detected.
    """
    url_to_internal: Dict[str, str] = {}
    invalid_names = {"Allows", "Required technologies", "Effects", "Prototype type"}

    for url, rec in records_by_url.items():
        internal = rec.internal_name
        if internal in invalid_names:
            raise ValueError(
                f"Parsed invalid internal name {internal!r} for page {url}. "
                "The internal-name parser likely matched an infobox label."
            )
        url_to_internal[url] = internal

    records_by_id: Dict[str, TechRecord] = {}

    for url, rec in records_by_url.items():
        node_id = rec.internal_name

        allows_ids: List[str] = []
        for child_url, child_title in rec.allows_links_raw:
            child_id = url_to_internal.get(child_url) or fallback_name_from_title(child_title, child_url)
            if child_id not in allows_ids:
                allows_ids.append(child_id)

        required_ids: List[str] = []
        for parent_url, parent_title in rec.required_links_raw:
            parent_id = url_to_internal.get(parent_url) or fallback_name_from_title(parent_title, parent_url)
            if parent_id not in required_ids:
                required_ids.append(parent_id)

        out = TechRecord(
            id=node_id,
            title=rec.title,
            internal_name=rec.internal_name,
            url=rec.url,
            allows=allows_ids,
            required_technologies=required_ids,
            is_space_age_exclusive=rec.is_space_age_exclusive,
            research_type=rec.research_type,
            research_science=rec.research_science,
            research_condition_text=rec.research_condition_text,
        )
        if rec.error:
            out.error = rec.error

        records_by_id[node_id] = out

    return records_by_id


def invert_edges(records_by_id: Dict[str, TechRecord]) -> None:
    """
    Add derived parent relationships by inverting allows edges.

    Args:
        records_by_id: Mapping of internal name to normalized record.

    Returns:
        None

    Raises:
        None
    """
    unlocked_by: Dict[str, List[str]] = {node_id: [] for node_id in records_by_id.keys()}

    for parent_id, rec in records_by_id.items():
        for child_id in rec.allows:
            if child_id in unlocked_by:
                unlocked_by[child_id].append(parent_id)

    for node_id, rec in records_by_id.items():
        explicit = list(dict.fromkeys(rec.required_technologies))
        derived = list(dict.fromkeys(unlocked_by.get(node_id, [])))

        rec.unlocked_by_derived = derived

        merged = explicit[:]
        for parent in derived:
            if parent not in merged:
                merged.append(parent)
        rec.required_technologies_merged = merged
