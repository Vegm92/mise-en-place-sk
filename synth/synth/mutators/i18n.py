"""Catalan/Galician label substitutions for Spanish invoice templates."""

from __future__ import annotations
import random

CATALAN_LABELS = {
    "Factura":        "Factura",        # same word
    "Albarán":        "Albarà",
    "Albarán de Entrega": "Albarà de Lliurament",
    "Fecha emisión":  "Data d'emissió",
    "Fecha":          "Data",
    "Vencimiento":    "Venciment",
    "Cliente":        "Client",
    "Descripción":    "Descripció",
    "Cantidad":       "Quantitat",
    "Importe":        "Import",
    "Total":          "Total",
    "Base imponible": "Base imposable",
    "Cuota IVA":      "Quota IVA",
    "Proveedor":      "Proveïdor",
}

GALICIAN_LABELS = {
    "Fecha emisión":  "Data de emisión",
    "Fecha":          "Data",
    "Cliente":        "Cliente",
    "Descripción":    "Descrición",
    "Cantidad":       "Cantidade",
    "Importe":        "Importe",
    "Total":          "Total",
    "Albarán":        "Albará",
}


def get_label_map(lang: str) -> dict[str, str]:
    if lang == "ca":
        return CATALAN_LABELS
    elif lang == "gl":
        return GALICIAN_LABELS
    return {}
