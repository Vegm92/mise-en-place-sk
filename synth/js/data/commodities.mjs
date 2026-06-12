// Commodity catalogue: snake_case key → [display category, IVA rate prior, mixed IVA].
// The display name is the canonical category stored on suppliers.category and MUST
// match VALID_CATEGORIES (src/lib/constants.ts). This module is dependency-free so
// tests/category-taxonomy.test.ts can import it without dragging in untyped helpers.

/** @type {Record<string, [string, number, boolean]>} */
export const COMMODITIES = {
  frutas_verduras:     ['Frutas y Verduras',        0.10, false],
  carnes:              ['Carnes y Derivados',        0.10, false],
  pescados:            ['Pescados y Mariscos',       0.10, false],
  lacteos:             ['Lácteos',                  0.10, false],
  aceites:             ['Aceites y Conservas',       0.10, true],
  bebidas_alcoholicas: ['Bebidas',                  0.21, true],
  panaderia:           ['Panadería y Bollería',      0.04, true],
  especias:            ['Especias y Condimentos',    0.10, false],
  limpieza:            ['Productos de Limpieza',     0.21, false],
  congelados:          ['Congelados',               0.10, false],
  embutidos:           ['Embutidos y Charcutería',  0.10, false],
  vinos:               ['Vinos y Cavas',            0.21, false],
  cafe:                ['Café y Bebidas Calientes',  0.21, true],
};

// Category display names a generated supplier can be assigned.
export const SUPPLIER_CATEGORIES = Object.values(COMMODITIES).map(([name]) => name);
