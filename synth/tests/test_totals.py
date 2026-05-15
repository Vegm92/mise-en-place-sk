"""Tests for IVA-aware total calculator."""

import random
import pytest
from synth.generators.totals import compute_totals


_ITEMS = [
    {"description": "Aceite oliva", "quantity": 2, "unit": "garrafa",
     "unit_price": 30.0, "total_price": 60.0, "iva_rate": 0.10},
    {"description": "Vino tinto", "quantity": 6, "unit": "botella",
     "unit_price": 8.0, "total_price": 48.0, "iva_rate": 0.21},
    {"description": "Pan de molde", "quantity": 4, "unit": "ud",
     "unit_price": 1.50, "total_price": 6.0, "iva_rate": 0.04},
]


def test_strict_mode_grand_total():
    t = compute_totals(_ITEMS, mode="strict")
    expected_base = 60 + 48 + 6
    expected_iva = round(60 * 0.10 + 48 * 0.21 + 6 * 0.04, 2)
    assert abs(t.grand_total - (expected_base + expected_iva)) < 0.01
    assert t.displayed_grand_total == t.grand_total
    assert t.error_type is None


def test_wrong_iva_sum_differs():
    rng = random.Random(1)
    t = compute_totals(_ITEMS, mode="wrong_iva_sum", rng=rng)
    assert t.displayed_grand_total != t.grand_total
    assert t.error_type == "wrong_iva_sum"


def test_rounding_error_small():
    rng = random.Random(2)
    t = compute_totals(_ITEMS, mode="rounding_error", rng=rng)
    assert abs(t.displayed_grand_total - t.grand_total) <= 0.01
    assert t.error_type == "rounding_error"


def test_iva_breakdown_has_three_rates():
    t = compute_totals(_ITEMS, mode="strict")
    rates = {b.rate for b in t.iva_breakdown}
    assert rates == {0.04, 0.10, 0.21}


def test_single_rate_items():
    items = [{"description": "A", "quantity": 1, "unit": "kg",
              "unit_price": 10.0, "total_price": 10.0, "iva_rate": 0.10}]
    t = compute_totals(items)
    assert len(t.iva_breakdown) == 1
    assert t.iva_breakdown[0].rate == 0.10
    assert abs(t.grand_total - 11.0) < 0.01
