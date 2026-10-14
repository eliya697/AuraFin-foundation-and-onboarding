"""Loads shared/tracks.json, the single source of truth shared with the React app."""

import json
from dataclasses import dataclass
from functools import lru_cache

from .config import get_settings


@dataclass(frozen=True)
class Track:
    id: str
    name: str
    tagline: str
    savings_rate: float
    benchmarks: dict[str, float]
    min_unexpected_share: float


@dataclass(frozen=True)
class Catalog:
    life_stages: dict[str, str]
    goals: dict[str, str]
    tracks: dict[str, Track]
    field_labels: dict[str, str]
    max_amount: float
    max_children: int
    reserve_boost_per_child: float
    reserve_boost_max: float
    max_custom_expenses: int
    max_custom_title_length: int


@lru_cache
def get_catalog() -> Catalog:
    raw = json.loads(get_settings().catalog_path.read_text(encoding="utf-8"))
    return Catalog(
        life_stages={item["id"]: item["label"] for item in raw["lifeStages"]},
        goals={item["id"]: item["label"] for item in raw["goals"]},
        tracks={
            t["id"]: Track(
                id=t["id"],
                name=t["name"],
                tagline=t["tagline"],
                savings_rate=t["savingsRate"],
                benchmarks=t["benchmarks"],
                min_unexpected_share=t["minUnexpectedShare"],
            )
            for t in raw["tracks"]
        },
        field_labels={key: spec["label"] for key, spec in raw["fields"].items()},
        max_amount=raw["maxAmount"],
        max_children=raw["children"]["maxCount"],
        reserve_boost_per_child=raw["children"]["reserveBoostPerChild"],
        reserve_boost_max=raw["children"]["reserveBoostMax"],
        max_custom_expenses=raw["customExpenses"]["maxItems"],
        max_custom_title_length=raw["customExpenses"]["maxTitleLength"],
    )
