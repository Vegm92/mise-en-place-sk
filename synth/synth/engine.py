"""Core generation engine: orchestrates spec → HTML → PDF → degradation → output."""

from __future__ import annotations
import json
import os
import random
from pathlib import Path

from jinja2 import Environment, FileSystemLoader

from synth.config import (
    TEMPLATES, FACTURA_TEMPLATES, ALBARAN_TEMPLATES,
    GenerationConfig, sample_difficulty,
    select_degradations, select_mutations,
)
from synth.generators.factura import make_factura
from synth.generators.albaran import make_albaran
from synth.render.html_to_pdf import render_pdf
from synth.render.pdf_to_image import pdf_to_image, image_to_jpeg, count_pages
from synth.schema.validate import validate_dict
from synth.mutators.missing_fields import MUTATOR_MAP as MISSING_MAP
from synth.mutators.wrong_math import MUTATOR_MAP as MATH_MAP
from synth.mutators.weird_formats import format_date, format_money, DATE_STYLES, DECIMAL_STYLES, CURRENCY_STYLES

# All mutator maps merged
ALL_MUTATORS = {**MISSING_MAP, **MATH_MAP}

TEMPLATES_DIR = Path(__file__).parent / "templates"
CSS_DIR = TEMPLATES_DIR / "static" / "css"


def _build_jinja_env() -> Environment:
    env = Environment(loader=FileSystemLoader(str(TEMPLATES_DIR)), autoescape=False)
    return env


def _get_degradation_class(tag: str):
    """Lazy import degradation class by tag name."""
    from synth.degradation.scan import ALL_SCAN_DEGRADATIONS
    from synth.degradation.physical import ALL_PHYSICAL_DEGRADATIONS
    from synth.degradation.printer import ALL_PRINTER_DEGRADATIONS
    from synth.degradation.watermark import ALL_WATERMARK_DEGRADATIONS
    from synth.degradation.camera import ALL_CAMERA_DEGRADATIONS

    all_degs = {
        **ALL_SCAN_DEGRADATIONS,
        **ALL_PHYSICAL_DEGRADATIONS,
        **ALL_PRINTER_DEGRADATIONS,
        **ALL_WATERMARK_DEGRADATIONS,
        **ALL_CAMERA_DEGRADATIONS,
    }
    return all_degs.get(tag)


def generate_one(
    idx: int,
    cfg: GenerationConfig,
    rng: random.Random,
) -> dict:
    """Generate a single document pair (PDF/JPG + JSON). Returns manifest entry."""
    doc_seed = rng.randint(0, 2**31)
    doc_rng = random.Random(doc_seed)

    difficulty = cfg.difficulty if cfg.difficulty != "mixed" else sample_difficulty(doc_rng)

    # Choose doc type and template
    allowed_types = cfg.doc_types
    doc_type = doc_rng.choice(allowed_types)

    if cfg.template_whitelist:
        candidates = [t for t in cfg.template_whitelist if TEMPLATES.get(t, {}).get("doc_type") == doc_type]
    else:
        candidates = FACTURA_TEMPLATES if doc_type == "factura" else ALBARAN_TEMPLATES
    template_name = doc_rng.choice(candidates) if candidates else (
        doc_rng.choice(FACTURA_TEMPLATES) if doc_type == "factura" else doc_rng.choice(ALBARAN_TEMPLATES)
    )

    template_meta = TEMPLATES[template_name]
    css_name = template_meta["css"]

    # Select degradations and mutations
    deg_tags = select_degradations(doc_rng, difficulty, cfg.inject_tags, cfg.exclude_tags)
    mut_tags = select_mutations(doc_rng, difficulty, cfg.inject_tags, cfg.exclude_tags)

    # Build spec and ground truth
    date_style = doc_rng.choice(DATE_STYLES) if difficulty in ("medium", "hard", "cursed") else "dmy_slash"
    decimal_style = doc_rng.choice(DECIMAL_STYLES) if difficulty in ("hard", "cursed") else "es_standard"
    currency_style = doc_rng.choice(CURRENCY_STYLES) if difficulty in ("hard", "cursed") else "euro_after"

    error_mode = "strict"
    if "wrong_iva_math" in mut_tags:
        error_mode = "wrong_iva_sum"

    if doc_type == "factura":
        spec, gt = make_factura(doc_rng, seed=doc_seed, difficulty=difficulty, error_mode=error_mode)
    else:
        spec, gt = make_albaran(doc_rng, seed=doc_seed, difficulty=difficulty)

    gt._meta.template = template_name
    gt._meta.degradations = deg_tags
    gt._meta.difficulty = difficulty

    # Apply mutations (pre-render, semantic edits)
    for mut in mut_tags:
        if mut in ALL_MUTATORS and mut != "wrong_iva_math":  # wrong_iva handled via error_mode
            spec, gt = ALL_MUTATORS[mut](spec, gt, doc_rng)

    # Render Jinja2 template
    jinja_env = _build_jinja_env()
    template = jinja_env.get_template(f"{template_name}.html.j2")

    def _fmt_date(d): return format_date(d, date_style)
    def _fmt_money(v): return format_money(v, decimal_style, currency_style) if v is not None else ""
    def _fmt_qty(q): return f"{q:g}" if q is not None else ""
    def _fmt_pct(r): return f"{int(r * 100)}%"

    cif_label_variants = {"es": "CIF/NIF", "cat": "NIF"}
    cif_label = doc_rng.choice(list(cif_label_variants.values()))
    currency_symbol = {"euro_before": "€", "euro_after": "€", "eur_code": "EUR", "no_symbol": ""}[currency_style]

    html = template.render(
        spec=spec,
        css_path=str(CSS_DIR),
        date_format=_fmt_date,
        format_money=_fmt_money,
        format_qty=_fmt_qty,
        format_pct=_fmt_pct,
        cif_label=cif_label,
        currency_symbol=currency_symbol,
        watermark=getattr(spec, "watermark", None),
    )

    # Render PDF
    pdf_bytes = render_pdf(html, base_url=str(TEMPLATES_DIR) + "/")
    page_count = count_pages(pdf_bytes)
    gt._meta.rendered_pdf_pages = page_count

    # Determine output basename
    prefix = f"{doc_type}_{idx:04d}"
    out_dir = Path(cfg.output_dir)

    manifest_entry: dict = {
        "basename": prefix,
        "seed": doc_seed,
        "doc_type": doc_type,
        "template": template_name,
        "difficulty": difficulty,
        "degradations": deg_tags,
        "mutations": gt._meta.mutations,
        "formats": [],
    }

    # Save PDF
    if "pdf" in cfg.output_formats or not deg_tags:
        pdf_path = out_dir / f"{prefix}.pdf"
        pdf_path.write_bytes(pdf_bytes)
        manifest_entry["formats"].append("pdf")

    # Produce JPEG with degradations
    if "jpg" in cfg.output_formats or deg_tags:
        from synth.degradation.pipeline import Pipeline
        img = pdf_to_image(pdf_bytes, dpi=cfg.image_dpi)

        # Build degradation pipeline
        degs = []
        for tag in deg_tags:
            cls = _get_degradation_class(tag)
            if cls:
                degs.append(cls())

        if degs:
            pipeline = Pipeline(degs)
            img = pipeline.apply(img, doc_rng)

        jpg_bytes = image_to_jpeg(img, quality=85 if difficulty == "easy" else 75)
        jpg_path = out_dir / f"{prefix}.jpg"
        jpg_path.write_bytes(jpg_bytes)
        manifest_entry["formats"].append("jpg")

    # Validate and save ground truth JSON
    gt_dict = gt.to_dict()
    validate_dict(gt_dict)
    json_path = out_dir / f"{prefix}.json"
    json_path.write_text(json.dumps(gt_dict, ensure_ascii=False, indent=2), encoding="utf-8")

    return manifest_entry


def generate_batch(cfg: GenerationConfig) -> list[dict]:
    """Generate cfg.count documents and write _manifest.json."""
    out_dir = Path(cfg.output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    rng = random.Random(cfg.seed)
    manifest = []

    for i in range(1, cfg.count + 1):
        try:
            entry = generate_one(i, cfg, rng)
            manifest.append(entry)
        except Exception as e:
            manifest.append({"basename": f"error_{i:04d}", "error": str(e)})

    manifest_path = out_dir / "_manifest.json"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")

    return manifest
