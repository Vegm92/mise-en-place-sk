# Laya eval: product matching

Offline experiment: would [Laya](https://github.com/NandhaKishorM/laya) (open-source, Jev-compatible
typed-decision model) make better product-match decisions than what production does today?

**Isolated by design.** Nothing here is imported by the app, the worker, CI, knip, svelte-check or
vitest (they only scan `src/` and `scripts/*.mjs`). Deleting this folder is a full rollback.

## What it measures

Production (`processNormalizeJob`, `src/lib/server/products.ts`) asks Gemini to pick a match and
shows a suggestion when its self-reported confidence is `>= 0.8`. Users then accept or reject it.

This harness takes every **decided** suggestion, asks Laya one yes/no question per pair
("is this invoice line the same product as this existing product?"), and compares Laya's `p(yes)`
with the score the suggestion was shown with.

| Metric | Meaning |
|---|---|
| `auc` | Separates accepted from rejected pairs (0.5 = coin flip) |
| `ece` | Calibration error: does 0.8 mean right ~80% of the time? Lower is better |
| `brier` | Overall probability error. Lower is better |
| `precision` | Of pairs at or above the threshold, share users accepted |
| `accepted_kept` | Share of accepted suggestions still shown at the threshold |
| `rejected_suppressed` | Share of rejected suggestions the threshold would have hidden |

Groups: `llm` (Gemini suggestions), `fuzzy` (trigram suggestions: their score is a similarity, not a
probability, so read only `auc` for them), and `all`.

## Known limits of the golden set

- **Truncated.** Only suggestions that cleared the production threshold were ever shown, so every
  `llm` baseline score is `>= 0.8`. This can measure false positives, not missed matches (recall).
- **Label source.** Accept and reject both set the notification to `status='sent'`, so the label is
  read from the alias the user settled on (`product_aliases.product_id` vs the suggested product).
  Fuzzy payloads have no `candidateProductId`, so they're labeled by candidate name. A product
  renamed after the decision shows up as a false reject.
- Categorization is not covered: `products.category` has no user-vs-model provenance to label from.

## Run it

```bash
cd experiments/laya-eval
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt

# 1. Harness self-check (no model, no DB)
python -m unittest -v
python eval_match.py fixtures/synthetic.jsonl --stub

# 2. Export the golden set (read-only transaction; use a replica or a restored dump if you have one)
mkdir -p data
psql "$DATABASE_URL" -qAt -f export_golden.sql > data/golden.jsonl

# 3. Real run (first run downloads the checkpoint from huggingface.co)
python eval_match.py data/golden.jsonl --device cpu --out report-multilingual.json
python eval_match.py data/golden.jsonl --device cpu --subfolder '' --out report-english.json
```

`data/` is git-ignored: the golden set holds real supplier line items. Never commit it.

## Decision rule

Worth wiring into `src/` only if, on the `llm` group, Laya's `auc` is clearly above 0.5 and at its
threshold it suppresses a meaningful share of rejected suggestions while keeping most accepted ones.
Note `ms_per_pair` too: CPU latency decides whether a Railway sidecar is viable.
