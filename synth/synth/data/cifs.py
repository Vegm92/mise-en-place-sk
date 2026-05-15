"""Synthetic CIF/NIF generator — never produces real registered Spanish tax IDs.

Uses the 'X', 'Y', 'Z' provisional NIF series (used for foreigners) and
unassigned CIF letter series to guarantee we never collide with real companies.
The check digit is intentionally incorrect by default to make it obvious these
are synthetic.
"""

from __future__ import annotations
import random

# CIF type letters: J = sociedad civil, X = unassigned (safe synthetic prefix)
# We use letters that are NOT assigned to real entity types in current AEAT rules.
_SAFE_CIF_LETTERS = ["X", "Y", "Z"]  # X/Y/Z: provisional foreigner NIFs — clearly synthetic

# Provinces 01–52 (real range), but we cap at 52
_PROVINCES = [f"{n:02d}" for n in range(1, 53)]


def fake_cif(rng: random.Random, *, valid_checksum: bool = False) -> str:
    """
    Generate a synthetic CIF string.
    Format: Letter + 7 digits + control char
    Using X/Y/Z prefix makes it clearly non-real.
    """
    letter = rng.choice(_SAFE_CIF_LETTERS)
    digits = "".join(str(rng.randint(0, 9)) for _ in range(7))
    if valid_checksum:
        control = _cif_control(letter, digits)
    else:
        # Intentionally wrong — synthetic marker
        control = str(rng.randint(0, 9))
    return f"{letter}{digits}{control}"


def fake_nif_autonomo(rng: random.Random) -> str:
    """Autónomo NIF: 8 digits + letter (DNI format)."""
    number = rng.randint(10_000_000, 99_999_999)
    letters = "TRWAGMYFPDXBNJZSQVHLCKE"
    letter = letters[number % 23]
    return f"{number}{letter}"


def _cif_control(letter: str, digits: str) -> str:
    """Compute the CIF control digit (for valid_checksum=True path only)."""
    odd_sum = sum(int(digits[i]) for i in range(0, 7, 2))
    even_sum = 0
    for i in range(1, 7, 2):
        d = int(digits[i]) * 2
        even_sum += d if d < 10 else d - 9
    total = odd_sum + even_sum
    control_digit = (10 - (total % 10)) % 10
    # Letter-based entities use a letter control char
    if letter in "ABCDEFGHJUV":
        return "JABCDEFGHI"[control_digit]
    return str(control_digit)
