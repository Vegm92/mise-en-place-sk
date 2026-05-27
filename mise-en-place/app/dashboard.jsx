// Dashboard — primary + alternate layouts.

const D = window.MEP_DATA;
const { eur, eurc } = D;
const { ChevronRight, ChevronDown, AlertTriangle, Tag, Clock, Info, X,
  Sparkle, Plus, Check, Calendar } = window.MEPIcons;

// ── Hero KPI Card ──────────────────────────────────────────────────────────
function MEPKpiCard({ label, value, sub, delta, deltaCtx, spark, sparkColor = 'var(--mep-acc)', invert }) {
  return (
    <div className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <div className="label" style={{ marginBottom: 8 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, marginBottom: 6 }}>
        <div className="num" style={{ fontSize: 26, fontWeight: 600, color: 'var(--mep-fg)', letterSpacing: -0.6, lineHeight: 1.1 }}>
          {value}
        </div>
        {spark && <MEPSparkline data={spark} color={sparkColor} width={84} height={28} />}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {typeof delta === 'number' && <MEPDelta value={delta} invert={invert} />}
        <span style={{ fontSize: 12, color: 'var(--mep-fg-3)' }}>{deltaCtx}</span>
      </div>
      {sub && <div style={{ fontSize: 11.5, color: 'var(--mep-fg-3)', marginTop: 6 }}>{sub}</div>}
    </div>
  );
}

// ── Stacked weekly bar chart ──────────────────────────────────────────────
function MEPSpendChart({ weeks = D.weeks, categories = D.categories, height = 230, showLegend = true,
  highlightIdx = null }) {
  const max = Math.max(...weeks.map(w => w.total));
  const padTop = 18, padBottom = 26, padLeft = 36, padRight = 8;
  const innerH = height - padTop - padBottom;
  return (
    <div style={{ width: '100%' }}>
      <div style={{ position: 'relative', height }}>
        <svg width="100%" height={height} style={{ display: 'block', overflow: 'visible' }}>
          {/* gridlines */}
          {[0, 0.25, 0.5, 0.75, 1].map((p, i) => (
            <g key={i}>
              <line x1={padLeft} x2="100%" y1={padTop + innerH * (1 - p)} y2={padTop + innerH * (1 - p)}
                stroke="var(--mep-divider)" strokeWidth="1" />
              <text x={padLeft - 8} y={padTop + innerH * (1 - p) + 3.5}
                fontSize="10" fill="var(--mep-fg-3)" textAnchor="end" className="num">
                {p === 0 ? '0' : (max * p / 1000).toFixed(1).replace('.', ',') + ' k €'}
              </text>
            </g>
          ))}
          {/* bars */}
          {weeks.map((w, wi) => {
            const colW = `calc((100% - ${padLeft + padRight}px) / ${weeks.length})`;
            const barW = 28;
            const xLeft = `calc(${padLeft}px + (${colW}) * ${wi} + (${colW}) / 2 - ${barW / 2}px)`;
            let stackY = padTop + innerH;
            const dim = highlightIdx !== null && highlightIdx !== wi;
            return (
              <g key={wi} style={{ opacity: dim ? 0.35 : 1, transition: 'opacity 150ms' }}>
                {categories.map((c) => {
                  const v = w[c.key] || 0;
                  const h = (v / max) * innerH;
                  stackY -= h;
                  return (
                    <rect key={c.key}
                      x={xLeft} y={stackY} width={barW} height={Math.max(h, 0.5)}
                      fill={c.color}
                      style={{ filter: highlightIdx === wi ? 'brightness(1.08)' : 'none' }}
                    />
                  );
                })}
                <text x={xLeft} dx={barW / 2} y={height - 10}
                  textAnchor="middle" fontSize="11" fill="var(--mep-fg-3)" className="num">
                  {w.label}
                </text>
                {highlightIdx === wi && (
                  <text x={xLeft} dx={barW / 2} y={stackY - 6}
                    textAnchor="middle" fontSize="11" fontWeight="600" fill="var(--mep-fg)" className="num">
                    {(w.total / 1000).toFixed(2).replace('.', ',')} k €
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
      {showLegend && (
        <div style={{ display: 'flex', gap: 14, paddingLeft: padLeft, marginTop: 8, flexWrap: 'wrap' }}>
          {categories.map(c => (
            <div key={c.key} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="swatch" style={{ background: c.color }} />
              <span style={{ fontSize: 11.5, color: 'var(--mep-fg-2)' }}>{c.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Alert row ─────────────────────────────────────────────────────────────
function MEPAlertRow({ alert }) {
  const palettes = {
    high: { bg: 'var(--mep-neg-soft)', icon: 'var(--mep-neg)', dot: 'var(--mep-neg)' },
    med:  { bg: 'var(--mep-warn-soft)', icon: 'var(--mep-warn)', dot: 'var(--mep-warn)' },
    low:  { bg: 'var(--mep-info-soft)', icon: 'var(--mep-info)', dot: 'var(--mep-info)' },
  };
  const icons = {
    price: AlertTriangle, budget: Tag, due: Clock, new: Info,
  };
  const p = palettes[alert.sev];
  const Ic = icons[alert.kind] || Info;
  return (
    <div style={{
      padding: '10px 12px',
      borderRadius: 8,
      background: p.bg,
      display: 'flex', alignItems: 'flex-start', gap: 10,
    }}>
      <div style={{ color: p.icon, marginTop: 1 }}>
        <Ic size={15} />
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 12.5, color: 'var(--mep-fg)', fontWeight: 500, lineHeight: 1.35 }}>
          {alert.text}
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--mep-fg-2)', marginTop: 3 }}>
          {alert.detail}
        </div>
      </div>
      <div style={{ fontSize: 11, color: 'var(--mep-fg-3)', whiteSpace: 'nowrap', marginTop: 2 }}>
        {alert.when}
      </div>
    </div>
  );
}

// ── Supplier breakdown row ────────────────────────────────────────────────
function MEPSupplierRow({ s, total, maxPct }) {
  const pct = (s.spend / total) * 100;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 50px', alignItems: 'center',
      gap: 12, padding: '7px 0', borderBottom: '1px solid var(--mep-divider)' }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span className="swatch" style={{ background: s.color, width: 6, height: 6, borderRadius: 1 }} />
          <span style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--mep-fg)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {s.name}
          </span>
        </div>
        <div style={{ height: 4, borderRadius: 2, background: 'var(--mep-divider)', overflow: 'hidden' }}>
          <div style={{ width: `${(pct / maxPct) * 100}%`, height: '100%', background: s.color }} />
        </div>
      </div>
      <div className="num" style={{ fontSize: 12.5, color: 'var(--mep-fg)', textAlign: 'right' }}>
        {eur(s.spend)}
      </div>
      <div className="num" style={{ fontSize: 11.5, color: 'var(--mep-fg-3)', textAlign: 'right' }}>
        {pct.toFixed(1).replace('.', ',')}%
      </div>
    </div>
  );
}

// ── Dashboard A — Primary three-column ────────────────────────────────────
function MEPDashboardMain() {
  const k = D.kpis;
  const spark1 = D.days.map(d => d.carne + d.pescado + d.verdura + d.vinos + d.otros);
  const spark2 = spark1.map(v => v * 0.21 + Math.random() * 30);
  const totalSupplier = D.suppliers.reduce((s, x) => s + x.spend, 0);
  const topSuppliers = D.suppliers.slice().sort((a, b) => b.spend - a.spend).slice(0, 6);
  const maxSupplierPct = (topSuppliers[0].spend / totalSupplier) * 100;

  return (
    <main style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '20px 24px 0', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* KPI strip */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          <MEPKpiCard label="Gasto este mes"
            value={eurc(k.monthSpend)} delta={k.monthDelta} deltaCtx="vs. abril"
            sub={`${k.invCount} facturas · ${D.suppliers.length} proveedores`}
            spark={spark1} />
          <MEPKpiCard label="Media por proveedor"
            value={eur(k.avgPerSupplier)} delta={k.avgDelta} deltaCtx="vs. abril"
            sub="cargado actual"
            spark={spark2} />
          <MEPKpiCard label="Pendiente de pago"
            value={eur(k.pendingPay)} delta={k.pendingDelta} deltaCtx="vs. semana pasada"
            sub="3 facturas · vence en ≤ 14 d"
            spark={spark1.map(v => v * 0.16 + 50)} sparkColor="var(--mep-warn)" />
          <MEPKpiCard label="Presupuesto usado"
            value={k.budgetUsed + '%'} delta={k.budgetDelta} deltaCtx="vs. abril a 19/may." invert
            sub="con 12 días por delante"
            spark={[10, 22, 31, 39, 48, 56, 64, 72]} sparkColor="var(--mep-pos)" />
        </div>

        {/* Spend chart + Alerts */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
          {/* Spend chart */}
          <div className="card" style={{ padding: '16px 16px 14px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <div>
                <div className="subtitle">Gasto por semana</div>
                <div style={{ fontSize: 12, color: 'var(--mep-fg-3)', marginTop: 2 }}>
                  Apiladas por categoría · últimos 28 días
                </div>
              </div>
              <div style={{ display: 'flex', gap: 0, background: 'var(--mep-surface-2)',
                borderRadius: 6, padding: 2, border: '1px solid var(--mep-divider)' }}>
                {['7 d', '30 d', '90 d'].map((p, i) => (
                  <button key={p} style={{
                    border: 0, background: i === 1 ? 'var(--mep-surface)' : 'transparent',
                    color: i === 1 ? 'var(--mep-fg)' : 'var(--mep-fg-3)',
                    fontSize: 11.5, fontWeight: i === 1 ? 500 : 400,
                    padding: '4px 10px', borderRadius: 4, cursor: 'pointer',
                    boxShadow: i === 1 ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
                  }}>{p}</button>
                ))}
              </div>
            </div>
            <div style={{ flex: 1, paddingTop: 8 }}>
              <MEPSpendChart highlightIdx={2} />
            </div>
          </div>

          {/* Alert feed */}
          <div className="card" style={{ padding: '14px 14px 12px', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div className="subtitle">Alertas</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--mep-fg-3)' }}>
                <span className="num" style={{ color: 'var(--mep-neg)', fontWeight: 600 }}>2</span>
                <span>graves</span>
                <span style={{ color: 'var(--mep-divider)' }}>·</span>
                <span className="num" style={{ color: 'var(--mep-warn)', fontWeight: 600 }}>2</span>
                <span>medias</span>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, overflow: 'hidden' }}>
              {D.alerts.slice(0, 5).map(a => <MEPAlertRow key={a.id} alert={a} />)}
            </div>
            <div style={{ marginTop: 'auto', paddingTop: 10, borderTop: '1px solid var(--mep-divider)', marginTop: 10 }}>
              <button className="btn btn-ghost" style={{ width: '100%', justifyContent: 'space-between', padding: '0 6px', height: 28 }}>
                <span style={{ fontSize: 12 }}>Ver todas las alertas</span>
                <ChevronRight size={13} />
              </button>
            </div>
          </div>
        </div>

        {/* Supplier breakdown + Recent invoices */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
          <div className="card" style={{ padding: '14px 16px 8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div>
                <div className="subtitle">Proveedores principales</div>
                <div style={{ fontSize: 12, color: 'var(--mep-fg-3)', marginTop: 2 }}>
                  Por gasto · este mes
                </div>
              </div>
              <button className="btn btn-ghost" style={{ height: 28, fontSize: 12 }}>
                Ver todos <ChevronRight size={12} />
              </button>
            </div>
            <div>
              {topSuppliers.map(s => (
                <MEPSupplierRow key={s.id} s={s} total={totalSupplier} maxPct={maxSupplierPct} />
              ))}
            </div>
          </div>

          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div className="subtitle">Facturas recientes</div>
                <div style={{ fontSize: 12, color: 'var(--mep-fg-3)', marginTop: 2 }}>
                  Últimas 6 procesadas
                </div>
              </div>
              <button className="btn btn-ghost" style={{ height: 28, fontSize: 12 }}>
                Ver todas <ChevronRight size={12} />
              </button>
            </div>
            <table className="tbl" style={{ borderTop: '1px solid var(--mep-divider)' }}>
              <thead>
                <tr>
                  <th>Proveedor</th>
                  <th>N.º</th>
                  <th>Fecha</th>
                  <th className="num">Total</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {D.invoices.slice(0, 6).map(inv => {
                  const s = D.supplierById[inv.supplier];
                  return (
                    <tr key={inv.id} className="row">
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span className="swatch" style={{ background: s.color }} />
                          <span style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--mep-fg)',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }}>
                            {s.name}
                          </span>
                        </div>
                      </td>
                      <td className="num" style={{ fontSize: 12, color: 'var(--mep-fg-2)' }}>{inv.num}</td>
                      <td className="num" style={{ fontSize: 12, color: 'var(--mep-fg-2)' }}>
                        {new Date(inv.date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}
                      </td>
                      <td className="num">{eur(inv.total)}</td>
                      <td>
                        <span className={`badge badge-${inv.status === 'pending' ? 'pending' : inv.status === 'exported' ? 'exported' : 'confirmed'}`}>
                          {inv.status === 'pending' ? 'Por revisar' : inv.status === 'exported' ? 'Exportada' : 'Confirmada'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  );
}

// ── Dashboard B — Alert-forward layout ────────────────────────────────────
function MEPDashboardAlertFirst() {
  const k = D.kpis;
  const spark1 = D.days.map(d => d.carne + d.pescado + d.verdura + d.vinos + d.otros);

  return (
    <main style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '20px 24px 0', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Hero alert banner */}
        <div className="card" style={{
          padding: '18px 20px',
          background: 'linear-gradient(90deg, var(--mep-neg-soft), transparent 70%)',
          border: '1px solid var(--mep-border)',
          display: 'flex', alignItems: 'center', gap: 16,
        }}>
          <div style={{
            width: 38, height: 38, borderRadius: 19,
            background: 'var(--mep-neg-soft)', color: 'var(--mep-neg)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <AlertTriangle size={18} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11.5, fontWeight: 500, letterSpacing: 0.02, textTransform: 'uppercase',
              color: 'var(--mep-neg)', marginBottom: 3 }}>
              2 alertas requieren tu atención
            </div>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--mep-fg)', letterSpacing: -0.1 }}>
              El aceite de oliva subió un <span className="num">18%</span> en el último pedido,
              y la merluza un <span className="num">12%</span>.
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--mep-fg-2)', marginTop: 4 }}>
              Revisa tus márgenes en platos con estos ingredientes antes del próximo pedido.
            </div>
          </div>
          <button className="btn btn-primary">Revisar precios</button>
          <button className="btn btn-ghost" style={{ width: 32, padding: 0, justifyContent: 'center' }}>
            <X size={14} />
          </button>
        </div>

        {/* Inline KPI strip — denser */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)' }}>
            <KpiInline label="Gasto este mes" value={eurc(k.monthSpend)} delta={k.monthDelta} ctx="vs. abril" />
            <KpiInline label="Media por proveedor" value={eur(k.avgPerSupplier)} delta={k.avgDelta} ctx="vs. abril" />
            <KpiInline label="Pendiente de pago" value={eur(k.pendingPay)} delta={k.pendingDelta} ctx="próximos 14 d" />
            <KpiInline label="Presupuesto usado" value={k.budgetUsed + '%'} delta={k.budgetDelta} ctx="vs. abril" invert lastChild />
          </div>
        </div>

        {/* Big spend chart */}
        <div className="card" style={{ padding: '16px 16px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 10 }}>
            <div>
              <div className="subtitle">Gasto por semana</div>
              <div style={{ fontSize: 12, color: 'var(--mep-fg-3)', marginTop: 2 }}>
                Apiladas por categoría · 30 días
              </div>
            </div>
            <div style={{ display: 'flex', gap: 18, alignItems: 'flex-end' }}>
              <KpiTuckedIn label="Media semanal" value={eur(D.weeks.reduce((s, w) => s + w.total, 0) / D.weeks.length)} />
              <KpiTuckedIn label="Mejor semana" value="S17" sub="2.084,90 €" />
              <KpiTuckedIn label="Peor semana" value="S20" sub="6.231,50 €" tone="neg" />
            </div>
          </div>
          <div style={{ height: 260 }}>
            <MEPSpendChart height={260} highlightIdx={3} />
          </div>
        </div>

        {/* Below: 50/50 split — Recent invoices + alerts list */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 12, marginBottom: 20 }}>
          <div className="card" style={{ padding: '14px 0 0', overflow: 'hidden' }}>
            <div style={{ padding: '0 16px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div className="subtitle">Por revisar</div>
                <div style={{ fontSize: 12, color: 'var(--mep-fg-3)', marginTop: 2 }}>
                  3 facturas extraídas esperan confirmación
                </div>
              </div>
              <button className="btn btn-secondary" style={{ height: 30, fontSize: 12.5 }}>
                Confirmar todas
              </button>
            </div>
            <table className="tbl" style={{ borderTop: '1px solid var(--mep-divider)' }}>
              <thead>
                <tr>
                  <th>Proveedor · N.º</th>
                  <th>Fecha</th>
                  <th>Líneas</th>
                  <th className="num">Total</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {D.invoices.filter(i => i.status === 'pending').slice(0, 3).map(inv => {
                  const s = D.supplierById[inv.supplier];
                  return (
                    <tr key={inv.id} className="row">
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span className="swatch" style={{ background: s.color }} />
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--mep-fg)' }}>{s.name}</div>
                            <div className="num" style={{ fontSize: 11.5, color: 'var(--mep-fg-3)' }}>{inv.num}</div>
                          </div>
                        </div>
                      </td>
                      <td className="num" style={{ fontSize: 12.5, color: 'var(--mep-fg-2)' }}>
                        {new Date(inv.date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}
                      </td>
                      <td className="num" style={{ fontSize: 12.5, color: 'var(--mep-fg-2)' }}>{inv.items}</td>
                      <td className="num" style={{ fontWeight: 500 }}>{eur(inv.total)}</td>
                      <td style={{ textAlign: 'right' }}>
                        <button className="btn btn-ghost" style={{ height: 26, padding: '0 8px', fontSize: 12 }}>
                          Revisar <ChevronRight size={12} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="card" style={{ padding: '14px 14px 14px' }}>
            <div className="subtitle" style={{ marginBottom: 10 }}>Alertas recientes</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {D.alerts.slice(0, 4).map(a => <MEPAlertRow key={a.id} alert={a} />)}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

function KpiInline({ label, value, delta, ctx, invert, lastChild }) {
  return (
    <div style={{
      padding: 16,
      borderRight: lastChild ? 'none' : '1px solid var(--mep-divider)',
    }}>
      <div className="label" style={{ marginBottom: 6 }}>{label}</div>
      <div className="num" style={{ fontSize: 22, fontWeight: 600, color: 'var(--mep-fg)', letterSpacing: -0.5, lineHeight: 1.1 }}>
        {value}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
        {typeof delta === 'number' && <MEPDelta value={delta} invert={invert} />}
        <span style={{ fontSize: 11.5, color: 'var(--mep-fg-3)' }}>{ctx}</span>
      </div>
    </div>
  );
}

function KpiTuckedIn({ label, value, sub, tone }) {
  return (
    <div style={{ textAlign: 'right' }}>
      <div style={{ fontSize: 10.5, color: 'var(--mep-fg-3)', letterSpacing: 0.02, textTransform: 'uppercase', marginBottom: 2 }}>{label}</div>
      <div className="num" style={{ fontSize: 14, fontWeight: 600,
        color: tone === 'neg' ? 'var(--mep-neg)' : 'var(--mep-fg)' }}>{value}</div>
      {sub && <div className="num" style={{ fontSize: 11, color: 'var(--mep-fg-3)' }}>{sub}</div>}
    </div>
  );
}

// ── Dashboard C — Calm "now / next / context" layout ──────────────────────
function MEPDashboardNowNext() {
  const k = D.kpis;
  const topSupplier = D.suppliers.slice().sort((a, b) => b.spend - a.spend).slice(0, 5);
  const totalSupplier = D.suppliers.reduce((s, x) => s + x.spend, 0);

  return (
    <main style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '24px 24px 0', display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 16,
        flex: 1, overflow: 'hidden' }}>
        {/* Left column — Now: this month at a glance */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
          <div className="card" style={{ padding: 20 }}>
            <div className="label" style={{ marginBottom: 4 }}>Mayo 2026 · al día 19</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 18 }}>
              <div className="num" style={{ fontSize: 44, fontWeight: 600, color: 'var(--mep-fg)', letterSpacing: -1, lineHeight: 1 }}>
                {eurc(k.monthSpend)}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <MEPDelta value={k.monthDelta} />
                <span style={{ fontSize: 11.5, color: 'var(--mep-fg-3)' }}>vs. abril a 19/may.</span>
              </div>
            </div>

            {/* Projection bar */}
            <div style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: 'var(--mep-fg-3)', marginBottom: 6 }}>
                <span>Real (19 días) <span className="num" style={{ color: 'var(--mep-fg)', fontWeight: 500, marginLeft: 6 }}>15.240,32 €</span></span>
                <span>Proyectado fin de mes <span className="num" style={{ color: 'var(--mep-fg)', fontWeight: 500, marginLeft: 6 }}>24.876,00 €</span></span>
              </div>
              <div style={{ position: 'relative', height: 10, borderRadius: 5, background: 'var(--mep-surface-2)', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '61%',
                  background: 'var(--mep-acc)', borderRadius: '5px 0 0 5px' }} />
                <div style={{ position: 'absolute', left: '61%', top: 0, bottom: 0, width: '39%',
                  background: 'repeating-linear-gradient(45deg, var(--mep-acc-soft), var(--mep-acc-soft) 5px, transparent 5px, transparent 10px)' }} />
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--mep-fg-3)', marginTop: 6 }}>
                A este ritmo superarías el presupuesto del mes (24.000 €) en <span className="num" style={{ color: 'var(--mep-neg)', fontWeight: 500 }}>876 €</span>.
              </div>
            </div>
          </div>

          {/* Mini chart */}
          <div className="card" style={{ padding: 16, flex: 1, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <div className="subtitle">Tendencia diaria</div>
              <div style={{ fontSize: 11.5, color: 'var(--mep-fg-3)' }}>Últimos 28 días</div>
            </div>
            <div style={{ flex: 1, paddingTop: 8 }}>
              <MEPDailyChart days={D.days} />
            </div>
          </div>

          {/* Top suppliers compact */}
          <div className="card" style={{ padding: '14px 16px' }}>
            <div className="subtitle" style={{ marginBottom: 10 }}>Top proveedores</div>
            <div>
              {topSupplier.map((s, i) => (
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 12,
                  padding: '6px 0', borderBottom: i < topSupplier.length - 1 ? '1px solid var(--mep-divider)' : '0' }}>
                  <span className="num" style={{ width: 18, fontSize: 11, color: 'var(--mep-fg-3)' }}>{i + 1}</span>
                  <span className="swatch" style={{ background: s.color }} />
                  <span style={{ flex: 1, fontSize: 12.5, color: 'var(--mep-fg)', fontWeight: 500 }}>{s.name}</span>
                  <span className="num" style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--mep-fg)' }}>{eur(s.spend)}</span>
                  <MEPDelta value={s.deltaPct} />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right column — Next: what to do */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
          <div className="card" style={{ padding: '16px 16px 12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div>
                <div className="subtitle">Para actuar hoy</div>
                <div style={{ fontSize: 11.5, color: 'var(--mep-fg-3)', marginTop: 2 }}>3 alertas activas · 2 facturas por revisar</div>
              </div>
              <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 22, height: 22, borderRadius: 11, fontSize: 11, fontWeight: 600,
                background: 'var(--mep-acc-soft)', color: 'var(--mep-acc)' }} className="num">5</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {D.alerts.slice(0, 4).map(a => <MEPActionRow key={a.id} alert={a} />)}
            </div>
          </div>

          <div className="card" style={{ padding: '14px 16px' }}>
            <div className="subtitle" style={{ marginBottom: 10 }}>Próximos vencimientos</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {D.invoices.filter(i => i.status === 'pending').slice(0, 3).map(inv => {
                const s = D.supplierById[inv.supplier];
                const due = new Date(inv.due), today = new Date('2026-05-19');
                const days = Math.round((due - today) / (1000 * 60 * 60 * 24));
                return (
                  <div key={inv.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 0' }}>
                    <div style={{
                      width: 44, height: 44, borderRadius: 8, flexShrink: 0,
                      background: 'var(--mep-surface-2)', border: '1px solid var(--mep-divider)',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <span className="num" style={{ fontSize: 16, fontWeight: 600, color: 'var(--mep-fg)', lineHeight: 1 }}>
                        {due.getDate()}
                      </span>
                      <span style={{ fontSize: 9, color: 'var(--mep-fg-3)', textTransform: 'uppercase' }}>
                        {due.toLocaleDateString('es-ES', { month: 'short' }).replace('.', '')}
                      </span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--mep-fg)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {s.name}
                      </div>
                      <div className="num" style={{ fontSize: 11.5, color: 'var(--mep-fg-3)' }}>
                        {inv.num} · vence en {days} d
                      </div>
                    </div>
                    <div className="num" style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--mep-fg)' }}>
                      {eur(inv.total)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="card" style={{ padding: '14px 16px', flex: 1 }}>
            <div className="subtitle" style={{ marginBottom: 10 }}>Cambios de precio destacados</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {[
                { name: 'Aceite oliva virgen extra', sup: 'Aceites Gómez', from: 4.20, to: 4.96, color: '#8a6d2d' },
                { name: 'Merluza fresca', sup: 'Pescados Atlántico', from: 16.40, to: 18.40, color: '#4d5b7a' },
                { name: 'Tomate rama', sup: 'Mercavera', from: 2.40, to: 2.10, color: '#3d6b5a', drop: true },
              ].map(p => (
                <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 12,
                  padding: '8px 0', borderBottom: '1px solid var(--mep-divider)' }}>
                  <span className="swatch" style={{ background: p.color, width: 4, height: 28, borderRadius: 2 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--mep-fg)' }}>{p.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--mep-fg-3)' }}>{p.sup}</div>
                  </div>
                  <div className="num" style={{ fontSize: 11.5, color: 'var(--mep-fg-3)', textDecoration: 'line-through' }}>
                    {p.from.toFixed(2).replace('.', ',')} €
                  </div>
                  <div className="num" style={{ fontSize: 13, fontWeight: 600, color: p.drop ? 'var(--mep-pos)' : 'var(--mep-neg)' }}>
                    {p.to.toFixed(2).replace('.', ',')} €
                  </div>
                  <MEPDelta value={((p.to - p.from) / p.from) * 100} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

function MEPActionRow({ alert }) {
  const palettes = {
    high: { dot: 'var(--mep-neg)' },
    med:  { dot: 'var(--mep-warn)' },
    low:  { dot: 'var(--mep-info)' },
  };
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '4px 0' }}>
      <span style={{
        width: 6, height: 6, borderRadius: 3, background: palettes[alert.sev].dot,
        flexShrink: 0, marginTop: 6,
      }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, color: 'var(--mep-fg)', fontWeight: 500, lineHeight: 1.35 }}>
          {alert.text}
        </div>
        <div style={{ fontSize: 11, color: 'var(--mep-fg-3)', marginTop: 2 }}>{alert.detail}</div>
      </div>
      <button className="btn btn-ghost" style={{ height: 24, padding: '0 6px', fontSize: 11.5 }}>
        Ver →
      </button>
    </div>
  );
}

// Daily mini line chart
function MEPDailyChart({ days }) {
  const totals = days.map(d => d.carne + d.pescado + d.verdura + d.vinos + d.otros);
  const max = Math.max(...totals), min = Math.min(...totals);
  const width = 1, height = 1; // normalized; SVG uses viewBox
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <svg width="100%" height="100%" viewBox="0 0 100 30" preserveAspectRatio="none" style={{ display: 'block' }}>
        <defs>
          <linearGradient id="dailygrad" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--mep-acc)" stopOpacity="0.16" />
            <stop offset="100%" stopColor="var(--mep-acc)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {(() => {
          const pts = totals.map((v, i) => {
            const x = (i / (totals.length - 1)) * 100;
            const y = 28 - ((v - min) / (max - min || 1)) * 25;
            return [x, y];
          });
          const path = pts.map((p, i) => (i === 0 ? 'M' : 'L') + p[0].toFixed(2) + ' ' + p[1].toFixed(2)).join(' ');
          return (
            <>
              <path d={path + ' L 100 30 L 0 30 Z'} fill="url(#dailygrad)" />
              <path d={path} fill="none" stroke="var(--mep-acc)" strokeWidth="0.7" vectorEffect="non-scaling-stroke" />
              {pts.map(([x, y], i) => (
                i % 7 === 0 ? <circle key={i} cx={x} cy={y} r="0.8" fill="var(--mep-acc)" vectorEffect="non-scaling-stroke" /> : null
              ))}
            </>
          );
        })()}
      </svg>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--mep-fg-3)', marginTop: 4 }}>
        {[0, 7, 14, 21, 27].map(i => (
          <span key={i} className="num">
            {new Date(days[i].date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }).replace('.', '')}
          </span>
        ))}
      </div>
    </div>
  );
}

Object.assign(window, {
  MEPDashboardMain, MEPDashboardAlertFirst, MEPDashboardNowNext,
  MEPKpiCard, MEPSpendChart, MEPAlertRow, MEPSupplierRow,
});
