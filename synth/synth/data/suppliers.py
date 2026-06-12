"""Fake Spanish restaurant supplier profiles.

All names are composed synthetic names — no real company data.
IVA rate priors reflect the supplier's main product category.
"""

from __future__ import annotations
import random
from dataclasses import dataclass, field
from synth.data.cifs import fake_cif, fake_nif_autonomo
from synth.data.addresses import fake_address

@dataclass
class SupplierProfile:
    name: str
    category: str
    cif: str
    address: dict
    phone: str
    email: str
    iva_rate_prior: float  # primary IVA rate (0.04 / 0.10 / 0.21)
    mixed_iva: bool        # True if supplier sells across multiple IVA rates
    is_autonomo: bool      # True = individual supplier with NIF


_ADJECTIVES = [
    "Del Sur", "Del Norte", "Catalán", "Mediterráneo", "Fresco", "Natural",
    "Premium", "Selecto", "Artesano", "Ecológico", "Local", "Ibérico",
    "Del Maresme", "Del Penedès", "De La Ribera", "De L'Empordà",
]

_COMMODITIES = {
    "frutas_verduras":  ("Frutas y Verduras",   0.10, False),
    "carnes":           ("Carnes y Derivados",   0.10, False),
    "pescados":         ("Pescados y Mariscos",  0.10, False),
    "lacteos":          ("Lácteos",              0.10, False),
    "aceites":          ("Aceites y Conservas",  0.10, True),
    "bebidas_alcoholicas": ("Bebidas",           0.21, True),
    "panaderia":        ("Panadería y Bollería", 0.04, True),
    "especias":         ("Especias y Condimentos", 0.10, False),
    "limpieza":         ("Productos de Limpieza", 0.21, False),
    "congelados":       ("Congelados",           0.10, False),
    "embutidos":        ("Embutidos y Charcutería", 0.10, False),
    "vinos":            ("Vinos y Cavas",        0.21, False),
    "cafe":             ("Café y Bebidas Calientes", 0.21, True),
}

_LEGAL_FORMS = ["S.L.", "S.A.", "S.C.P.", "S.L.U.", "Coop."]


def _fake_phone(rng: random.Random) -> str:
    prefix = rng.choice(["93", "91", "96", "95", "94", "971"])
    return f"+34 {prefix} {rng.randint(100,999)} {rng.randint(10,99)} {rng.randint(10,99)}"


def _fake_email(name: str) -> str:
    slug = name.lower().split()[0].replace(".", "").replace(",", "")
    return f"facturacion@{slug}.es"


def random_supplier(rng: random.Random) -> SupplierProfile:
    cat_key = rng.choice(list(_COMMODITIES.keys()))
    cat_name, iva_rate, mixed = _COMMODITIES[cat_key]
    adj = rng.choice(_ADJECTIVES)
    is_autonomo = rng.random() < 0.15  # 15% autónomos

    if is_autonomo:
        first_names = ["Antonio", "María", "Juan", "Carles", "Francesc", "Montserrat", "Jordi", "Ana"]
        last_names = ["García", "Martínez", "López", "Puig", "Roca", "Ferrer", "Mas", "Costa"]
        name = f"{rng.choice(first_names)} {rng.choice(last_names)} {rng.choice(last_names)}"
        cif = fake_nif_autonomo(rng)
    else:
        commodity_word = cat_name.split()[0]
        legal = rng.choice(_LEGAL_FORMS)
        name = f"{commodity_word} {adj} {legal}"
        cif = fake_cif(rng)

    return SupplierProfile(
        name=name,
        category=cat_name,  # display name — must match VALID_CATEGORIES (constants.ts)
        cif=cif,
        address=fake_address(rng),
        phone=_fake_phone(rng),
        email=_fake_email(name),
        iva_rate_prior=iva_rate,
        mixed_iva=mixed,
        is_autonomo=is_autonomo,
    )
