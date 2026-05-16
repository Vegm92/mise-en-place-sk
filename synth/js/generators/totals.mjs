export function computeTotals(items, mode = 'strict', rng = null) {
  const byRate = {};
  for (const item of items) {
    const rate = item.iva_rate ?? 0.10;
    byRate[rate] = (byRate[rate] || 0) + item.total_price;
  }

  const breakdown = [];
  let baseTotal = 0, ivaTotal = 0;
  for (const rate of Object.keys(byRate).map(Number).sort()) {
    const base = Math.round(byRate[rate] * 100) / 100;
    const cuota = Math.round(base * rate * 100) / 100;
    breakdown.push({ rate, base, cuota });
    baseTotal += base;
    ivaTotal += cuota;
  }
  baseTotal = Math.round(baseTotal * 100) / 100;
  ivaTotal  = Math.round(ivaTotal * 100) / 100;
  const grandTotal = Math.round((baseTotal + ivaTotal) * 100) / 100;

  let displayed = grandTotal;
  let errorType = null;

  if (mode === 'wrong_iva_sum' && rng) {
    const error = Math.round(rng.uniform(0.01, 5.00) * 100) / 100;
    const sign = rng.choice([-1, 1]);
    displayed = Math.round((grandTotal + sign * error) * 100) / 100;
    errorType = 'wrong_iva_sum';
  } else if (mode === 'rounding_error' && rng) {
    displayed = Math.round((grandTotal + rng.choice([-0.01, 0.01])) * 100) / 100;
    errorType = 'rounding_error';
  }

  return { iva_breakdown: breakdown, base_total: baseTotal, iva_total: ivaTotal, grand_total: grandTotal, displayed_grand_total: displayed, error_type: errorType };
}
