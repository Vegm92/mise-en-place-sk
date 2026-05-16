"""IVA-aware total calculator.

Supports strict mode (correct math) and error modes for corner-case testing.
"""

from __future__ import annotations
import random
from dataclasses import dataclass
from typing import Literal


@dataclass
class IvaBreakdown:
    rate: float
    base: float
    cuota: float


@dataclass
class Totals:
    iva_breakdown: list[IvaBreakdown]
    base_total: float
    iva_total: float
    grand_total: float
    # Displayed values (may differ from computed in error modes)
    displayed_grand_total: float
    error_type: str | None = None


def compute_totals(
    items: list[dict],
    mode: Literal["strict", "wrong_iva_sum", "wrong_line_total", "rounding_error"] = "strict",
    rng: random.Random | None = None,
) -> Totals:
    """
    Compute IVA breakdown from a list of line items.
    Each item must have: total_price (float), iva_rate (float).
    """
    by_rate: dict[float, float] = {}
    for item in items:
        rate = item.get("iva_rate", 0.10)
        by_rate.setdefault(rate, 0.0)
        by_rate[rate] += item["total_price"]

    breakdown = []
    base_total = 0.0
    iva_total = 0.0
    for rate, base in sorted(by_rate.items()):
        base = round(base, 2)
        cuota = round(base * rate, 2)
        breakdown.append(IvaBreakdown(rate=rate, base=base, cuota=cuota))
        base_total += base
        iva_total += cuota

    base_total = round(base_total, 2)
    iva_total = round(iva_total, 2)
    grand_total = round(base_total + iva_total, 2)

    displayed = grand_total
    error_type = None

    if mode == "wrong_iva_sum" and rng is not None:
        # Off by a random amount between 0.01 and 5.00
        error = round(rng.uniform(0.01, 5.00), 2)
        displayed = round(grand_total + rng.choice([-1, 1]) * error, 2)
        error_type = "wrong_iva_sum"
    elif mode == "rounding_error" and rng is not None:
        displayed = round(grand_total + rng.choice([-0.01, 0.01]), 2)
        error_type = "rounding_error"

    return Totals(
        iva_breakdown=breakdown,
        base_total=base_total,
        iva_total=iva_total,
        grand_total=grand_total,
        displayed_grand_total=displayed,
        error_type=error_type,
    )
