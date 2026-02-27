"""
Crawl the Factorio wiki research graph and export a Space Age-oriented tech tree.

This script starts from the two root research pages,
    - Electronics (research)
    - Steam power (research)
and recursively traverses the wiki by following each page's "Allows" links.

The crawler is tailored to the structure of the Factorio wiki research pages.
In particular, some research pages contain multiple tabbed variants, such as a
base-game version and a Space Age DLC version. When such pages are encountered,
the parser prefers the Space Age tab so that the resulting graph reflects the
Space Age progression rather than the vanilla one.

For each research page, the script extracts:
    - the page title,
    - the internal technology name,
    - prerequisite technologies,
    - unlocked technologies,
    - whether the page is Space Age-exclusive,
    - the research icon image,
    - and the original wiki URL.

The graph is first crawled using page URLs, then normalized into a graph keyed
by internal technology names. This is important because internal names are the
stable in-game identifiers and are more useful than wiki URLs for downstream
processing.

The script also downloads one icon image per technology. Unlike prerequisite
or unlock icons embedded inside the tabbed content tables, the correct image for
the technology itself is taken from the research page's infobox header.

Output:
    - A JSONL file containing one JSON object per research node.
    - A directory of downloaded technology images.

Typical usage:
    python main.py \
        --output-jsonl ./data/tech_tree.jsonl \
        --image-dir ./data/tech_images

Notes:
    - The crawler follows "Allows" links outward from the two root technologies.
    - When both vanilla and Space Age versions of a research appear on the same
      page, only the Space Age version is used for graph construction.
    - The JSONL output is intended to serve as the canonical intermediate format
      for later visualization or analysis.
"""

import argparse
import json
import re
import sys
import time
from collections import deque
from pathlib import Path
from typing import Dict, List, Optional, Set, Tuple
from urllib.parse import urljoin, urlparse, unquote

import requests
from bs4 import BeautifulSoup, Tag


BASE_URL = "https://wiki.factorio.com"
ROOTS = [
    "https://wiki.factorio.com/Electronics_(research)",
    "https://wiki.factorio.com/Steam_power_(research)",
]

DEFAULT_OUTPUT_JSONL = "./data/tech_tree.jsonl"
DEFAULT_IMAGE_DIR = "./data/tech_images"

USER_AGENT = (
    "Mozilla/5.0 (compatible; FactorioTechTreeScraper/1.1; "
    "+https://wiki.factorio.com/)"
)


def normalize_research_url(url: str) -> str:
    if not url.startswith("http://") and not url.startswith("https://"):
        url = urljoin(BASE_URL, url)

    parsed = urlparse(url)
    path = parsed.path
    normalized = f"{parsed.scheme}://{parsed.netloc}{path}"
    normalized = normalized.replace(" ", "_")
    return normalized


def sanitize_filename(name: str) -> str:
    name = name.strip()
    name = re.sub(r"[\\/:*?\"<>|]+", "_", name)
    name = re.sub(r"\s+", "_", name)
    return name


def slug_from_url(url: str) -> str:
    path = urlparse(url).path
    name = path.rsplit("/", 1)[-1]
    name = unquote(name)
    return sanitize_filename(name)


def make_session() -> requests.Session:
    session = requests.Session()
    session.headers.update({"User-Agent": USER_AGENT})
    return session


def fetch_html(session: requests.Session, url: str, timeout: float = 20.0) -> str:
    resp = session.get(url, timeout=timeout)
    resp.raise_for_status()
    return resp.text


def download_file(session: requests.Session, url: str, out_path: Path, timeout: float = 30.0) -> None:
    out_path.parent.mkdir(parents=True, exist_ok=True)

    with session.get(url, stream=True, timeout=timeout) as resp:
        resp.raise_for_status()
        with open(out_path, "wb") as f:
            for chunk in resp.iter_content(chunk_size=8192):
                if chunk:
                    f.write(chunk)


def extract_page_title(soup: BeautifulSoup) -> Optional[str]:
    h1 = soup.find("h1", id="firstHeading")
    if h1:
        return h1.get_text(" ", strip=True)

    title_tag = soup.find("title")
    if title_tag:
        title = title_tag.get_text(" ", strip=True)
        title = re.sub(r"\s*-\s*Factorio Wiki\s*$", "", title)
        return title

    return None


def is_research_link(href: Optional[str]) -> bool:
    if not href:
        return False
    if not href.startswith("/"):
        return False
    return href.endswith("_(research)")


def extract_internal_name(scope: Tag) -> Optional[str]:
    """
    Extract the infobox value for 'Internal name' from the selected scope only.
    """
    label_node = scope.find(string=lambda s: isinstance(s, str) and s.strip() == "Internal name")
    if label_node is None:
        return None

    label_tr = label_node.find_parent("tr")
    if label_tr is None:
        return None

    value_tr = label_tr.find_next_sibling("tr")
    if value_tr is None:
        return None

    value_td = value_tr.find("td")
    if value_td is None:
        return None

    value = value_td.get_text(" ", strip=True)
    if not value:
        return None

    bad_values = {
        "Allows",
        "Required technologies",
        "Effects",
        "Prototype type",
        "Researched by",
        "Cost",
    }
    if value in bad_values:
        return None

    return value


def get_preferred_research_scope(soup: BeautifulSoup) -> Tag:
    """
    Choose the HTML scope from which to parse a research page.

    Priority:
      1. Space Age tab:  <table class="tab tab-2 ...">
      2. Base-game tab:  <table class="tab tab-1 ...">
      3. Whole document fallback

    This is necessary because some research pages contain both a base-game and
    Space Age variant on the same page.
    """
    space_age_tab = soup.select_one("table.tab.tab-2")
    if space_age_tab is not None:
        return space_age_tab

    base_tab = soup.select_one("table.tab.tab-1")
    if base_tab is not None:
        return base_tab

    return soup


def find_section_cell_by_label(scope: Tag, label: str) -> Optional[Tag]:
    """
    Within the chosen research scope, find the section cell for labels like:
      - Required technologies
      - Allows

    Expected structure:
      <tr> ... <p>Allows</p> ... </tr>
      <tr><td ...> ... links ... </td></tr>
    """
    label_node = scope.find(string=lambda s: isinstance(s, str) and s.strip() == label)
    if label_node is None:
        return None

    tr = label_node.find_parent("tr")
    if tr is None:
        return None

    next_tr = tr.find_next_sibling("tr")
    if next_tr is None:
        return None

    return next_tr.find("td")


def extract_research_links_from_cell(cell: Optional[Tag]) -> List[Tuple[str, str]]:
    """
    Return a list of:
        (absolute_url, page_title)
    for research links found in a section cell.
    """
    if cell is None:
        return []

    out: List[Tuple[str, str]] = []
    seen: Set[str] = set()

    for a in cell.find_all("a", href=True):
        href = a["href"]
        title = a.get("title", "").strip()

        if not is_research_link(href):
            continue

        full_url = normalize_research_url(urljoin(BASE_URL, href))
        if full_url in seen:
            continue

        seen.add(full_url)
        out.append((full_url, title))

    return out


def extract_allows_links(scope: Tag) -> List[Tuple[str, str]]:
    cell = find_section_cell_by_label(scope, "Allows")
    return extract_research_links_from_cell(cell)


def extract_required_links(scope: Tag) -> List[Tuple[str, str]]:
    cell = find_section_cell_by_label(scope, "Required technologies")
    return extract_research_links_from_cell(cell)


def extract_space_age_flag(soup: BeautifulSoup) -> bool:
    text = soup.get_text("\n", strip=True)
    return "Space Age expansion exclusive feature" in text or "Introduced in Space Age" in text


def extract_research_icon_url(soup: BeautifulSoup, page_url: str) -> Optional[str]:
    """
    Extract the research's own icon image.

    Important:
    - Do NOT search inside the selected tab scope for the page icon, because on
      multi-variant pages the first '(research)' image inside the tab is often
      the first prerequisite technology.
    - Instead, prefer the dedicated infobox header image at the top of the page.
    """

    # 1. Best source: the infobox header image for the page itself.
    header = soup.select_one("div.infobox-header.technology")
    if header is not None:
        img = header.find("img", src=True)
        if img is not None:
            return urljoin(page_url, img["src"])

    # 2. Fallback: first image inside the top-level infobox header table.
    infobox = soup.select_one("div.infobox")
    if infobox is not None:
        header_table = infobox.find("table")
        if header_table is not None:
            img = header_table.find("img", src=True)
            if img is not None:
                return urljoin(page_url, img["src"])

    # 3. Last resort: search the whole infobox, but only before the first tabbed
    #    content table if possible.
    if infobox is not None:
        for child in infobox.children:
            if not isinstance(child, Tag):
                continue

            classes = child.get("class", [])
            if child.name == "table" and "tab" in classes:
                break

            img = child.find("img", src=True)
            if img is not None:
                return urljoin(page_url, img["src"])

    return None


def image_extension_from_url(url: str) -> str:
    path = urlparse(url).path.lower()
    for ext in [".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"]:
        if ext in path:
            return ext
    return ".png"


def fallback_name_from_title(title: Optional[str], url: str) -> str:
    """
    If internal_name is unavailable, fall back to a stable slug derived from the page.
    """
    if title:
        t = title
        t = re.sub(r"\s*\(research\)\s*$", "", t, flags=re.IGNORECASE)
        t = t.strip().lower()
        t = re.sub(r"[^a-z0-9]+", "_", t)
        t = re.sub(r"_+", "_", t).strip("_")
        if t:
            return t

    return slug_from_url(url).lower()


def parse_research_page(html: str, page_url: str) -> Dict:
    soup = BeautifulSoup(html, "html.parser")
    scope = get_preferred_research_scope(soup)

    title = extract_page_title(soup)
    internal_name = extract_internal_name(scope)
    if not internal_name:
        internal_name = fallback_name_from_title(title, page_url)

    allows_links = extract_allows_links(scope)
    required_links = extract_required_links(scope)

    # Use the full page soup here, not `scope`
    icon_url = extract_research_icon_url(soup, page_url)
    is_space_age = extract_space_age_flag(soup)

    return {
        "id": internal_name,
        "title": title,
        "internal_name": internal_name,
        "url": normalize_research_url(page_url),
        "allows_links_raw": allows_links,
        "required_links_raw": required_links,
        "is_space_age_exclusive": is_space_age,
        "image_url": icon_url,
        "selected_variant": (
            "space-age"
            if scope is not soup and "tab-2" in (scope.get("class") or [])
            else "base-game"
            if scope is not soup and "tab-1" in (scope.get("class") or [])
            else "single"
        ),
    }


def crawl_research_graph(
    session: requests.Session,
    roots: List[str],
    sleep_seconds: float = 0.5,
    verbose: bool = True,
) -> Dict[str, Dict]:
    """
    First pass:
    - crawl all reachable research pages by URL
    - parse page data
    - store records keyed by URL

    Second pass later will rewrite graph edges from URLs to internal names.
    """
    visited: Set[str] = set()
    queue = deque(normalize_research_url(u) for u in roots)
    records_by_url: Dict[str, Dict] = {}

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

            for child_url, _ in rec["allows_links_raw"]:
                if child_url not in visited:
                    queue.append(child_url)

        except Exception as e:
            print(f"[ERROR] Failed to parse {url}: {e}", file=sys.stderr)
            records_by_url[url] = {
                "id": fallback_name_from_title(None, url),
                "title": None,
                "internal_name": fallback_name_from_title(None, url),
                "url": url,
                "allows_links_raw": [],
                "required_links_raw": [],
                "is_space_age_exclusive": False,
                "image_url": None,
                "error": str(e),
            }

        time.sleep(sleep_seconds)

    return records_by_url


def convert_edges_to_internal_names(records_by_url: Dict[str, Dict]) -> Dict[str, Dict]:
    url_to_internal: Dict[str, str] = {}
    for url, rec in records_by_url.items():
        internal = rec["internal_name"]

        if internal in {"Allows", "Required technologies", "Effects", "Prototype type"}:
            raise ValueError(
                f"Parsed invalid internal name {internal!r} for page {url}. "
                "The internal-name parser likely matched an infobox label."
            )

        url_to_internal[url] = internal

    records_by_id: Dict[str, Dict] = {}

    for url, rec in records_by_url.items():
        node_id = rec["internal_name"]

        allows_ids: List[str] = []
        for child_url, child_title in rec.get("allows_links_raw", []):
            child_id = url_to_internal.get(child_url)
            if child_id is None:
                child_id = fallback_name_from_title(child_title, child_url)
            if child_id not in allows_ids:
                allows_ids.append(child_id)

        required_ids: List[str] = []
        for parent_url, parent_title in rec.get("required_links_raw", []):
            parent_id = url_to_internal.get(parent_url)
            if parent_id is None:
                parent_id = fallback_name_from_title(parent_title, parent_url)
            if parent_id not in required_ids:
                required_ids.append(parent_id)

        out = {
            "id": node_id,
            "title": rec.get("title"),
            "internal_name": rec.get("internal_name"),
            "url": rec.get("url"),
            "allows": allows_ids,
            "required_technologies": required_ids,
            "is_space_age_exclusive": rec.get("is_space_age_exclusive", False),
            "image_url": rec.get("image_url"),
        }

        if "error" in rec:
            out["error"] = rec["error"]

        records_by_id[node_id] = out

    return records_by_id


def invert_edges(records_by_id: Dict[str, Dict]) -> None:
    unlocked_by: Dict[str, List[str]] = {node_id: [] for node_id in records_by_id.keys()}

    for parent_id, rec in records_by_id.items():
        for child_id in rec.get("allows", []):
            if child_id in unlocked_by:
                unlocked_by[child_id].append(parent_id)

    for node_id, rec in records_by_id.items():
        explicit = list(dict.fromkeys(rec.get("required_technologies", [])))
        derived = list(dict.fromkeys(unlocked_by.get(node_id, [])))

        rec["unlocked_by_derived"] = derived

        merged = explicit[:]
        for x in derived:
            if x not in merged:
                merged.append(x)
        rec["required_technologies_merged"] = merged


def download_icons_for_records(
    session: requests.Session,
    records_by_id: Dict[str, Dict],
    image_dir: Path,
    sleep_seconds: float = 0.2,
    verbose: bool = True,
) -> None:
    image_dir.mkdir(parents=True, exist_ok=True)

    for node_id, rec in records_by_id.items():
        img_url = rec.get("image_url")
        if not img_url:
            rec["image_path"] = None
            continue

        ext = image_extension_from_url(img_url)
        out_path = image_dir / f"{sanitize_filename(node_id)}{ext}"

        try:
            if not out_path.exists():
                if verbose:
                    print(f"[IMG] {img_url} -> {out_path}", file=sys.stderr)
                download_file(session, img_url, out_path)

            rec["image_path"] = str(out_path)
        except Exception as e:
            print(f"[ERROR] Failed to download image for {node_id}: {e}", file=sys.stderr)
            rec["image_path"] = None
            rec["image_error"] = str(e)

        time.sleep(sleep_seconds)


def write_jsonl(records_by_id: Dict[str, Dict], output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with open(output_path, "w", encoding="utf-8") as f:
        for node_id in sorted(records_by_id.keys()):
            f.write(json.dumps(records_by_id[node_id], ensure_ascii=False) + "\n")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Recursively scrape Factorio research pages, store the tech graph as JSONL, "
            "and download each research icon."
        )
    )
    parser.add_argument(
        "--output-jsonl",
        type=str,
        default=DEFAULT_OUTPUT_JSONL,
        help=f"Path to output JSONL file (default: {DEFAULT_OUTPUT_JSONL})",
    )
    parser.add_argument(
        "--image-dir",
        type=str,
        default=DEFAULT_IMAGE_DIR,
        help=f"Directory to save downloaded tech images (default: {DEFAULT_IMAGE_DIR})",
    )
    parser.add_argument(
        "--sleep",
        type=float,
        default=0.5,
        help="Delay in seconds between page fetches (default: 0.5)",
    )
    parser.add_argument(
        "--image-sleep",
        type=float,
        default=0.2,
        help="Delay in seconds between image downloads (default: 0.2)",
    )
    parser.add_argument(
        "--quiet",
        action="store_true",
        help="Suppress progress logs to stderr",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
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

    download_icons_for_records(
        session=session,
        records_by_id=records_by_id,
        image_dir=Path(args.image_dir),
        sleep_seconds=args.image_sleep,
        verbose=verbose,
    )

    write_jsonl(records_by_id, Path(args.output_jsonl))

    if verbose:
        print(f"[DONE] Wrote {len(records_by_id)} records to {args.output_jsonl}", file=sys.stderr)


if __name__ == "__main__":
    main()