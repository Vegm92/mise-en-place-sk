"""Field-level scoring for extraction accuracy benchmarking."""

from __future__ import annotations
import json
import subprocess
import sys
from pathlib import Path
from dataclasses import dataclass, field


@dataclass
class ScoreCard:
    doc_name: str
    difficulty: str
    degradations: list[str]
    mutations: list[str]
    # Per-field: True = exact match, False = mismatch, None = both null
    supplier_name: bool | None = None
    invoice_number: bool | None = None
    invoice_date: bool | None = None
    due_date: bool | None = None
    total_amount_ok: bool | None = None   # within €0.01
    line_item_f1: float = 0.0
    extractor_confidence: float = 0.0
    error: str | None = None


def _amount_match(a, b, tol=0.01) -> bool | None:
    if a is None and b is None:
        return None
    if a is None or b is None:
        return False
    return abs(a - b) <= tol


def _str_match(a: str | None, b: str | None) -> bool | None:
    if not a and not b:
        return None
    if not a or not b:
        return False
    return a.strip().lower() == b.strip().lower()


def _line_item_f1(pred_items: list[dict], truth_items: list[dict]) -> float:
    """Simple F1 on line-item description exact matches (no Hungarian for now)."""
    if not truth_items and not pred_items:
        return 1.0
    if not truth_items or not pred_items:
        return 0.0

    truth_descs = [it.get("description", "").lower().strip() for it in truth_items]
    pred_descs  = [it.get("description", "").lower().strip() for it in pred_items]

    tp = sum(1 for d in pred_descs if d in truth_descs)
    precision = tp / len(pred_descs) if pred_descs else 0
    recall    = tp / len(truth_descs) if truth_descs else 0
    if precision + recall == 0:
        return 0.0
    return 2 * precision * recall / (precision + recall)


def run_gemini(file_path: str) -> dict | None:
    """Call the Node extract_runner shim to invoke real production extractInvoice()."""
    runner = Path(__file__).parent / "extract_runner.mjs"
    repo_root = Path(__file__).parent.parent.parent.parent
    try:
        result = subprocess.run(
            ["npx", "tsx", str(runner), file_path],
            capture_output=True, text=True, timeout=60,
            cwd=str(repo_root),
        )
        if result.returncode != 0:
            return None
        return json.loads(result.stdout)
    except Exception:
        return None


def run_claude(file_path: str, claude_url: str = "http://localhost:8001/extract") -> dict | None:
    """POST to the existing Python FastAPI extraction service."""
    try:
        import httpx
        with open(file_path, "rb") as f:
            ext = Path(file_path).suffix.lower()
            mime = "application/pdf" if ext == ".pdf" else "image/jpeg"
            resp = httpx.post(claude_url, files={"file": (Path(file_path).name, f, mime)}, timeout=90)
        if resp.status_code != 200:
            return None
        return resp.json()
    except Exception:
        return None


def score_pair(doc_path: str, gt: dict, backend: str) -> ScoreCard:
    difficulty = gt.get("_meta", {}).get("difficulty", "?")
    degs       = gt.get("_meta", {}).get("degradations", [])
    muts       = gt.get("_meta", {}).get("mutations", [])
    card = ScoreCard(doc_name=Path(doc_path).stem, difficulty=difficulty,
                     degradations=degs, mutations=muts)

    if backend == "gemini":
        pred = run_gemini(doc_path)
    else:
        pred = run_claude(doc_path)

    if pred is None:
        card.error = "extractor returned None"
        return card

    card.extractor_confidence = pred.get("confidence", 0.0)
    card.supplier_name    = _str_match(pred.get("supplier_name"), gt.get("supplier_name"))
    card.invoice_number   = _str_match(pred.get("invoice_number"), gt.get("invoice_number"))
    card.invoice_date     = _str_match(pred.get("invoice_date"), gt.get("invoice_date"))
    card.due_date         = _str_match(pred.get("due_date"), gt.get("due_date"))
    card.total_amount_ok  = _amount_match(pred.get("total_amount"), gt.get("total_amount"))
    card.line_item_f1     = _line_item_f1(pred.get("line_items", []), gt.get("line_items", []))
    return card


FIELD_ACCURACY_THRESHOLD = 0.80  # published target: totals ≥ 80% or CI fails


def run_benchmark(input_dir: str, backend: str = "gemini", limit: int | None = None,
                  report_path: str | None = None, threshold: float = FIELD_ACCURACY_THRESHOLD):
    from rich.console import Console
    from rich.table import Table

    console = Console()
    out_dir = Path(input_dir)

    # Find all doc+json pairs
    pairs = []
    for json_file in sorted(out_dir.glob("*.json")):
        if json_file.stem == "_manifest":
            continue
        for ext in (".pdf", ".jpg"):
            doc_file = out_dir / (json_file.stem + ext)
            if doc_file.exists():
                pairs.append((str(doc_file), str(json_file)))
                break

    if limit:
        pairs = pairs[:limit]

    console.print(f"[bold]Benchmarking {len(pairs)} documents[/bold] with [cyan]{backend}[/cyan]")

    cards: list[ScoreCard] = []
    for doc_path, json_path in pairs:
        gt = json.loads(Path(json_path).read_text(encoding="utf-8"))
        card = score_pair(doc_path, gt, backend=backend)
        cards.append(card)
        status = "✓" if not card.error else "✗"
        console.print(f"  {status} {card.doc_name} ({card.difficulty}) conf={card.extractor_confidence:.2f} f1={card.line_item_f1:.2f}")

    # Summary table
    difficulties = sorted(set(c.difficulty for c in cards))
    table = Table(title="Benchmark Results by Difficulty")
    table.add_column("Metric")
    for d in difficulties:
        table.add_column(d, style="cyan")
    table.add_column("Overall", style="bold")

    def pct(cards, field):
        vals = [getattr(c, field) for c in cards if getattr(c, field) is not None and not c.error]
        if not vals:
            return "N/A"
        return f"{sum(vals)/len(vals)*100:.0f}%"

    def avg(cards, field):
        vals = [getattr(c, field) for c in cards if not c.error]
        if not vals:
            return "N/A"
        return f"{sum(vals)/len(vals):.2f}"

    metrics = [
        ("supplier_name exact", "supplier_name"),
        ("invoice_date exact",  "invoice_date"),
        ("total_amount ±€0.01", "total_amount_ok"),
        ("line_item F1",        "line_item_f1"),
        ("mean confidence",     "extractor_confidence"),
    ]

    for label, field in metrics:
        row = [label]
        for d in difficulties:
            dc = [c for c in cards if c.difficulty == d]
            row.append(pct(dc, field) if field != "line_item_f1" and field != "extractor_confidence"
                       else avg(dc, field))
        row.append(pct(cards, field) if field not in ("line_item_f1", "extractor_confidence")
                   else avg(cards, field))
        table.add_row(*row)

    console.print(table)

    # Gate: compute totals accuracy and fail CI if below threshold
    amount_vals = [c.total_amount_ok for c in cards if c.total_amount_ok is not None and not c.error]
    amount_accuracy = sum(amount_vals) / len(amount_vals) if amount_vals else 0.0

    console.print(f"\n[bold]Totals accuracy:[/bold] {amount_accuracy * 100:.0f}%  "
                  f"(threshold: {threshold * 100:.0f}%)")

    if report_path:
        Path(report_path).write_text(
            f"# Benchmark Report\n\nBackend: {backend}\nDocuments: {len(pairs)}\n"
            f"Totals accuracy: {amount_accuracy * 100:.0f}% (threshold {threshold * 100:.0f}%)\n\n"
            + "(Rich table — see terminal output)\n",
            encoding="utf-8"
        )
        console.print(f"[dim]Report written to {report_path}[/dim]")

    if amount_accuracy < threshold:
        console.print(
            f"[bold red]✗ GATE FAILED: totals accuracy {amount_accuracy * 100:.0f}% "
            f"< required {threshold * 100:.0f}%[/bold red]"
        )
        sys.exit(1)
    else:
        console.print(
            f"[bold green]✓ Gate passed: totals accuracy {amount_accuracy * 100:.0f}% "
            f"≥ {threshold * 100:.0f}%[/bold green]"
        )
