export const TEMPLATES = {
  factura_letterhead:    { doc_type: 'factura', css: 'base' },
  factura_minimal:       { doc_type: 'factura', css: 'base' },
  factura_legacy_90s:    { doc_type: 'factura', css: 'legacy' },
  factura_eu_style:      { doc_type: 'factura', css: 'base' },
  albaran_thermal:       { doc_type: 'albaran', css: 'thermal' },
  albaran_a5_carbonless: { doc_type: 'albaran', css: 'base' },
  albaran_handwritten:   { doc_type: 'albaran', css: 'base' },
};

export const FACTURA_TEMPLATES = Object.entries(TEMPLATES)
  .filter(([, v]) => v.doc_type === 'factura').map(([k]) => k);
export const ALBARAN_TEMPLATES = Object.entries(TEMPLATES)
  .filter(([, v]) => v.doc_type === 'albaran').map(([k]) => k);

export const MUTATION_POOL_BY_DIFFICULTY = {
  easy:   [],
  medium: ['missing_due_date'],
  hard:   ['missing_invoice_number', 'missing_due_date', 'missing_cif_supplier', 'wrong_iva_math', 'negative_quantity'],
  cursed: ['missing_invoice_number', 'missing_due_date', 'missing_cif_supplier', 'missing_date',
           'wrong_iva_math', 'line_total_wrong', 'negative_quantity', 'missing_total'],
};

const MAX_MUTATIONS = { easy: 0, medium: 1, hard: 3, cursed: 4 };

const DIFFICULTY_WEIGHTS = { easy: 0.20, medium: 0.40, hard: 0.30, cursed: 0.10 };

export function sampleDifficulty(rng) {
  const keys = Object.keys(DIFFICULTY_WEIGHTS);
  const weights = Object.values(DIFFICULTY_WEIGHTS);
  return rng.choices(keys, weights, 1)[0];
}

export function selectMutations(rng, difficulty, inject, exclude) {
  const pool = (MUTATION_POOL_BY_DIFFICULTY[difficulty] || []).filter(t => !exclude.includes(t));
  const maxN = MAX_MUTATIONS[difficulty] || 0;
  const selected = rng.sample(pool, Math.min(maxN, pool.length));
  for (const tag of inject) {
    if (!exclude.includes(tag) && !selected.includes(tag) &&
        (MUTATION_POOL_BY_DIFFICULTY.cursed || []).includes(tag)) {
      selected.push(tag);
    }
  }
  return selected;
}
