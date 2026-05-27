// Admin — separate, minimal shell for the privileged admin area.
// Distinct from the main app: top amber band, ADMIN pill, slim top nav, no sidebar.

const { Logo, ChevronLeft, ChevronRight, AlertTriangle, Info, Clock,
  Check, X, Sun, Moon } = window.MEPIcons;

// ── Status badge ──────────────────────────────────────────────────────────
function StatusBadge({ status, size = 'sm' }) {
  // status: 'ok' | 'degraded' | 'down'
  const map = {
    ok:       { label: 'OK',       bg: 'var(--mep-pos-soft)',  fg: 'var(--mep-pos)',  dot: 'var(--mep-pos)' },
    degraded: { label: 'DEGRADED', bg: 'var(--mep-neg-soft)',  fg: 'var(--mep-neg)',  dot: 'var(--mep-neg)' },
    warn:     { label: 'WARN',     bg: 'var(--mep-warn-soft)', fg: 'var(--mep-warn)', dot: 'var(--mep-warn)' },
    down:     { label: 'DOWN',     bg: 'var(--mep-neg-soft)',  fg: 'var(--mep-neg)',  dot: 'var(--mep-neg)' },
  };
  const s = map[status] || map.ok;
  const big = size === 'lg';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: big ? 10 : 6,
      padding: big ? '10px 16px' : '3px 9px',
      borderRadius: big ? 8 : 4,
      background: s.bg, color: s.fg,
      fontSize: big ? 14 : 11,
      fontWeight: big ? 600 : 500,
      letterSpacing: big ? 0.06 : 0.04,
      textTransform: 'uppercase',
      lineHeight: 1,
      fontVariantNumeric: 'tabular-nums',
    }}>
      <span style={{
        width: big ? 8 : 6, height: big ? 8 : 6, borderRadius: '50%',
        background: s.dot,
        boxShadow: big ? `0 0 0 4px ${s.bg}` : 'none',
      }} />
      {s.label}
    </span>
  );
}

// ── Pos / Neg pill (small) ────────────────────────────────────────────────
function PosNegPill({ ok, labelOk = 'OK', labelBad = 'FAIL' }) {
  const fg  = ok ? 'var(--mep-pos)' : 'var(--mep-neg)';
  const bg  = ok ? 'var(--mep-pos-soft)' : 'var(--mep-neg-soft)';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 7px', borderRadius: 4,
      background: bg, color: fg,
      fontSize: 11, fontWeight: 500, letterSpacing: 0.04,
      textTransform: 'uppercase', lineHeight: '16px',
    }}>
      {ok
        ? <Check size={10} />
        : <X size={10} />
      }
      {ok ? labelOk : labelBad}
    </span>
  );
}

// ── KpiCard ───────────────────────────────────────────────────────────────
function KpiCard({ label, value, unit, sub, pill }) {
  return (
    <div className="card" style={{
      padding: '14px 16px',
      display: 'flex', flexDirection: 'column', gap: 6,
      minWidth: 0,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
      }}>
        <div className="label">{label}</div>
        {pill}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
        <div className="num" style={{
          fontSize: 26, fontWeight: 600, color: 'var(--mep-fg)',
          letterSpacing: -0.6, lineHeight: 1.05,
        }}>
          {value}
        </div>
        {unit && (
          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--mep-fg-3)' }}>
            {unit}
          </div>
        )}
      </div>
      {sub && (
        <div style={{ fontSize: 11.5, color: 'var(--mep-fg-3)', marginTop: 1 }}>
          {sub}
        </div>
      )}
    </div>
  );
}

// ── SectionCard ───────────────────────────────────────────────────────────
function SectionCard({ title, sub, action, children, padding = '14px 16px 16px' }) {
  return (
    <div className="card" style={{ padding, display: 'flex', flexDirection: 'column' }}>
      <div style={{
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        gap: 12, marginBottom: 12,
      }}>
        <div style={{ minWidth: 0 }}>
          <div className="subtitle" style={{ fontSize: 15 }}>{title}</div>
          {sub && (
            <div style={{ fontSize: 12, color: 'var(--mep-fg-3)', marginTop: 2 }}>
              {sub}
            </div>
          )}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

// ── Alert row (admin variant — system events, not invoices) ──────────────
function AlertPill({ type }) {
  const map = {
    job:    { label: 'JOB',    bg: 'var(--mep-info-soft)', fg: 'var(--mep-info)' },
    auth:   { label: 'AUTH',   bg: 'var(--mep-warn-soft)', fg: 'var(--mep-warn)' },
    db:     { label: 'DB',     bg: 'var(--mep-acc-soft)',  fg: 'var(--mep-acc)'  },
    quota:  { label: 'QUOTA',  bg: 'var(--mep-warn-soft)', fg: 'var(--mep-warn)' },
    error:  { label: 'ERROR',  bg: 'var(--mep-neg-soft)',  fg: 'var(--mep-neg)'  },
    info:   { label: 'INFO',   bg: 'var(--mep-info-soft)', fg: 'var(--mep-info)' },
  };
  const t = map[type] || map.info;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '2px 7px', borderRadius: 4,
      background: t.bg, color: t.fg,
      fontSize: 10, fontWeight: 600, letterSpacing: 0.06,
      lineHeight: '16px', fontFamily: 'var(--mep-fs-mono)',
      minWidth: 48, justifyContent: 'center',
    }}>{t.label}</span>
  );
}

function AdminAlertRow({ a, last }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 12,
      padding: '10px 0',
      borderBottom: last ? '0' : '1px solid var(--mep-divider)',
    }}>
      <AlertPill type={a.type} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{
          fontSize: 13, color: 'var(--mep-fg)', fontWeight: 500, lineHeight: 1.4,
        }}>{a.msg}</div>
        {a.detail && (
          <div style={{
            fontSize: 11.5, color: 'var(--mep-fg-3)', marginTop: 2,
            fontFamily: 'var(--mep-fs-mono)',
          }}>{a.detail}</div>
        )}
      </div>
      <div className="num" style={{
        fontSize: 11, color: 'var(--mep-fg-3)', whiteSpace: 'nowrap', marginTop: 2,
        fontFamily: 'var(--mep-fs-mono)',
      }}>{a.when}</div>
    </div>
  );
}

// ── Admin Shell ───────────────────────────────────────────────────────────
function AdminShell({ active = 'overview', theme = 'light', children,
  email = 'lucia@mise.app', onNav, onThemeToggle, screenLabel }) {
  const nav = [
    { id: 'overview', label: 'Overview', href: '/admin' },
    { id: 'health',   label: 'Health',   href: '/admin/health' },
    { id: 'events',   label: 'Events',   href: '/admin/events', disabled: true },
  ];
  const isDark = theme === 'dark';
  return (
    <div className="mep" data-theme={theme} data-accent="amber"
      data-screen-label={screenLabel}
      style={{
        width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
        background: 'var(--mep-bg)', overflow: 'hidden',
        // The defining mark of admin: persistent amber top border band
        borderTop: '4px solid var(--mep-acc)',
      }}>
      {/* Top nav */}
      <header style={{
        flexShrink: 0, height: 52,
        display: 'flex', alignItems: 'center',
        padding: '0 24px', gap: 20,
        background: 'var(--mep-surface)',
        borderBottom: '1px solid var(--mep-divider)',
      }}>
        {/* Back to app */}
        <a href="#" style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          fontSize: 12.5, color: 'var(--mep-fg-3)',
          textDecoration: 'none', padding: '4px 8px 4px 4px',
          borderRadius: 5, transition: 'color 120ms',
        }}>
          <ChevronLeft size={13} />
          <span>Back to app</span>
        </a>

        <div style={{ width: 1, height: 18, background: 'var(--mep-divider)' }} />

        {/* Brand + ADMIN pill */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ color: 'var(--mep-acc)', display: 'flex' }}>
            <Logo size={18} />
          </div>
          <div style={{
            fontSize: 14, fontWeight: 600, color: 'var(--mep-fg)',
            letterSpacing: -0.2,
          }}>
            Mise en Place
          </div>
          <span style={{
            display: 'inline-flex', alignItems: 'center',
            padding: '2px 7px',
            borderRadius: 4,
            background: 'var(--mep-acc)',
            color: 'var(--mep-acc-fg)',
            fontSize: 10, fontWeight: 700, letterSpacing: 0.12,
            lineHeight: '14px', textTransform: 'uppercase',
            fontFamily: 'var(--mep-fs-mono)',
          }}>
            ADMIN
          </span>
        </div>

        {/* Nav */}
        <nav style={{ display: 'flex', alignItems: 'center', gap: 2, marginLeft: 8 }}>
          {nav.map(n => {
            const isActive = n.id === active;
            return (
              <a key={n.id} href="#"
                onClick={(e) => { e.preventDefault(); if (!n.disabled && onNav) onNav(n.id); }}
                style={{
                  position: 'relative',
                  padding: '6px 12px',
                  fontSize: 13,
                  fontWeight: isActive ? 600 : 500,
                  color: n.disabled ? 'var(--mep-fg-4)'
                    : isActive ? 'var(--mep-fg)' : 'var(--mep-fg-2)',
                  textDecoration: 'none',
                  borderRadius: 5,
                  cursor: n.disabled ? 'not-allowed' : 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                }}>
                <span>{n.label}</span>
                {n.disabled && (
                  <span style={{
                    fontSize: 9.5, fontWeight: 600,
                    padding: '1px 5px', borderRadius: 3,
                    background: 'var(--mep-hover)', color: 'var(--mep-fg-3)',
                    letterSpacing: 0.05, textTransform: 'uppercase',
                    lineHeight: '12px',
                  }}>Soon</span>
                )}
                {isActive && (
                  <span style={{
                    position: 'absolute', left: 8, right: 8, bottom: -15,
                    height: 2, borderRadius: 1, background: 'var(--mep-acc)',
                  }} />
                )}
              </a>
            );
          })}
        </nav>

        <div style={{ flex: 1 }} />

        {/* Theme toggle */}
        <button className="btn btn-ghost"
          onClick={onThemeToggle}
          style={{ width: 30, height: 30, padding: 0, justifyContent: 'center' }}>
          {isDark ? <Sun size={14} /> : <Moon size={14} />}
        </button>

        {/* Admin email */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          paddingLeft: 12,
          borderLeft: '1px solid var(--mep-divider)',
        }}>
          <div style={{
            width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
            background: 'var(--mep-acc-soft)', color: 'var(--mep-acc)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 10, fontWeight: 600,
          }}>LM</div>
          <div style={{ fontSize: 11.5, color: 'var(--mep-fg-2)',
            fontFamily: 'var(--mep-fs-mono)' }}>
            {email}
          </div>
        </div>
      </header>

      {/* Page body */}
      <main style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
        {children}
      </main>
    </div>
  );
}

// ── Page header (inside main) ─────────────────────────────────────────────
function PageHead({ route, title, subtitle, right }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
      gap: 16, padding: '22px 24px 16px',
    }}>
      <div>
        <div style={{
          fontSize: 11, fontWeight: 500, letterSpacing: 0.08,
          textTransform: 'uppercase', color: 'var(--mep-fg-3)',
          fontFamily: 'var(--mep-fs-mono)', marginBottom: 4,
        }}>
          {route}
        </div>
        <h1 style={{
          margin: 0, fontSize: 24, fontWeight: 600,
          color: 'var(--mep-fg)', letterSpacing: -0.4, lineHeight: 1.1,
        }}>{title}</h1>
        {subtitle && (
          <div style={{ fontSize: 13, color: 'var(--mep-fg-2)', marginTop: 6 }}>
            {subtitle}
          </div>
        )}
      </div>
      {right}
    </div>
  );
}

// ── Sample data ───────────────────────────────────────────────────────────
const ADMIN_OVERVIEW = {
  kpis: [
    { label: 'Total Invoices',     value: '12,847', sub: 'across all tenants' },
    { label: 'Total Suppliers',    value: '1,283',  sub: '94 added this month' },
    { label: 'Active Sessions',    value: '47',     sub: 'last 15 minutes' },
    { label: 'Total Users',        value: '326',    sub: '218 active in 30 d' },
    { label: 'New Invoices',       value: '438',    unit: '/ 7d', sub: 'avg 62.6 per day' },
    { label: 'DB Size',            value: '184.2',  unit: 'MB', sub: '+2.1 MB / 7d' },
  ],
  alerts: [
    { type: 'job',   msg: 'Nightly OCR re-extraction completed', detail: 'job=ocr-reextract · processed=1,284 · failed=2',  when: '03:14' },
    { type: 'auth',  msg: 'Repeated failed logins for lucia@mise.app', detail: 'src=85.55.241.x · attempts=5 · lockout=600s', when: '08:42' },
    { type: 'quota', msg: 'Tenant casa-lua approaching 80% of plan quota', detail: 'tenant=casa-lua · used=117/150', when: '11:07' },
    { type: 'db',    msg: 'Slow query > 2 s on invoice_lines.search', detail: 'duration=2.41s · rows=18,402',   when: '12:18' },
  ],
};

const ADMIN_HEALTH = {
  status: 'ok',
  kpis: [
    { label: 'DB Reachable',     value: 'YES',  pill: <PosNegPill ok labelOk="OK" />,             sub: 'last check 4s ago' },
    { label: 'DB Size',          value: '184.2', unit: 'MB',                                       sub: 'PostgreSQL 15.6' },
    { label: 'Uploads Writable', value: 'YES',  pill: <PosNegPill ok labelOk="OK" />,             sub: '/var/mep/uploads' },
    { label: 'Uploads Free',     value: '38.4', unit: 'GB',                                       sub: '78% of 50 GB free' },
    { label: 'Active Sessions',  value: '47',                                                     sub: '15-min window' },
    { label: 'Uptime',           value: '14d 06h',                                                 sub: 'since 2026-05-12 04:01' },
    { label: 'Version',          value: '0.18.2', sub: 'commit a1f3c9b · main' },
  ],
};

// ── PAGE 1 — Overview ─────────────────────────────────────────────────────
function AdminOverview({ onGoHealth }) {
  const { kpis, alerts } = ADMIN_OVERVIEW;
  return (
    <>
      <PageHead
        route="/admin"
        title="Overview"
        subtitle="System-wide counters across all tenants. Refreshed every 60s."
        right={
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            fontSize: 11.5, color: 'var(--mep-fg-3)',
            fontFamily: 'var(--mep-fs-mono)',
          }}>
            <span style={{
              width: 6, height: 6, borderRadius: 3,
              background: 'var(--mep-pos)',
              boxShadow: '0 0 0 3px var(--mep-pos-soft)',
            }} />
            <span>last sync 14s ago</span>
          </div>
        }
      />

      <div style={{ padding: '0 24px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* KPI grid 3 × 2 */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 10,
        }}>
          {kpis.map(k => <KpiCard key={k.label} {...k} />)}
        </div>

        {/* Two cards side-by-side */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 10 }}>
          <SectionCard
            title="Pending Alerts"
            sub={`${alerts.length} unresolved · sorted by recency`}
            action={
              <span className="num" style={{
                fontSize: 11.5, color: 'var(--mep-fg-3)',
                fontFamily: 'var(--mep-fs-mono)',
              }}>{alerts.length} items</span>
            }>
            <div>
              {alerts.map((a, i) => (
                <AdminAlertRow key={i} a={a} last={i === alerts.length - 1} />
              ))}
            </div>
          </SectionCard>

          <SectionCard
            title="System Health"
            sub="Live status of core services">
            <div style={{
              display: 'flex', flexDirection: 'column', gap: 14,
            }}>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 14px', borderRadius: 8,
                background: 'var(--mep-pos-soft)',
              }}>
                <div>
                  <div style={{
                    fontSize: 10.5, fontWeight: 500, letterSpacing: 0.08,
                    textTransform: 'uppercase', color: 'var(--mep-pos)',
                    fontFamily: 'var(--mep-fs-mono)', marginBottom: 4,
                  }}>Status</div>
                  <div style={{
                    fontSize: 17, fontWeight: 600, color: 'var(--mep-pos)',
                    letterSpacing: -0.2, lineHeight: 1,
                  }}>All systems normal</div>
                </div>
                <StatusBadge status="ok" />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[
                  ['Database',         'ok'],
                  ['Uploads volume',   'ok'],
                  ['OCR worker',       'ok'],
                  ['Auth sessions',    'ok'],
                ].map(([k, s]) => (
                  <div key={k} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    fontSize: 12.5,
                  }}>
                    <span style={{ color: 'var(--mep-fg-2)' }}>{k}</span>
                    <PosNegPill ok={s === 'ok'} labelOk="OK" />
                  </div>
                ))}
              </div>

              <a href="#" onClick={(e) => { e.preventDefault(); onGoHealth && onGoHealth(); }}
                style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '8px 10px', marginTop: 'auto',
                  borderRadius: 6,
                  background: 'var(--mep-acc-soft)',
                  color: 'var(--mep-acc)',
                  fontSize: 12.5, fontWeight: 500,
                  textDecoration: 'none',
                }}>
                <span>View full health report</span>
                <ChevronRight size={13} />
              </a>
            </div>
          </SectionCard>
        </div>
      </div>
    </>
  );
}

// ── PAGE 2 — Health ───────────────────────────────────────────────────────
function AdminHealth() {
  const { status, kpis } = ADMIN_HEALTH;
  const isOk = status === 'ok';
  return (
    <>
      <PageHead
        route="/admin/health"
        title="System Health"
        subtitle="Live diagnostics. Suitable for external uptime monitoring."
        right={
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '4px 9px',
            borderRadius: 5,
            background: 'var(--mep-surface)',
            border: '1px solid var(--mep-divider)',
            fontFamily: 'var(--mep-fs-mono)',
            fontSize: 11, color: 'var(--mep-fg-3)',
          }}>
            <span>GET /admin/health.json</span>
          </div>
        }
      />

      <div style={{ padding: '0 24px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Big status banner */}
        <div className="card" style={{
          padding: '20px 22px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 18,
          background: isOk ? 'var(--mep-pos-soft)' : 'var(--mep-neg-soft)',
          borderColor: isOk ? 'var(--mep-pos-soft)' : 'var(--mep-neg-soft)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, minWidth: 0 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 22, flexShrink: 0,
              background: isOk ? 'var(--mep-pos)' : 'var(--mep-neg)',
              color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: `0 0 0 6px ${isOk ? 'var(--mep-pos-soft)' : 'var(--mep-neg-soft)'}`,
            }}>
              {isOk ? <Check size={22} /> : <AlertTriangle size={20} />}
            </div>
            <div>
              <div style={{
                fontSize: 11, fontWeight: 500, letterSpacing: 0.08,
                textTransform: 'uppercase',
                color: isOk ? 'var(--mep-pos)' : 'var(--mep-neg)',
                fontFamily: 'var(--mep-fs-mono)', marginBottom: 4,
              }}>status</div>
              <div style={{
                fontSize: 32, fontWeight: 600,
                color: isOk ? 'var(--mep-pos)' : 'var(--mep-neg)',
                letterSpacing: -0.6, lineHeight: 1,
              }}>
                {isOk ? 'OK' : 'DEGRADED'}
              </div>
            </div>
          </div>

          <div style={{
            fontFamily: 'var(--mep-fs-mono)',
            fontSize: 11.5, color: 'var(--mep-fg-2)',
            textAlign: 'right', lineHeight: 1.55,
          }}>
            <div>status: <span style={{ color: isOk ? 'var(--mep-pos)' : 'var(--mep-neg)' }}>"{isOk ? 'ok' : 'degraded'}"</span></div>
            <div>checked_at: 2026-05-26T14:18:32Z</div>
            <div>response_ms: 23</div>
          </div>
        </div>

        {/* KPI grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 10,
        }}>
          {kpis.map(k => <KpiCard key={k.label} {...k} />)}
        </div>

        {/* Pulsetic note */}
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 10,
          padding: '11px 14px',
          borderRadius: 8,
          background: 'var(--mep-info-soft)',
          color: 'var(--mep-fg-2)',
          fontSize: 12.5, lineHeight: 1.5,
        }}>
          <div style={{ color: 'var(--mep-info)', marginTop: 1, flexShrink: 0 }}>
            <Info size={14} />
          </div>
          <div>
            <span style={{ color: 'var(--mep-fg)', fontWeight: 500 }}>Monitoring tip.</span>
            {' '}Point Pulsetic (or any uptime monitor) at this endpoint with a keyword match on{' '}
            <code style={{
              fontFamily: 'var(--mep-fs-mono)', fontSize: 11.5,
              padding: '1px 6px', borderRadius: 3,
              background: 'var(--mep-surface)', color: 'var(--mep-fg)',
              border: '1px solid var(--mep-border)',
            }}>status:ok</code>{' '}
            for alerting.
          </div>
        </div>

        {/* Raw JSON preview — operator detail */}
        <SectionCard
          title="Response body"
          sub="What external monitors see when they hit the endpoint"
          padding="14px 16px 14px"
          action={
            <span style={{
              fontSize: 11, color: 'var(--mep-fg-3)',
              fontFamily: 'var(--mep-fs-mono)',
            }}>200 OK · application/json</span>
          }>
          <pre style={{
            margin: 0,
            padding: '12px 14px',
            borderRadius: 6,
            background: 'var(--mep-surface-2)',
            border: '1px solid var(--mep-divider)',
            fontFamily: 'var(--mep-fs-mono)',
            fontSize: 11.5, lineHeight: 1.65,
            color: 'var(--mep-fg-2)',
            overflow: 'auto',
            whiteSpace: 'pre',
          }}>
{`{
  "status": "ok",
  "version": "0.18.2",
  "uptime_seconds": 1232560,
  "db": { "reachable": true, "size_mb": 184.2 },
  "uploads": { "writable": true, "free_gb": 38.4 },
  "sessions_active": 47,
  "checked_at": "2026-05-26T14:18:32Z"
}`}
          </pre>
        </SectionCard>
      </div>
    </>
  );
}

// ── PAGE 3 — Events stub ──────────────────────────────────────────────────
function AdminEvents() {
  return (
    <>
      <PageHead
        route="/admin/events"
        title="Events"
        subtitle="System-level audit log. Currently disabled."
        right={
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '4px 9px',
            borderRadius: 4,
            background: 'var(--mep-hover)',
            color: 'var(--mep-fg-3)',
            fontSize: 11, fontWeight: 600, letterSpacing: 0.06,
            textTransform: 'uppercase',
            fontFamily: 'var(--mep-fs-mono)',
          }}>Coming soon</span>
        }
      />

      <div style={{ padding: '0 24px 24px' }}>
        <div className="card" style={{
          padding: '48px 32px',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          textAlign: 'center',
          background: 'var(--mep-surface)',
          borderStyle: 'dashed',
          opacity: 0.85,
        }}>
          <div style={{
            width: 56, height: 56, borderRadius: 14,
            background: 'var(--mep-surface-2)',
            border: '1px solid var(--mep-divider)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--mep-fg-3)',
            marginBottom: 18,
          }}>
            <Clock size={24} />
          </div>

          <div style={{
            fontSize: 17, fontWeight: 600, color: 'var(--mep-fg)',
            letterSpacing: -0.2, marginBottom: 6,
          }}>
            Events log is not yet available
          </div>
          <div style={{
            fontSize: 13, color: 'var(--mep-fg-2)', lineHeight: 1.55,
            maxWidth: 460,
          }}>
            This page requires the <code style={{
              fontFamily: 'var(--mep-fs-mono)', fontSize: 12,
              padding: '1px 6px', borderRadius: 3,
              background: 'var(--mep-surface-2)', color: 'var(--mep-fg)',
              border: '1px solid var(--mep-divider)',
            }}>events</code> table.
            {' '}Once shipped, you'll see auth, OCR, and tenant lifecycle events streamed here in real time.
          </div>

          <div style={{
            marginTop: 20, padding: '6px 12px',
            borderRadius: 5,
            background: 'var(--mep-warn-soft)',
            color: 'var(--mep-warn)',
            fontSize: 11.5, fontWeight: 500,
            fontFamily: 'var(--mep-fs-mono)',
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}>
            Tracked in issue #29
          </div>

          {/* Faded mock rows underneath to hint at the future shape */}
          <div style={{
            marginTop: 36, width: '100%', maxWidth: 540,
            display: 'flex', flexDirection: 'column', gap: 8,
            opacity: 0.32,
            maskImage: 'linear-gradient(180deg, #000 0%, transparent 100%)',
            WebkitMaskImage: 'linear-gradient(180deg, #000 0%, transparent 100%)',
            pointerEvents: 'none',
          }}>
            {[
              ['AUTH',  'user.signin · lucia@mise.app',         '14:02:11'],
              ['OCR',   'invoice.extract · inv_2026-A-0471',    '14:01:48'],
              ['DB',    'migration.apply · 0041_events_table',  '13:59:02'],
              ['QUOTA', 'tenant.threshold · casa-lua @ 80%',    '13:54:30'],
            ].map(([type, msg, when], i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 12px',
                borderRadius: 6,
                background: 'var(--mep-surface-2)',
                border: '1px solid var(--mep-divider)',
                fontFamily: 'var(--mep-fs-mono)',
                fontSize: 11.5,
                textAlign: 'left',
              }}>
                <span style={{
                  minWidth: 52, textAlign: 'center',
                  padding: '1px 6px', borderRadius: 3,
                  background: 'var(--mep-hover)', color: 'var(--mep-fg-2)',
                  fontWeight: 600, letterSpacing: 0.06,
                }}>{type}</span>
                <span style={{ flex: 1, color: 'var(--mep-fg-2)' }}>{msg}</span>
                <span style={{ color: 'var(--mep-fg-3)' }}>{when}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

// ── Composite artboard wrapper ────────────────────────────────────────────
function AdminArtboard({ page = 'overview', theme = 'light', screenLabel }) {
  const [t, setT] = React.useState(theme);
  const [p, setP] = React.useState(page);
  React.useEffect(() => setT(theme), [theme]);
  React.useEffect(() => setP(page), [page]);
  return (
    <AdminShell
      active={p}
      theme={t}
      onNav={setP}
      onThemeToggle={() => setT(t === 'dark' ? 'light' : 'dark')}
      screenLabel={screenLabel}>
      {p === 'overview' && <AdminOverview onGoHealth={() => setP('health')} />}
      {p === 'health'   && <AdminHealth />}
      {p === 'events'   && <AdminEvents />}
    </AdminShell>
  );
}

Object.assign(window, {
  AdminShell, AdminOverview, AdminHealth, AdminEvents, AdminArtboard,
  AdminKpiCard: KpiCard, AdminSectionCard: SectionCard,
  AdminStatusBadge: StatusBadge, AdminPosNegPill: PosNegPill,
});
