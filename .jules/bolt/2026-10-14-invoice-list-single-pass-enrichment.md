# Invoice List Single-Pass Line Item Enrichment & Stats Processing

## Problem
The `load` function in `src/routes/(app)/invoices/+page.server.ts` handles invoice listing and statistics computation. On every request, it performed multiple passes over invoice line items:
1. `lineItemsByInvoice` map set key-value pairs redundantly on every item iteration.
2. For each invoice (up to 50 per page):
   - `.get(inv.id)` was called twice on `lineItemsByInvoice`.
   - `.filter()` was executed to count uncategorized line items, allocating a temporary array per invoice.
   - `.map()` was executed to parse numeric prices on line items, allocating mapped objects.
3. After `invoiceList` was constructed, `.filter(inv => inv.uncategorized_line_count > 0).length` was run over `invoiceList` to count invoices with uncategorized lines, allocating another temporary array.
4. `r.month.split('-')[1]` was executed for every trend row, allocating string arrays to extract month indices.

## Solution
1. Consolidated line item grouping in `lineItemsByInvoice` to only execute `.set()` when creating new entry arrays.
2. Transformed invoice list enrichment and uncategorized line counting into a single `for` loop over `invoiceRows`:
   - Replaced multi-pass `.filter()` and `.map()` calls with direct indexed loops.
   - Calculated `uncategorized_line_count` and incremented `uncategorizedLineInvoices` directly during the single pass without allocating intermediate arrays.
3. Replaced `r.month.split('-')[1]` with direct substring slicing `r.month.slice(5, 7)`.

## Results
- **Operations/sec**: Increased from ~4,611 ops/sec to ~5,141 ops/sec (1.12x speedup).
- **Allocations**: Eliminated 50+ intermediate array allocations per page load.
- **Correctness**: Verified 100% output equality and passed all Vitest suites and invariant linters cleanly.
