"""
Invoice processing pipeline — stateless extraction only.
Public surface: run(file_path) -> tuple[dict, ValidationResult]
               run_group(file_paths) -> tuple[dict, ValidationResult]
No database access. No unit bridge. Those run in the SvelteKit app.
"""
from __future__ import annotations
from pathlib import Path
from typing import Callable

import pdfplumber

from agents.invoice_agent import call_with_text, call_with_image, call_with_images_multi
from services.invoice_types import (
    InvoiceFile, AgentInput, ValidationResult, FileType,
    UnsupportedFileTypeError, MissingTransformerError,
)
from services.invoice_transformers import (
    _transform_text_pdf, _transform_scanned_pdf, _transform_image,
)


def _extract_pdf_text(path: str) -> str:
    with pdfplumber.open(path) as pdf:
        return "\n".join(page.extract_text() or "" for page in pdf.pages).strip()


def classify(file: InvoiceFile) -> FileType:
    if file.ext == "pdf":
        text = _extract_pdf_text(file.path)
        return FileType.TEXT_PDF if len(text) >= 50 else FileType.SCANNED_PDF
    if file.ext in {"jpg", "jpeg", "png", "webp"}:
        return FileType.IMAGE
    raise UnsupportedFileTypeError(f"Unsupported file type: .{file.ext}")


TRANSFORMERS: dict[FileType, Callable[[InvoiceFile], AgentInput]] = {
    FileType.TEXT_PDF:    _transform_text_pdf,
    FileType.SCANNED_PDF: _transform_scanned_pdf,
    FileType.IMAGE:       _transform_image,
}


def transform(file: InvoiceFile, file_type: FileType) -> AgentInput:
    transformer = TRANSFORMERS.get(file_type)
    if transformer is None:
        raise MissingTransformerError(f"No transformer registered for {file_type}")
    return transformer(file)


def extract(agent_input: AgentInput) -> dict:
    if agent_input.mode == "text":
        return call_with_text(agent_input.text)
    if agent_input.mode == "image":
        return call_with_image(agent_input.image_data, agent_input.media_type)
    raise ValueError(f"Unrecognised AgentInput mode: {agent_input.mode!r}")


def validate_structure(data: dict) -> ValidationResult:
    errors: list[str] = []
    required = ("supplier_name", "total_amount", "line_items", "confidence")
    for key in required:
        if key not in data:
            errors.append(f"missing required key: {key!r}")
    if "line_items" in data and not isinstance(data["line_items"], list):
        errors.append("line_items must be a list")
    if "confidence" in data:
        conf = data["confidence"]
        if not isinstance(conf, (int, float)):
            errors.append("confidence must be a number")
        elif not (0.0 <= conf <= 1.0):
            errors.append(f"confidence out of range [0, 1]: {conf}")
    return ValidationResult(valid=len(errors) == 0, errors=errors)


def _file_to_image(file: InvoiceFile) -> tuple[str, str]:
    file_type = classify(file)
    if file_type == FileType.IMAGE:
        inp = _transform_image(file)
    else:
        inp = _transform_scanned_pdf(file)
    return inp.image_data, inp.media_type


def run_group(file_paths: list[Path]) -> tuple[dict, ValidationResult]:
    if len(file_paths) == 1:
        return run(file_paths[0])
    images = []
    for path in file_paths:
        file = InvoiceFile(path=str(path), ext=path.suffix.lstrip(".").lower())
        images.append(_file_to_image(file))
    data = call_with_images_multi(images)
    return data, validate_structure(data)


def run(file_path: str | Path) -> tuple[dict, ValidationResult]:
    p = Path(file_path)
    file = InvoiceFile(path=str(p), ext=p.suffix.lstrip("."))
    file_type = classify(file)
    agent_input = transform(file, file_type)
    data = extract(agent_input)
    return data, validate_structure(data)
