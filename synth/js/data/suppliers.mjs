import { fakeCif, fakeNifAutonomo } from './cifs.mjs';
import { fakeAddress } from './addresses.mjs';

const ADJECTIVES = [
  'Del Sur', 'Del Norte', 'Catalán', 'Mediterráneo', 'Fresco', 'Natural',
  'Premium', 'Selecto', 'Artesano', 'Ecológico', 'Local', 'Ibérico',
  'Del Maresme', 'Del Penedès', 'De La Ribera', "De L'Empordà",
];

const COMMODITIES = {
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

const LEGAL_FORMS = ['S.L.', 'S.A.', 'S.C.P.', 'S.L.U.', 'Coop.'];

const FIRST_NAMES = ['Antonio', 'María', 'Juan', 'Carles', 'Francesc', 'Montserrat', 'Jordi', 'Ana'];
const LAST_NAMES  = ['García', 'Martínez', 'López', 'Puig', 'Roca', 'Ferrer', 'Mas', 'Costa'];

function fakePhone(rng) {
  const prefix = rng.choice(['93', '91', '96', '95', '94', '971']);
  const a = rng.randint(100, 999), b = rng.randint(10, 99), c = rng.randint(10, 99);
  return `+34 ${prefix} ${a} ${b} ${c}`;
}

function fakeEmail(name) {
  const slug = name.toLowerCase().split(' ')[0].replace(/[.,]/g, '');
  return `facturacion@${slug}.es`;
}

export function randomSupplier(rng) {
  const catKey = rng.choice(Object.keys(COMMODITIES));
  const [catName, ivaRate, mixed] = COMMODITIES[catKey];
  const adj = rng.choice(ADJECTIVES);
  const isAutonomo = rng.random() < 0.15;

  let name, cif;
  if (isAutonomo) {
    name = `${rng.choice(FIRST_NAMES)} ${rng.choice(LAST_NAMES)} ${rng.choice(LAST_NAMES)}`;
    cif = fakeNifAutonomo(rng);
  } else {
    const commodityWord = catName.split(' ')[0];
    const legal = rng.choice(LEGAL_FORMS);
    name = `${commodityWord} ${adj} ${legal}`;
    cif = fakeCif(rng);
  }

  return {
    name,
    category: catKey,
    cif,
    address: fakeAddress(rng),
    phone: fakePhone(rng),
    email: fakeEmail(name),
    iva_rate_prior: ivaRate,
    mixed_iva: mixed,
    is_autonomo: isAutonomo,
  };
}
