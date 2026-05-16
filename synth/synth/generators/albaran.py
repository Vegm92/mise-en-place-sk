"""Albarán (delivery note) document generator.

Albaranes differ from facturas: they may omit totals, IVA breakdown, due dates,
and formal invoice numbers. They use an albarán number (nº albarán) instead.
"""

from __future__ import annotations
import random
from dataclasses import dataclass
from datetime import date, timedelta

from synth.data.suppliers import SupplierProfile, random_supplier
from synth.data.products import sample_basket
from synth.data.cifs import fake_cif
from synth.data.addresses import fake_address
from synth.schema.ground_truth import GroundTruth, GroundTruthMeta, LineItem


@dataclass
class AlbaranSpec:
    supplier: SupplierProfile
    buyer_name: str
    albaran_number: str
    delivery_date: str      # YYYY-MM-DD
    items: list[dict]
    has_prices: bool        # False = no unit_price / total on document
    has_total: bool         # False = delivery note without grand total
    notes: str = ""


_RESTAURANT_NAMES = [
    "Bar Restaurant La Taula", "Restaurante El Racó", "Bistró de la Rambla",
    "Can Pepe Restauració", "El Forn de la Vila", "Hostal del Mercat",
    "La Cuina de Sempre", "Taberna del Gat", "Restaurant Maresme",
    "Gastropub dels Arcs", "Bar Melón", "La Bodegueta Nova",
]


def _random_albaran_number(rng: random.Random) -> str:
    seq = rng.randint(1, 99999)
    prefix = rng.choice(["ALB", "A", "DEL", "ENT"])
    year = 2025 + rng.randint(0, 1)
    return f"{prefix}-{year}-{seq:05d}"


def make_albaran(
    rng: random.Random,
    supplier: SupplierProfile | None = None,
    seed: int = 0,
    difficulty: str = "easy",
) -> tuple[AlbaranSpec, GroundTruth]:
    if supplier is None:
        supplier = random_supplier(rng)

    n_items = rng.randint(4, 18) if difficulty in ("hard", "cursed") else rng.randint(2, 10)
    items = sample_basket(rng, n=n_items, category=supplier.category, mix_iva=False)

    delivery_date = date.today() - timedelta(days=rng.randint(0, 30))
    albaran_number = _random_albaran_number(rng)
    buyer_name = rng.choice(_RESTAURANT_NAMES)

    # Hard/cursed: sometimes no prices on the albarán at all
    has_prices = not (difficulty in ("hard", "cursed") and rng.random() < 0.4)
    has_total = has_prices and rng.random() > 0.3  # even with prices, total optional

    if not has_prices:
        for it in items:
            it["unit_price"] = None
            it["total_price"] = None

    spec = AlbaranSpec(
        supplier=supplier,
        buyer_name=buyer_name,
        albaran_number=albaran_number,
        delivery_date=delivery_date.strftime("%Y-%m-%d"),
        items=items,
        has_prices=has_prices,
        has_total=has_total,
    )

    total_amount = (
        round(sum(it["total_price"] for it in items if it.get("total_price")), 2)
        if has_total else None
    )

    meta = GroundTruthMeta(
        seed=seed,
        doc_type="albaran",
        template="",  # filled by caller
        difficulty=difficulty,
        supplier_cif=supplier.cif,
        iva_breakdown=[],   # albaranes don't break down IVA
    )

    gt = GroundTruth(
        supplier_name=supplier.name,
        invoice_number=albaran_number,   # albarán number used as invoice_number
        invoice_date=delivery_date.strftime("%Y-%m-%d"),
        due_date=None,
        total_amount=total_amount,
        currency="EUR",
        confidence=1.0,
        line_items=[
            LineItem(
                description=it["description"],
                quantity=it["quantity"],
                unit=it["unit"],
                unit_price=it.get("unit_price"),
                total_price=it.get("total_price"),
            )
            for it in items
        ],
        _meta=meta,
    )

    return spec, gt
