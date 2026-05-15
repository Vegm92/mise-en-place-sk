"""Semantic math error mutators — ground truth records displayed values."""

from __future__ import annotations
import random


def apply_wrong_iva_sum(spec, gt, rng: random.Random) -> tuple:
    """Offset the displayed grand total by a small random amount."""
    error = round(rng.uniform(0.02, 8.00), 2)
    direction = rng.choice([-1, 1])
    spec.totals.displayed_grand_total = round(
        spec.totals.displayed_grand_total + direction * error, 2
    )
    # Ground truth stores what's DISPLAYED — extractor will see the wrong number
    gt.total_amount = spec.totals.displayed_grand_total
    gt._meta.mutations.append("wrong_iva_math")
    return spec, gt


def apply_wrong_line_total(spec, gt, rng: random.Random) -> tuple:
    """Make one line item's displayed total not match qty × unit_price."""
    if not spec.items:
        return spec, gt
    idx = rng.randint(0, len(spec.items) - 1)
    error = round(rng.uniform(0.01, 2.00), 2)
    spec.items[idx]["total_price"] = round(
        spec.items[idx]["total_price"] + rng.choice([-1, 1]) * error, 2
    )
    # Ground truth reflects displayed value
    gt.line_items[idx].total_price = spec.items[idx]["total_price"]
    gt._meta.mutations.append("line_total_wrong")
    return spec, gt


MUTATOR_MAP = {
    "wrong_iva_math":    apply_wrong_iva_sum,
    "line_total_wrong":  apply_wrong_line_total,
}
