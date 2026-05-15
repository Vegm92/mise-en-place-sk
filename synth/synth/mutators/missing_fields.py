"""Pre-render mutators that drop specific fields from the spec and align ground truth."""

from __future__ import annotations
import random


def drop_invoice_number(spec, gt, rng: random.Random) -> tuple:
    """Remove invoice number from both the rendered document and ground truth."""
    spec.invoice_number = ""
    gt.invoice_number = None
    gt._meta.missing.append("invoice_number")
    gt._meta.mutations.append("missing_invoice_number")
    return spec, gt


def drop_due_date(spec, gt, rng: random.Random) -> tuple:
    spec.due_date = None
    gt.due_date = None
    gt._meta.missing.append("due_date")
    gt._meta.mutations.append("missing_due_date")
    return spec, gt


def drop_supplier_cif(spec, gt, rng: random.Random) -> tuple:
    """Render supplier block without CIF (field missing from document)."""
    spec.supplier.cif = ""
    gt._meta.missing.append("supplier_cif")
    gt._meta.mutations.append("missing_cif_supplier")
    return spec, gt


def drop_total(spec, gt, rng: random.Random) -> tuple:
    """For albaranes — mark as no-total delivery note."""
    gt.total_amount = None
    gt._meta.missing.append("total")
    gt._meta.mutations.append("missing_total")
    return spec, gt


def drop_date(spec, gt, rng: random.Random) -> tuple:
    spec.invoice_date = ""
    gt.invoice_date = None
    gt._meta.missing.append("invoice_date")
    gt._meta.mutations.append("missing_date")
    return spec, gt


def add_negative_line(spec, gt, rng: random.Random) -> tuple:
    """Add a product return line (negative quantity)."""
    if spec.items:
        return_item = dict(spec.items[0])
        return_item["quantity"] = -abs(return_item["quantity"])
        return_item["total_price"] = round(return_item["unit_price"] * return_item["quantity"], 2)
        spec.items.append(return_item)
        from synth.schema.ground_truth import LineItem
        gt.line_items.append(LineItem(
            description=return_item["description"],
            quantity=return_item["quantity"],
            unit=return_item["unit"],
            unit_price=return_item["unit_price"],
            total_price=return_item["total_price"],
        ))
        gt._meta.mutations.append("negative_quantity")
    return spec, gt


MUTATOR_MAP = {
    "missing_invoice_number": drop_invoice_number,
    "missing_due_date":       drop_due_date,
    "missing_cif_supplier":   drop_supplier_cif,
    "missing_total":          drop_total,
    "missing_date":           drop_date,
    "negative_quantity":      add_negative_line,
}
