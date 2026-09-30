# Supplier Cadence Gap Loop & Composite Index Optimization

## Bottleneck
In `supplierCadence` (`src/lib/server/supplier-cadence.ts`), computing invoice date gaps iterated over `sortedDates.slice(1)`. Creating array slices (`.slice(1)`) allocated temporary arrays for every supplier cadence calculation pass.

In addition, supplier delivery cadence queries (`supplierInvoiceDates`) execute an inner join filtering on `restaurant_id`, `supplier_id`, and `invoice_date`. Without a composite index covering `(restaurant_id, supplier_id, invoice_date)` on `invoices`, query execution required scanning broader tenant indices.

## Solution
1. **Allocation-Free Gap Iteration:** Replaced `sortedDates.slice(1)` in `supplierCadence` with an index-based loop (`for (let i = 1; i < sortedDates.length; i++)`), eliminating intermediate sub-array slice allocations.
2. **Composite Database Indexing:** Added composite index `idx_invoices_rid_supplier_date` on `invoices (restaurant_id, supplier_id, invoice_date)` in `src/lib/server/schema.ts` to optimize tenant-and-supplier-scoped invoice date lookups.
