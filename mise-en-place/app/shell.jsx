// Shared app shell — Sidebar + TopBar + AppShell wrapper
// Used by every artboard to give a consistent product chrome.

const { Logo, Dashboard: IDash, Receipt, Truck, Trend, Tag, Wallet, Bell,
  Settings: ISettings, Help, Plus, Search, Filter, Download, Upload: IUpload,
  Sun, Moon, ChevronDown, ChevronRight, AlertTriangle, Clock, Info, DotsH,
  Mail, Calendar, Sparkle, RefreshCw, Camera, File: IFile, Edit, Eye, Check, X
} = MEPIcons;

// ── Sidebar ───────────────────────────────────────────────────────────────
function MEPSidebar({ active = 'dashboard', collapsed = false }) {
  const nav = [
    { id: 'dashboard', label: 'Resumen',     icon: IDash },
    { id: 'invoices',  label: 'Facturas',    icon: Receipt, badge: 3 },
    { id: 'suppliers', label: 'Proveedores', icon: Truck },
    { id: 'analytics', label: 'Análisis',    icon: Trend, sub: [
      { id: 'spend',  label: 'Gasto' },
      { id: 'prices', label: 'Precios' },
    ]},
    { id: 'budgets',   label: 'Presupuestos', icon: Tag },
    { id: 'reminders', label: 'Recordatorios', icon: Bell, badge: 2 },
  ];

  return (
    <aside style={{
      width: 232, height: '100%', flexShrink: 0,
      background: 'var(--mep-surface)',
      borderRight: '1px solid var(--mep-divider)',
      display: 'flex', flexDirection: 'column',
      padding: '20px 12px 16px',
    }}>
      {/* Brand */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 10px 22px' }}>
        <div style={{ color: 'var(--mep-acc)' }}><Logo size={22} /></div>
        <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: -0.2, color: 'var(--mep-fg)' }}>
          Mise en Place
        </div>
      </div>

      {/* Upload CTA */}
      <button className="btn btn-primary" style={{
        height: 38, justifyContent: 'center', fontWeight: 500,
        marginBottom: 20, width: '100%',
      }}>
        <IUpload size={15} />
        <span>Subir factura</span>
      </button>

      {/* Primary nav */}
      <nav style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {nav.map(n => (
          <NavItem key={n.id} item={n} active={active} />
        ))}
      </nav>

      <div style={{ flex: 1 }} />

      {/* Storage / quota */}
      <div style={{
        margin: '0 4px 14px', padding: '12px 12px',
        borderRadius: 8, background: 'var(--mep-surface-2)',
        border: '1px solid var(--mep-divider)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--mep-fg-2)' }}>Plan Restaurante</span>
          <span className="num" style={{ fontSize: 11, color: 'var(--mep-fg-3)' }}>47/150</span>
        </div>
        <div style={{ height: 4, borderRadius: 2, background: 'var(--mep-divider)', overflow: 'hidden' }}>
          <div style={{ width: '31%', height: '100%', background: 'var(--mep-acc)' }} />
        </div>
        <div style={{ fontSize: 11, color: 'var(--mep-fg-3)', marginTop: 6 }}>
          facturas este mes
        </div>
      </div>

      {/* Utility */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <UtilItem icon={ISettings} label="Ajustes" />
        <UtilItem icon={Help} label="Ayuda" />
      </div>

      {/* User */}
      <div style={{
        marginTop: 10, padding: '8px 8px', display: 'flex',
        alignItems: 'center', gap: 10, borderRadius: 8,
      }}>
        <div style={{
          width: 28, height: 28, borderRadius: 14, flexShrink: 0,
          background: 'linear-gradient(135deg, #b8741a, #7a3a4a)',
          color: '#fff', fontSize: 11, fontWeight: 600,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>LM</div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--mep-fg)', lineHeight: 1.2,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            Lucía Marín
          </div>
          <div style={{ fontSize: 11, color: 'var(--mep-fg-3)' }}>Casa Lúa</div>
        </div>
        <div style={{ color: 'var(--mep-fg-3)' }}>
          <ChevronDown size={14} />
        </div>
      </div>
    </aside>
  );
}

function NavItem({ item, active }) {
  const isActive = item.id === active || (item.sub && item.sub.some(s => s.id === active));
  const Ic = item.icon;
  return (
    <div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '7px 10px', height: 32, borderRadius: 6,
        cursor: 'pointer',
        background: isActive ? 'var(--mep-acc-soft)' : 'transparent',
        color: isActive ? 'var(--mep-acc)' : 'var(--mep-fg-2)',
        fontSize: 13.5, fontWeight: isActive ? 500 : 400,
        position: 'relative',
      }}>
        <Ic size={16} />
        <span style={{ flex: 1 }}>{item.label}</span>
        {item.badge ? (
          <span style={{
            fontSize: 10, fontWeight: 600, minWidth: 16, height: 16,
            padding: '0 5px', borderRadius: 8,
            background: isActive ? 'var(--mep-acc)' : 'var(--mep-warn-soft)',
            color: isActive ? 'var(--mep-acc-fg)' : 'var(--mep-warn)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          }} className="num">{item.badge}</span>
        ) : null}
      </div>
      {item.sub && isActive && (
        <div style={{ marginLeft: 32, marginTop: 1, marginBottom: 4,
          paddingLeft: 10, borderLeft: '1px solid var(--mep-divider)',
          display: 'flex', flexDirection: 'column', gap: 0 }}>
          {item.sub.map(s => (
            <div key={s.id} style={{
              padding: '5px 10px', borderRadius: 5,
              fontSize: 12.5, color: s.id === active ? 'var(--mep-fg)' : 'var(--mep-fg-2)',
              fontWeight: s.id === active ? 500 : 400,
              cursor: 'pointer',
              background: s.id === active ? 'var(--mep-hover)' : 'transparent',
            }}>{s.label}</div>
          ))}
        </div>
      )}
    </div>
  );
}

function UtilItem({ icon: Ic, label }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '6px 10px', height: 30, borderRadius: 6,
      color: 'var(--mep-fg-3)', fontSize: 13, cursor: 'pointer',
    }}>
      <Ic size={15} />
      <span>{label}</span>
    </div>
  );
}

// ── TopBar / PageHeader ───────────────────────────────────────────────────
function MEPTopBar({ title, crumbs, periodLabel = 'Mayo 2026', actions, onThemeToggle, isDark = false }) {
  return (
    <header style={{
      height: 56, flexShrink: 0,
      display: 'flex', alignItems: 'center',
      padding: '0 24px',
      borderBottom: '1px solid var(--mep-divider)',
      background: 'var(--mep-bg)',
      gap: 16,
    }}>
      <div style={{ minWidth: 0, flex: 1 }}>
        {crumbs ? (
          <div style={{ fontSize: 12, color: 'var(--mep-fg-3)', marginBottom: 2,
            display: 'flex', alignItems: 'center', gap: 4 }}>
            {crumbs.map((c, i) => (
              <React.Fragment key={i}>
                <span style={{ color: i === crumbs.length - 1 ? 'var(--mep-fg-2)' : 'var(--mep-fg-3)',
                  cursor: i < crumbs.length - 1 ? 'pointer' : 'default' }}>{c}</span>
                {i < crumbs.length - 1 && <ChevronRight size={11} />}
              </React.Fragment>
            ))}
          </div>
        ) : null}
        <h1 style={{
          margin: 0, fontSize: 20, fontWeight: 600,
          color: 'var(--mep-fg)', letterSpacing: -0.3,
        }}>{title}</h1>
      </div>

      {periodLabel && (
        <button className="btn btn-secondary" style={{ height: 34 }}>
          <Calendar size={14} />
          <span>{periodLabel}</span>
          <ChevronDown size={13} />
        </button>
      )}

      <button className="btn btn-ghost" title="Cambiar tema" onClick={onThemeToggle}
        style={{ width: 34, height: 34, padding: 0, justifyContent: 'center' }}>
        {isDark ? <Sun size={15} /> : <Moon size={15} />}
      </button>

      {actions ? actions : (
        <button className="btn btn-primary" style={{ height: 34 }}>
          <IUpload size={14} />
          <span>Subir factura</span>
        </button>
      )}
    </header>
  );
}

// ── AppShell — full chrome wrapper ────────────────────────────────────────
function MEPShell({ theme = 'light', accent = 'teal', density = 'default',
  active = 'dashboard', children, screenLabel }) {
  const [t, setT] = React.useState(theme);
  React.useEffect(() => setT(theme), [theme]);
  return (
    <div className="mep" data-theme={t} data-accent={accent} data-density={density}
      data-screen-label={screenLabel}
      style={{ width: '100%', height: '100%', display: 'flex', overflow: 'hidden' }}>
      <MEPSidebar active={active} />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column',
        background: 'var(--mep-bg)' }}>
        {typeof children === 'function'
          ? children({ theme: t, setTheme: setT, isDark: t === 'dark' })
          : children}
      </div>
    </div>
  );
}

// Sparkline — small inline trend chart
function MEPSparkline({ data, color = 'var(--mep-acc)', width = 84, height = 26, deltaPositive }) {
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 1;
  const step = width / (data.length - 1);
  const pts = data.map((v, i) => [i * step, height - 2 - ((v - min) / range) * (height - 4)]);
  const path = pts.map((p, i) => (i === 0 ? 'M' : 'L') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const fillPath = path + ` L ${width} ${height} L 0 ${height} Z`;
  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      <defs>
        <linearGradient id={`sg-${color.replace(/[^a-z]/gi, '')}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={fillPath} fill={`url(#sg-${color.replace(/[^a-z]/gi, '')})`} />
      <path d={path} fill="none" stroke={color} strokeWidth="1.4" />
    </svg>
  );
}

// Mini delta indicator
function MEPDelta({ value, suffix = '%', invert = false }) {
  // invert: spending up is BAD by default. invert=false means up = bad (negative semantic).
  const positive = invert ? value > 0 : value < 0;
  const negative = invert ? value < 0 : value > 0;
  const color = positive ? 'var(--mep-pos)' : (negative ? 'var(--mep-neg)' : 'var(--mep-fg-3)');
  const arrow = value > 0 ? '↑' : (value < 0 ? '↓' : '·');
  return (
    <span className="num" style={{
      fontSize: 12, fontWeight: 500, color, display: 'inline-flex', alignItems: 'center', gap: 3,
    }}>
      <span style={{ fontSize: 11 }}>{arrow}</span>
      {Math.abs(value).toFixed(1).replace('.', ',')}{suffix}
    </span>
  );
}

Object.assign(window, {
  MEPSidebar, MEPTopBar, MEPShell, MEPSparkline, MEPDelta,
});
