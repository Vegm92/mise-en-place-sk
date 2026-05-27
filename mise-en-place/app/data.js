// Sample data for Mise en Place — Spanish restaurant "Casa Lúa", Madrid
// All amounts in EUR. Use Spanish locale formatting (1.234,56 €).

window.MEP_DATA = (() => {
  const fmt = (n, opts = {}) =>
    new Intl.NumberFormat('es-ES', {
      minimumFractionDigits: 2, maximumFractionDigits: 2, ...opts
    }).format(n);
  const eur = (n) => fmt(n) + ' €';
  const eurc = (n) => fmt(n, { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' €';

  // Curated supplier palette (light + dark) — muted, distinct.
  const supplierColors = [
    '#7a5b3a', // siena
    '#3d6b5a', // moss
    '#7a3a4a', // garnet
    '#4d5b7a', // slate-blue
    '#8a6d2d', // ochre
    '#5a6a3a', // olive
    '#6a4a6a', // plum
    '#3a6a7a', // teal-deep
  ];

  const suppliers = [
    { id: 's1', name: 'Cárnicas Ibérico Aranda', cat: 'Carne', cif: 'B81234567', spend: 4218.40, deltaPct: +6.4, last: '2026-05-18', invoices: 11, color: supplierColors[0] },
    { id: 's2', name: 'Mercavera Productos Frescos', cat: 'Verdura', cif: 'B12849320', spend: 2867.15, deltaPct: -2.1, last: '2026-05-19', invoices: 22, color: supplierColors[1] },
    { id: 's3', name: 'Bodegas Solana', cat: 'Vinos', cif: 'A28392019', spend: 1924.50, deltaPct: +0.8, last: '2026-05-12', invoices: 4, color: supplierColors[2] },
    { id: 's4', name: 'Pescados Atlántico Vigo', cat: 'Pescado', cif: 'B36789432', spend: 3104.92, deltaPct: +18.0, last: '2026-05-19', invoices: 9, color: supplierColors[3] },
    { id: 's5', name: 'Lácteos Castilla SA', cat: 'Lácteos', cif: 'A45219834', spend: 942.20, deltaPct: +1.3, last: '2026-05-17', invoices: 8, color: supplierColors[4] },
    { id: 's6', name: 'Aceites Gómez Hermanos', cat: 'Aceites', cif: 'B92043281', spend: 1186.40, deltaPct: +12.4, last: '2026-05-15', invoices: 3, color: supplierColors[5] },
    { id: 's7', name: 'Panadería Ruiz', cat: 'Pan', cif: 'B82910543', spend: 612.80, deltaPct: -0.5, last: '2026-05-19', invoices: 18, color: supplierColors[6] },
    { id: 's8', name: 'Limpieza Profesional Madrid', cat: 'Limpieza', cif: 'B78902341', spend: 384.10, deltaPct: +0.0, last: '2026-05-10', invoices: 2, color: supplierColors[7] },
  ];

  // Invoices — current period (May 2026). Mixed statuses.
  const invoices = [
    { id: 'i01', num: '2026-A-0471', supplier: 's1', date: '2026-05-19', due: '2026-06-08', items: 14, total: 482.65, status: 'pending' },
    { id: 'i02', num: 'MV/26/3318', supplier: 's2', date: '2026-05-19', due: '2026-06-02', items: 22, total: 318.40, status: 'confirmed' },
    { id: 'i03', num: 'PA-2026-0982', supplier: 's4', date: '2026-05-19', due: '2026-05-26', items: 9, total: 612.18, status: 'pending' },
    { id: 'i04', num: '2026/0042', supplier: 's7', date: '2026-05-19', due: '2026-06-02', items: 4, total: 64.20, status: 'confirmed' },
    { id: 'i05', num: '2026-A-0468', supplier: 's1', date: '2026-05-17', due: '2026-06-06', items: 11, total: 408.92, status: 'confirmed' },
    { id: 'i06', num: 'LC/2026/118', supplier: 's5', date: '2026-05-17', due: '2026-06-16', items: 7, total: 142.80, status: 'confirmed' },
    { id: 'i07', num: 'MV/26/3290', supplier: 's2', date: '2026-05-15', due: '2026-05-29', items: 19, total: 286.45, status: 'exported' },
    { id: 'i08', num: 'AG-2026-118', supplier: 's6', date: '2026-05-15', due: '2026-06-14', items: 3, total: 482.10, status: 'confirmed' },
    { id: 'i09', num: 'BS/26/041', supplier: 's3', date: '2026-05-12', due: '2026-06-11', items: 6, total: 642.50, status: 'confirmed' },
    { id: 'i10', num: 'PA-2026-0961', supplier: 's4', date: '2026-05-12', due: '2026-05-19', items: 11, total: 689.40, status: 'exported' },
    { id: 'i11', num: 'MV/26/3261', supplier: 's2', date: '2026-05-12', due: '2026-05-26', items: 18, total: 264.80, status: 'exported' },
    { id: 'i12', num: '2026/0038', supplier: 's7', date: '2026-05-12', due: '2026-05-26', items: 5, total: 58.40, status: 'exported' },
  ];

  // Spend by day for the last 30 days, stacked by category.
  // Realistic weekly rhythm: Mon/Tue light, Fri/Sat heavy.
  const categories = [
    { key: 'carne',   label: 'Carne',   color: '#7a5b3a' },
    { key: 'pescado', label: 'Pescado', color: '#4d5b7a' },
    { key: 'verdura', label: 'Verdura', color: '#3d6b5a' },
    { key: 'vinos',   label: 'Vinos',   color: '#7a3a4a' },
    { key: 'otros',   label: 'Otros',   color: '#6d6660' },
  ];

  // Synthesize 28 weekday-rhythm days
  const dailyShape = [0.4, 0.7, 0.8, 0.9, 1.5, 1.4, 0.3]; // Mo Tu We Th Fr Sa Su
  const days = [];
  const today = new Date('2026-05-19');
  for (let i = 27; i >= 0; i--) {
    const d = new Date(today); d.setDate(today.getDate() - i);
    const w = d.getDay() === 0 ? 6 : d.getDay() - 1;
    const base = dailyShape[w];
    days.push({
      date: d.toISOString().slice(0, 10),
      dow: w,
      carne:   Math.round(base * 110 + (Math.sin(i * 0.7) * 25)),
      pescado: Math.round(base * 90  + (Math.sin(i * 1.1) * 30)),
      verdura: Math.round(base * 70  + (Math.cos(i * 0.5) * 15)),
      vinos:   Math.round(base * 45  + (Math.sin(i * 0.3) * 20)),
      otros:   Math.round(base * 35  + (Math.cos(i * 0.9) * 10)),
    });
  }

  // Aggregate into ISO weeks for the bar chart
  const weeks = [];
  for (let i = 0; i < days.length; i += 7) {
    const slice = days.slice(i, i + 7);
    const agg = { label: 'S' + (Math.floor(i / 7) + 17), days: slice };
    for (const c of categories) agg[c.key] = slice.reduce((s, d) => s + (d[c.key] || 0), 0);
    agg.total = categories.reduce((s, c) => s + agg[c.key], 0);
    weeks.push(agg);
  }

  const alerts = [
    { id: 'a1', sev: 'high', kind: 'price', text: 'Aceite oliva virgen extra subió +18% vs. último pedido', detail: 'Aceites Gómez Hermanos · pedido del 15 may.', when: 'hace 2 h' },
    { id: 'a2', sev: 'high', kind: 'price', text: 'Merluza fresca +12% en la última factura', detail: 'Pescados Atlántico Vigo · 19 may.', when: 'hace 4 h' },
    { id: 'a3', sev: 'med',  kind: 'budget', text: 'Categoría Carne al 87% del presupuesto mensual', detail: '4.218,40 € de 4.850,00 € · queda 1 semana', when: 'hace 6 h' },
    { id: 'a4', sev: 'med',  kind: 'due', text: 'Pago a Pescados Atlántico vence en 7 días', detail: 'Factura PA-2026-0982 · 612,18 €', when: 'ayer' },
    { id: 'a5', sev: 'low',  kind: 'new', text: 'Nuevo proveedor detectado: Distribuciones Olé', detail: 'Asignar categoría', when: 'hace 2 d' },
  ];

  // Line items for the focus invoice (PA-2026-0982)
  const lineItems = [
    { desc: 'Merluza fresca', qty: 3.20, unit: 'kg', price: 18.40, total: 58.88, flagged: true },
    { desc: 'Lubina salvaje', qty: 2.50, unit: 'kg', price: 24.80, total: 62.00, flagged: false },
    { desc: 'Pulpo cocido', qty: 1.80, unit: 'kg', price: 28.50, total: 51.30, flagged: false },
    { desc: 'Almejas finas', qty: 2.00, unit: 'kg', price: 32.00, total: 64.00, flagged: false },
    { desc: 'Gambas blancas', qty: 1.50, unit: 'kg', price: 38.20, total: 57.30, flagged: false },
    { desc: 'Boquerones', qty: 4.00, unit: 'kg', price: 8.40, total: 33.60, flagged: false },
    { desc: 'Sardinas', qty: 3.50, unit: 'kg', price: 6.20, total: 21.70, flagged: false },
    { desc: 'Bacalao desalado', qty: 2.20, unit: 'kg', price: 22.80, total: 50.16, flagged: false },
    { desc: 'Salmón fresco', qty: 2.80, unit: 'kg', price: 19.50, total: 54.60, flagged: false },
  ];
  const subtotal = lineItems.reduce((s, l) => s + l.total, 0);
  const iva = subtotal * 0.10;

  return {
    fmt, eur, eurc,
    suppliers, supplierById: Object.fromEntries(suppliers.map(s => [s.id, s])),
    invoices,
    categories,
    days, weeks,
    alerts,
    lineItems, subtotal, iva, ivaPct: 10,
    kpis: {
      monthSpend: 15240.32,
      monthDelta: +8.2,         // vs last month
      avgPerSupplier: 1905.04,
      avgDelta: -3.1,
      pendingPay: 2418.45,
      pendingDelta: +12.0,
      budgetUsed: 72,           // %
      budgetDelta: -4.0,        // vs last month
      invCount: 47,
    },
    budgets: [
      { cat: 'Carne',    color: '#7a5b3a', limit: 4850, spent: 4218.40 },
      { cat: 'Pescado',  color: '#4d5b7a', limit: 3600, spent: 3104.92 },
      { cat: 'Verdura',  color: '#3d6b5a', limit: 3000, spent: 2867.15 },
      { cat: 'Vinos',    color: '#7a3a4a', limit: 2500, spent: 1924.50 },
      { cat: 'Aceites',  color: '#8a6d2d', limit: 1000, spent: 1186.40 },
      { cat: 'Lácteos',  color: '#5a6a3a', limit: 1200, spent:  942.20 },
    ],
  };
})();
