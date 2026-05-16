"""WeasyPrint HTML → PDF renderer."""

from __future__ import annotations
import os
from pathlib import Path

try:
    from weasyprint import HTML, CSS
    _WEASYPRINT_AVAILABLE = True
except ImportError:
    _WEASYPRINT_AVAILABLE = False


def render_pdf(html_content: str, base_url: str | None = None) -> bytes:
    """Render HTML string to PDF bytes using WeasyPrint."""
    if not _WEASYPRINT_AVAILABLE:
        raise RuntimeError(
            "WeasyPrint is not installed. Run: pip install weasyprint\n"
            "Also install system deps: libpango libcairo libharfbuzz"
        )
    doc = HTML(string=html_content, base_url=base_url)
    return doc.write_pdf()
