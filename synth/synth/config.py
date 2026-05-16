"""Difficulty presets and generator configuration."""

from __future__ import annotations
import random
from dataclasses import dataclass, field

# Map template names to their doc type and required spec type
TEMPLATES = {
    "factura_letterhead":  {"doc_type": "factura",  "css": "base"},
    "factura_minimal":     {"doc_type": "factura",  "css": "base"},
    "factura_legacy_90s":  {"doc_type": "factura",  "css": "legacy"},
    "factura_eu_style":    {"doc_type": "factura",  "css": "base"},
    "albaran_thermal":     {"doc_type": "albaran",  "css": "thermal"},
    "albaran_a5_carbonless": {"doc_type": "albaran", "css": "base"},
    "albaran_handwritten": {"doc_type": "albaran",  "css": "base"},
}

FACTURA_TEMPLATES = [k for k, v in TEMPLATES.items() if v["doc_type"] == "factura"]
ALBARAN_TEMPLATES = [k for k, v in TEMPLATES.items() if v["doc_type"] == "albaran"]

# Visual degradation tags available per difficulty
DEGRADATION_POOL_BY_DIFFICULTY = {
    "easy": [
        "rotate_small", "low_contrast", "jpeg_artifacts_low",
    ],
    "medium": [
        "rotate_small", "low_contrast", "jpeg_artifacts_low",
        "coffee_stain", "lighting_gradient", "vignette",
        "motion_blur", "carbonless_tint",
    ],
    "hard": [
        "rotate_small", "rotate_90", "low_contrast", "jpeg_artifacts_low",
        "jpeg_artifacts_extreme", "coffee_stain", "wrinkle", "ink_bleed",
        "bleed_through", "lighting_gradient", "vignette", "dirty_drum",
        "thermal_fade", "thermal_banding", "partial_cut_bottom",
        "watermark_duplicado", "watermark_copia", "binarised_aggressive",
        "motion_blur", "perspective_phone",
    ],
    "cursed": [
        "rotate_small", "rotate_90", "rotate_180", "low_contrast",
        "jpeg_artifacts_low", "jpeg_artifacts_extreme", "coffee_stain",
        "wrinkle", "ink_bleed", "bleed_through", "lighting_gradient",
        "vignette", "dirty_drum", "thermal_fade", "thermal_banding",
        "partial_cut_bottom", "partial_cut_right", "watermark_duplicado",
        "watermark_copia", "watermark_anulado", "binarised_aggressive",
        "staple_holes", "motion_blur", "perspective_phone", "over_exposed",
    ],
}

# Semantic mutation tags per difficulty
MUTATION_POOL_BY_DIFFICULTY = {
    "easy":   [],
    "medium": ["missing_due_date"],
    "hard":   ["missing_invoice_number", "missing_due_date", "missing_cif_supplier",
               "wrong_iva_math", "negative_quantity"],
    "cursed": ["missing_invoice_number", "missing_due_date", "missing_cif_supplier",
               "missing_date", "wrong_iva_math", "line_total_wrong",
               "negative_quantity", "missing_total"],
}

# Max degradations per difficulty
MAX_DEGRADATIONS = {"easy": 1, "medium": 3, "hard": 5, "cursed": 8}
MAX_MUTATIONS    = {"easy": 0, "medium": 1, "hard": 3, "cursed": 4}


@dataclass
class GenerationConfig:
    count: int = 10
    doc_types: list[str] = field(default_factory=lambda: ["factura", "albaran"])
    difficulty: str = "mixed"
    template_whitelist: list[str] = field(default_factory=list)
    inject_tags: list[str] = field(default_factory=list)
    exclude_tags: list[str] = field(default_factory=list)
    output_formats: list[str] = field(default_factory=lambda: ["pdf"])
    output_dir: str = "./output"
    seed: int = 42
    workers: int = 1
    image_dpi: int = 200


DIFFICULTY_WEIGHTS = {"easy": 0.20, "medium": 0.40, "hard": 0.30, "cursed": 0.10}


def sample_difficulty(rng: random.Random) -> str:
    choices = list(DIFFICULTY_WEIGHTS.keys())
    weights = list(DIFFICULTY_WEIGHTS.values())
    return rng.choices(choices, weights=weights, k=1)[0]


def select_degradations(rng: random.Random, difficulty: str, inject: list[str], exclude: list[str]) -> list[str]:
    pool = [t for t in DEGRADATION_POOL_BY_DIFFICULTY.get(difficulty, []) if t not in exclude]
    max_n = MAX_DEGRADATIONS.get(difficulty, 0)
    selected = rng.sample(pool, min(max_n, len(pool))) if pool else []
    # Forced injections (--inject)
    for tag in inject:
        if tag not in exclude and tag not in selected:
            selected.append(tag)
    return selected


def select_mutations(rng: random.Random, difficulty: str, inject: list[str], exclude: list[str]) -> list[str]:
    pool = [t for t in MUTATION_POOL_BY_DIFFICULTY.get(difficulty, []) if t not in exclude]
    max_n = MAX_MUTATIONS.get(difficulty, 0)
    selected = rng.sample(pool, min(max_n, len(pool))) if pool else []
    for tag in inject:
        if tag not in exclude and tag not in selected:
            if tag in MUTATION_POOL_BY_DIFFICULTY.get("cursed", []):
                selected.append(tag)
    return selected
