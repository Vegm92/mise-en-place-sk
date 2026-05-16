"""Canonical Spanish restaurant supplier units and their colloquial variants."""

from __future__ import annotations
import random

CANONICAL_UNITS = [
    "ud", "kg", "g", "L", "ml",
    "caja", "garrafa", "botella", "pack", "bandeja",
    "saco", "palé", "docena", "bulto",
]

# Variants per canonical unit — used by unit_quirks mutator and data generation
UNIT_VARIANTS: dict[str, list[str]] = {
    "ud":      ["ud", "ud.", "Ud", "UD", "unidad", "unidades", "und", "u."],
    "kg":      ["kg", "Kg", "KG", "kg.", "kilo", "kilos", "kgs", "k.g."],
    "g":       ["g", "gr", "grs", "gramos"],
    "L":       ["L", "l", "lt", "lts", "litro", "litros", "Lts"],
    "ml":      ["ml", "ML", "mL", "mililitro", "mililitros"],
    "caja":    ["caja", "Caja", "CAJA", "cjx", "cj", "cajas"],
    "garrafa": ["garrafa", "Garrafa", "grfa", "gfa"],
    "botella": ["botella", "Botella", "bot", "bote", "btl"],
    "pack":    ["pack", "Pack", "PACK", "pk", "pck"],
    "bandeja": ["bandeja", "Bandeja", "bdj", "bdja"],
    "saco":    ["saco", "Saco", "sc"],
    "palé":    ["palé", "pale", "Palé", "palet", "plt"],
    "docena":  ["docena", "Docena", "doc", "dna", "dzn"],
    "bulto":   ["bulto", "Bulto", "bto", "blto"],
}


def random_unit(rng: random.Random, canonical: str | None = None) -> str:
    """Return a random colloquial variant for the given canonical unit (or any unit)."""
    if canonical is None:
        canonical = rng.choice(CANONICAL_UNITS)
    variants = UNIT_VARIANTS.get(canonical, [canonical])
    return rng.choice(variants)


def canonical_for(variant: str) -> str:
    """Best-effort reverse lookup — returns the variant itself if not found."""
    v = variant.lower().rstrip(".")
    for canon, variants in UNIT_VARIANTS.items():
        if v in [x.lower().rstrip(".") for x in variants]:
            return canon
    return variant
