const CANONICAL_UNITS = [
  'ud', 'kg', 'g', 'L', 'ml', 'caja', 'garrafa', 'botella', 'pack', 'bandeja',
  'saco', 'palé', 'docena', 'bulto',
];

const UNIT_VARIANTS = {
  ud:      ['ud', 'ud.', 'Ud', 'UD', 'unidad', 'unidades', 'und', 'u.'],
  kg:      ['kg', 'Kg', 'KG', 'kg.', 'kilo', 'kilos', 'kgs', 'k.g.'],
  g:       ['g', 'gr', 'grs', 'gramos'],
  L:       ['L', 'l', 'lt', 'lts', 'litro', 'litros', 'Lts'],
  ml:      ['ml', 'ML', 'mL', 'mililitro', 'mililitros'],
  caja:    ['caja', 'Caja', 'CAJA', 'cjx', 'cj', 'cajas'],
  garrafa: ['garrafa', 'Garrafa', 'grfa', 'gfa'],
  botella: ['botella', 'Botella', 'bot', 'bote', 'btl'],
  pack:    ['pack', 'Pack', 'PACK', 'pk', 'pck'],
  bandeja: ['bandeja', 'Bandeja', 'bdj', 'bdja'],
  saco:    ['saco', 'Saco', 'sc'],
  'palé':  ['palé', 'pale', 'Palé', 'palet', 'plt'],
  docena:  ['docena', 'Docena', 'doc', 'dna', 'dzn'],
  bulto:   ['bulto', 'Bulto', 'bto', 'blto'],
};

export function randomUnit(rng, canonical = null) {
  const key = canonical ?? rng.choice(CANONICAL_UNITS);
  const variants = UNIT_VARIANTS[key] ?? [key];
  return rng.choice(variants);
}
