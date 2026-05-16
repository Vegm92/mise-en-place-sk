"""Verify that generated CIFs never match real Spanish CIF formats in unintended ways."""

import random
import pytest
from synth.data.cifs import fake_cif, fake_nif_autonomo

# CIF letter series assigned to real entity types (we must NOT use these as prefixes)
REAL_CIF_LETTERS = set("ABCDEFGHJNPQRSUVW")
# Our safe series
SAFE_CIF_LETTERS = set("XYZ")


def test_fake_cif_uses_safe_letter_series():
    rng = random.Random(0)
    for _ in range(200):
        cif = fake_cif(rng)
        assert cif[0] in SAFE_CIF_LETTERS, f"CIF {cif!r} uses reserved letter {cif[0]!r}"


def test_fake_cif_length():
    rng = random.Random(1)
    for _ in range(100):
        cif = fake_cif(rng)
        assert len(cif) == 9, f"CIF {cif!r} should be 9 chars"


def test_fake_nif_autonomo_format():
    rng = random.Random(2)
    for _ in range(100):
        nif = fake_nif_autonomo(rng)
        assert len(nif) == 9, f"NIF {nif!r} should be 9 chars"
        assert nif[:8].isdigit(), f"NIF {nif!r}: first 8 chars should be digits"
        assert nif[-1].isalpha(), f"NIF {nif!r}: last char should be a letter"


def test_no_real_cif_checksum_by_default():
    """Default mode should NOT produce a valid CIF checksum (synthetic marker)."""
    from synth.data.cifs import _cif_control
    rng = random.Random(3)
    wrong_count = 0
    for _ in range(100):
        cif = fake_cif(rng, valid_checksum=False)
        expected = _cif_control(cif[0], cif[1:8])
        if cif[-1] != expected:
            wrong_count += 1
    # At least 80% should have wrong checksums (statistically, ~90% since random)
    assert wrong_count >= 80, f"Only {wrong_count}/100 had wrong checksums"
