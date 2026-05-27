// Suppliers — list view + profile (with tabs).

const SD = window.MEP_DATA;
const SI = window.MEPIcons;

// ── Suppliers list ────────────────────────────────────────────────────────
function MEPSuppliersList() {
  // Synthesize a richer set so the list feels full
  const extras = [
    { id: 'x1', name: 'Distribuciones Olé Madrid', cat: 'Sin categoría', cif: 'B91029384', spend: 248.30, deltaPct: 0, last: '2026-05-19', invoices: 1, color: '#8a8275', isNew: true },
    { id: 'x2', name: 'Frutas y Verduras El Huerto', cat: 'Verdura', cif: 'B19283746', spend: 718.40, deltaPct: -8.2, last: '2026-05-11', invoices: 6, color: '#3d6b5a' },
    { id: 'x3', name: 'Vinos del Duero S.L.', cat: 'Vinos', cif: 'A28371920', spend: 1142.00, deltaPct: +2.4, last: '2026-05-09', invoices: 3, color: '#7a3a4a' },
    { id: 'x4', name: 'Quesos La Mancha', cat: 'Lácteos', cif: 'B45901827', spend: 318.20, deltaPct: +5.6, last: '2026-05-08', invoices: 2, color: '#8a6d2d' },
  ];
  const all = [...SD.suppliers, ...extras].sort((a, b) => b.spend - a.spend);

  return (
    <main style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '20px 24px 0', display: 'flex', flexDirection: 'column', gap: 14, flex: 1, minHeight: 0 }}>

        {/* Filter bar */}
        <div className="card" style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
            <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--mep-fg-3)' }}>
              <SI.Search size={14} />
            </span>
            <input className="input" style={{ paddingLeft: 32, width: '100%' }}
              placeholder="Buscar por nombre o CIF…" />
          </div>
          <FilterChip2 label="Categoría" value="Todas" />
          <FilterChip2 label="Actividad" value="Últimos 30 d" />
          <div style={{ flex: 1 }} />
          <button className="btn btn-secondary">
            <SI.Plus size={13} /> Añadir proveedor
          </button>
        </div>

        {/* Summary strip */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          <SummaryStat label="Proveedores activos" value="12" sub="3 nuevos este mes" />
          <SummaryStat label="Gasto total" value={SD.eurc(all.reduce((s, x) => s + x.spend, 0))} sub="este mes" />
          <SummaryStat label="Facturas" value="78" sub="este mes" />
          <SummaryStat label="Sin asignar" value="1" sub="Distribuciones Olé" tone="warn" />
        </div>

        {/* Suppliers table */}
        <div className="card" style={{ padding: 0, overflow: 'hidden', flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div style={{ overflow: 'auto', flex: 1 }}>
            <table className="tbl" style={{ tableLayout: 'fixed' }}>
              <thead>
                <tr>
                  <th style={{ width: '28%' }}>Proveedor</th>
                  <th style={{ width: 120 }}>Categoría</th>
                  <th style={{ width: 110 }}>CIF</th>
                  <th className="num" style={{ width: 80 }}>Facturas</th>
                  <th className="num" style={{ width: 110 }}>Gasto (mes)</th>
                  <th className="num" style={{ width: 70 }}>Δ</th>
                  <th style={{ width: 110 }}>Último pedido</th>
                  <th style={{ width: 40 }}></th>
                </tr>
              </thead>
              <tbody>
                {all.map(s => (
                  <tr key={s.id} className="row">
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ width: 28, height: 28, borderRadius: 14, flexShrink: 0,
                          background: s.color + '24', color: s.color,
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 11, fontWeight: 600 }}>
                          {s.name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()}
                        </span>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--mep-fg)',
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 220 }}>
                              {s.name}
                            </span>
                            {s.isNew && <span className="badge" style={{ background: 'var(--mep-acc-soft)', color: 'var(--mep-acc)', fontSize: 9.5, padding: '1px 5px' }}>NUEVO</span>}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5,
                        color: s.cat === 'Sin categoría' ? 'var(--mep-fg-3)' : 'var(--mep-fg-2)',
                        fontStyle: s.cat === 'Sin categoría' ? 'italic' : 'normal' }}>
                        <span className="swatch" style={{ background: s.color }} />
                        {s.cat}
                      </span>
                    </td>
                    <td className="num" style={{ fontSize: 12.5, color: 'var(--mep-fg-3)' }}>{s.cif}</td>
                    <td className="num" style={{ fontSize: 12.5, color: 'var(--mep-fg-2)' }}>{s.invoices}</td>
                    <td className="num" style={{ fontWeight: 500 }}>{SD.eur(s.spend)}</td>
                    <td className="num">
                      {s.deltaPct === 0 ? <span style={{ fontSize: 11.5, color: 'var(--mep-fg-3)' }}>—</span>
                        : <MEPDelta value={s.deltaPct} />}
                    </td>
                    <td className="num" style={{ fontSize: 12.5, color: 'var(--mep-fg-2)' }}>
                      {new Date(s.last).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <SI.ChevronRight size={13} style={{ color: 'var(--mep-fg-3)' }} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  );
}

function FilterChip2({ label, value }) {
  return (
    <button className="btn btn-secondary" style={{ height: 32, fontSize: 12.5 }}>
      <span style={{ color: 'var(--mep-fg-3)', fontWeight: 400 }}>{label}:</span>
      <span style={{ marginLeft: -2 }}>{value}</span>
      <SI.ChevronDown size={12} />
    </button>
  );
}

function SummaryStat({ label, value, sub, tone }) {
  return (
    <div className="card" style={{ padding: 14 }}>
      <div className="label" style={{ marginBottom: 6 }}>{label}</div>
      <div className="num" style={{ fontSize: 22, fontWeight: 600,
        color: tone === 'warn' ? 'var(--mep-warn)' : 'var(--mep-fg)', letterSpacing: -0.4, lineHeight: 1.1 }}>
        {value}
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--mep-fg-3)', marginTop: 6 }}>{sub}</div>
    </div>
  );
}

// ── Supplier profile ──────────────────────────────────────────────────────
function MEPSupplierProfile() {
  const s = SD.supplierById.s4; // Pescados Atlántico Vigo — has the price-shock story

  // Monthly spend series for this supplier
  const monthly = [
    { m: 'Nov 25', v: 2284 }, { m: 'Dic', v: 2640 }, { m: 'Ene 26', v: 2410 },
    { m: 'Feb',    v: 2820 }, { m: 'Mar', v: 3010 }, { m: 'Abr', v: 2740 },
    { m: 'May',    v: 3105, partial: true },
  ];
  const maxM = Math.max(...monthly.map(m => m.v));

  const products = [
    { name: 'Merluza fresca',   unit: 'kg', cur: 18.40, prev: 16.40, last: '2026-05-19' },
    { name: 'Lubina salvaje',   unit: 'kg', cur: 24.80, prev: 24.20, last: '2026-05-19' },
    { name: 'Pulpo cocido',     unit: 'kg', cur: 28.50, prev: 28.50, last: '2026-05-12' },
    { name: 'Almejas finas',    unit: 'kg', cur: 32.00, prev: 30.50, last: '2026-05-19' },
    { name: 'Gambas blancas',   unit: 'kg', cur: 38.20, prev: 35.80, last: '2026-05-12' },
    { name: 'Boquerones',       unit: 'kg', cur:  8.40, prev:  9.10, last: '2026-05-12' },
    { name: 'Sardinas',         unit: 'kg', cur:  6.20, prev:  6.20, last: '2026-05-05' },
    { name: 'Bacalao desalado', unit: 'kg', cur: 22.80, prev: 21.40, last: '2026-05-12' },
    { name: 'Salmón fresco',    unit: 'kg', cur: 19.50, prev: 19.20, last: '2026-05-19' },
  ];

  return (
    <main style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      {/* Profile header */}
      <div style={{ padding: '18px 24px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--mep-fg-3)', marginBottom: 8 }}>
          <span style={{ cursor: 'pointer' }}>Proveedores</span>
          <SI.ChevronRight size={11} />
          <span style={{ color: 'var(--mep-fg-2)' }}>{s.name}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 28, flexShrink: 0,
            background: s.color + '24', color: s.color,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 17, fontWeight: 600,
          }}>PA</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 600, color: 'var(--mep-fg)', letterSpacing: -0.4 }}>
              {s.name}
            </h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 4, fontSize: 12.5, color: 'var(--mep-fg-3)' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <span className="swatch" style={{ background: s.color }} /> {s.cat}
              </span>
              <span className="num">CIF {s.cif}</span>
              <span>· Vigo, Pontevedra</span>
              <span>· Último pedido <span className="num">hace 1 día</span></span>
            </div>
          </div>
          <button className="btn btn-secondary"><SI.Edit size={13} /> Editar</button>
          <button className="btn btn-secondary"><SI.Mail size={13} /> Contactar</button>
          <button className="btn btn-ghost" style={{ width: 32, padding: 0, justifyContent: 'center' }}>
            <SI.DotsH size={14} />
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 0, marginTop: 18, borderBottom: '1px solid var(--mep-divider)' }}>
          {[
            { id: 'overview', label: 'Resumen', active: true },
            { id: 'invoices', label: 'Facturas', count: 9 },
            { id: 'products', label: 'Productos', count: 27 },
            { id: 'units',    label: 'Conversiones de unidad' },
          ].map(t => (
            <button key={t.id} style={{
              border: 0, background: 'transparent', cursor: 'pointer',
              padding: '10px 16px', borderBottom: t.active ? '2px solid var(--mep-acc)' : '2px solid transparent',
              marginBottom: -1,
              fontSize: 13, fontWeight: t.active ? 600 : 500,
              color: t.active ? 'var(--mep-fg)' : 'var(--mep-fg-3)',
              fontFamily: 'inherit',
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}>
              {t.label}
              {t.count && <span className="num" style={{ fontSize: 11, fontWeight: 500,
                padding: '1px 6px', borderRadius: 999,
                background: 'var(--mep-surface-2)', color: 'var(--mep-fg-3)' }}>{t.count}</span>}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content — Overview */}
      <div style={{ padding: '18px 24px 24px', display: 'grid',
        gridTemplateColumns: '1.4fr 1fr', gap: 14, flex: 1, minHeight: 0, overflow: 'auto' }}>

        {/* Left col */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Monthly chart */}
          <div className="card" style={{ padding: '16px 16px 12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <div>
                <div className="subtitle">Gasto mensual</div>
                <div style={{ fontSize: 12, color: 'var(--mep-fg-3)', marginTop: 2 }}>Últimos 7 meses</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span className="num" style={{ fontSize: 22, fontWeight: 600, color: 'var(--mep-fg)', letterSpacing: -0.4 }}>
                  {SD.eur(2700)}
                </span>
                <span style={{ fontSize: 11.5, color: 'var(--mep-fg-3)' }}>media mensual</span>
              </div>
            </div>

            <div style={{ height: 180, position: 'relative', marginTop: 16 }}>
              <svg width="100%" height={180} style={{ display: 'block', overflow: 'visible' }}>
                {[0, 1].map(p => (
                  <line key={p} x1="40" x2="100%" y1={180 - p * 160 - 10} y2={180 - p * 160 - 10}
                    stroke="var(--mep-divider)" strokeDasharray={p === 1 ? '0' : '0'} strokeWidth="1" />
                ))}
                <line x1="40" x2="100%" y1={180 - (2700 / maxM) * 160 - 10} y2={180 - (2700 / maxM) * 160 - 10}
                  stroke="var(--mep-fg-3)" strokeDasharray="4 4" strokeWidth="1" />
                <text x="100%" y={180 - (2700 / maxM) * 160 - 12} dx="-2" textAnchor="end"
                  fontSize="10" fill="var(--mep-fg-3)" className="num">media 2.700 €</text>

                {monthly.map((m, i) => {
                  const colW = `calc((100% - 48px) / ${monthly.length})`;
                  const barW = 36;
                  const xLeft = `calc(40px + (${colW}) * ${i} + (${colW}) / 2 - ${barW / 2}px)`;
                  const h = (m.v / maxM) * 160;
                  return (
                    <g key={i}>
                      <rect x={xLeft} y={170 - h} width={barW} height={h}
                        fill={m.partial ? 'var(--mep-acc-soft)' : s.color}
                        stroke={m.partial ? s.color : 'none'} strokeDasharray={m.partial ? '3 2' : ''} strokeWidth="1.2" rx="2" />
                      <text x={xLeft} dx={barW / 2} y={170 - h - 4}
                        textAnchor="middle" fontSize="10.5" fontWeight="500" fill="var(--mep-fg)" className="num">
                        {(m.v / 1000).toFixed(1).replace('.', ',')}k
                      </text>
                      <text x={xLeft} dx={barW / 2} y={180}
                        textAnchor="middle" fontSize="10.5" fill="var(--mep-fg-3)" className="num">
                        {m.m}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>

          {/* KPIs strip */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            <KpiTile label="Valor medio de factura" value={SD.eur(344.99)} delta={+2.8} />
            <KpiTile label="Cambios de precio (90 d)" value="6" sub="3 al alza" tone="warn" />
            <KpiTile label="Plazo medio de pago" value="14 d" sub="términos: 7 d" tone="warn" />
          </div>

          {/* Top products */}
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div className="subtitle">Productos con más cambios de precio</div>
                <div style={{ fontSize: 12, color: 'var(--mep-fg-3)', marginTop: 2 }}>Últimos 90 días</div>
              </div>
              <a style={{ fontSize: 12.5, color: 'var(--mep-acc)', fontWeight: 500, cursor: 'pointer' }}>
                Ver todos los productos
              </a>
            </div>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th className="num">Precio actual</th>
                  <th className="num">Anterior</th>
                  <th className="num">Δ</th>
                  <th>Tendencia</th>
                  <th>Último pedido</th>
                </tr>
              </thead>
              <tbody>
                {products.slice(0, 5).map(p => {
                  const d = ((p.cur - p.prev) / p.prev) * 100;
                  return (
                    <tr key={p.name} className="row">
                      <td style={{ fontSize: 13, fontWeight: 500, color: 'var(--mep-fg)' }}>{p.name}</td>
                      <td className="num" style={{ fontWeight: 500 }}>{p.cur.toFixed(2).replace('.', ',')} €/{p.unit}</td>
                      <td className="num" style={{ fontSize: 12, color: 'var(--mep-fg-3)' }}>{p.prev.toFixed(2).replace('.', ',')}</td>
                      <td className="num">
                        {Math.abs(d) < 0.01 ? <span style={{ color: 'var(--mep-fg-3)', fontSize: 11.5 }}>—</span>
                          : <MEPDelta value={d} />}
                      </td>
                      <td>
                        <MEPSparkline data={fakePriceTrend(p.cur, p.prev)}
                          color={d > 0.01 ? 'var(--mep-neg)' : (d < -0.01 ? 'var(--mep-pos)' : 'var(--mep-fg-3)')}
                          width={72} height={20} />
                      </td>
                      <td className="num" style={{ fontSize: 12, color: 'var(--mep-fg-2)' }}>
                        {new Date(p.last).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right col */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
          {/* Contact / info card */}
          <div className="card" style={{ padding: 16 }}>
            <div className="subtitle" style={{ marginBottom: 10 }}>Información</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <InfoRow icon={SI.Mail} label="pedidos@pescadosatlantico.es" />
              <InfoRow icon={SI.Bell} label="+34 986 24 18 02" />
              <InfoRow icon={SI.Calendar} label="Reparto martes y viernes · antes de las 09:00" />
              <InfoRow icon={SI.Wallet} label="Términos · transferencia a 7 días" />
            </div>
          </div>

          {/* Active alerts for this supplier */}
          <div className="card" style={{ padding: '14px 14px 14px' }}>
            <div className="subtitle" style={{ marginBottom: 10 }}>Alertas activas <span className="num" style={{ color: 'var(--mep-fg-3)', fontWeight: 400 }}>· 2</span></div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <MEPAlertRow alert={{ sev: 'high', kind: 'price',
                text: 'Merluza fresca: +12% en la última factura',
                detail: 'De 16,40 €/kg a 18,40 €/kg · 19 may.',
                when: 'hace 4 h' }} />
              <MEPAlertRow alert={{ sev: 'med', kind: 'due',
                text: 'Pago vence en 7 días',
                detail: 'Factura PA-2026-0982 · 612,18 €',
                when: 'ayer' }} />
            </div>
          </div>

          {/* Recent invoices */}
          <div className="card" style={{ padding: 0, overflow: 'hidden', flex: 1 }}>
            <div style={{ padding: '14px 16px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div className="subtitle">Facturas recientes</div>
              <a style={{ fontSize: 12.5, color: 'var(--mep-acc)', fontWeight: 500, cursor: 'pointer' }}>
                Ver todas (9)
              </a>
            </div>
            {SD.invoices.filter(i => i.supplier === 's4').concat([
              { id: 'r1', num: 'PA-2026-0961', date: '2026-05-12', total: 689.40, status: 'exported' },
              { id: 'r2', num: 'PA-2026-0941', date: '2026-05-04', total: 542.30, status: 'exported' },
            ]).slice(0, 5).map((inv, i, arr) => (
              <div key={inv.id} style={{
                padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10,
                borderTop: '1px solid var(--mep-divider)', cursor: 'pointer',
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="num" style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--mep-fg)' }}>{inv.num}</div>
                  <div style={{ fontSize: 11, color: 'var(--mep-fg-3)' }}>
                    {new Date(inv.date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}
                    {inv.items ? ` · ${inv.items} líneas` : ''}
                  </div>
                </div>
                <div className="num" style={{ fontSize: 13, fontWeight: 500, color: 'var(--mep-fg)' }}>
                  {SD.eur(inv.total)}
                </div>
                <span className={`badge badge-${inv.status === 'pending' ? 'pending' : inv.status === 'exported' ? 'exported' : 'confirmed'}`}
                  style={{ fontSize: 10, padding: '1px 5px' }}>
                  {inv.status === 'pending' ? 'Por revisar' : inv.status === 'exported' ? 'Exportada' : 'Confirmada'}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}

function KpiTile({ label, value, delta, sub, tone }) {
  return (
    <div className="card" style={{ padding: 14 }}>
      <div className="label" style={{ marginBottom: 6 }}>{label}</div>
      <div className="num" style={{ fontSize: 22, fontWeight: 600,
        color: tone === 'warn' ? 'var(--mep-warn)' : 'var(--mep-fg)', letterSpacing: -0.4, lineHeight: 1.1 }}>
        {value}
      </div>
      <div style={{ marginTop: 6, fontSize: 11.5, color: 'var(--mep-fg-3)' }}>
        {typeof delta === 'number' ? <MEPDelta value={delta} /> : sub}
      </div>
    </div>
  );
}

function InfoRow({ icon: Ic, label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5, color: 'var(--mep-fg-2)' }}>
      <Ic size={14} style={{ color: 'var(--mep-fg-3)', flexShrink: 0 }} />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
    </div>
  );
}

function fakePriceTrend(cur, prev) {
  // 10 plausible price points trending from prev to cur
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const t = i / 9;
    const base = prev + (cur - prev) * t;
    pts.push(base + (Math.sin(i * 1.3) * Math.abs(cur - prev) * 0.15));
  }
  return pts;
}

Object.assign(window, { MEPSuppliersList, MEPSupplierProfile });
