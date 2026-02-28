"""Crawler configuration constants."""

BASE_URL = "https://wiki.factorio.com"
ROOTS = [
    "https://wiki.factorio.com/Electronics_(research)",
    "https://wiki.factorio.com/Steam_power_(research)",
]

DEFAULT_OUTPUT_JSONL = "./data/tech_tree.jsonl"
USER_AGENT = (
    "Mozilla/5.0 (compatible; FactorioTechTreeScraper/1.1; "
    "+https://wiki.factorio.com/)"
)
