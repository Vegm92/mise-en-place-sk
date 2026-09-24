"""Score product-match suggestions with Laya and compare against the stored baseline score.

Each golden row is a (raw invoice line, suggested product) pair plus the user's verdict.
Laya answers one yes/no (noul) question per pair; its p(yes) is compared with the score
the production matcher (Gemini or fuzzy) attached to the same suggestion.
"""

from __future__ import annotations

import argparse
import difflib
import json
import sys
import time
from collections.abc import Callable, Sequence
from pathlib import Path

LLM_MATCH_THRESHOLD = 0.8
BASE_DIR = Path(__file__).resolve().parent

QUESTION = {
    "same_product": {
        "type": "noul",
        "instructions": (
            "¿La línea de factura se refiere al mismo producto que el producto existente? "
            "Ten en cuenta abreviaturas, jerga y códigos de artículo del sector alimentario "
            'español (p.ej. "MERL." = merluza, "TERN." = ternera, "S/H" = sin hueso).'
        ),
    }
}

Scorer = Callable[[Sequence[dict]], list[float]]


def confined(path: Path | str) -> Path:
    resolved = (BASE_DIR / path).resolve()
    if not resolved.is_relative_to(BASE_DIR):
        raise ValueError(f"{path} is outside {BASE_DIR}")
    return resolved


def load_rows(path: Path | str) -> list[dict]:
    rows = []
    for line in confined(path).read_text(encoding="utf-8").splitlines():
        if line.strip():
            rows.append(json.loads(line))
    return rows


def pair_state(row: dict) -> dict:
    return {"linea_factura": row["description"], "producto_existente": row["candidate_name"]}


def stub_scorer(rows: Sequence[dict]) -> list[float]:
    return [
        difflib.SequenceMatcher(None, r["description"].lower(), r["candidate_name"].lower()).ratio()
        for r in rows
    ]


def laya_scorer(subfolder: str, device: str | None, batch_size: int) -> Scorer:
    import laya

    agent = laya.load("convaiinnovations/laya", subfolder=subfolder or None, device=device)

    def score(rows: Sequence[dict]) -> list[float]:
        results = agent.predict_batch(
            [pair_state(r) for r in rows], QUESTION, batch_size=batch_size, lang="es"
        )
        return [float(res["answers"]["same_product"]["noul"]) for res in results]

    return score


def auc(scores: Sequence[float], labels: Sequence[int]) -> float | None:
    pos = [s for s, y in zip(scores, labels) if y == 1]
    neg = [s for s, y in zip(scores, labels) if y == 0]
    if not pos or not neg:
        return None
    wins = sum(((p > n) - (p < n) + 1) / 2 for p in pos for n in neg)
    return wins / (len(pos) * len(neg))


def ece(scores: Sequence[float], labels: Sequence[int], bins: int = 10) -> float:
    total = len(scores)
    buckets: list[list[int]] = [[] for _ in range(bins)]
    for i, s in enumerate(scores):
        buckets[min(int(s * bins), bins - 1)].append(i)
    err = 0.0
    for idx in buckets:
        if idx:
            conf = sum(scores[i] for i in idx) / len(idx)
            acc = sum(labels[i] for i in idx) / len(idx)
            err += len(idx) / total * abs(conf - acc)
    return err


def brier(scores: Sequence[float], labels: Sequence[int]) -> float:
    return sum((s - y) ** 2 for s, y in zip(scores, labels)) / len(scores)


def gate_stats(scores: Sequence[float], labels: Sequence[int], threshold: float) -> dict:
    shown = [y for s, y in zip(scores, labels) if s >= threshold]
    positives = sum(labels)
    negatives = len(labels) - positives
    kept_pos = sum(shown)
    kept_neg = len(shown) - kept_pos
    return {
        "shown": len(shown),
        "precision": kept_pos / len(shown) if shown else None,
        "accepted_kept": kept_pos / positives if positives else None,
        "rejected_suppressed": 1 - kept_neg / negatives if negatives else None,
    }


def summarize(scores: Sequence[float], labels: Sequence[int], threshold: float) -> dict:
    return {
        "auc": auc(scores, labels),
        "ece": ece(scores, labels),
        "brier": brier(scores, labels),
        **gate_stats(scores, labels, threshold),
    }


def build_report(rows: Sequence[dict], candidate: Sequence[float], threshold: float) -> dict:
    report: dict = {"threshold": threshold, "groups": {}}
    groups = {"all": list(range(len(rows)))}
    for i, r in enumerate(rows):
        groups.setdefault(r["source"], []).append(i)
    for name, idx in groups.items():
        labels = [int(rows[i]["label"]) for i in idx]
        report["groups"][name] = {
            "n": len(idx),
            "accepted": sum(labels),
            "baseline": summarize([rows[i]["baseline_score"] for i in idx], labels, threshold),
            "candidate": summarize([candidate[i] for i in idx], labels, threshold),
        }
    return report


def fmt(v: float | int | None) -> str:
    if v is None:
        return "-"
    return f"{v:.3f}" if isinstance(v, float) else str(v)


def print_report(report: dict, candidate_name: str) -> None:
    cols = ["auc", "ece", "brier", "shown", "precision", "accepted_kept", "rejected_suppressed"]
    print(f"threshold={report['threshold']}  candidate={candidate_name}")
    print(f"{'group':<8}{'scorer':<11}{'n':>5}{'acc':>5}" + "".join(f"{c:>20}" for c in cols))
    for name, g in report["groups"].items():
        for scorer in ("baseline", "candidate"):
            m = g[scorer]
            print(
                f"{name:<8}{scorer:<11}{g['n']:>5}{g['accepted']:>5}"
                + "".join(f"{fmt(m[c]):>20}" for c in cols)
            )


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("golden", help="JSONL from export_golden.sql, relative to this folder")
    parser.add_argument("--stub", action="store_true", help="string-similarity scorer, no model")
    parser.add_argument("--subfolder", default="multilingual", help="'' for the English root")
    parser.add_argument("--device", default=None, help="cpu | cuda | mps (auto if unset)")
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--threshold", type=float, default=LLM_MATCH_THRESHOLD)
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--out", default=None, help="report path, relative to this folder")
    args = parser.parse_args(argv)

    rows = load_rows(args.golden)[: args.limit]
    if not rows:
        print("golden set is empty", file=sys.stderr)
        return 1

    if args.stub:
        scorer, name = stub_scorer, "stub-difflib"
    else:
        scorer = laya_scorer(args.subfolder, args.device, args.batch_size)
        name = f"laya/{args.subfolder or 'root'}"

    started = time.perf_counter()
    scores = scorer(rows)
    elapsed = time.perf_counter() - started

    report = build_report(rows, scores, args.threshold)
    report["candidate"] = name
    report["ms_per_pair"] = round(elapsed * 1000 / len(rows), 2)
    print_report(report, name)
    print(f"latency: {report['ms_per_pair']} ms/pair over {len(rows)} pairs")

    if args.out:
        out = confined(args.out)
        out.parent.mkdir(parents=True, exist_ok=True)
        per_row = [
            {"notification_id": r["notification_id"], "label": r["label"],
             "baseline": r["baseline_score"], "candidate": s}
            for r, s in zip(rows, scores)
        ]
        out.write_text(
            json.dumps({"report": report, "rows": per_row}, ensure_ascii=False, indent=1),
            encoding="utf-8",
        )
        print(f"wrote {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
