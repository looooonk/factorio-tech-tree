"""Utility helpers for URL and filename handling."""

from __future__ import annotations

import re
from typing import Optional
from urllib.parse import unquote, urljoin, urlparse

from config import BASE_URL


def normalize_research_url(url: str) -> str:
    """
    Normalize a research URL to a stable absolute form.

    Args:
        url: Input URL that may be relative or contain spaces.

    Returns:
        Normalized absolute URL.

    Raises:
        ValueError: If the URL is empty.
    """
    if not url:
        raise ValueError("URL must not be empty.")

    if not url.startswith("http://") and not url.startswith("https://"):
        url = urljoin(BASE_URL, url)

    parsed = urlparse(url)
    path = parsed.path.replace(" ", "_")
    return f"{parsed.scheme}://{parsed.netloc}{path}"


def sanitize_filename(name: str) -> str:
    """
    Sanitize an arbitrary string for safe filesystem use.

    Args:
        name: Candidate filename.

    Returns:
        Sanitized filename string.

    Raises:
        None
    """
    name = name.strip()
    name = re.sub(r"[\\/:*?\"<>|]+", "_", name)
    name = re.sub(r"\s+", "_", name)
    return name


def slug_from_url(url: str) -> str:
    """
    Build a stable slug based on the final URL path segment.

    Args:
        url: Source URL.

    Returns:
        Sanitized slug string.

    Raises:
        None
    """
    path = urlparse(url).path
    name = path.rsplit("/", 1)[-1]
    name = unquote(name)
    return sanitize_filename(name)


def fallback_name_from_title(title: Optional[str], url: str) -> str:
    """
    Derive a stable internal name when none is present in the page.

    Args:
        title: Research page title, if available.
        url: Research page URL.

    Returns:
        Lowercase, underscore-delimited name.

    Raises:
        None
    """
    if title:
        cleaned = re.sub(r"\s*\(research\)\s*$", "", title, flags=re.IGNORECASE)
        cleaned = cleaned.strip().lower()
        cleaned = re.sub(r"[^a-z0-9]+", "_", cleaned)
        cleaned = re.sub(r"_+", "_", cleaned).strip("_")
        if cleaned:
            return cleaned

    return slug_from_url(url).lower()
