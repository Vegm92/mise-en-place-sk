export function applyWrongIvaSum(spec, gt, rng) {
  if (!spec.totals) return; // albaran has no totals
  const error = Math.round(rng.uniform(0.02, 8.00) * 100) / 100;
  const sign = rng.choice([-1, 1]);
  spec.totals.displayed_grand_total = Math.round(
    (spec.totals.displayed_grand_total + sign * error) * 100
  ) / 100;
  gt.total_amount = spec.totals.displayed_grand_total;
  gt._meta.mutations.push('wrong_iva_math');
}

export function applyWrongLineTotal(spec, gt, rng) {
  if (!spec.items.length) return;
  const idx = rng.randint(0, spec.items.length - 1);
  const error = Math.round(rng.uniform(0.01, 2.00) * 100) / 100;
  const sign = rng.choice([-1, 1]);
  spec.items[idx].total_price = Math.round((spec.items[idx].total_price + sign * error) * 100) / 100;
  gt.line_items[idx].total_price = spec.items[idx].total_price;
  gt._meta.mutations.push('line_total_wrong');
}

export const MUTATOR_MAP = {
  wrong_iva_math:   applyWrongIvaSum,
  line_total_wrong: applyWrongLineTotal,
};
