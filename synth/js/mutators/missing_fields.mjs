export function dropInvoiceNumber(spec, gt) {
  spec.invoice_number = '';
  gt.invoice_number = null;
  gt._meta.missing.push('invoice_number');
  gt._meta.mutations.push('missing_invoice_number');
}

export function dropDueDate(spec, gt) {
  spec.due_date = null;
  gt.due_date = null;
  gt._meta.missing.push('due_date');
  gt._meta.mutations.push('missing_due_date');
}

export function dropSupplierCif(spec, gt) {
  spec.supplier.cif = '';
  gt._meta.missing.push('supplier_cif');
  gt._meta.mutations.push('missing_cif_supplier');
}

export function dropTotal(spec, gt) {
  gt.total_amount = null;
  gt._meta.missing.push('total');
  gt._meta.mutations.push('missing_total');
}

export function dropDate(spec, gt) {
  spec.invoice_date = '';
  gt.invoice_date = null;
  gt._meta.missing.push('invoice_date');
  gt._meta.mutations.push('missing_date');
}

export function addNegativeLine(spec, gt, rng) {
  if (!spec.items.length) return;
  const src = { ...spec.items[0] };
  src.quantity = -Math.abs(src.quantity);
  src.total_price = Math.round(src.unit_price * src.quantity * 100) / 100;
  spec.items.push(src);
  gt.line_items.push({
    description: src.description,
    quantity: src.quantity,
    unit: src.unit,
    unit_price: src.unit_price,
    total_price: src.total_price,
  });
  gt._meta.mutations.push('negative_quantity');
}

export const MUTATOR_MAP = {
  missing_invoice_number: (s, g)       => dropInvoiceNumber(s, g),
  missing_due_date:       (s, g)       => dropDueDate(s, g),
  missing_cif_supplier:   (s, g)       => dropSupplierCif(s, g),
  missing_total:          (s, g)       => dropTotal(s, g),
  missing_date:           (s, g)       => dropDate(s, g),
  negative_quantity:      (s, g, rng)  => addNegativeLine(s, g, rng),
};
