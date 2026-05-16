"""Ground-truth data model — mirrors ExtractedInvoice from src/lib/server/extract.ts.

The top-level fields match exactly. The _meta block is additive and stripped
before any comparison with extractor output.
"""

from __future__ import annotations
from dataclasses import dataclass, field, asdict
from typing import Any


@dataclass
class LineItem:
    description: str
    quantity: float | None
    unit: str | None
    unit_price: float | None
    total_price: float | None


@dataclass
class GroundTruthMeta:
    seed: int
    doc_type: str           # "factura" | "albaran"
    template: str
    difficulty: str
    degradations: list[str] = field(default_factory=list)
    mutations: list[str] = field(default_factory=list)
    missing: list[str] = field(default_factory=list)
    supplier_cif: str | None = None
    iva_breakdown: list[dict] = field(default_factory=list)
    rendered_pdf_pages: int = 1
    synth_version: str = "0.1.0"


@dataclass
class GroundTruth:
    supplier_name: str | None
    invoice_number: str | None
    invoice_date: str | None       # YYYY-MM-DD or None
    due_date: str | None           # YYYY-MM-DD or None
    total_amount: float | None
    currency: str                  # always "EUR" unless mutated
    confidence: float              # always 1.0 (truth, not prediction)
    line_items: list[LineItem]
    _meta: GroundTruthMeta

    def to_dict(self) -> dict[str, Any]:
        d = {
            "supplier_name": self.supplier_name,
            "invoice_number": self.invoice_number,
            "invoice_date": self.invoice_date,
            "due_date": self.due_date,
            "total_amount": self.total_amount,
            "currency": self.currency,
            "confidence": self.confidence,
            "line_items": [
                {
                    "description": li.description,
                    "quantity": li.quantity,
                    "unit": li.unit,
                    "unit_price": li.unit_price,
                    "total_price": li.total_price,
                }
                for li in self.line_items
            ],
            "_meta": {
                "synth_version": self._meta.synth_version,
                "seed": self._meta.seed,
                "doc_type": self._meta.doc_type,
                "template": self._meta.template,
                "difficulty": self._meta.difficulty,
                "supplier_cif": self._meta.supplier_cif,
                "iva_breakdown": self._meta.iva_breakdown,
                "degradations": self._meta.degradations,
                "mutations": self._meta.mutations,
                "missing": self._meta.missing,
                "rendered_pdf_pages": self._meta.rendered_pdf_pages,
            },
        }
        return d

    def to_extracted_dict(self) -> dict[str, Any]:
        """Returns dict without _meta, matching ExtractedInvoice shape exactly."""
        d = self.to_dict()
        d.pop("_meta", None)
        return d
