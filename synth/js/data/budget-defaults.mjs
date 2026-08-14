// Default monthly category budgets seeded for the demo restaurant.
// Each category MUST be one of VALID_CATEGORIES (src/lib/constants.ts) — enforced
// by tests/category-taxonomy.test.ts so budgets never drift from the app taxonomy.
/** @type {[string, number][]} */
export const DEFAULT_BUDGETS = [
  ['Carnes y Derivados',       3200],
  ['Pescados y Mariscos',      2400],
  ['Frutas y Verduras',        1600],
  ['Lácteos',                   900],
  ['Bebidas',                   750],
  ['Panadería y Bollería',      500],
  ['Aceites y Conservas',       400],
  ['Embutidos y Charcutería',   600],
  ['Productos de Limpieza',     300],
];
