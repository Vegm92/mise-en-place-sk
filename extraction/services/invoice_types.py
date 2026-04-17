from __future__ import annotations
from dataclasses import dataclass, field
from enum import Enum
from typing import Literal


class FileType(Enum):
    TEXT_PDF    = "text_pdf"
    SCANNED_PDF = "scanned_pdf"
    IMAGE       = "image"
    # Future variants: EMAIL, HTML, CSV


class UnsupportedFileTypeError(ValueError):
    """Raised by classify() for unrecognised file extensions."""


class MissingTransformerError(NotImplementedError):
    """Raised by transform() when no transformer is registered for a FileType."""


@dataclass
class InvoiceFile:
    path: str
    ext: str  # bare, no dot — e.g. "pdf", "png"


@dataclass
class AgentInput:
    mode: Literal["text", "image"]
    text: str | None = None
    image_data: str | None = None  # base64; required when mode="image"
    media_type: str | None = None  # MIME; required when mode="image"

    def __post_init__(self):
        if self.mode == "image":
            if self.image_data is None:
                raise ValueError("image_data required when mode='image'")
            if self.media_type is None:
                raise ValueError("media_type required when mode='image'")


@dataclass
class ValidationResult:
    valid: bool
    errors: list[str] = field(default_factory=list)
