"""Factura (invoice) document generator."""

from __future__ import annotations
import random
from dataclasses import dataclass, field
from datetime import date, timedelta

from synth.data.suppliers import SupplierProfile, random_supplier
from synth.data.products import sample_basket
from synth.data.cifs import fake_cif
from synth.data.addresses import fake_address
from synth.generators.totals import compute_totals, Totals
from synth.schema.ground_truth import GroundTruth, GroundTruthMeta, LineItem


@dataclass
class FacturaSpec:
    supplier: SupplierProfile
    buyer_name: str
    buyer_cif: str
    buyer_address: dict
    invoice_number: str
    invoice_date: str          # YYYY-MM-DD
    due_date: str | None       # YYYY-MM-DD
    items: list[dict]
    totals: Totals
    currency: str = "EUR"
    notes: str = ""
    watermark: str | None = None


_RESTAURANT_NAMES = [
    "Bar Restaurant La Taula", "Restaurante El Racó", "Bistró de la Rambla",
    "Can Pepe Restauració", "El Forn de la Vila", "Hostal del Mercat",
    "La Cuina de Sempre", "Taberna del Gat", "Restaurant Maresme",
    "Gastropub dels Arcs", "Bar Melón", "La Bodegueta Nova",
    "Cafeteria Central", "Cervecería del Port", "Marisquería El Mar",
]

_NOTE_TEMPLATES = [
    "", "", "",  # most have no notes
    "Pago a 30 días",
    "Forma de pago: transferencia bancaria",
    "Ref. pedido: PED-{n}",
    "Condiciones: pago a 15 días fecha factura",
]


def _random_invoice_number(rng: random.Random) -> str:
    year = 2025 + rng.randint(0, 1)
    seq = rng.randint(1, 9999)
    prefix = rng.choice(["F", "FAC", "FV", "A"])
    return f"{prefix}{year}-{seq:04d}"


def make_factura(
    rng: random.Random,
    supplier: SupplierProfile | None = None,
    seed: int = 0,
    difficulty: str = "easy",
    error_mode: str = "strict",
) -> tuple[FacturaSpec, GroundTruth]:
    if supplier is None:
        supplier = random_supplier(rng)

    n_items = rng.randint(3, 12) if difficulty in ("hard", "cursed") else rng.randint(2, 8)
    mix_iva = supplier.mixed_iva or difficulty in ("medium", "hard", "cursed")
    items = sample_basket(rng, n=n_items, category=supplier.category, mix_iva=mix_iva)

    totals = compute_totals(items, mode=error_mode, rng=rng)  # type: ignore[arg-type]

    inv_date = date.today() - timedelta(days=rng.randint(1, 60))
    due_offset = rng.choice([0, 15, 30, 60])
    due = (inv_date + timedelta(days=due_offset)) if due_offset else None

    buyer_name = rng.choice(_RESTAURANT_NAMES)
    buyer_cif = fake_cif(rng)
    buyer_addr = fake_address(rng)
    inv_number = _random_invoice_number(rng)
    note_tmpl = rng.choice(_NOTE_TEMPLATES)
    note = note_tmpl.format(n=rng.randint(100, 9999)) if "{n}" in note_tmpl else note_tmpl

    spec = FacturaSpec(
        supplier=supplier,
        buyer_name=buyer_name,
        buyer_cif=buyer_cif,
        buyer_address=buyer_addr,
        invoice_number=inv_number,
        invoice_date=inv_date.strftime("%Y-%m-%d"),
        due_date=due.strftime("%Y-%m-%d") if due else None,
        items=items,
        totals=totals,
        notes=note,
    )

    meta = GroundTruthMeta(
        seed=seed,
        doc_type="factura",
        template="",  # filled by caller
        difficulty=difficulty,
        supplier_cif=supplier.cif,
        iva_breakdown=[
            {"rate": b.rate, "base": b.base, "cuota": b.cuota}
            for b in totals.iva_breakdown
        ],
        mutations=[totals.error_type] if totals.error_type else [],
    )

    gt = GroundTruth(
        supplier_name=supplier.name,
        invoice_number=inv_number,
        invoice_date=inv_date.strftime("%Y-%m-%d"),
        due_date=due.strftime("%Y-%m-%d") if due else None,
        total_amount=totals.displayed_grand_total,
        currency="EUR",
        confidence=1.0,
        line_items=[
            LineItem(
                description=it["description"],
                quantity=it["quantity"],
                unit=it["unit"],
                unit_price=it["unit_price"],
                total_price=it["total_price"],
            )
            for it in items
        ],
        _meta=meta,
    )

    return spec, gt
