"""HTTP utilities for fetching wiki pages and assets."""

from __future__ import annotations

import requests

from config import USER_AGENT


def make_session() -> requests.Session:
    """
    Create a requests session with default headers.

    Args:
        None

    Returns:
        Configured requests session.

    Raises:
        RuntimeError: If the session cannot be created.
    """
    try:
        session = requests.Session()
    except requests.RequestException as exc:
        raise RuntimeError(f"Failed to create session: {exc}") from exc

    session.headers.update({"User-Agent": USER_AGENT})
    return session


def fetch_html(session: requests.Session, url: str, timeout: float = 20.0) -> str:
    """
    Fetch HTML content from a URL.

    Args:
        session: Requests session to use.
        url: Page URL.
        timeout: Request timeout in seconds.

    Returns:
        Response HTML as text.

    Raises:
        RuntimeError: If the request fails.
    """
    try:
        resp = session.get(url, timeout=timeout)
        resp.raise_for_status()
    except requests.RequestException as exc:
        raise RuntimeError(f"Failed to fetch {url}: {exc}") from exc

    return resp.text
