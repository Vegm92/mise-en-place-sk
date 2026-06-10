"""CLI entry point for the synthetic invoice generator."""

from __future__ import annotations
import json
import sys
from pathlib import Path

import click
from rich.console import Console
from rich.table import Table
from rich.progress import track

from synth.config import GenerationConfig, TEMPLATES, DEGRADATION_POOL_BY_DIFFICULTY, MUTATION_POOL_BY_DIFFICULTY
from synth.schema.validate import validate_dict

console = Console()

ALL_KNOWN_TAGS = (
    set().union(*DEGRADATION_POOL_BY_DIFFICULTY.values())
    | set().union(*MUTATION_POOL_BY_DIFFICULTY.values())
)


def _parse_tags(value: str) -> list[str]:
    return [t.strip() for t in value.split(",") if t.strip()] if value else []


@click.group()
def main():
    """Synthetic Spanish invoice/albarán generator for mise-en-place benchmarking."""


@main.command()
@click.option("--count", default=10, show_default=True, help="Number of documents to generate")
@click.option("--type", "doc_types", default="factura,albaran", show_default=True,
              help="Document types: factura, albaran, or both comma-separated")
@click.option("--difficulty", default="mixed", show_default=True,
              type=click.Choice(["easy", "medium", "hard", "cursed", "mixed"]),
              help="Difficulty preset")
@click.option("--template", "template_whitelist", default="", help="Comma-separated template whitelist")
@click.option("--inject", default="", help="Comma-separated degradation/mutation tags to force on every doc")
@click.option("--exclude", default="", help="Comma-separated tags to never apply")
@click.option("--formats", default="pdf,jpg", show_default=True,
              help="Output formats: pdf, jpg, or both comma-separated")
@click.option("--output", default="./output", show_default=True, help="Output directory")
@click.option("--seed", default=42, show_default=True, help="Random seed for reproducibility")
@click.option("--workers", default=1, show_default=True, help="Parallel workers (not yet implemented)")
@click.option("--image-dpi", default=200, show_default=True, help="DPI for JPEG rasterisation")
def generate(count, doc_types, difficulty, template_whitelist, inject, exclude, formats, output, seed, workers, image_dpi):
    """Generate synthetic invoice/albarán documents with paired ground-truth JSON."""
    from synth.engine import generate_batch

    inject_tags = _parse_tags(inject)
    exclude_tags = _parse_tags(exclude)

    # Validate tags
    unknown = set(inject_tags + exclude_tags) - ALL_KNOWN_TAGS - set(TEMPLATES.keys())
    if unknown:
        console.print(f"[red]Unknown tags: {', '.join(unknown)}[/red]")
        console.print(f"[dim]Known tags: {', '.join(sorted(ALL_KNOWN_TAGS))}[/dim]")
        sys.exit(2)

    cfg = GenerationConfig(
        count=count,
        doc_types=_parse_tags(doc_types) or ["factura", "albaran"],
        difficulty=difficulty,
        template_whitelist=_parse_tags(template_whitelist),
        inject_tags=inject_tags,
        exclude_tags=exclude_tags,
        output_formats=_parse_tags(formats) or ["pdf", "jpg"],
        output_dir=output,
        seed=seed,
        workers=workers,
        image_dpi=image_dpi,
    )

    console.print(f"[bold]Generating {count} documents[/bold] → [cyan]{output}[/cyan]")
    console.print(f"Difficulty: [yellow]{difficulty}[/yellow]  Seed: {seed}")

    manifest = generate_batch(cfg)

    errors = [e for e in manifest if "error" in e]
    console.print(f"\n[green]✓ Generated {len(manifest) - len(errors)} documents[/green]", end="")
    if errors:
        console.print(f" [red]({len(errors)} errors)[/red]")
    else:
        console.print()

    console.print(f"Manifest: [dim]{output}/_manifest.json[/dim]")


@main.command("validate-output")
@click.argument("directory", type=click.Path(exists=True))
def validate_output(directory):
    """Validate all ground-truth JSON files in a generation output directory."""
    out_dir = Path(directory)
    json_files = sorted(out_dir.glob("*.json"))
    json_files = [f for f in json_files if f.name != "_manifest.json"]

    if not json_files:
        console.print("[yellow]No JSON files found.[/yellow]")
        return

    errors = []
    for f in track(json_files, description="Validating..."):
        data = json.loads(f.read_text(encoding="utf-8"))
        try:
            validate_dict(data)
        except Exception as e:
            errors.append((f.name, str(e)))

    if errors:
        console.print(f"\n[red]✗ {len(errors)} validation error(s):[/red]")
        for fname, msg in errors:
            console.print(f"  [red]{fname}[/red]: {msg}")
        sys.exit(1)
    else:
        console.print(f"[green]✓ All {len(json_files)} files valid.[/green]")


@main.command()
@click.argument("directory", type=click.Path(exists=True))
def stats(directory):
    """Print distribution statistics for a generation run."""
    manifest_path = Path(directory) / "_manifest.json"
    if not manifest_path.exists():
        console.print("[red]No _manifest.json found. Run generate first.[/red]")
        return

    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    entries = [e for e in manifest if "error" not in e]

    table = Table(title="Generation Run Statistics")
    table.add_column("Metric")
    table.add_column("Value", style="cyan")

    total = len(entries)
    facturas = sum(1 for e in entries if e.get("doc_type") == "factura")
    albaranes = sum(1 for e in entries if e.get("doc_type") == "albaran")
    difficulties = {}
    all_degs: dict[str, int] = {}
    all_muts: dict[str, int] = {}

    for e in entries:
        d = e.get("difficulty", "?")
        difficulties[d] = difficulties.get(d, 0) + 1
        for tag in e.get("degradations", []):
            all_degs[tag] = all_degs.get(tag, 0) + 1
        for tag in e.get("mutations", []):
            all_muts[tag] = all_muts.get(tag, 0) + 1

    table.add_row("Total documents", str(total))
    table.add_row("Facturas", str(facturas))
    table.add_row("Albaranes", str(albaranes))
    for d, n in sorted(difficulties.items()):
        table.add_row(f"Difficulty: {d}", str(n))
    for tag, n in sorted(all_degs.items(), key=lambda x: -x[1])[:10]:
        table.add_row(f"Deg: {tag}", str(n))
    for tag, n in sorted(all_muts.items(), key=lambda x: -x[1]):
        table.add_row(f"Mut: {tag}", str(n))

    console.print(table)


@main.command()
@click.argument("input_dir", type=click.Path(exists=True))
@click.option("--backend", default="gemini", type=click.Choice(["gemini", "claude", "both"]))
@click.option("--limit", default=0, help="Max documents to benchmark (0 = all)")
@click.option("--report", default="", help="Output report path (markdown)")
@click.option("--threshold", default=0.80, show_default=True,
              help="Minimum totals field-accuracy (0.0–1.0) required to pass CI gate")
def bench(input_dir, backend, limit, report, threshold):
    """Benchmark extraction accuracy against generated documents.

    Exits with code 1 if total_amount accuracy falls below --threshold.
    """
    from synth.bench.score import run_benchmark
    run_benchmark(input_dir, backend=backend, limit=limit or None,
                  report_path=report or None, threshold=threshold)


if __name__ == "__main__":
    main()
