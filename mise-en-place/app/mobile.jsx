// Mobile screens — built inside IOSDevice frames, sized for iPhone 16 (402×874).

const M = window.MEP_DATA;
const MI = window.MEPIcons;

// ── Mobile shell — bottom tab bar with raised upload button ──────────────
function MEPMobileShell({ theme = 'light', accent = 'amber',
  title, statusBarDark, children, tab = 'home', overlay, scroll = true }) {
  return (
    <div className="mep" data-theme={theme} data-accent={accent}
      style={{ width: '100%', height: '100%', position: 'relative',
        background: 'var(--mep-bg)', display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}>
      {/* Padding to clear iOS status bar (handled by IOSDevice) */}
      <div style={{
        paddingTop: 62, paddingBottom: 6, paddingLeft: 18, paddingRight: 18,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600, letterSpacing: -0.4, color: 'var(--mep-fg)' }}>
          {title}
        </h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button style={{
            width: 36, height: 36, borderRadius: 18,
            border: 0, background: 'var(--mep-surface)',
            color: 'var(--mep-fg-2)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
          }}>
            <MI.Search size={16} />
          </button>
          <button style={{
            width: 36, height: 36, borderRadius: 18,
            border: 0, background: 'var(--mep-surface)',
            color: 'var(--mep-fg-2)', cursor: 'pointer', position: 'relative',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
          }}>
            <MI.Bell size={16} />
            <span style={{
              position: 'absolute', top: 8, right: 8,
              width: 6, height: 6, borderRadius: 3, background: 'var(--mep-neg)',
              border: '1.5px solid var(--mep-surface)', boxSizing: 'content-box',
            }} />
          </button>
        </div>
      </div>

      {/* Scroll content */}
      <div style={{ flex: 1, overflow: scroll ? 'auto' : 'hidden',
        paddingBottom: 100, // clear bottom tab bar
      }}>
        {children}
      </div>

      {overlay}

      {/* Bottom tab bar */}
      <MobileTabBar tab={tab} />
    </div>
  );
}

function MobileTabBar({ tab = 'home' }) {
  const tabs = [
    { id: 'home', label: 'Resumen', icon: MI.Dashboard },
    { id: 'invoices', label: 'Facturas', icon: MI.Receipt },
    { id: 'upload', label: '', icon: MI.Plus, raised: true },
    { id: 'analytics', label: 'Análisis', icon: MI.Trend },
    { id: 'alerts', label: 'Alertas', icon: MI.Bell, badge: 2 },
  ];
  return (
    <div style={{
      position: 'absolute', bottom: 0, left: 0, right: 0,
      paddingTop: 8, paddingBottom: 28, // home indicator
      background: 'var(--mep-surface)',
      borderTop: '1px solid var(--mep-divider)',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'space-around',
      zIndex: 5,
    }}>
      {tabs.map(t => {
        const Ic = t.icon;
        const active = t.id === tab;
        if (t.raised) return (
          <button key={t.id} style={{
            position: 'relative', top: -18,
            width: 54, height: 54, borderRadius: 27,
            border: 0, background: 'var(--mep-acc)', color: 'var(--mep-acc-fg)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer',
            boxShadow: '0 6px 16px rgba(184,116,26,0.40), 0 2px 4px rgba(0,0,0,0.10)',
          }}>
            <Ic size={22} sw={2} />
          </button>
        );
        return (
          <button key={t.id} style={{
            border: 0, background: 'transparent', cursor: 'pointer',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
            color: active ? 'var(--mep-acc)' : 'var(--mep-fg-3)',
            padding: '4px 6px', position: 'relative',
            minWidth: 50,
          }}>
            <div style={{ position: 'relative' }}>
              <Ic size={20} sw={1.7} />
              {t.badge && (
                <span style={{
                  position: 'absolute', top: -4, right: -8,
                  minWidth: 14, height: 14, padding: '0 4px',
                  borderRadius: 7, fontSize: 9, fontWeight: 700,
                  background: 'var(--mep-neg)', color: '#fff',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                }} className="num">{t.badge}</span>
              )}
            </div>
            <span style={{ fontSize: 10.5, fontWeight: active ? 600 : 500, letterSpacing: 0.02 }}>
              {t.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ── Mobile Dashboard ──────────────────────────────────────────────────────
function MEPMobileDashboard() {
  const k = M.kpis;
  const topSuppliers = M.suppliers.slice().sort((a, b) => b.spend - a.spend).slice(0, 4);
  const totalSupplier = M.suppliers.reduce((s, x) => s + x.spend, 0);

  return (
    <div style={{ padding: '8px 18px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* Greeting */}
      <div style={{ fontSize: 13, color: 'var(--mep-fg-3)' }}>
        Buenas tardes, Lucía · martes, 19 mayo
      </div>

      {/* Hero spend card */}
      <div className="card" style={{ padding: 16 }}>
        <div className="label" style={{ marginBottom: 6 }}>Gasto este mes</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
          <div className="num" style={{ fontSize: 32, fontWeight: 600, color: 'var(--mep-fg)',
            letterSpacing: -0.8, lineHeight: 1 }}>
            {M.eurc(k.monthSpend)}
          </div>
          <MEPDelta value={k.monthDelta} />
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--mep-fg-3)' }}>
          {k.invCount} facturas · proyección de cierre <span className="num" style={{ color: 'var(--mep-fg-2)', fontWeight: 500 }}>24.876 €</span>
        </div>

        {/* Mini sparkline */}
        <div style={{ marginTop: 14, height: 50 }}>
          <MEPSparkline data={M.days.map(d => d.carne + d.pescado + d.verdura + d.vinos + d.otros)}
            color="var(--mep-acc)" width={350} height={50} />
        </div>

        {/* Budget progress */}
        <div style={{ marginTop: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, marginBottom: 6 }}>
            <span style={{ color: 'var(--mep-fg-3)' }}>Presupuesto del mes</span>
            <span className="num" style={{ color: 'var(--mep-fg)', fontWeight: 500 }}>
              <span style={{ color: 'var(--mep-warn)' }}>72%</span> de 24.000 €
            </span>
          </div>
          <div style={{ height: 6, borderRadius: 3, background: 'var(--mep-surface-2)', overflow: 'hidden' }}>
            <div style={{ width: '72%', height: '100%', background: 'var(--mep-acc)' }} />
          </div>
        </div>
      </div>

      {/* Alert tile */}
      <div className="card" style={{
        padding: '12px 14px',
        background: 'var(--mep-neg-soft)',
        border: '1px solid transparent',
        display: 'flex', alignItems: 'flex-start', gap: 12,
      }}>
        <div style={{ color: 'var(--mep-neg)', marginTop: 2 }}>
          <MI.AlertTriangle size={18} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.04,
            textTransform: 'uppercase', color: 'var(--mep-neg)', marginBottom: 2 }}>
            2 alertas graves
          </div>
          <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--mep-fg)', lineHeight: 1.4 }}>
            Aceite oliva +18% · Merluza +12%
          </div>
          <div style={{ fontSize: 12, color: 'var(--mep-fg-2)', marginTop: 3 }}>
            Revisa los márgenes antes del próximo pedido
          </div>
        </div>
        <MI.ChevronRight size={16} style={{ color: 'var(--mep-fg-3)' }} />
      </div>

      {/* KPI cards row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <MobileKpi label="Pendiente pago" value={M.eur(k.pendingPay)} delta={k.pendingDelta} />
        <MobileKpi label="Por revisar" value="3" delta={null} sub="facturas extraídas" tone="warn" />
      </div>

      {/* Top suppliers */}
      <div className="card" style={{ padding: '14px 14px 6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div className="subtitle" style={{ fontSize: 15 }}>Proveedores principales</div>
          <MI.ChevronRight size={14} style={{ color: 'var(--mep-fg-3)' }} />
        </div>
        {topSuppliers.map((s, i) => (
          <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 12,
            padding: '8px 0',
            borderBottom: i < topSuppliers.length - 1 ? '1px solid var(--mep-divider)' : 0 }}>
            <span className="swatch" style={{ background: s.color, width: 8, height: 26, borderRadius: 2 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--mep-fg)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</div>
              <div style={{ fontSize: 11, color: 'var(--mep-fg-3)' }}>
                {s.cat} · {s.invoices} facturas
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="num" style={{ fontSize: 13, fontWeight: 500, color: 'var(--mep-fg)' }}>
                {M.eur(s.spend)}
              </div>
              <MEPDelta value={s.deltaPct} />
            </div>
          </div>
        ))}
      </div>

      {/* Recent invoices */}
      <div className="card" style={{ padding: '14px 14px 6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div className="subtitle" style={{ fontSize: 15 }}>Recientes</div>
          <a style={{ fontSize: 12, color: 'var(--mep-acc)', fontWeight: 500, cursor: 'pointer' }}>Ver todas</a>
        </div>
        {M.invoices.slice(0, 3).map((inv, i) => {
          const s = M.supplierById[inv.supplier];
          return (
            <div key={inv.id} style={{ display: 'flex', alignItems: 'center', gap: 12,
              padding: '10px 0',
              borderBottom: i < 2 ? '1px solid var(--mep-divider)' : 0 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 8, flexShrink: 0,
                background: s.color + '22', color: s.color,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <MI.Receipt size={16} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--mep-fg)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {s.name}
                </div>
                <div className="num" style={{ fontSize: 11.5, color: 'var(--mep-fg-3)' }}>
                  {inv.num} · {new Date(inv.date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="num" style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--mep-fg)' }}>
                  {M.eur(inv.total)}
                </div>
                <span className={`badge badge-${inv.status === 'pending' ? 'pending' : inv.status === 'exported' ? 'exported' : 'confirmed'}`}
                  style={{ fontSize: 9.5, padding: '1px 5px' }}>
                  {inv.status === 'pending' ? 'Por revisar' : inv.status === 'exported' ? 'Exportada' : 'Confirmada'}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MobileKpi({ label, value, delta, sub, tone }) {
  return (
    <div className="card" style={{ padding: 12 }}>
      <div className="label" style={{ fontSize: 10.5, marginBottom: 5 }}>{label}</div>
      <div className="num" style={{ fontSize: 19, fontWeight: 600,
        color: tone === 'warn' ? 'var(--mep-warn)' : 'var(--mep-fg)', letterSpacing: -0.3, lineHeight: 1 }}>
        {value}
      </div>
      <div style={{ marginTop: 6, fontSize: 11, color: 'var(--mep-fg-3)' }}>
        {typeof delta === 'number' ? <MEPDelta value={delta} /> : sub}
      </div>
    </div>
  );
}

// ── Mobile Upload — camera viewfinder ────────────────────────────────────
function MEPMobileUploadCamera() {
  return (
    <div style={{ width: '100%', height: '100%', position: 'relative',
      background: '#0a0a0d', overflow: 'hidden' }}>
      {/* Camera feed faux */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(ellipse at center, #2c2825 0%, #0a0a0d 70%)',
      }}>
        {/* Faux paper invoice in the framing zone */}
        <div style={{
          position: 'absolute', left: '14%', top: '20%', width: '72%', height: '56%',
          background: '#f7f3ec',
          transform: 'perspective(800px) rotateX(8deg) rotateY(-3deg)',
          boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
          padding: '14px 14px',
          fontFamily: 'var(--mep-font)',
          fontSize: 8, color: '#2a2a2a',
        }}>
          <div style={{ fontWeight: 700, fontSize: 11, color: '#7a5b3a', marginBottom: 4 }}>
            Cárnicas Ibérico Aranda
          </div>
          <div style={{ fontSize: 7, color: '#888', marginBottom: 8 }}>
            Pol. Ind. Las Peñas, nave 12 · 09400 Aranda de Duero
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #ccc',
            borderBottom: '1px solid #ccc', padding: '4px 0', fontSize: 8 }}>
            <span style={{ fontWeight: 600 }}>FACTURA 2026-A-0471</span>
            <span>19/05/2026</span>
          </div>
          <div style={{ marginTop: 8, fontSize: 7, lineHeight: 1.7 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Solomillo ternera</span><span>119,28 €</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Costillas cerdo</span><span>51,10 €</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Carrillera ternera</span><span>34,72 €</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Chorizo cular</span><span>27,36 €</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Lomo embuchado</span><span>29,20 €</span>
            </div>
          </div>
          <div style={{ borderTop: '1.5px solid #7a5b3a', paddingTop: 4, marginTop: 8,
            display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 9 }}>
            <span>TOTAL</span><span>539,13 €</span>
          </div>
        </div>
      </div>

      {/* Dimming overlay outside frame */}
      <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0 }}>
        <defs>
          <mask id="cam-mask">
            <rect width="100" height="100" fill="white"/>
            <rect x="9" y="22" width="82" height="56" rx="2" fill="black"/>
          </mask>
        </defs>
        <rect width="100" height="100" fill="rgba(0,0,0,0.55)" mask="url(#cam-mask)"/>
      </svg>

      {/* Framing guide corners */}
      <div style={{ position: 'absolute', left: '9%', right: '9%', top: '22%', height: '56%' }}>
        {[{l: 0, t: 0, br: '0 0 0 16px'}, {r: 0, t: 0, br: '0 0 16px 0'},
          {l: 0, b: 0, br: '0 16px 0 0'}, {r: 0, b: 0, br: '16px 0 0 0'}].map((c, i) => (
          <div key={i} style={{
            position: 'absolute',
            left: c.l, right: c.r, top: c.t, bottom: c.b,
            width: 26, height: 26,
            borderTop: c.t === 0 ? '3px solid var(--mep-acc)' : 'none',
            borderBottom: c.b === 0 ? '3px solid var(--mep-acc)' : 'none',
            borderLeft: c.l === 0 ? '3px solid var(--mep-acc)' : 'none',
            borderRight: c.r === 0 ? '3px solid var(--mep-acc)' : 'none',
          }}/>
        ))}
      </div>

      {/* Top instruction */}
      <div style={{
        position: 'absolute', top: 80, left: 16, right: 16,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <button style={{
          width: 36, height: 36, borderRadius: 18, border: 0,
          background: 'rgba(255,255,255,0.18)', color: '#fff',
          backdropFilter: 'blur(12px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
        }}>
          <MI.X size={16} />
        </button>
        <div style={{ flex: 1, textAlign: 'center', fontSize: 13.5, color: '#fff', fontWeight: 500 }}>
          Encuadra la factura
        </div>
        <button style={{
          width: 36, height: 36, borderRadius: 18, border: 0,
          background: 'rgba(255,255,255,0.18)', color: '#fff',
          backdropFilter: 'blur(12px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
        }}>
          <MI.Sparkle size={16} />
        </button>
      </div>

      {/* Detection hint */}
      <div style={{
        position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
        background: 'rgba(0,0,0,0.5)', padding: '4px 10px', borderRadius: 999,
        color: 'var(--mep-acc)', fontSize: 11, fontWeight: 500,
        backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', gap: 6,
        pointerEvents: 'none',
      }}>
        <span style={{ width: 6, height: 6, borderRadius: 3, background: 'var(--mep-acc)' }} />
        Documento detectado
      </div>

      {/* Bottom controls */}
      <div style={{
        position: 'absolute', bottom: 50, left: 0, right: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'space-around',
        padding: '0 24px',
      }}>
        <button style={{
          width: 54, height: 54, borderRadius: 12, border: 0,
          background: 'rgba(255,255,255,0.14)', color: '#fff',
          backdropFilter: 'blur(12px)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3,
          cursor: 'pointer',
        }}>
          <MI.Image size={20} />
          <span style={{ fontSize: 9 }}>Galería</span>
        </button>

        <button style={{
          width: 78, height: 78, borderRadius: 39, border: 0,
          background: 'transparent', cursor: 'pointer', padding: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{ width: 78, height: 78, borderRadius: 39,
            border: '4px solid #fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ width: 64, height: 64, borderRadius: 32, background: '#fff' }} />
          </span>
        </button>

        <button style={{
          width: 54, height: 54, borderRadius: 12, border: 0,
          background: 'rgba(255,255,255,0.14)', color: '#fff',
          backdropFilter: 'blur(12px)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3,
          cursor: 'pointer',
        }}>
          <MI.File size={20} />
          <span style={{ fontSize: 9 }}>PDF</span>
        </button>
      </div>
    </div>
  );
}

// ── Mobile Upload — review (single-column form) ──────────────────────────
function MEPMobileReview() {
  const items = M.lineItems.slice(0, 5);
  return (
    <MEPMobileShell title="Revisar" tab="invoices">
      <div style={{ padding: '4px 18px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* Doc thumbnail strip */}
        <div className="card" style={{ padding: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 44, height: 56, borderRadius: 4, background: '#c14a4a',
            color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 10, fontWeight: 700, flexShrink: 0,
          }}>PDF</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--mep-fg)' }}>
              PA-2026-0982.pdf
            </div>
            <div className="num" style={{ fontSize: 11, color: 'var(--mep-fg-3)' }}>
              2 páginas · 192 KB
            </div>
          </div>
          <button className="btn btn-ghost" style={{ height: 30, padding: '0 10px' }}>
            <MI.Eye size={13} /> Ver
          </button>
        </div>

        {/* Confidence badge */}
        <div style={{
          padding: '8px 12px', borderRadius: 8,
          background: 'var(--mep-acc-soft)', color: 'var(--mep-acc)',
          display: 'flex', alignItems: 'center', gap: 8,
          fontSize: 12, fontWeight: 500,
        }}>
          <MI.Sparkle size={14} />
          Extraído por IA con alta confianza · revisa antes de guardar
        </div>

        {/* Header card */}
        <div className="card" style={{ padding: '4px 0', overflow: 'hidden' }}>
          <MobileField label="Proveedor" value="Pescados Atlántico Vigo"
            sub="Coincide con proveedor existente" />
          <MobileField label="N.º factura" value="PA-2026-0982" mono />
          <MobileField label="Fecha" value="19/05/2026" mono />
          <MobileField label="Vencimiento" value="26/05/2026" mono />
          <MobileField label="Total" value="487,19 €" mono strong flagged
            sub="No coincide con suma calculada (493,54 €)" last />
        </div>

        {/* Line items as cards */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '8px 4px 4px' }}>
          <div className="subtitle" style={{ fontSize: 14 }}>Líneas <span className="num" style={{ color: 'var(--mep-fg-3)', fontWeight: 400 }}>· 9</span></div>
          <button className="btn btn-ghost" style={{ height: 26, padding: '0 8px', fontSize: 12 }}>
            <MI.Plus size={12} /> Añadir
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map((l, i) => (
            <div key={i} className="card" style={{
              padding: 12, display: 'flex', alignItems: 'center', gap: 12,
              background: l.flagged ? 'var(--mep-warn-soft)' : 'var(--mep-surface)',
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                  <span style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--mep-fg)' }}>{l.desc}</span>
                  {l.flagged && <MI.AlertTriangle size={12} style={{ color: 'var(--mep-warn)' }} />}
                </div>
                <div className="num" style={{ fontSize: 11.5, color: 'var(--mep-fg-3)' }}>
                  {l.qty.toFixed(2).replace('.', ',')} {l.unit} × {l.price.toFixed(2).replace('.', ',')} €
                </div>
              </div>
              <div className="num" style={{ fontSize: 14, fontWeight: 600, color: 'var(--mep-fg)' }}>
                {l.total.toFixed(2).replace('.', ',')} €
              </div>
              <MI.ChevronRight size={14} style={{ color: 'var(--mep-fg-3)' }} />
            </div>
          ))}
          <div style={{ textAlign: 'center', fontSize: 11.5, color: 'var(--mep-fg-3)', padding: '4px 0' }}>
            + 4 líneas más
          </div>
        </div>

        {/* Totals */}
        <div className="card" style={{ padding: '12px 14px', background: 'var(--mep-surface-2)' }}>
          <Total label="Base imponible" value="442,90 €" />
          <Total label="IVA (10%)" value="44,29 €" />
          <Total strong label="Total calculado" value="487,19 €" />
        </div>
      </div>

      {/* Sticky bottom CTA */}
      <div style={{
        position: 'absolute', bottom: 92, left: 14, right: 14,
        display: 'flex', gap: 8, zIndex: 4,
      }}>
        <button className="btn btn-secondary" style={{ flex: 1, height: 44, justifyContent: 'center', fontSize: 14 }}>
          Descartar
        </button>
        <button className="btn btn-primary" style={{ flex: 2, height: 44, justifyContent: 'center', fontSize: 14, fontWeight: 600 }}>
          <MI.Check size={15} /> Confirmar y guardar
        </button>
      </div>
    </MEPMobileShell>
  );
}

function MobileField({ label, value, sub, mono, strong, flagged, last }) {
  return (
    <div style={{
      padding: '12px 16px',
      borderBottom: last ? 0 : '1px solid var(--mep-divider)',
      display: 'flex', alignItems: 'center', gap: 12,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 10.5, color: 'var(--mep-fg-3)', textTransform: 'uppercase',
          letterSpacing: 0.04, fontWeight: 500, marginBottom: 3 }}>{label}</div>
        <div className={mono ? 'num' : ''} style={{
          fontSize: strong ? 15 : 13.5, fontWeight: strong ? 600 : 500,
          color: flagged ? 'var(--mep-warn)' : 'var(--mep-fg)' }}>{value}</div>
        {sub && <div style={{ fontSize: 11, color: flagged ? 'var(--mep-warn)' : 'var(--mep-fg-3)', marginTop: 3 }}>{sub}</div>}
      </div>
      <MI.ChevronRight size={14} style={{ color: 'var(--mep-fg-3)' }} />
    </div>
  );
}

// Local Total helper (upload.jsx's Total is in a different Babel scope)
function Total({ label, value, strong }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
      <span style={{ fontSize: 12.5, color: 'var(--mep-fg-2)' }}>{label}</span>
      <span className="num" style={{ fontSize: strong ? 14.5 : 12.5,
        fontWeight: strong ? 600 : 500, color: 'var(--mep-fg)' }}>{value}</span>
    </div>
  );
}

// ── Mobile Invoice List ──────────────────────────────────────────────────
function MEPMobileInvoiceList() {
  return (
    <MEPMobileShell title="Facturas" tab="invoices">
      <div style={{ padding: '0 18px', marginBottom: 12 }}>
        {/* Search */}
        <div style={{ position: 'relative' }}>
          <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--mep-fg-3)' }}>
            <MI.Search size={15} />
          </span>
          <input className="input" style={{ width: '100%', height: 40, paddingLeft: 36, fontSize: 14 }}
            placeholder="Buscar N.º, proveedor…" />
        </div>
      </div>

      {/* Filter chips */}
      <div style={{ display: 'flex', gap: 6, padding: '0 18px 12px', overflowX: 'auto' }}>
        {[
          { label: 'Este mes', active: true },
          { label: 'Por revisar', count: 3 },
          { label: 'Vencidas', count: 1 },
          { label: 'Por proveedor' },
          { label: 'Por categoría' },
        ].map((f, i) => (
          <button key={i} style={{
            border: 0, height: 30, padding: '0 12px', borderRadius: 15,
            background: f.active ? 'var(--mep-acc)' : 'var(--mep-surface)',
            color: f.active ? 'var(--mep-acc-fg)' : 'var(--mep-fg-2)',
            fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap', cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 5,
            boxShadow: f.active ? 'none' : '0 1px 2px rgba(0,0,0,0.04)',
            fontFamily: 'inherit',
          }}>
            {f.label}
            {f.count && (
              <span className="num" style={{ fontSize: 11, fontWeight: 600 }}>
                {f.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Day-grouped list */}
      {[
        { label: 'Hoy · 19 mayo', invoices: M.invoices.slice(0, 4) },
        { label: 'Ayer · 17 mayo', invoices: M.invoices.slice(4, 6) },
        { label: '15 mayo', invoices: M.invoices.slice(6, 8) },
      ].map(group => (
        <div key={group.label} style={{ marginBottom: 16 }}>
          <div style={{ padding: '6px 18px', fontSize: 11.5, color: 'var(--mep-fg-3)',
            textTransform: 'uppercase', letterSpacing: 0.04, fontWeight: 500 }}>
            {group.label}
          </div>
          <div style={{ padding: '0 18px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {group.invoices.map(inv => {
              const s = M.supplierById[inv.supplier];
              const statusLabel = inv.status === 'pending' ? 'Por revisar' :
                inv.status === 'exported' ? 'Exportada' : 'Confirmada';
              return (
                <div key={inv.id} className="card" style={{
                  padding: 12, display: 'flex', alignItems: 'center', gap: 12,
                }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: 8, flexShrink: 0,
                    background: s.color + '20', color: s.color,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <MI.Receipt size={17} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--mep-fg)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {s.name}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                      <span className={`badge badge-${inv.status === 'pending' ? 'pending' : inv.status === 'exported' ? 'exported' : 'confirmed'}`}
                        style={{ fontSize: 9.5, padding: '1px 5px' }}>
                        {statusLabel}
                      </span>
                      <span className="num" style={{ fontSize: 11, color: 'var(--mep-fg-3)' }}>
                        {inv.num}
                      </span>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className="num" style={{ fontSize: 14, fontWeight: 600, color: 'var(--mep-fg)' }}>
                      {M.eur(inv.total)}
                    </div>
                    <div className="num" style={{ fontSize: 10.5, color: 'var(--mep-fg-3)' }}>
                      {inv.items} líneas
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </MEPMobileShell>
  );
}

// ── Mobile Invoice Detail ────────────────────────────────────────────────
function MEPMobileInvoiceDetail() {
  return (
    <div className="mep" data-theme="light" data-accent="amber" style={{
      width: '100%', height: '100%', position: 'relative',
      background: 'var(--mep-bg)', display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* Detail header — sticky */}
      <div style={{
        paddingTop: 58, paddingBottom: 10, paddingLeft: 14, paddingRight: 14,
        background: 'var(--mep-surface)', borderBottom: '1px solid var(--mep-divider)',
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <button style={{
          width: 36, height: 36, borderRadius: 18, border: 0,
          background: 'transparent', color: 'var(--mep-fg)', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <MI.ChevronLeft size={18} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="num" style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--mep-fg)' }}>
            2026-A-0471
          </div>
          <div style={{ fontSize: 11, color: 'var(--mep-fg-3)' }}>Cárnicas Ibérico Aranda</div>
        </div>
        <button style={{
          width: 36, height: 36, borderRadius: 18, border: 0,
          background: 'transparent', color: 'var(--mep-fg)', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <MI.DotsH size={18} />
        </button>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '14px 14px 100px',
        display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* Hero total */}
        <div className="card" style={{ padding: '16px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div>
              <div className="label" style={{ marginBottom: 6 }}>Total con IVA</div>
              <div className="num" style={{ fontSize: 30, fontWeight: 600,
                color: 'var(--mep-fg)', letterSpacing: -0.6, lineHeight: 1 }}>
                539,13 €
              </div>
            </div>
            <span className="badge badge-confirmed">
              <MI.Check size={10} /> Confirmada
            </span>
          </div>
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--mep-divider)',
            display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
            <div>
              <div style={{ color: 'var(--mep-fg-3)' }}>Emitida</div>
              <div className="num" style={{ color: 'var(--mep-fg)', fontWeight: 500, marginTop: 2 }}>19 may 2026</div>
            </div>
            <div>
              <div style={{ color: 'var(--mep-fg-3)' }}>Vence</div>
              <div className="num" style={{ color: 'var(--mep-fg)', fontWeight: 500, marginTop: 2 }}>8 jun 2026</div>
            </div>
            <div>
              <div style={{ color: 'var(--mep-fg-3)' }}>Líneas</div>
              <div className="num" style={{ color: 'var(--mep-fg)', fontWeight: 500, marginTop: 2 }}>10</div>
            </div>
          </div>
        </div>

        {/* Doc preview */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--mep-divider)',
            display: 'flex', alignItems: 'center', gap: 8 }}>
            <MI.File size={13} style={{ color: 'var(--mep-fg-2)' }} />
            <div style={{ flex: 1, fontSize: 12, color: 'var(--mep-fg-2)' }}>2026-A-0471.pdf</div>
            <a style={{ fontSize: 12, color: 'var(--mep-acc)', fontWeight: 500 }}>
              Abrir
            </a>
          </div>
          <div style={{ padding: 16, background: 'var(--mep-surface-2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{
              width: 130, height: 165, background: '#fff', borderRadius: 4,
              boxShadow: '0 4px 12px rgba(0,0,0,0.10)',
              padding: '10px 11px', fontSize: 5.5, color: '#16181b',
            }}>
              <div style={{ fontWeight: 700, fontSize: 7, color: '#7a5b3a', marginBottom: 2 }}>
                Cárnicas Ibérico Aranda
              </div>
              <div style={{ fontSize: 4.5, color: '#888', marginBottom: 5 }}>
                CIF B81234567
              </div>
              <div style={{ fontWeight: 600, fontSize: 6, borderBottom: '1px solid #ddd', paddingBottom: 2, marginBottom: 3 }}>
                FACTURA 2026-A-0471
              </div>
              {['Solomillo', 'Costillas', 'Carrillera', 'Chorizo', 'Lomo embuch.', 'Morcilla', 'Panceta', 'Jamón'].map((l, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '1px 0', borderBottom: '0.5px solid #eee' }}>
                  <span>{l}</span><span>{((i+1) * 27.5).toFixed(2).replace('.', ',')}</span>
                </div>
              ))}
              <div style={{ borderTop: '1px solid #7a5b3a', marginTop: 3, paddingTop: 2,
                display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
                <span>TOTAL</span><span>539,13 €</span>
              </div>
            </div>
          </div>
        </div>

        {/* Line items collapsed list */}
        <div className="card" style={{ padding: '4px 0' }}>
          {[
            { desc: 'Solomillo de ternera ibérica', qty: '4,20 kg', total: '119,28 €' },
            { desc: 'Cordero lechal (cuartos)', qty: '2,40 kg', total: '69,36 €' },
            { desc: 'Pollo de corral entero', qty: '6,80 kg', total: '63,92 €' },
            { desc: 'Jamón serrano (loncheado)', qty: '2,20 kg', total: '54,56 €' },
            { desc: 'Costillas cerdo ibérico', qty: '3,50 kg', total: '51,10 €' },
          ].map((l, i, arr) => (
            <div key={i} style={{
              padding: '11px 14px',
              borderBottom: i < arr.length - 1 ? '1px solid var(--mep-divider)' : 0,
              display: 'flex', alignItems: 'center', gap: 12,
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--mep-fg)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.desc}</div>
                <div className="num" style={{ fontSize: 11, color: 'var(--mep-fg-3)', marginTop: 2 }}>{l.qty}</div>
              </div>
              <div className="num" style={{ fontSize: 13, fontWeight: 500, color: 'var(--mep-fg)' }}>{l.total}</div>
            </div>
          ))}
          <div style={{ padding: '10px 14px', textAlign: 'center', fontSize: 12,
            color: 'var(--mep-acc)', fontWeight: 500, borderTop: '1px solid var(--mep-divider)' }}>
            Ver las 10 líneas
          </div>
        </div>

        {/* Quick actions */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {[
            { icon: MI.Edit, label: 'Editar' },
            { icon: MI.Download, label: 'PDF' },
            { icon: MI.Truck, label: 'Proveedor' },
          ].map((a, i) => (
            <button key={i} className="card" style={{
              padding: '14px 8px', border: '1px solid var(--mep-border)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
              background: 'var(--mep-surface)', cursor: 'pointer',
              fontFamily: 'inherit',
            }}>
              <a.icon size={18} style={{ color: 'var(--mep-fg-2)' }} />
              <span style={{ fontSize: 11.5, color: 'var(--mep-fg-2)', fontWeight: 500 }}>{a.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, {
  MEPMobileShell, MEPMobileDashboard, MEPMobileUploadCamera,
  MEPMobileReview, MEPMobileInvoiceList, MEPMobileInvoiceDetail,
});
