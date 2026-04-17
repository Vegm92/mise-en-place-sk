"""
Invoice file transformers — one function per FileType.
Each returns an AgentInput ready for the LLM extractor.
"""
from __future__ import annotations
import base64

import fitz  # pymupdf
import pdfplumber

from services.invoice_types import InvoiceFile, AgentInput

_MEDIA_TYPES: dict[str, str] = {
    "jpg":  "image/jpeg",
    "jpeg": "image/jpeg",
    "png":  "image/png",
    "webp": "image/webp",
}


def _transform_text_pdf(file: InvoiceFile) -> AgentInput:
    with pdfplumber.open(file.path) as pdf:
        text = "\n".join(page.extract_text() or "" for page in pdf.pages).strip()
    return AgentInput(mode="text", text=text)


def _transform_scanned_pdf(file: InvoiceFile) -> AgentInput:
    # Render only page 0 (first page) at 200 DPI — invoice totals/supplier appear there.
    doc = fitz.open(file.path)
    page = doc[0]
    mat = fitz.Matrix(200 / 72, 200 / 72)  # 72 dpi base → scale to 200 dpi
    pix = page.get_pixmap(matrix=mat)
    png_bytes = pix.tobytes("png")
    image_data = base64.standard_b64encode(png_bytes).decode("utf-8")
    return AgentInput(mode="image", image_data=image_data, media_type="image/png")


def _transform_image(file: InvoiceFile) -> AgentInput:
    media_type = _MEDIA_TYPES.get(file.ext, "image/jpeg")
    with open(file.path, "rb") as f:
        image_data = base64.standard_b64encode(f.read()).decode("utf-8")
    return AgentInput(mode="image", image_data=image_data, media_type=media_type)
