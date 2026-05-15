"""PDF → PIL Image conversion using pymupdf."""

from __future__ import annotations
from PIL import Image
import io

try:
    import fitz  # pymupdf
    _FITZ_AVAILABLE = True
except ImportError:
    _FITZ_AVAILABLE = False


def pdf_to_image(pdf_bytes: bytes, page_index: int = 0, dpi: int = 200) -> Image.Image:
    """Rasterise a single PDF page to a PIL Image."""
    if not _FITZ_AVAILABLE:
        raise RuntimeError("pymupdf is not installed. Run: pip install pymupdf")
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    page = doc[page_index]
    mat = fitz.Matrix(dpi / 72, dpi / 72)
    pix = page.get_pixmap(matrix=mat, alpha=False)
    img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
    doc.close()
    return img


def image_to_jpeg(img: Image.Image, quality: int = 85) -> bytes:
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=quality, optimize=True)
    return buf.getvalue()


def count_pages(pdf_bytes: bytes) -> int:
    if not _FITZ_AVAILABLE:
        raise RuntimeError("pymupdf is not installed.")
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    n = len(doc)
    doc.close()
    return n
