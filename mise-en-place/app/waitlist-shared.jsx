// Waitlist — shared building blocks
// Copy bank, email form, product mockups (mini invoice list / extraction / dashboard),
// integrations strip, testimonials.

const { Logo, Camera, Mail, Check, Sparkle, ArrowUp, ArrowDown, Bell,
  AlertTriangle, ChevronRight, Search, Tag, Calendar, Sun, Moon, X } = window.MEPIcons;

// ── Copy bank (Spanish-default, refined) ──────────────────────────────────
const WL_COPY = {
  pageTitle:    'Mise en Place — Lista de espera',
  eyebrow:      'Acceso anticipado · Barcelona · Verano 2026',
  brand:        'Mise en Place',
  brandKicker:  'Control operativo para cocinas profesionales',

  // 3 headline variants for the Tweaks toggle
  headlines: [
    {
      key: 'brain',
      text: 'El cerebro operativo de tu cocina.',
      sub:  'Sube una factura. En segundos está registrada, categorizada y analizada. Sin hojas de cálculo. Sin errores de transcripción.',
    },
    {
      key: 'direct',
      text: 'Sabe en qué gasta tu cocina, antes que tú.',
      sub:  'Factura tras factura, Mise en Place lee, normaliza y vigila tus precios. Tu margen, defendido cada día.',
    },
    {
      key: 'craft',
      text: 'Tus facturas, leídas. Tu margen, defendido.',
      sub:  'El sistema operativo que tus albaranes siempre debieron tener. Hecho en Barcelona, para cocinas de menú y de barra.',
    },
  ],

  ctaShort:     'Apuntarme',
  ctaLong:      'Quiero acceso anticipado',
  emailPh:      'tu@email.com',
  privacy:      'Solo guardamos tu email. Sin spam. Sin compromisos.',
  incentive:    'Las primeras 50 cocinas obtienen 1 mes gratis y setup prioritario.',
  successTitle: 'Estás dentro.',
  successBody:  'Te escribiremos en cuanto abramos un sitio. Mientras tanto, vigila tu bandeja.',

  // Integrations
  integrationsLabel: 'Compatible con tu flujo',
  integrations: [
    { name: 'Square POS' },
    { name: 'Revo TPV' },
    { name: 'Holded' },
    { name: 'Excel / CSV' },
    { name: 'WhatsApp Business' },
  ],

  // Pain — three stats
  painEyebrow: 'El problema',
  painHead:    'Cada semana se te escapan horas, datos y dinero.',
  painSub:     'Tres síntomas que vemos en toda cocina sin un sistema.',
  pain: [
    {
      stat:    '4–6 h',
      label:   'a la semana',
      title:   'Tu equipo transcribe facturas a mano.',
      body:    'Cada albarán acaba en una hoja de cálculo —o en un cajón. Son entre cuatro y seis horas semanales que no cocinan, no entrenan, no atienden.',
    },
    {
      stat:    '¿0?',
      label:   'visibilidad',
      title:   'Nadie sabe en qué se gastó la semana.',
      body:    '¿Cuánto cárnico llevamos este mes? Sin sistema, esa respuesta tarda treinta minutos. Con Mise en Place, está en pantalla antes de que termines la pregunta.',
    },
    {
      stat:    '+8 %',
      label:   'subidas invisibles',
      title:   'Los proveedores te suben el precio en silencio.',
      body:    'El aceite sube un ocho por ciento un martes cualquiera. Lo descubres tres meses después, revisando facturas. Mise en Place detecta el cambio y te avisa el mismo día.',
    },
  ],

  // How it works
  howEyebrow:  'Cómo funciona',
  howHead:     'Tres movimientos. Cero hojas de cálculo.',
  steps: [
    {
      num: '01',
      tag: 'Captura',
      title:    'Una foto al albarán, o el PDF a la web.',
      body:     'Desde el móvil del repartidor, por WhatsApp, o arrastrando el PDF al panel. Sin instalaciones. Sin app que recordar abrir.',
      mock:     'capture',
    },
    {
      num: '02',
      tag: 'Inferencia',
      title:    'El Cerebro de Cocina extrae y normaliza.',
      body:     'Proveedor, fechas, IVA, y cada línea con su producto, cantidad y precio. Los nombres se normalizan para que tu inventario sea perfecto.',
      mock:     'extract',
    },
    {
      num: '03',
      tag: 'Poder',
      title:    'Tu panel se ilumina con datos que importan.',
      body:     'Gasto por categoría. Alertas de precio. Integración con tu TPV (Square / Revo) para restar el stock vendido. Tu margen, en tiempo real.',
      mock:     'dashboard',
    },
  ],

  // Testimonials
  testimonialsEyebrow: 'Lo que dicen los chefs',
  testimonials: [
    {
      quote: 'Cada semana pierdo horas pasando facturas a mano. Si funciona como dices, lo firmo ahora mismo.',
      name:  'Jordi M.',
      role:  'Jefe de Cocina · Restaurante de menú · Barcelona',
      initials: 'JM',
    },
    {
      quote: 'Lo difícil no es gastar. Lo difícil es saber en qué gastas. Nunca tengo esa visión en tiempo real.',
      name:  'Ana R.',
      role:  'Responsable de Compras · Hotel boutique · Costa Brava',
      initials: 'AR',
    },
    {
      quote: 'Si me ahorras el viernes de papeleo, me ahorras una jornada entera del equipo de oficina.',
      name:  'Iván C.',
      role:  'Gerente · Grupo de cuatro locales · Eixample',
      initials: 'IC',
    },
  ],

  // Founder note
  founderEyebrow: 'Una nota del fundador',
  founder: {
    body: 'Pasé tres años en cocinas y dos en restaurantes ayudando con la administración. La factura es el documento más maltratado de la industria: nadie la quiere, todos la necesitan. Mise en Place existe para que esa hora del viernes deje de existir.',
    name: 'Víctor Egea Martínez',
    role: 'Fundador · Barcelona',
  },

  // FAQ
  faqEyebrow: 'Dudas frecuentes',
  faq: [
    { q: '¿Qué pasa con mis datos?', a: 'Tus facturas son tuyas. Las almacenamos cifradas en servidores en la UE y puedes exportarlas o eliminarlas en cualquier momento. Nunca las usaremos para entrenar modelos públicos.' },
    { q: '¿Necesito cambiar mi software de TPV?', a: 'No. Mise en Place se conecta a Square y Revo desde el primer día, y exporta a Excel/CSV para el resto. Si usas otro TPV, escríbenos —probablemente lo integremos pronto.' },
    { q: '¿Y si el albarán está manchado o arrugado?', a: 'Esa es nuestra especialidad. El motor lee fotos de móvil hechas con prisas en una cocina caliente. Si algo no se entiende, te lo señala para que lo confirmes tú —no inventa.' },
    { q: '¿Cuánto cuesta?', a: 'Durante el acceso anticipado, gratis. El precio final estará entre 49 € y 99 € por local al mes según volumen, sin sorpresas.' },
    { q: '¿Cuándo empieza el acceso?', a: 'Abrimos en tandas a partir de julio de 2026. Avisamos por email con al menos una semana de antelación.' },
  ],

  // Spot counter
  spotCounter: { taken: 43, total: 50, label: 'plazas prioritarias asignadas' },

  footerNote: 'Mise en Place · Barcelona · 2026 — Hecho en una cocina, no en una sala de juntas.',
};

// ── Email form (state-aware) ───────────────────────────────────────────────
function WLEmailForm({ size = 'md', accent = true, light = false }) {
  const [email, setEmail] = React.useState('');
  const [submitted, setSubmitted] = React.useState(false);
  const [err, setErr] = React.useState('');
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const submit = (e) => {
    e.preventDefault();
    if (!email.trim()) { setErr('Introduce tu email para continuar.'); return; }
    if (!EMAIL_RE.test(email.trim())) { setErr('Ese email no parece válido.'); return; }
    setErr(''); setSubmitted(true);
  };

  const big = size === 'lg';
  const inputH = big ? 52 : 44;
  const fs    = big ? 14.5 : 13.5;

  if (submitted) {
    return (
      <div style={{
        padding: big ? '18px 20px' : '14px 16px',
        borderRadius: 10,
        background: 'var(--mep-pos-soft)',
        border: '1px solid var(--mep-pos)',
        display: 'flex', alignItems: 'flex-start', gap: 12,
      }}>
        <div style={{
          width: 26, height: 26, borderRadius: 13, flexShrink: 0,
          background: 'var(--mep-pos)', color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Check size={15} />
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--mep-pos)', marginBottom: 3 }}>
            {WL_COPY.successTitle}
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--mep-fg-2)', lineHeight: 1.5 }}>
            {WL_COPY.successBody}
          </div>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <span style={{
            position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)',
            color: 'var(--mep-fg-3)', pointerEvents: 'none',
          }}><Mail size={15} /></span>
          <input
            type="email" value={email}
            onChange={(e) => { setEmail(e.target.value); if (err) setErr(''); }}
            placeholder={WL_COPY.emailPh}
            style={{
              width: '100%', height: inputH,
              padding: `0 14px 0 38px`,
              fontFamily: 'inherit', fontSize: fs,
              borderRadius: 8,
              background: 'var(--mep-surface)',
              color: 'var(--mep-fg)',
              border: `1px solid ${err ? 'var(--mep-neg)' : 'var(--mep-border-strong)'}`,
              outline: 'none', boxSizing: 'border-box',
            }}
          />
        </div>
        <button type="submit" className="btn btn-primary" style={{
          height: inputH, padding: big ? '0 22px' : '0 18px',
          fontSize: fs, fontWeight: 600, letterSpacing: -0.1,
          flexShrink: 0,
        }}>
          {big ? WL_COPY.ctaLong : WL_COPY.ctaShort}
          <ChevronRight size={13} />
        </button>
      </div>
      {err && (
        <div style={{ fontSize: 11.5, color: 'var(--mep-neg)', paddingLeft: 4 }}>
          {err}
        </div>
      )}
      {accent && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 2 }}>
          <Sparkle size={11} style={{ color: 'var(--mep-acc)' }} />
          <span style={{ fontSize: 11.5, color: 'var(--mep-acc)', fontWeight: 500 }}>
            {WL_COPY.incentive}
          </span>
        </div>
      )}
      <div style={{ fontSize: 11, color: 'var(--mep-fg-3)', paddingLeft: 2 }}>
        {WL_COPY.privacy}
      </div>
    </form>
  );
}

// ── Integrations strip ─────────────────────────────────────────────────────
function WLIntegrations({ tone = 'neutral' }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 22, flexWrap: 'wrap',
      padding: '14px 20px',
      borderRadius: 12,
      background: 'var(--mep-surface)',
      border: '1px solid var(--mep-divider)',
    }}>
      <div style={{
        fontSize: 10.5, fontWeight: 600, letterSpacing: 0.12,
        textTransform: 'uppercase', color: 'var(--mep-fg-3)',
        fontFamily: 'var(--mep-fs-mono)',
        flexShrink: 0,
      }}>
        {WL_COPY.integrationsLabel}
      </div>
      <div style={{
        flex: 1, height: 1, background: 'var(--mep-divider)',
        minWidth: 20,
      }} />
      <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        {WL_COPY.integrations.map((it, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              width: 6, height: 6, borderRadius: 3, background: 'var(--mep-acc)',
              boxShadow: '0 0 0 3px var(--mep-acc-soft)',
            }} />
            <span style={{
              fontSize: 12.5, fontWeight: 500, color: 'var(--mep-fg-2)',
              letterSpacing: -0.05,
            }}>{it.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Brand mark + admin-style ADMIN pill replaced with EARLY ACCESS pill ────
function WLBrandLockup({ small }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ color: 'var(--mep-acc)', display: 'flex' }}>
        <Logo size={small ? 18 : 22} />
      </div>
      <div style={{
        fontSize: small ? 14 : 16,
        fontWeight: 600, letterSpacing: -0.3,
        color: 'var(--mep-fg)',
      }}>
        {WL_COPY.brand}
      </div>
    </div>
  );
}

// ── Spot counter — "43 / 50" ──────────────────────────────────────────────
function WLSpotCounter({ inline }) {
  const { taken, total, label } = WL_COPY.spotCounter;
  const pct = (taken / total) * 100;
  return (
    <div style={{
      display: 'flex', flexDirection: inline ? 'row' : 'column',
      alignItems: inline ? 'center' : 'flex-start',
      gap: inline ? 14 : 10,
      padding: inline ? '10px 14px' : '14px 16px',
      borderRadius: 10,
      background: 'var(--mep-surface)',
      border: '1px solid var(--mep-divider)',
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span className="num" style={{
          fontSize: 22, fontWeight: 700, color: 'var(--mep-acc)',
          letterSpacing: -0.6, lineHeight: 1, fontFamily: 'var(--mep-fs-mono)',
        }}>{taken}</span>
        <span style={{ fontSize: 14, color: 'var(--mep-fg-3)', fontFamily: 'var(--mep-fs-mono)' }}>
          / {total}
        </span>
      </div>
      <div style={{ flex: 1, minWidth: 120, width: inline ? 'auto' : '100%' }}>
        <div style={{
          fontSize: 11, color: 'var(--mep-fg-3)',
          textTransform: 'uppercase', letterSpacing: 0.06, fontWeight: 500,
          marginBottom: 5, fontFamily: 'var(--mep-fs-mono)',
        }}>{label}</div>
        <div style={{
          width: '100%', height: 5, borderRadius: 3,
          background: 'var(--mep-hover)', overflow: 'hidden',
        }}>
          <div style={{
            width: `${pct}%`, height: '100%',
            background: 'var(--mep-acc)',
            borderRadius: 3,
          }} />
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// PRODUCT MOCKUPS
// Small versions of the real app UI to use in the "how it works" section.
// ─────────────────────────────────────────────────────────────────────────

// Mock 1 — Capture: phone snapshot + WhatsApp bubble
function WLCaptureMock() {
  return (
    <div style={{
      position: 'relative', width: '100%', aspectRatio: '4 / 3',
      borderRadius: 16, overflow: 'hidden',
      background: 'linear-gradient(135deg, var(--mep-surface-2) 0%, var(--mep-surface) 100%)',
      border: '1px solid var(--mep-divider)',
      padding: 28,
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 24,
    }}>
      {/* Faux invoice paper (background) */}
      <div style={{
        position: 'absolute', top: 22, left: 22, width: '54%', height: '78%',
        background: 'var(--mep-surface)',
        border: '1px solid var(--mep-divider)',
        borderRadius: 4,
        boxShadow: '0 14px 40px rgba(0,0,0,0.12)',
        transform: 'rotate(-6deg)',
        padding: '14px 16px',
        display: 'flex', flexDirection: 'column', gap: 6,
        overflow: 'hidden',
      }}>
        <div style={{
          fontSize: 10, fontWeight: 700, color: 'var(--mep-fg)',
          fontFamily: 'var(--mep-fs-mono)',
        }}>CÁRNICAS IBÉRICO ARANDA</div>
        <div style={{ fontSize: 8.5, color: 'var(--mep-fg-3)', fontFamily: 'var(--mep-fs-mono)' }}>
          CIF B81234567 · Madrid
        </div>
        <div style={{ height: 1, background: 'var(--mep-divider)', margin: '4px 0' }} />
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          fontSize: 8.5, color: 'var(--mep-fg-2)', fontFamily: 'var(--mep-fs-mono)',
        }}>
          <span>FACTURA</span><span>N.º 2026-A-0471</span>
        </div>
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          fontSize: 8.5, color: 'var(--mep-fg-3)', fontFamily: 'var(--mep-fs-mono)',
        }}>
          <span>Fecha</span><span>19/05/2026</span>
        </div>
        <div style={{ height: 1, background: 'var(--mep-divider)', margin: '4px 0' }} />
        {['Solomillo ibérico', 'Costillas cerdo', 'Carrillera', 'Chorizo cular', 'Lomo embuchado'].map((p, i) => (
          <div key={i} style={{
            display: 'flex', justifyContent: 'space-between',
            fontSize: 8, color: 'var(--mep-fg-2)', fontFamily: 'var(--mep-fs-mono)',
          }}>
            <span>{p}</span>
            <span className="num">{(20 + i * 14).toFixed(2)} €</span>
          </div>
        ))}
        <div style={{ flex: 1 }} />
        <div style={{ height: 1, background: 'var(--mep-divider)' }} />
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          fontSize: 9, fontWeight: 700, color: 'var(--mep-fg)',
          fontFamily: 'var(--mep-fs-mono)',
        }}>
          <span>TOTAL</span><span className="num">482,65 €</span>
        </div>
      </div>

      {/* WhatsApp-style chat bubble (foreground) */}
      <div style={{
        position: 'absolute', right: 28, bottom: 28, width: '46%',
        display: 'flex', flexDirection: 'column', gap: 8,
        alignItems: 'flex-end',
      }}>
        {/* Outgoing — image attachment */}
        <div style={{
          maxWidth: '90%',
          background: '#dcf8c6',
          color: '#0a2618',
          borderRadius: '12px 12px 4px 12px',
          padding: 8,
          fontSize: 11,
          boxShadow: '0 8px 20px rgba(0,0,0,0.12)',
        }}>
          <div style={{
            width: '100%', height: 76, borderRadius: 6,
            background: 'linear-gradient(135deg, #c1bfaf 0%, #8a8678 60%, #5f5a4d 100%)',
            position: 'relative',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Camera size={20} style={{ color: 'rgba(255,255,255,0.5)' }} />
          </div>
          <div style={{ fontSize: 10, marginTop: 5, fontFamily: 'var(--mep-fs-mono)' }}>
            albaran_aranda.jpg · 1.2 MB
          </div>
        </div>

        {/* Incoming — bot reply */}
        <div style={{
          maxWidth: '90%',
          background: '#ffffff',
          color: '#0a2618',
          borderRadius: '12px 12px 12px 4px',
          padding: '8px 12px',
          fontSize: 11.5,
          boxShadow: '0 8px 20px rgba(0,0,0,0.12)',
          fontWeight: 500,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
            <span style={{
              width: 12, height: 12, borderRadius: 6,
              background: 'var(--mep-acc)', color: 'var(--mep-acc-fg)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 7, fontWeight: 700,
            }}>M</span>
            <span style={{ fontSize: 10, fontWeight: 600 }}>Mise en Place</span>
          </div>
          Recibida ✓ · Procesando 14 líneas…
          <div style={{
            fontSize: 9.5, color: '#5a8a6f', marginTop: 3,
            fontFamily: 'var(--mep-fs-mono)',
          }}>
            14:02
          </div>
        </div>
      </div>
    </div>
  );
}

// Mock 2 — Extraction: table of extracted lines
function WLExtractMock() {
  const lines = [
    { ok: true,  desc: 'Solomillo de ternera ibérica', qty: '4,20 kg', total: '119,28' },
    { ok: true,  desc: 'Costillas de cerdo ibérico',   qty: '3,50 kg', total: '51,10'  },
    { ok: true,  desc: 'Carrillera de ternera',        qty: '2,80 kg', total: '34,72'  },
    { ok: 'warn',desc: 'Chorizo cular ibérico',        qty: '1,20 kg', total: '27,36'  },
    { ok: true,  desc: 'Lomo embuchado',               qty: '0,80 kg', total: '29,20'  },
  ];
  return (
    <div className="card" style={{
      width: '100%', padding: 0, overflow: 'hidden',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Title bar */}
      <div style={{
        padding: '12px 16px',
        borderBottom: '1px solid var(--mep-divider)',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <div style={{
          width: 22, height: 22, borderRadius: 5,
          background: 'var(--mep-acc-soft)', color: 'var(--mep-acc)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Sparkle size={12} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--mep-fg)' }}>
            Cárnicas Ibérico Aranda
          </div>
          <div style={{
            fontSize: 10.5, color: 'var(--mep-fg-3)',
            fontFamily: 'var(--mep-fs-mono)',
          }}>
            2026-A-0471 · 19/05/2026 · extraído en 2,3 s
          </div>
        </div>
        <span className="badge badge-confirmed" style={{ fontSize: 9.5 }}>
          <Check size={9} /> Confirmada
        </span>
      </div>

      {/* Lines */}
      <div>
        {lines.map((l, i) => (
          <div key={i} style={{
            display: 'grid',
            gridTemplateColumns: '14px 1fr 70px 60px',
            gap: 10,
            padding: '8px 16px',
            borderBottom: i === lines.length - 1 ? 0 : '1px solid var(--mep-divider)',
            alignItems: 'center',
            fontSize: 11.5,
          }}>
            <div style={{
              width: 12, height: 12, borderRadius: 6,
              background: l.ok === 'warn' ? 'var(--mep-warn-soft)' : 'var(--mep-pos-soft)',
              color: l.ok === 'warn' ? 'var(--mep-warn)' : 'var(--mep-pos)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              {l.ok === 'warn' ? <AlertTriangle size={7} /> : <Check size={7} />}
            </div>
            <span style={{ color: 'var(--mep-fg-2)', minWidth: 0,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {l.desc}
            </span>
            <span className="num" style={{
              color: 'var(--mep-fg-3)', textAlign: 'right',
              fontFamily: 'var(--mep-fs-mono)',
            }}>
              {l.qty}
            </span>
            <span className="num" style={{
              color: 'var(--mep-fg)', fontWeight: 500,
              textAlign: 'right', fontFamily: 'var(--mep-fs-mono)',
            }}>
              {l.total} €
            </span>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div style={{
        padding: '10px 16px',
        background: 'var(--mep-surface-2)',
        borderTop: '1px solid var(--mep-divider)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span style={{ fontSize: 11, color: 'var(--mep-fg-3)' }}>
          14 líneas · IVA 10 %
        </span>
        <span className="num" style={{
          fontSize: 13, fontWeight: 700, color: 'var(--mep-fg)',
          fontFamily: 'var(--mep-fs-mono)',
        }}>
          482,65 €
        </span>
      </div>
    </div>
  );
}

// Mock 3 — Dashboard: stacked bar chart + alert + KPIs
function WLDashboardMock() {
  // Eight weeks of synthesized data
  const weeks = [
    { l: 'S15', a: 22, b: 18, c: 14 },
    { l: 'S16', a: 26, b: 16, c: 18 },
    { l: 'S17', a: 24, b: 20, c: 16 },
    { l: 'S18', a: 30, b: 22, c: 14 },
    { l: 'S19', a: 28, b: 24, c: 18 },
    { l: 'S20', a: 36, b: 22, c: 22 },
    { l: 'S21', a: 38, b: 28, c: 20, hi: true },
  ];
  const maxTotal = Math.max(...weeks.map(w => w.a + w.b + w.c));
  const padL = 28, padT = 14, padB = 22, chartH = 130;
  const cols = weeks.length;
  return (
    <div className="card" style={{
      padding: 16, display: 'flex', flexDirection: 'column', gap: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{
            fontSize: 10.5, color: 'var(--mep-fg-3)',
            textTransform: 'uppercase', letterSpacing: 0.08, fontWeight: 500,
            fontFamily: 'var(--mep-fs-mono)',
          }}>
            Gasto · últimas 7 semanas
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 4 }}>
            <span className="num" style={{
              fontSize: 22, fontWeight: 700, color: 'var(--mep-fg)',
              letterSpacing: -0.4, fontFamily: 'var(--mep-fs-mono)',
            }}>3.842,15 €</span>
            <span style={{
              fontSize: 11, color: 'var(--mep-pos)', fontWeight: 600,
              display: 'inline-flex', alignItems: 'center', gap: 2,
            }}>
              <ArrowUp size={10} /> 12,4 %
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 5 }}>
          {[{ k: 'Carne', c: '#7a5b3a' }, { k: 'Pescado', c: '#4d5b7a' }, { k: 'Verdura', c: '#3d6b5a' }].map(c => (
            <div key={c.k} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: c.c }} />
              <span style={{ fontSize: 10, color: 'var(--mep-fg-3)' }}>{c.k}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Chart */}
      <svg width="100%" height={chartH + padT + padB} style={{ display: 'block', overflow: 'visible' }}>
        {[0, 0.5, 1].map(p => (
          <line key={p} x1={padL} x2="100%" y1={padT + chartH * (1 - p)} y2={padT + chartH * (1 - p)}
            stroke="var(--mep-divider)" strokeWidth="1" />
        ))}
        {weeks.map((w, i) => {
          const barW = 22;
          const colW = `calc((100% - ${padL + 6}px) / ${cols})`;
          const xL  = `calc(${padL}px + (${colW}) * ${i} + (${colW}) / 2 - ${barW / 2}px)`;
          const total = w.a + w.b + w.c;
          let stackY = padT + chartH;
          const segs = [
            { v: w.a, c: '#7a5b3a' },
            { v: w.b, c: '#4d5b7a' },
            { v: w.c, c: '#3d6b5a' },
          ];
          const dim = !w.hi && weeks.some(x => x.hi);
          return (
            <g key={i} style={{ opacity: dim ? 0.45 : 1 }}>
              {segs.map((s, si) => {
                const h = (s.v / maxTotal) * chartH;
                stackY -= h;
                return <rect key={si} x={xL} y={stackY} width={barW} height={Math.max(h, 0.5)} fill={s.c} />;
              })}
              <text x={xL} dx={barW / 2} y={padT + chartH + 14}
                textAnchor="middle" fontSize="9.5" fill="var(--mep-fg-3)"
                fontFamily="var(--mep-fs-mono)">{w.l}</text>
              {w.hi && (
                <text x={xL} dx={barW / 2} y={stackY - 4} textAnchor="middle"
                  fontSize="9.5" fontWeight="700" fill="var(--mep-fg)"
                  fontFamily="var(--mep-fs-mono)">
                  {((total / 10) + 0.86).toFixed(2).replace('.', ',')} k
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {/* Alert row */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '9px 12px',
        borderRadius: 8,
        background: 'var(--mep-warn-soft)',
      }}>
        <div style={{ color: 'var(--mep-warn)', flexShrink: 0 }}>
          <AlertTriangle size={14} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11.5, color: 'var(--mep-fg)', fontWeight: 600 }}>
            Aceite de oliva virgen · +8,1 % esta semana
          </div>
          <div style={{ fontSize: 10.5, color: 'var(--mep-fg-3)', fontFamily: 'var(--mep-fs-mono)' }}>
            Aceites Gómez Hermanos · 4,80 € → 5,19 € / L
          </div>
        </div>
        <span style={{
          fontSize: 10, fontWeight: 600, color: 'var(--mep-warn)',
          textTransform: 'uppercase', letterSpacing: 0.06,
          fontFamily: 'var(--mep-fs-mono)',
        }}>Revisar</span>
      </div>
    </div>
  );
}

// Pick mock by key
function WLMock({ kind }) {
  if (kind === 'capture')   return <WLCaptureMock />;
  if (kind === 'extract')   return <WLExtractMock />;
  if (kind === 'dashboard') return <WLDashboardMock />;
  return null;
}

// Export
Object.assign(window, {
  WL_COPY, WLEmailForm, WLIntegrations, WLBrandLockup,
  WLSpotCounter, WLMock,
  WLCaptureMock, WLExtractMock, WLDashboardMock,
});
