"""JSON schema validator for ground-truth output.

Validates that a ground-truth dict (with _meta stripped) conforms to
the ExtractedInvoice shape from src/lib/server/extract.ts.
"""

from __future__ import annotations
import jsonschema

EXTRACTED_INVOICE_SCHEMA = {
    "type": "object",
    "required": ["supplier_name", "invoice_number", "invoice_date", "due_date",
                 "total_amount", "currency", "confidence", "line_items"],
    "additionalProperties": False,
    "properties": {
        "supplier_name": {"type": ["string", "null"]},
        "invoice_number": {"type": ["string", "null"]},
        "invoice_date":   {"type": ["string", "null"]},
        "due_date":       {"type": ["string", "null"]},
        "total_amount":   {"type": ["number", "null"]},
        "currency":       {"type": ["string", "null"]},
        "confidence":     {"type": "number", "minimum": 0.0, "maximum": 1.0},
        "line_items": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["description", "quantity", "unit", "unit_price", "total_price"],
                "additionalProperties": False,
                "properties": {
                    "description": {"type": "string"},
                    "quantity":    {"type": ["number", "null"]},
                    "unit":        {"type": ["string", "null"]},
                    "unit_price":  {"type": ["number", "null"]},
                    "total_price": {"type": ["number", "null"]},
                },
            },
        },
    },
}


def validate_dict(d: dict) -> None:
    """Raise jsonschema.ValidationError if d doesn't match ExtractedInvoice schema."""
    stripped = {k: v for k, v in d.items() if k != "_meta"}
    jsonschema.validate(stripped, EXTRACTED_INVOICE_SCHEMA)
