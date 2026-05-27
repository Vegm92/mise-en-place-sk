// Analytics — Spend + Prices

const AD = window.MEP_DATA;
const AI = window.MEPIcons;

// ── Analytics — Spend ────────────────────────────────────────────────────
function MEPAnalyticsSpend() {
  // 12-week stacked-bars
  const weeks12 = (() => {
    const out = [];
    for (let i = 0; i < 12; i++) {
      const base = 1400 + Math.sin(i * 0.7) * 300 + i * 40;
      out.push({
        label: 'S' + (i + 8),
        carne: Math.round(base * 0.32 + Math.sin(i * 1.1) * 80),
        pescado: Math.round(base * 0.24 + Math.cos(i * 0.9) * 60),
        verdura: Math.round(base * 0.20 + Math.sin(i * 1.5) * 40),
        vinos: Math.round(base * 0.12),
        otros: Math.round(base * 0.12),
      });
    }
    return out.map(w => ({ ...w, total: w.carne + w.pescado + w.verdura + w.vinos + w.otros }));
  })();

  // Top 5 suppliers by spend in period
  const top5 = AD.suppliers.slice().sort((a, b) => b.spend - a.spend).slice(0, 5);
  const maxSup = top5[0].spend;

  // Spend by day of week (synthesized)
  const dows = [
    { d: 'Lun', v: 384 }, { d: 'Mar', v: 1241 }, { d: 'Mié', v: 921 },
    { d: 'Jue', v: 1583 }, { d: 'Vie', v: 2418 }, { d: 'Sáb', v: 2106 }, { d: 'Dom', v: 187 },
  ];
  const maxDow = Math.max(...dows.map(d => d.v));

  return (
    <main style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '20px 24px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Header strip */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: 'var(--mep-fg)', letterSpacing: -0.3 }}>
            ¿Dónde va el dinero?
          </h2>
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', gap: 0, background: 'var(--mep-surface-2)',
            borderRadius: 6, padding: 2, border: '1px solid var(--mep-divider)' }}>
            {['7 d', '30 d', '90 d', '12 m'].map((p, i) => (
              <button key={p} style={{
                border: 0, background: i === 2 ? 'var(--mep-surface)' : 'transparent',
                color: i === 2 ? 'var(--mep-fg)' : 'var(--mep-fg-3)',
                fontSize: 12, fontWeight: i === 2 ? 500 : 400,
                padding: '5px 12px', borderRadius: 4, cursor: 'pointer',
                fontFamily: 'inherit',
                boxShadow: i === 2 ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
              }}>{p}</button>
            ))}
          </div>
          <button className="btn btn-secondary"><AI.Download size={13} /> Exportar CSV</button>
        </div>

        {/* KPI row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          <KpiStat label="Gasto total · 90 d" value={AD.eurc(weeks12.reduce((s, w) => s + w.total, 0))}
            delta={+9.4} ctx="vs. trimestre anterior" />
          <KpiStat label="Media semanal" value={AD.eur(weeks12.reduce((s, w) => s + w.total, 0) / weeks12.length)}
            delta={+4.1} ctx="vs. trimestre anterior" />
          <KpiStat label="Mejor categoría" value="Verduras" sub="−6,2% vs. trimestre anterior" tone="pos" />
          <KpiStat label="Peor categoría" value="Pescado" sub="+18,4% vs. trimestre anterior" tone="neg" />
        </div>

        {/* Big stacked bar chart */}
        <div className="card" style={{ padding: '16px 16px 12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <div>
              <div className="subtitle">Gasto por semana · apilado por categoría</div>
              <div style={{ fontSize: 12, color: 'var(--mep-fg-3)', marginTop: 2 }}>
                Últimos 90 días · semanas ISO 8 a 19
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
              {AD.categories.map(c => (
                <div key={c.key} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className="swatch" style={{ background: c.color, width: 10, height: 10, borderRadius: 2 }} />
                  <span style={{ fontSize: 11.5, color: 'var(--mep-fg-2)' }}>{c.label}</span>
                </div>
              ))}
            </div>
          </div>
          <div style={{ height: 260, marginTop: 16 }}>
            <MEPSpendChart weeks={weeks12} categories={AD.categories} height={260} showLegend={false} highlightIdx={9} />
          </div>
        </div>

        {/* Secondary charts row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr 1fr', gap: 12 }}>
          {/* Top 5 suppliers */}
          <div className="card" style={{ padding: '14px 16px' }}>
            <div className="subtitle" style={{ marginBottom: 4 }}>Top 5 proveedores</div>
            <div style={{ fontSize: 12, color: 'var(--mep-fg-3)', marginBottom: 14 }}>Por gasto · 90 días</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {top5.map(s => {
                const pct = (s.spend / maxSup) * 100;
                return (
                  <div key={s.id}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                      <span style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--mep-fg)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>
                        {s.name}
                      </span>
                      <span className="num" style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--mep-fg)' }}>
                        {AD.eur(s.spend)}
                      </span>
                    </div>
                    <div style={{ height: 8, borderRadius: 4, background: 'var(--mep-surface-2)', overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: s.color }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Day of week */}
          <div className="card" style={{ padding: '14px 16px' }}>
            <div className="subtitle" style={{ marginBottom: 4 }}>Por día de la semana</div>
            <div style={{ fontSize: 12, color: 'var(--mep-fg-3)', marginBottom: 14 }}>
              Patrón de entregas · media de 90 d
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 4,
              height: 138 }}>
              {dows.map((d, i) => {
                const h = (d.v / maxDow) * 120;
                const isWeekend = i >= 5;
                return (
                  <div key={d.d} style={{ flex: 1, display: 'flex', flexDirection: 'column',
                    alignItems: 'center', gap: 4 }}>
                    <span className="num" style={{ fontSize: 10, fontWeight: 500, color: 'var(--mep-fg-2)' }}>
                      {(d.v / 1000).toFixed(1).replace('.', ',')}k
                    </span>
                    <div style={{
                      width: '100%', height: h, borderRadius: 3,
                      background: i === 4 ? 'var(--mep-acc)' : (isWeekend ? 'var(--mep-fg-4)' : 'var(--mep-surface-2)'),
                      border: i === 4 ? 'none' : `1px solid var(--mep-divider)`,
                    }} />
                    <span style={{ fontSize: 10.5, color: 'var(--mep-fg-3)' }}>{d.d}</span>
                  </div>
                );
              })}
            </div>
            <div style={{ fontSize: 11, color: 'var(--mep-fg-3)', marginTop: 10, paddingTop: 10,
              borderTop: '1px solid var(--mep-divider)' }}>
              <span style={{ color: 'var(--mep-acc)', fontWeight: 500 }}>Viernes</span> concentra el 28% del gasto semanal
            </div>
          </div>

          {/* MoM comparison */}
          <div className="card" style={{ padding: '14px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <div className="subtitle">Mes a mes</div>
            </div>
            <div style={{ fontSize: 12, color: 'var(--mep-fg-3)', marginBottom: 14 }}>
              Abril vs. mayo (al día 19)
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {AD.categories.map(c => {
                const prev = 1000 + Math.random() * 1500;
                const cur = prev * (0.85 + Math.random() * 0.4);
                const max = Math.max(prev, cur);
                return (
                  <div key={c.key}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, marginBottom: 3 }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--mep-fg-2)' }}>
                        <span className="swatch" style={{ background: c.color }} /> {c.label}
                      </span>
                      <MEPDelta value={((cur - prev) / prev) * 100} />
                    </div>
                    <div style={{ display: 'flex', gap: 2, height: 6 }}>
                      <div style={{ width: `${(prev / max) * 50}%`, background: c.color, opacity: 0.4, borderRadius: 2 }} />
                      <div style={{ flex: 1 }} />
                    </div>
                    <div style={{ display: 'flex', gap: 2, height: 6, marginTop: 2 }}>
                      <div style={{ width: `${(cur / max) * 50}%`, background: c.color, borderRadius: 2 }} />
                      <div style={{ flex: 1 }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Detail table — by category */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            borderBottom: '1px solid var(--mep-divider)' }}>
            <div className="subtitle">Detalle por producto</div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <FilterChip2 label="Agrupar" value="Categoría" />
              <FilterChip2 label="Ordenar" value="Gasto ↓" />
            </div>
          </div>
          <table className="tbl">
            <thead>
              <tr>
                <th style={{ width: 40 }}></th>
                <th>Producto</th>
                <th>Proveedor</th>
                <th className="num" style={{ width: 100 }}>Cant. total</th>
                <th className="num" style={{ width: 110 }}>Gasto total</th>
                <th className="num" style={{ width: 110 }}>Precio medio</th>
                <th className="num" style={{ width: 70 }}>Δ precio</th>
              </tr>
            </thead>
            <tbody>
              {/* Category group: Pescado */}
              <tr style={{ background: 'var(--mep-surface-2)' }}>
                <td><AI.ChevronDown size={12} style={{ color: 'var(--mep-fg-2)' }} /></td>
                <td colSpan={3} style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--mep-fg)' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <span className="swatch" style={{ background: '#4d5b7a', width: 10, height: 10, borderRadius: 2 }} />
                    Pescado <span style={{ color: 'var(--mep-fg-3)', fontWeight: 400 }}>· 9 productos</span>
                  </span>
                </td>
                <td className="num" style={{ fontSize: 13, fontWeight: 600 }}>{AD.eur(3104.92)}</td>
                <td colSpan={2}></td>
              </tr>
              {[
                ['Merluza fresca', 'Pescados Atlántico Vigo', '24,80 kg', '456,32 €', '18,40 €/kg', +12.0],
                ['Lubina salvaje', 'Pescados Atlántico Vigo', '18,40 kg', '456,32 €', '24,80 €/kg', +2.5],
                ['Pulpo cocido',   'Pescados Atlántico Vigo', '12,80 kg', '364,80 €', '28,50 €/kg', 0],
                ['Almejas finas',  'Pescados Atlántico Vigo', '10,20 kg', '326,40 €', '32,00 €/kg', +4.9],
              ].map((r, i) => (
                <tr key={i} className="row">
                  <td></td>
                  <td style={{ fontSize: 13, fontWeight: 500, color: 'var(--mep-fg)' }}>{r[0]}</td>
                  <td style={{ fontSize: 12.5, color: 'var(--mep-fg-2)' }}>{r[1]}</td>
                  <td className="num" style={{ color: 'var(--mep-fg-2)' }}>{r[2]}</td>
                  <td className="num" style={{ fontWeight: 500 }}>{r[3]}</td>
                  <td className="num" style={{ color: 'var(--mep-fg-2)' }}>{r[4]}</td>
                  <td className="num">
                    {r[5] === 0 ? <span style={{ color: 'var(--mep-fg-3)', fontSize: 11.5 }}>—</span>
                      : <MEPDelta value={r[5]} />}
                  </td>
                </tr>
              ))}
              {/* Category group: Carne (collapsed) */}
              <tr style={{ background: 'var(--mep-surface-2)', cursor: 'pointer' }}>
                <td><AI.ChevronRight size={12} style={{ color: 'var(--mep-fg-2)' }} /></td>
                <td colSpan={3} style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--mep-fg)' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <span className="swatch" style={{ background: '#7a5b3a', width: 10, height: 10, borderRadius: 2 }} />
                    Carne <span style={{ color: 'var(--mep-fg-3)', fontWeight: 400 }}>· 14 productos</span>
                  </span>
                </td>
                <td className="num" style={{ fontSize: 13, fontWeight: 600 }}>{AD.eur(4218.40)}</td>
                <td colSpan={2}></td>
              </tr>
              <tr style={{ background: 'var(--mep-surface-2)', cursor: 'pointer' }}>
                <td><AI.ChevronRight size={12} style={{ color: 'var(--mep-fg-2)' }} /></td>
                <td colSpan={3} style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--mep-fg)' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <span className="swatch" style={{ background: '#3d6b5a', width: 10, height: 10, borderRadius: 2 }} />
                    Verdura <span style={{ color: 'var(--mep-fg-3)', fontWeight: 400 }}>· 22 productos</span>
                  </span>
                </td>
                <td className="num" style={{ fontSize: 13, fontWeight: 600 }}>{AD.eur(2867.15)}</td>
                <td colSpan={2}></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}

function KpiStat({ label, value, delta, ctx, sub, tone }) {
  return (
    <div className="card" style={{ padding: 14 }}>
      <div className="label" style={{ marginBottom: 6 }}>{label}</div>
      <div className="num" style={{ fontSize: 22, fontWeight: 600,
        color: tone === 'pos' ? 'var(--mep-pos)' : tone === 'neg' ? 'var(--mep-neg)' : 'var(--mep-fg)',
        letterSpacing: -0.4, lineHeight: 1.1 }}>
        {value}
      </div>
      <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
        {typeof delta === 'number' && <MEPDelta value={delta} />}
        <span style={{ fontSize: 11.5, color: 'var(--mep-fg-3)' }}>{ctx || sub}</span>
      </div>
    </div>
  );
}

// ── Analytics — Prices ───────────────────────────────────────────────────
function MEPAnalyticsPrices() {
  // Curated product list with price history
  const products = [
    { name: 'Aceite oliva virgen extra', sup: 'Aceites Gómez', cat: '#8a6d2d', unit: 'L', cur: 4.96, prev: 4.20,
      hist: [3.95, 4.10, 4.15, 4.20, 4.20, 4.20, 4.96], last: '15 may.' },
    { name: 'Merluza fresca', sup: 'Pescados Atlántico', cat: '#4d5b7a', unit: 'kg', cur: 18.40, prev: 16.40,
      hist: [15.20, 16.40, 16.40, 16.20, 16.40, 16.40, 18.40], last: '19 may.' },
    { name: 'Solomillo de ternera ibérica', sup: 'Cárnicas Ibérico', cat: '#7a5b3a', unit: 'kg', cur: 28.40, prev: 26.80,
      hist: [25.20, 26.40, 26.80, 26.80, 27.20, 26.80, 28.40], last: '19 may.' },
    { name: 'Cordero lechal', sup: 'Cárnicas Ibérico', cat: '#7a5b3a', unit: 'kg', cur: 28.90, prev: 27.40,
      hist: [26.50, 27.00, 27.40, 27.40, 27.40, 27.40, 28.90], last: '19 may.' },
    { name: 'Almejas finas', sup: 'Pescados Atlántico', cat: '#4d5b7a', unit: 'kg', cur: 32.00, prev: 30.50,
      hist: [28.50, 29.00, 30.50, 30.50, 30.50, 30.50, 32.00], last: '19 may.' },
    { name: 'Gambas blancas', sup: 'Pescados Atlántico', cat: '#4d5b7a', unit: 'kg', cur: 38.20, prev: 35.80,
      hist: [34.00, 34.50, 35.80, 35.80, 36.20, 35.80, 38.20], last: '12 may.' },
    { name: 'Bacalao desalado', sup: 'Pescados Atlántico', cat: '#4d5b7a', unit: 'kg', cur: 22.80, prev: 21.40,
      hist: [20.50, 21.40, 21.40, 21.40, 21.40, 21.40, 22.80], last: '12 may.' },
    { name: 'Vino tinto Ribera reserva', sup: 'Bodegas Solana', cat: '#7a3a4a', unit: 'bot.', cur: 6.40, prev: 6.10,
      hist: [5.90, 6.10, 6.10, 6.10, 6.10, 6.10, 6.40], last: '12 may.' },
    // drops
    { name: 'Tomate rama', sup: 'Mercavera', cat: '#3d6b5a', unit: 'kg', cur: 2.10, prev: 2.40,
      hist: [2.80, 2.60, 2.40, 2.40, 2.40, 2.40, 2.10], last: '19 may.' },
    { name: 'Pimiento rojo', sup: 'Mercavera', cat: '#3d6b5a', unit: 'kg', cur: 2.85, prev: 3.20,
      hist: [3.40, 3.40, 3.20, 3.20, 3.20, 3.20, 2.85], last: '19 may.' },
    { name: 'Lechuga romana', sup: 'Mercavera', cat: '#3d6b5a', unit: 'ud.', cur: 0.90, prev: 0.90,
      hist: [0.85, 0.90, 0.90, 0.90, 0.90, 0.90, 0.90], last: '19 may.' },
    { name: 'Patata agria', sup: 'Mercavera', cat: '#3d6b5a', unit: 'kg', cur: 0.85, prev: 0.92,
      hist: [0.95, 0.92, 0.92, 0.90, 0.90, 0.92, 0.85], last: '19 may.' },
  ];

  // Sort by |delta| desc
  const withDelta = products.map(p => ({ ...p, deltaPct: ((p.cur - p.prev) / p.prev) * 100 }));
  withDelta.sort((a, b) => Math.abs(b.deltaPct) - Math.abs(a.deltaPct));

  return (
    <main style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '20px 24px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: 'var(--mep-fg)', letterSpacing: -0.3 }}>
            ¿Qué precios están cambiando?
          </h2>
          <div style={{ flex: 1 }} />
        </div>

        {/* Toolbar */}
        <div className="card" style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
            <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--mep-fg-3)' }}>
              <AI.Search size={14} />
            </span>
            <input className="input" style={{ paddingLeft: 32, width: '100%' }}
              placeholder="Buscar producto…" />
          </div>
          <FilterChip2 label="Proveedor" value="Todos" />
          <FilterChip2 label="Categoría" value="Todas" />
          <FilterChip2 label="Cambios" value="≥ 5% absoluto" />
          <FilterChip2 label="Periodo" value="90 días" />
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', gap: 0, background: 'var(--mep-surface-2)',
            borderRadius: 6, padding: 2, border: '1px solid var(--mep-divider)' }}>
            {['|Δ| ↓', 'A-Z', 'Precio'].map((p, i) => (
              <button key={p} style={{
                border: 0, background: i === 0 ? 'var(--mep-surface)' : 'transparent',
                color: i === 0 ? 'var(--mep-fg)' : 'var(--mep-fg-3)',
                fontSize: 12, fontWeight: i === 0 ? 500 : 400,
                padding: '5px 10px', borderRadius: 4, cursor: 'pointer',
                fontFamily: 'inherit',
                boxShadow: i === 0 ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
              }}>{p}</button>
            ))}
          </div>
        </div>

        {/* Summary strip */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          <KpiStat label="Productos seguidos" value="42" sub="en 7 proveedores" />
          <KpiStat label="Subidas (90 d)" value="11" sub="3 por encima del 10%" tone="neg" />
          <KpiStat label="Bajadas (90 d)" value="6" sub="ahorro mensual estimado 84 €" tone="pos" />
          <KpiStat label="Sin cambios" value="25" sub="precios estables" />
        </div>

        {/* Price cards grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          {withDelta.map((p, i) => (
            <PriceCard key={p.name} product={p} expanded={i === 0} />
          ))}
        </div>
      </div>
    </main>
  );
}

function PriceCard({ product, expanded }) {
  const p = product;
  const up = p.deltaPct > 0.01;
  const down = p.deltaPct < -0.01;
  const flat = !up && !down;
  const sign = up ? 'neg' : down ? 'pos' : 'fg-3';
  const lineColor = up ? 'var(--mep-neg)' : down ? 'var(--mep-pos)' : 'var(--mep-fg-3)';

  return (
    <div className="card" style={{
      padding: '14px 14px 12px',
      gridColumn: expanded ? 'span 2' : 'span 1',
      borderColor: expanded ? 'var(--mep-acc-ring)' : 'var(--mep-border)',
      boxShadow: expanded ? '0 0 0 3px var(--mep-acc-ring), var(--mep-shadow-card)' : 'var(--mep-shadow-card)',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <span style={{ width: 4, height: 36, borderRadius: 2, background: p.cat, flexShrink: 0, marginTop: 3 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--mep-fg)', letterSpacing: -0.1,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {p.name}
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--mep-fg-3)' }}>{p.sup}</div>
        </div>
        <span className="num" style={{
          fontSize: 11, fontWeight: 600,
          padding: '2px 6px', borderRadius: 4,
          background: up ? 'var(--mep-neg-soft)' : down ? 'var(--mep-pos-soft)' : 'var(--mep-hover)',
          color: up ? 'var(--mep-neg)' : down ? 'var(--mep-pos)' : 'var(--mep-fg-3)',
          display: 'inline-flex', alignItems: 'center', gap: 3,
        }}>
          {up ? '↑' : down ? '↓' : '—'} {flat ? '0%' : Math.abs(p.deltaPct).toFixed(1).replace('.', ',') + '%'}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 12 }}>
        <span className="num" style={{ fontSize: 26, fontWeight: 600, color: 'var(--mep-fg)', letterSpacing: -0.5, lineHeight: 1 }}>
          {p.cur.toFixed(2).replace('.', ',')} €
        </span>
        <span style={{ fontSize: 12, color: 'var(--mep-fg-3)' }}>/ {p.unit}</span>
        {!flat && (
          <span className="num" style={{ marginLeft: 'auto', fontSize: 12.5, color: 'var(--mep-fg-3)',
            textDecoration: 'line-through' }}>
            {p.prev.toFixed(2).replace('.', ',')} €
          </span>
        )}
      </div>

      {/* Sparkline */}
      <div style={{ marginTop: 10, height: expanded ? 110 : 38, position: 'relative' }}>
        <PriceHistoryChart hist={p.hist} color={lineColor} tall={expanded} />
      </div>

      {expanded ? (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--mep-divider)',
          display: 'flex', gap: 14 }}>
          <ExpStat label="Min · 90 d" value={Math.min(...p.hist).toFixed(2).replace('.', ',') + ' €'} />
          <ExpStat label="Max · 90 d" value={Math.max(...p.hist).toFixed(2).replace('.', ',') + ' €'} />
          <ExpStat label="Media" value={(p.hist.reduce((s, h) => s + h, 0) / p.hist.length).toFixed(2).replace('.', ',') + ' €'} />
          <ExpStat label="Vs. media" value={(((p.cur / (p.hist.reduce((s, h) => s + h, 0) / p.hist.length)) - 1) * 100).toFixed(1).replace('.', ',') + '%'} tone={sign} />
          <div style={{ flex: 1 }} />
          <ExpStat label="Último pedido" value={p.last} />
        </div>
      ) : (
        <div style={{ marginTop: 6, fontSize: 11, color: 'var(--mep-fg-3)' }}>
          Último pedido <span className="num" style={{ color: 'var(--mep-fg-2)' }}>{p.last}</span>
        </div>
      )}
    </div>
  );
}

function PriceHistoryChart({ hist, color, tall }) {
  const min = Math.min(...hist), max = Math.max(...hist);
  const range = max - min || 1;
  return (
    <svg width="100%" height="100%" viewBox={`0 0 100 ${tall ? 30 : 20}`} preserveAspectRatio="none" style={{ display: 'block' }}>
      <defs>
        <linearGradient id={`ph-${color.replace(/[^a-z]/gi, '')}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.20" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {(() => {
        const innerH = tall ? 26 : 16;
        const pad = tall ? 2 : 2;
        const pts = hist.map((v, i) => {
          const x = (i / (hist.length - 1)) * 100;
          const y = pad + (1 - (v - min) / range) * innerH;
          return [x, y];
        });
        const path = pts.map((pt, i) => (i === 0 ? 'M' : 'L') + pt[0].toFixed(2) + ' ' + pt[1].toFixed(2)).join(' ');
        return (
          <>
            <path d={path + ` L 100 ${tall ? 30 : 20} L 0 ${tall ? 30 : 20} Z`}
              fill={`url(#ph-${color.replace(/[^a-z]/gi, '')})`} />
            <path d={path} fill="none" stroke={color} strokeWidth={tall ? 1 : 1.2}
              vectorEffect="non-scaling-stroke" />
            {pts.map(([x, y], i) => (
              <circle key={i} cx={x} cy={y} r={tall ? 1 : 0.8} fill={color}
                vectorEffect="non-scaling-stroke" />
            ))}
            {tall && pts.map(([x, y], i) => i === pts.length - 1 ? (
              <circle key={`hi-${i}`} cx={x} cy={y} r={1.8} fill={color} stroke="var(--mep-surface)" strokeWidth="0.6"
                vectorEffect="non-scaling-stroke" />
            ) : null)}
          </>
        );
      })()}
    </svg>
  );
}

function ExpStat({ label, value, tone }) {
  return (
    <div>
      <div style={{ fontSize: 10.5, color: 'var(--mep-fg-3)', textTransform: 'uppercase', letterSpacing: 0.04, fontWeight: 500 }}>{label}</div>
      <div className="num" style={{ fontSize: 13, fontWeight: 500,
        color: tone === 'neg' ? 'var(--mep-neg)' : tone === 'pos' ? 'var(--mep-pos)' : 'var(--mep-fg)',
        marginTop: 2 }}>
        {value}
      </div>
    </div>
  );
}

Object.assign(window, { MEPAnalyticsSpend, MEPAnalyticsPrices });
