"""Parsing utilities for Factorio research pages."""

from __future__ import annotations

import re
from typing import List, Optional, Set, Tuple, Union
from urllib.parse import urljoin

from bs4 import BeautifulSoup, NavigableString, Tag

from config import BASE_URL
from models import RawResearchRecord, ResearchScienceCost, ResearchSciencePack
from utils import fallback_name_from_title, normalize_research_url

ResearchScope = Union[BeautifulSoup, Tag]


def extract_page_title(soup: BeautifulSoup) -> Optional[str]:
    """
    Extract the page title from the wiki document.

    Args:
        soup: Parsed HTML document.

    Returns:
        Page title if found.

    Raises:
        None
    """
    h1 = soup.find("h1", id="firstHeading")
    if h1:
        return h1.get_text(" ", strip=True)

    title_tag = soup.find("title")
    if title_tag:
        title = title_tag.get_text(" ", strip=True)
        return re.sub(r"\s*-\s*Factorio Wiki\s*$", "", title)

    return None


def is_research_link(href: Optional[str]) -> bool:
    """
    Determine whether a link points to a research page.

    Args:
        href: Link href string.

    Returns:
        True if the link targets a research page.

    Raises:
        None
    """
    if not href:
        return False
    if not href.startswith("/"):
        return False
    return href.endswith("_(research)")


def extract_internal_name(scope: ResearchScope) -> Optional[str]:
    """
    Extract the internal technology name from the infobox.

    Args:
        scope: HTML scope to search.

    Returns:
        Internal name if found.

    Raises:
        None
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


def get_preferred_research_scope(soup: BeautifulSoup) -> ResearchScope:
    """
    Select the HTML scope used for parsing the research page.

    Args:
        soup: Parsed HTML document.

    Returns:
        HTML scope for parsing.

    Raises:
        None
    """
    space_age_tab = soup.select_one("table.tab.tab-2")
    if space_age_tab is not None:
        return space_age_tab

    base_tab = soup.select_one("table.tab.tab-1")
    if base_tab is not None:
        return base_tab

    return soup


def find_section_cell_by_label(scope: ResearchScope, label: str) -> Optional[Tag]:
    """
    Find a section cell following a label row in the infobox.

    Args:
        scope: HTML scope to search.
        label: Section label text.

    Returns:
        The section cell tag if found.

    Raises:
        None
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
    Extract research links from a section cell.

    Args:
        cell: Table cell containing links.

    Returns:
        List of (absolute_url, title) tuples.

    Raises:
        None
    """
    if cell is None:
        return []

    out: List[Tuple[str, str]] = []
    seen: Set[str] = set()

    for anchor in cell.find_all("a", href=True):
        href = anchor["href"]
        title = anchor.get("title", "").strip()

        if not is_research_link(href):
            continue

        full_url = normalize_research_url(urljoin(BASE_URL, href))
        if full_url in seen:
            continue

        seen.add(full_url)
        out.append((full_url, title))

    return out


def extract_allows_links(scope: ResearchScope) -> List[Tuple[str, str]]:
    """
    Extract links from the Allows section.

    Args:
        scope: HTML scope to search.

    Returns:
        List of (absolute_url, title) tuples.

    Raises:
        None
    """
    cell = find_section_cell_by_label(scope, "Allows")
    return extract_research_links_from_cell(cell)


def extract_required_links(scope: ResearchScope) -> List[Tuple[str, str]]:
    """
    Extract links from the Required technologies section.

    Args:
        scope: HTML scope to search.

    Returns:
        List of (absolute_url, title) tuples.

    Raises:
        None
    """
    cell = find_section_cell_by_label(scope, "Required technologies")
    return extract_research_links_from_cell(cell)


def extract_space_age_flag(soup: BeautifulSoup) -> bool:
    """
    Detect whether a page is Space Age exclusive.

    Args:
        soup: Parsed HTML document.

    Returns:
        True if the page is Space Age exclusive.

    Raises:
        None
    """
    text = soup.get_text("\n", strip=True)
    return "Space Age expansion exclusive feature" in text or "Introduced in Space Age" in text


def parse_number(value: str) -> Optional[float]:
    """
    Parse a numeric string into a float.

    Args:
        value: Raw numeric string.

    Returns:
        Parsed float value if available.

    Raises:
        None
    """
    if not value:
        return None

    cleaned = value.strip()
    cleaned = cleaned.replace(",", "")
    cleaned = cleaned.replace("\u00d7", " ").replace("\u2716", " ")
    match = re.search(r"[-+]?[0-9]*\\.?[0-9]+", cleaned)
    if not match:
        return None

    try:
        return float(match.group(0))
    except ValueError:
        return None


def parse_int(value: str) -> Optional[int]:
    """
    Parse a numeric string into an integer.

    Args:
        value: Raw numeric string.

    Returns:
        Parsed integer if available.

    Raises:
        None
    """
    parsed = parse_number(value)
    if parsed is None:
        return None
    if float(int(parsed)) == parsed:
        return int(parsed)
    return None


def extract_icon_title(icon: Tag) -> Optional[str]:
    """
    Extract the title from a Factorio icon element.

    Args:
        icon: Icon element tag.

    Returns:
        Title text if available.

    Raises:
        None
    """
    anchor = icon.find("a", title=True)
    if anchor is not None:
        title = anchor.get("title")
        if title:
            return title.strip()

    image = icon.find("img", alt=True)
    if image is not None:
        alt = image.get("alt")
        if alt:
            return alt.strip()

    return None


def extract_science_cost(scope: ResearchScope) -> Optional[ResearchScienceCost]:
    """
    Extract science cost information from the Cost section.

    Args:
        scope: HTML scope to search.

    Returns:
        Parsed science cost if present.

    Raises:
        None
    """
    cell = find_section_cell_by_label(scope, "Cost")
    if cell is None:
        cell = find_section_cell_by_label(scope, "Research cost")
    if cell is None:
        return None

    icon_divs = cell.find_all("div", class_="factorio-icon")
    if not icon_divs:
        return None

    time_seconds = None
    time_text = None
    start_index = 0

    first_title = extract_icon_title(icon_divs[0])
    first_text = icon_divs[0].find("div", class_="factorio-icon-text")
    first_text_value = first_text.get_text(" ", strip=True) if first_text else None

    if first_title and first_title.lower() == "time":
        time_text = first_text_value
        time_seconds = parse_number(first_text_value or "")
        start_index = 1

    science_packs: List[ResearchSciencePack] = []
    for icon in icon_divs[start_index:]:
        title = extract_icon_title(icon)
        if not title:
            continue
        amount_node = icon.find("div", class_="factorio-icon-text")
        amount_text = amount_node.get_text(" ", strip=True) if amount_node else None
        amount_per_unit = parse_number(amount_text or "") if amount_text else None
        science_packs.append(
            ResearchSciencePack(
                name=title,
                amount_per_unit=amount_per_unit,
                amount_text=amount_text,
            )
        )

    unit_count = None
    unit_count_text = None
    for big_node in cell.find_all("big"):
        candidate = big_node.get_text(" ", strip=True)
        if candidate:
            unit_count_text = candidate
            unit_count = parse_int(candidate)
            break

    return ResearchScienceCost(
        time_seconds=time_seconds,
        time_text=time_text,
        unit_count=unit_count,
        unit_count_text=unit_count_text,
        science_packs=science_packs,
    )


def extract_condition_text(scope: ResearchScope) -> Optional[str]:
    """
    Extract a textual research condition from the Researched by section.

    Args:
        scope: HTML scope to search.

    Returns:
        Condition text with icon titles substituted.

    Raises:
        None
    """
    cell = find_section_cell_by_label(scope, "Researched by")
    if cell is None:
        return None

    parts: List[str] = []

    def walk(node: Tag | NavigableString) -> None:
        if isinstance(node, NavigableString):
            parts.append(str(node))
            return

        if not isinstance(node, Tag):
            return

        if "factorio-icon" in (node.get("class") or []):
            title = extract_icon_title(node)
            if title:
                parts.append(f" {title} ")
            return

        for child in node.children:
            walk(child)

    walk(cell)
    text = "".join(parts)
    text = re.sub(r"\\s+", " ", text).strip()
    return text or None


def resolve_selected_variant(scope: ResearchScope, soup: BeautifulSoup) -> str:
    """
    Identify which research variant was selected from the page.

    Args:
        scope: HTML scope that was parsed.
        soup: Full page soup for comparison.

    Returns:
        Variant label string.

    Raises:
        None
    """
    if scope is soup:
        return "single"

    classes = scope.get("class") or []
    if "tab-2" in classes:
        return "space-age"
    if "tab-1" in classes:
        return "base-game"
    return "unknown"


def parse_research_page(html: str, page_url: str) -> RawResearchRecord:
    """
    Parse a research page into a structured record.

    Args:
        html: HTML content for the page.
        page_url: Page URL used for resolving links.

    Returns:
        Parsed research record.

    Raises:
        ValueError: If the page URL is empty.
    """
    if not page_url:
        raise ValueError("Page URL must not be empty.")

    soup = BeautifulSoup(html, "html.parser")
    scope = get_preferred_research_scope(soup)

    title = extract_page_title(soup)
    internal_name = extract_internal_name(scope) or fallback_name_from_title(title, page_url)

    allows_links = extract_allows_links(scope)
    required_links = extract_required_links(scope)

    is_space_age = extract_space_age_flag(soup)
    selected_variant = resolve_selected_variant(scope, soup)
    science_cost = extract_science_cost(scope)
    condition_text = extract_condition_text(scope)
    research_type = None
    research_science = None
    research_condition_text = None

    if science_cost is not None:
        research_type = "science"
        research_science = science_cost
    elif condition_text:
        research_type = "condition"
        research_condition_text = condition_text

    return RawResearchRecord(
        id=internal_name,
        title=title,
        internal_name=internal_name,
        url=normalize_research_url(page_url),
        allows_links_raw=allows_links,
        required_links_raw=required_links,
        is_space_age_exclusive=is_space_age,
        selected_variant=selected_variant,
        research_type=research_type,
        research_science=research_science,
        research_condition_text=research_condition_text,
    )
