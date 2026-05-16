"""Synthetic Spanish address components."""

from __future__ import annotations
import random

PROVINCES = [
    ("Barcelona", "08"),
    ("Madrid", "28"),
    ("Valencia", "46"),
    ("Sevilla", "41"),
    ("Zaragoza", "50"),
    ("Málaga", "29"),
    ("Murcia", "30"),
    ("Bilbao", "48"),
    ("Alicante", "03"),
    ("Córdoba", "14"),
    ("Tarragona", "43"),
    ("Girona", "17"),
    ("Lleida", "25"),
    ("Palma", "07"),
]

STREET_TYPES = ["Calle", "Avda.", "Passeig", "Carrer", "Plaza", "Polígono Industrial"]

STREET_NAMES = [
    "de la Industria", "del Comercio", "Gran Vía", "de Catalunya",
    "del Mediterráneo", "de Aragón", "de la República", "dels Tallers",
    "de Provença", "del Consell de Cent", "de Mallorca", "de Valencia",
    "Mayor", "de la Constitución", "dels Àngels", "de la Mercè",
]


def fake_address(rng: random.Random) -> dict:
    province_name, province_code = rng.choice(PROVINCES)
    street_type = rng.choice(STREET_TYPES)
    street_name = rng.choice(STREET_NAMES)
    number = rng.randint(1, 200)
    cp = f"{province_code}{rng.randint(0, 999):03d}"
    return {
        "street": f"{street_type} {street_name}, {number}",
        "city": province_name,
        "province": province_name,
        "postal_code": cp,
        "country": "España",
    }
