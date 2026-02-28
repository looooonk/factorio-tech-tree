"""Data models for crawler records."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any, Dict, List, Optional, Tuple


@dataclass
class ResearchSciencePack:
    """Science pack requirement details."""

    name: str
    amount_per_unit: Optional[float]
    amount_text: Optional[str]


@dataclass
class ResearchScienceCost:
    """Science-based research cost details."""

    time_seconds: Optional[float]
    time_text: Optional[str]
    unit_count: Optional[int]
    unit_count_text: Optional[str]
    science_packs: List[ResearchSciencePack] = field(default_factory=list)


@dataclass
class RawResearchRecord:
    """Parsed page data keyed by wiki URL."""

    id: str
    title: Optional[str]
    internal_name: str
    url: str
    allows_links_raw: List[Tuple[str, str]]
    required_links_raw: List[Tuple[str, str]]
    is_space_age_exclusive: bool
    selected_variant: str
    research_type: Optional[str]
    research_science: Optional[ResearchScienceCost]
    research_condition_text: Optional[str]
    error: Optional[str] = None


@dataclass
class TechRecord:
    """Normalized research record keyed by internal name."""

    id: str
    title: Optional[str]
    internal_name: str
    url: str
    allows: List[str]
    required_technologies: List[str]
    is_space_age_exclusive: bool
    unlocked_by_derived: List[str] = field(default_factory=list)
    required_technologies_merged: List[str] = field(default_factory=list)
    research_type: Optional[str] = None
    research_science: Optional[ResearchScienceCost] = None
    research_condition_text: Optional[str] = None
    error: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        """
        Convert the record to a JSON-serializable dictionary.

        Args:
            None

        Returns:
            Dictionary representation of the record.

        Raises:
            None
        """
        return asdict(self)
