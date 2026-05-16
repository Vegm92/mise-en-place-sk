"""Verify that generated ground-truth dicts pass schema validation."""

import random
import pytest
from synth.generators.factura import make_factura
from synth.generators.albaran import make_albaran
from synth.schema.validate import validate_dict


def test_factura_roundtrip():
    rng = random.Random(42)
    spec, gt = make_factura(rng, seed=42)
    gt_dict = gt.to_dict()
    validate_dict(gt_dict)


def test_albaran_roundtrip():
    rng = random.Random(99)
    spec, gt = make_albaran(rng, seed=99)
    gt_dict = gt.to_dict()
    validate_dict(gt_dict)


def test_extracted_dict_no_meta():
    rng = random.Random(7)
    _, gt = make_factura(rng, seed=7)
    d = gt.to_extracted_dict()
    assert "_meta" not in d
    validate_dict(d)


def test_multiple_difficulties():
    for diff in ("easy", "medium", "hard", "cursed"):
        rng = random.Random(hash(diff))
        _, gt = make_factura(rng, seed=0, difficulty=diff)
        validate_dict(gt.to_dict())


def test_albaran_null_total():
    rng = random.Random(55)
    for _ in range(10):
        _, gt = make_albaran(rng, seed=0, difficulty="hard")
        gt_dict = gt.to_dict()
        validate_dict(gt_dict)
        # total_amount may be null — schema must allow it
        assert gt_dict["total_amount"] is None or isinstance(gt_dict["total_amount"], (int, float))
