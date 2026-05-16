import { randomSupplier } from '../data/suppliers.mjs';
import { sampleBasket } from '../data/products.mjs';
import { fakeCif } from '../data/cifs.mjs';
import { fakeAddress } from '../data/addresses.mjs';
import { computeTotals } from './totals.mjs';

const RESTAURANT_NAMES = [
  'Bar Restaurant La Taula', 'Restaurante El Racó', 'Bistró de la Rambla',
  'Can Pepe Restauració', 'El Forn de la Vila', 'Hostal del Mercat',
  'La Cuina de Sempre', 'Taberna del Gat', 'Restaurant Maresme',
  'Gastropub dels Arcs', 'Bar Melón', 'La Bodegueta Nova',
  'Cafeteria Central', 'Cervecería del Port', 'Marisquería El Mar',
];

const NOTE_TEMPLATES = [
  '', '', '',
  'Pago a 30 días',
  'Forma de pago: transferencia bancaria',
  'Ref. pedido: PED-{n}',
  'Condiciones: pago a 15 días fecha factura',
];

function randomInvoiceNumber(rng) {
  const year = 2025 + rng.randint(0, 1);
  const seq = rng.randint(1, 9999);
  const prefix = rng.choice(['F', 'FAC', 'FV', 'A']);
  return `${prefix}${year}-${String(seq).padStart(4, '0')}`;
}

function addDays(isoDate, days) {
  const d = new Date(isoDate + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function todayMinus(days) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

export function makeFactura(rng, seed = 0, difficulty = 'easy', errorMode = 'strict', supplier = null) {
  if (!supplier) supplier = randomSupplier(rng);

  const nItems = ['hard', 'cursed'].includes(difficulty) ? rng.randint(3, 12) : rng.randint(2, 8);
  const mixIva = supplier.mixed_iva || ['medium', 'hard', 'cursed'].includes(difficulty);
  const items = sampleBasket(rng, nItems, supplier.category, mixIva);
  const totals = computeTotals(items, errorMode, rng);

  const invDate = todayMinus(rng.randint(1, 60));
  const dueOffset = rng.choice([0, 15, 30, 60]);
  const dueDate = dueOffset ? addDays(invDate, dueOffset) : null;

  const buyerName = rng.choice(RESTAURANT_NAMES);
  const buyerCif = fakeCif(rng);
  const buyerAddr = fakeAddress(rng);
  const invNumber = randomInvoiceNumber(rng);
  const noteTmpl = rng.choice(NOTE_TEMPLATES);
  const note = noteTmpl.includes('{n}')
    ? noteTmpl.replace('{n}', rng.randint(100, 9999))
    : noteTmpl;

  const spec = {
    supplier,
    buyer_name: buyerName,
    buyer_cif: buyerCif,
    buyer_address: buyerAddr,
    invoice_number: invNumber,
    invoice_date: invDate,
    due_date: dueDate,
    items,
    totals,
    currency: 'EUR',
    notes: note,
    watermark: null,
  };

  const gt = {
    supplier_name: supplier.name,
    invoice_number: invNumber,
    invoice_date: invDate,
    due_date: dueDate,
    total_amount: totals.displayed_grand_total,
    currency: 'EUR',
    confidence: 1.0,
    line_items: items.map(it => ({
      description: it.description,
      quantity: it.quantity,
      unit: it.unit,
      unit_price: it.unit_price,
      total_price: it.total_price,
    })),
    _meta: {
      synth_version: '0.1.0',
      seed,
      doc_type: 'factura',
      template: '',
      difficulty,
      supplier_cif: supplier.cif,
      iva_breakdown: totals.iva_breakdown.map(b => ({ rate: b.rate, base: b.base, cuota: b.cuota })),
      degradations: [],
      mutations: totals.error_type ? [totals.error_type] : [],
      missing: [],
      rendered_pdf_pages: 1,
    },
  };

  return { spec, gt };
}
