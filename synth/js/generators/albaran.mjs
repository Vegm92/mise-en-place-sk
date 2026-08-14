import { randomSupplier } from '../data/suppliers.mjs';
import { sampleBasket } from '../data/products.mjs';
import { fakeCif } from '../data/cifs.mjs';

const RESTAURANT_NAMES = [
  'Bar Restaurant La Taula', 'Restaurante El Racó', 'Bistró de la Rambla',
  'Can Pepe Restauració', 'El Forn de la Vila', 'Hostal del Mercat',
  'La Cuina de Sempre', 'Taberna del Gat', 'Restaurant Maresme',
  'Gastropub dels Arcs', 'Bar Melón', 'La Bodegueta Nova',
];

function randomAlbaranNumber(rng) {
  const seq = rng.randint(1, 99999);
  const prefix = rng.choice(['ALB', 'A', 'DEL', 'ENT']);
  const year = 2025 + rng.randint(0, 1);
  return `${prefix}-${year}-${String(seq).padStart(5, '0')}`;
}

function todayMinus(days) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

export function makeAlbaran(rng, seed = 0, difficulty = 'easy', supplier = null) {
  if (!supplier) supplier = randomSupplier(rng);

  const nItems = ['hard', 'cursed'].includes(difficulty) ? rng.randint(4, 18) : rng.randint(2, 10);
  const items = sampleBasket(rng, nItems, supplier.category, false);

  const deliveryDate = todayMinus(rng.randint(0, 30));
  const albaranNumber = randomAlbaranNumber(rng);
  const buyerName = rng.choice(RESTAURANT_NAMES);

  const hasPrices = !(['hard', 'cursed'].includes(difficulty) && rng.random() < 0.4);
  const hasTotal = hasPrices && rng.random() > 0.3;

  if (!hasPrices) {
    for (const it of items) {
      it.unit_price = null;
      it.total_price = null;
    }
  }

  const spec = {
    supplier,
    buyer_name: buyerName,
    albaran_number: albaranNumber,
    delivery_date: deliveryDate,
    items,
    has_prices: hasPrices,
    has_total: hasTotal,
    notes: '',
  };

  const totalAmount = hasTotal
    ? Math.round(items.reduce((s, it) => s + (it.total_price || 0), 0) * 100) / 100
    : null;

  const gt = {
    supplier_name: supplier.name,
    invoice_number: albaranNumber,
    invoice_date: deliveryDate,
    due_date: null,
    total_amount: totalAmount,
    currency: 'EUR',
    confidence: 1.0,
    line_items: items.map(it => ({
      description: it.description,
      quantity: it.quantity,
      unit: it.unit,
      unit_price: it.unit_price ?? null,
      total_price: it.total_price ?? null,
    })),
    _meta: {
      synth_version: '0.1.0',
      seed,
      doc_type: 'albaran',
      template: '',
      difficulty,
      supplier_cif: supplier.cif,
      iva_breakdown: [],
      degradations: [],
      mutations: [],
      missing: [],
      rendered_pdf_pages: 1,
    },
  };

  return { spec, gt };
}
