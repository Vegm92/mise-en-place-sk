// Waitlist — Variant C — Experimental
// Dark-first split hero, type-as-data, sticker labels, live ticker feel.

const { WLEmailForm, WLBrandLockup, WLSpotCounter, WLMock, WL_COPY,
  WLNav, WLLangToggle, WLFounder, WLFAQ } = window;
const VC_ICONS = window.MEPIcons;

// ─────────────────────────────────────────────────────────────────────────
// Live ticker / marquee — invoices flowing through the system
// ─────────────────────────────────────────────────────────────────────────
function WLTicker() {
  const items = [
    { sup: 'Mercavera Frescos',     n: 'MV/26/3318', val: '318,40 €', cat: 'verdura' },
    { sup: 'Cárnicas Ibérico Aranda', n: '2026-A-0471', val: '482,65 €', cat: 'carne'   },
    { sup: 'Pescados Atlántico Vigo', n: 'PA-2026-0982', val: '612,18 €', cat: 'pescado' },
    { sup: 'Bodegas Solana',          n: 'BS/26/041',    val: '642,50 €', cat: 'vinos'   },
    { sup: 'Aceites Gómez Hermanos',  n: 'AG-2026-118',  val: '482,10 €', cat: 'aceites' },
    { sup: 'Lácteos Castilla SA',     n: 'LC/2026/118',  val: '142,80 €', cat: 'lácteos' },
    { sup: 'Panadería Ruiz',          n: '2026/0042',    val: '64,20 €',  cat: 'pan'     },
  ];
  const all = [...items, ...items, ...items]; // tripled for seamless loop
  return (
    <div style={{
      overflow: 'hidden',
      borderTop: '1px solid var(--mep-divider)',
      borderBottom: '1px solid var(--mep-divider)',
      background: 'var(--mep-surface)',
      padding: '10px 0',
      position: 'relative',
      maskImage: 'linear-gradient(90deg, transparent 0%, #000 6%, #000 94%, transparent 100%)',
      WebkitMaskImage: 'linear-gradient(90deg, transparent 0%, #000 6%, #000 94%, transparent 100%)',
    }}>
      <div style={{
        display: 'inline-flex', gap: 28,
        whiteSpace: 'nowrap',
        animation: 'wlmarquee 64s linear infinite',
      }}>
        {all.map((it, i) => (
          <div key={i} style={{
            display: 'inline-flex', alignItems: 'center', gap: 12,
            padding: '4px 14px',
            background: 'var(--mep-surface-2)',
            border: '1px solid var(--mep-divider)',
            borderRadius: 999,
            fontSize: 12,
            fontFamily: 'var(--mep-fs-mono)',
          }}>
            <span style={{
              width: 6, height: 6, borderRadius: 3, background: 'var(--mep-pos)',
              boxShadow: '0 0 0 3px var(--mep-pos-soft)',
            }} />
            <span style={{ color: 'var(--mep-fg)', fontWeight: 500 }}>{it.sup}</span>
            <span style={{ color: 'var(--mep-fg-3)' }}>·</span>
            <span style={{ color: 'var(--mep-fg-3)' }}>{it.n}</span>
            <span style={{ color: 'var(--mep-fg-3)' }}>·</span>
            <span style={{ color: 'var(--mep-acc)', fontWeight: 600 }}>{it.val}</span>
            <span style={{ color: 'var(--mep-fg-3)' }}>·</span>
            <span style={{
              fontSize: 10, padding: '1px 6px', borderRadius: 3,
              background: 'var(--mep-hover)', color: 'var(--mep-fg-2)',
              textTransform: 'uppercase', letterSpacing: 0.06, fontWeight: 600,
            }}>{it.cat}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// "Sticker" — a small rotated/colored callout label
function WLSticker({ children, color = 'acc', rot = -4, style }) {
  const colorMap = {
    acc:  { bg: 'var(--mep-acc)',  fg: 'var(--mep-acc-fg)' },
    pos:  { bg: 'var(--mep-pos)',  fg: '#fff' },
    neg:  { bg: 'var(--mep-neg)',  fg: '#fff' },
    fg:   { bg: 'var(--mep-fg)',   fg: 'var(--mep-bg)' },
  };
  const c = colorMap[color] || colorMap.acc;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '4px 10px',
      background: c.bg, color: c.fg,
      fontSize: 10, fontWeight: 700, letterSpacing: 0.12,
      textTransform: 'uppercase',
      fontFamily: 'var(--mep-fs-mono)',
      transform: `rotate(${rot}deg)`,
      borderRadius: 3,
      boxShadow: '0 4px 12px rgba(0,0,0,0.18)',
      ...style,
    }}>{children}</span>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// VARIANT C — EXPERIMENTAL
// ═════════════════════════════════════════════════════════════════════════
function WLVariantC({ theme = 'dark', headlineKey = 'direct', show = {} }) {
  const head = WL_COPY.headlines.find(h => h.key === headlineKey) || WL_COPY.headlines[1];

  return (
    <div className="mep" data-theme={theme} data-accent="amber"
      data-screen-label="03 Waitlist · Experimental"
      style={{
        width: '100%', minHeight: '100%',
        background: 'var(--mep-bg)', color: 'var(--mep-fg)',
        borderTop: '4px solid var(--mep-acc)',
        fontFamily: 'var(--mep-font)',
        overflow: 'hidden',
      }}>
      <style>{`
        @keyframes wlmarquee { from { transform: translateX(0); } to { transform: translateX(-33.333%); } }
        @keyframes wlpulse { 0%, 100% { opacity: 0.5; } 50% { opacity: 1; } }
      `}</style>
      <WLNav />

      {/* Hero — split, dark, with floating product card */}
      <section style={{
        position: 'relative',
        padding: '64px 32px 80px',
        overflow: 'hidden',
        background: theme === 'dark'
          ? 'radial-gradient(ellipse 80% 60% at 20% 30%, rgba(213,152,84,0.10) 0%, transparent 60%)'
          : 'radial-gradient(ellipse 80% 60% at 20% 30%, rgba(184,116,26,0.07) 0%, transparent 60%)',
      }}>
        {/* dot grid */}
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: 'radial-gradient(circle, var(--mep-divider) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
          opacity: 0.5,
          pointerEvents: 'none',
        }} />

        <div style={{
          position: 'relative', zIndex: 1,
          maxWidth: 1280, margin: '0 auto',
          display: 'grid', gridTemplateColumns: '1.05fr 1fr',
          gap: 56, alignItems: 'center',
        }}>
          {/* Left — text */}
          <div>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 10,
              padding: '6px 14px',
              borderRadius: 999,
              border: '1px solid var(--mep-acc)',
              background: 'var(--mep-acc-soft)',
              color: 'var(--mep-acc)',
              fontSize: 11, fontWeight: 600, letterSpacing: 0.12,
              textTransform: 'uppercase',
              fontFamily: 'var(--mep-fs-mono)',
              marginBottom: 32,
            }}>
              <span style={{
                width: 6, height: 6, borderRadius: 3, background: 'var(--mep-acc)',
                animation: 'wlpulse 1.4s ease-in-out infinite',
              }} />
              <span>{WL_COPY.eyebrow}</span>
            </div>

            <h1 style={{
              margin: 0,
              fontSize: 76, fontWeight: 700,
              color: 'var(--mep-fg)',
              letterSpacing: -2.8, lineHeight: 0.98,
              textWrap: 'balance',
            }}>
              {head.text}
            </h1>

            <p style={{
              margin: '28px 0 0', maxWidth: 520,
              fontSize: 17, lineHeight: 1.6, color: 'var(--mep-fg-2)',
            }}>
              {head.sub}
            </p>

            <div style={{ marginTop: 36, maxWidth: 520 }} id="join">
              <WLEmailForm size="lg" />
            </div>

            <div style={{
              marginTop: 28,
              display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ display: 'flex' }}>
                  {['JM', 'AR', 'IC', 'MV'].map((init, i) => (
                    <div key={i} style={{
                      width: 28, height: 28, borderRadius: '50%',
                      background: `hsl(${30 + i * 70}, 30%, ${theme === 'dark' ? 50 : 40}%)`,
                      color: '#fff',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 10, fontWeight: 700,
                      border: '2px solid var(--mep-bg)',
                      marginLeft: i === 0 ? 0 : -8,
                      fontFamily: 'var(--mep-fs-mono)',
                    }}>{init}</div>
                  ))}
                </div>
                <div style={{ fontSize: 12, color: 'var(--mep-fg-2)' }}>
                  <span style={{
                    color: 'var(--mep-fg)', fontWeight: 600,
                    fontFamily: 'var(--mep-fs-mono)',
                  }}>43 chefs</span>
                  {' '}ya en la lista
                </div>
              </div>
              <div style={{ width: 1, height: 18, background: 'var(--mep-divider)' }} />
              <div style={{
                fontSize: 12, color: 'var(--mep-fg-2)',
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <span style={{
                  width: 6, height: 6, borderRadius: 3,
                  background: 'var(--mep-pos)',
                  boxShadow: '0 0 0 3px var(--mep-pos-soft)',
                }} />
                <span>
                  <span style={{ color: 'var(--mep-fg)', fontWeight: 600,
                    fontFamily: 'var(--mep-fs-mono)' }}>7 plazas</span>
                  {' '}aún disponibles
                </span>
              </div>
            </div>
          </div>

          {/* Right — floating product stack */}
          <div style={{ position: 'relative', height: 540 }}>

            {/* Background — dashboard */}
            <div style={{
              position: 'absolute', top: 0, right: 0, width: '95%',
              transform: 'rotate(-2deg)',
              boxShadow: '0 30px 80px rgba(0,0,0,0.4)',
              border: '1px solid var(--mep-divider)',
              borderRadius: 12, overflow: 'hidden',
              background: 'var(--mep-surface)',
            }}>
              <div style={{ padding: 6 }}>
                <WLMock kind="dashboard" />
              </div>
            </div>

            {/* Middle — extract */}
            <div style={{
              position: 'absolute', bottom: 60, left: 0, width: '78%',
              transform: 'rotate(3deg)',
              boxShadow: '0 30px 80px rgba(0,0,0,0.5)',
            }}>
              <WLMock kind="extract" />
            </div>

            {/* Floating stickers */}
            <div style={{
              position: 'absolute', top: 28, right: -8, zIndex: 3,
            }}>
              <WLSticker color="acc" rot={8}>+8,1 % aceite · detectado</WLSticker>
            </div>

            <div style={{
              position: 'absolute', bottom: 24, right: 40, zIndex: 3,
            }}>
              <WLSticker color="pos" rot={-6}>14 líneas · 2,3 s</WLSticker>
            </div>

            <div style={{
              position: 'absolute', top: 290, left: -12, zIndex: 3,
            }}>
              <WLSticker color="fg" rot={4}>Sin teclear</WLSticker>
            </div>
          </div>
        </div>
      </section>

      {/* Live ticker */}
      <WLTicker />

      {/* Type-as-data — pain points as massive editorial type */}
      <section style={{
        padding: '120px 32px 80px',
        position: 'relative',
        overflow: 'hidden',
      }}>
        <div style={{ maxWidth: 1280, margin: '0 auto' }}>
          <div style={{
            display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
            marginBottom: 64, gap: 24, flexWrap: 'wrap',
          }}>
            <div>
              <div style={{
                fontSize: 11, fontWeight: 600, letterSpacing: 0.22,
                textTransform: 'uppercase', color: 'var(--mep-acc)',
                fontFamily: 'var(--mep-fs-mono)', marginBottom: 14,
              }}>
                {WL_COPY.painEyebrow}
              </div>
              <h2 style={{
                margin: 0, fontSize: 48, fontWeight: 600,
                color: 'var(--mep-fg)',
                letterSpacing: -1.4, lineHeight: 1.05,
                maxWidth: 720, textWrap: 'balance',
              }}>
                {WL_COPY.painHead}
              </h2>
            </div>
            <div style={{
              fontSize: 11, color: 'var(--mep-fg-3)',
              fontFamily: 'var(--mep-fs-mono)',
              maxWidth: 260, lineHeight: 1.55,
              textAlign: 'right',
            }}>
              Tres números que vemos en cada cocina antes de Mise en Place.
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {WL_COPY.pain.map((p, i) => (
              <div key={i} style={{
                padding: '40px 0',
                borderTop: '1px solid var(--mep-divider)',
                ...(i === WL_COPY.pain.length - 1 ? { borderBottom: '1px solid var(--mep-divider)' } : {}),
                display: 'grid',
                gridTemplateColumns: '120px 1fr 1fr',
                gap: 40, alignItems: 'center',
                position: 'relative',
              }}>
                <div style={{
                  fontSize: 14, color: 'var(--mep-fg-3)',
                  fontFamily: 'var(--mep-fs-mono)',
                  letterSpacing: 0.08, textTransform: 'uppercase', fontWeight: 600,
                }}>0{i + 1} / 03</div>
                <div style={{
                  fontSize: 160, fontWeight: 700, color: 'var(--mep-acc)',
                  letterSpacing: -7, lineHeight: 0.86,
                  fontFamily: 'var(--mep-fs-mono)',
                  position: 'relative',
                  whiteSpace: 'nowrap',
                }}>
                  {p.stat}
                  <span style={{
                    position: 'absolute',
                    top: '38%', right: -10,
                    fontSize: 12, color: 'var(--mep-fg-3)',
                    letterSpacing: 0.08, textTransform: 'uppercase',
                    fontWeight: 500, fontFamily: 'var(--mep-fs-mono)',
                    transform: 'rotate(-90deg) translateY(-50%)',
                    transformOrigin: 'right top',
                  }}>{p.label}</span>
                </div>
                <div>
                  <h3 style={{
                    margin: 0, fontSize: 22, fontWeight: 600,
                    color: 'var(--mep-fg)', letterSpacing: -0.4, lineHeight: 1.2,
                  }}>{p.title}</h3>
                  <p style={{
                    margin: '12px 0 0', fontSize: 14.5, lineHeight: 1.7,
                    color: 'var(--mep-fg-2)', maxWidth: 460,
                  }}>{p.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How — staggered showcase with mocks at angles */}
      <section style={{
        padding: '100px 32px',
        background: theme === 'dark'
          ? 'linear-gradient(180deg, var(--mep-surface-2) 0%, var(--mep-bg) 100%)'
          : 'linear-gradient(180deg, var(--mep-surface-2) 0%, var(--mep-bg) 100%)',
        borderTop: '1px solid var(--mep-divider)',
      }}>
        <div style={{ maxWidth: 1280, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 72 }}>
            <div style={{
              fontSize: 11, fontWeight: 600, letterSpacing: 0.22,
              textTransform: 'uppercase', color: 'var(--mep-acc)',
              fontFamily: 'var(--mep-fs-mono)', marginBottom: 14,
            }}>{WL_COPY.howEyebrow}</div>
            <h2 style={{
              margin: 0, fontSize: 52, fontWeight: 600,
              color: 'var(--mep-fg)',
              letterSpacing: -1.6, lineHeight: 1.05, maxWidth: 720,
              marginLeft: 'auto', marginRight: 'auto', textWrap: 'balance',
            }}>{WL_COPY.howHead}</h2>
          </div>

          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 18,
          }}>
            {WL_COPY.steps.map((s, i) => (
              <div key={i} style={{
                background: 'var(--mep-surface)',
                border: '1px solid var(--mep-divider)',
                borderRadius: 16,
                padding: 24,
                display: 'flex', flexDirection: 'column', gap: 18,
                position: 'relative',
                overflow: 'hidden',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: 6,
                    background: 'var(--mep-acc)',
                    color: 'var(--mep-acc-fg)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 700,
                    fontFamily: 'var(--mep-fs-mono)',
                    letterSpacing: 0,
                  }}>{s.num}</div>
                  <div style={{
                    fontSize: 10.5, fontWeight: 600, letterSpacing: 0.14,
                    textTransform: 'uppercase', color: 'var(--mep-fg-3)',
                    fontFamily: 'var(--mep-fs-mono)',
                  }}>{s.tag}</div>
                </div>
                <h3 style={{
                  margin: 0, fontSize: 19, fontWeight: 600,
                  color: 'var(--mep-fg)', letterSpacing: -0.3, lineHeight: 1.25,
                  minHeight: 56,
                }}>{s.title}</h3>
                <p style={{
                  margin: 0, fontSize: 13.5, lineHeight: 1.65,
                  color: 'var(--mep-fg-2)',
                }}>{s.body}</p>
                <div style={{ marginTop: 'auto', marginLeft: -8, marginRight: -8, marginBottom: -8 }}>
                  <div style={{
                    transform: `rotate(${(i - 1) * 1.4}deg)`,
                    padding: 10,
                    background: 'var(--mep-surface-2)',
                    borderRadius: 10,
                    border: '1px solid var(--mep-divider)',
                  }}>
                    <WLMock kind={s.mock} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials — staggered cards */}
      <section style={{ padding: '100px 32px' }}>
        <div style={{ maxWidth: 1280, margin: '0 auto' }}>
          <div style={{
            display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
            marginBottom: 56, gap: 24,
          }}>
            <div style={{
              fontSize: 11, fontWeight: 600, letterSpacing: 0.22,
              textTransform: 'uppercase', color: 'var(--mep-acc)',
              fontFamily: 'var(--mep-fs-mono)',
            }}>{WL_COPY.testimonialsEyebrow}</div>
            <div style={{
              flex: 1, height: 1, background: 'var(--mep-divider)',
            }} />
          </div>
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20,
          }}>
            {WL_COPY.testimonials.map((t, i) => (
              <div key={i} style={{
                marginTop: i === 1 ? 0 : 24,
                background: i === 1 ? 'var(--mep-acc)' : 'var(--mep-surface)',
                color: i === 1 ? 'var(--mep-acc-fg)' : 'var(--mep-fg)',
                border: i === 1 ? 0 : '1px solid var(--mep-divider)',
                borderRadius: 16,
                padding: 28,
                display: 'flex', flexDirection: 'column', gap: 20,
              }}>
                <span style={{
                  fontSize: 60, lineHeight: 0.7, fontWeight: 700,
                  color: i === 1 ? 'rgba(0,0,0,0.2)' : 'var(--mep-acc)',
                  height: 22,
                }}>&ldquo;</span>
                <p style={{
                  margin: 0, fontSize: 15, lineHeight: 1.6,
                  color: 'inherit', letterSpacing: -0.1,
                  fontWeight: i === 1 ? 500 : 400,
                  flex: 1,
                }}>{t.quote}</p>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  paddingTop: 16,
                  borderTop: i === 1 ? '1px solid rgba(0,0,0,0.15)' : '1px solid var(--mep-divider)',
                }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: '50%',
                    background: i === 1 ? 'rgba(0,0,0,0.15)' : 'var(--mep-acc-soft)',
                    color: i === 1 ? 'var(--mep-acc-fg)' : 'var(--mep-acc)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, fontWeight: 700,
                    fontFamily: 'var(--mep-fs-mono)',
                  }}>{t.initials}</div>
                  <div>
                    <div style={{
                      fontSize: 13, fontWeight: 600,
                      color: 'inherit',
                    }}>{t.name}</div>
                    <div style={{
                      fontSize: 11, opacity: 0.7,
                      fontFamily: 'var(--mep-fs-mono)',
                    }}>{t.role}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Founder — full-width centered */}
      {show.founder && (
        <section style={{
          padding: '80px 32px',
          background: 'var(--mep-surface)',
          borderTop: '1px solid var(--mep-divider)',
          borderBottom: '1px solid var(--mep-divider)',
        }}>
          <div style={{ maxWidth: 720, margin: '0 auto', textAlign: 'center' }}>
            <div style={{
              fontSize: 11, fontWeight: 600, letterSpacing: 0.22,
              textTransform: 'uppercase', color: 'var(--mep-acc)',
              fontFamily: 'var(--mep-fs-mono)', marginBottom: 24,
            }}>{WL_COPY.founderEyebrow}</div>
            <p style={{
              margin: 0, fontSize: 26, lineHeight: 1.5,
              color: 'var(--mep-fg)', letterSpacing: -0.6,
              fontWeight: 400,
            }}>
              &ldquo;{WL_COPY.founder.body}&rdquo;
            </p>
            <div style={{
              marginTop: 28,
              display: 'inline-flex', alignItems: 'center', gap: 14,
            }}>
              <div style={{
                width: 40, height: 40, borderRadius: '50%',
                background: 'var(--mep-acc)', color: 'var(--mep-acc-fg)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13, fontWeight: 700, fontFamily: 'var(--mep-fs-mono)',
              }}>VE</div>
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--mep-fg)' }}>
                  {WL_COPY.founder.name}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--mep-fg-3)', fontFamily: 'var(--mep-fs-mono)' }}>
                  {WL_COPY.founder.role}
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* FAQ */}
      {show.faq && (
        <section style={{ padding: '80px 32px' }}>
          <div style={{
            maxWidth: 1280, margin: '0 auto',
            display: 'grid', gridTemplateColumns: '300px 1fr', gap: 64,
            alignItems: 'flex-start',
          }}>
            <div>
              <div style={{
                fontSize: 11, fontWeight: 600, letterSpacing: 0.22,
                textTransform: 'uppercase', color: 'var(--mep-acc)',
                fontFamily: 'var(--mep-fs-mono)', marginBottom: 14,
              }}>{WL_COPY.faqEyebrow}</div>
              <h2 style={{
                margin: 0, fontSize: 36, fontWeight: 600,
                color: 'var(--mep-fg)',
                letterSpacing: -0.8, lineHeight: 1.1,
              }}>Lo que más nos preguntan.</h2>
            </div>
            <div>
              <WLFAQ />
            </div>
          </div>
        </section>
      )}

      {/* Spot counter + final CTA */}
      <section style={{
        padding: '100px 32px',
        background: `linear-gradient(180deg, var(--mep-bg) 0%, var(--mep-surface-2) 100%)`,
        borderTop: '1px solid var(--mep-divider)',
      }}>
        <div style={{ maxWidth: 880, margin: '0 auto', textAlign: 'center' }}>
          {show.spotCounter && (
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 16,
              padding: '10px 18px',
              borderRadius: 999,
              background: 'var(--mep-surface)',
              border: '1px solid var(--mep-divider)',
              marginBottom: 32,
              fontFamily: 'var(--mep-fs-mono)',
            }}>
              <span style={{
                width: 8, height: 8, borderRadius: 4, background: 'var(--mep-acc)',
                animation: 'wlpulse 1.4s ease-in-out infinite',
              }} />
              <span style={{ fontSize: 12, color: 'var(--mep-fg-2)' }}>
                <span style={{ color: 'var(--mep-fg)', fontWeight: 600 }}>43 / 50</span>
                {' '}plazas prioritarias asignadas · quedan
                {' '}<span style={{ color: 'var(--mep-acc)', fontWeight: 700 }}>7</span>
              </span>
            </div>
          )}
          <h2 style={{
            margin: 0, fontSize: 56, fontWeight: 700,
            color: 'var(--mep-fg)',
            letterSpacing: -1.8, lineHeight: 1, textWrap: 'balance',
          }}>
            La próxima plaza
            {' '}
            <span style={{
              color: 'var(--mep-acc)', fontStyle: 'italic', fontWeight: 500,
            }}>
              puede ser la tuya.
            </span>
          </h2>
          <p style={{
            margin: '20px 0 36px', fontSize: 16, color: 'var(--mep-fg-2)',
            maxWidth: 520, marginLeft: 'auto', marginRight: 'auto',
          }}>
            Déjanos tu email y te avisamos cuando se libere un sitio.
          </p>
          <div style={{ maxWidth: 480, margin: '0 auto' }}>
            <WLEmailForm size="lg" />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer style={{
        padding: '32px',
        background: 'var(--mep-bg)',
        borderTop: '1px solid var(--mep-divider)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
      }}>
        <WLBrandLockup small />
        <div style={{
          fontSize: 11, color: 'var(--mep-fg-3)',
          fontFamily: 'var(--mep-fs-mono)',
          letterSpacing: 0.06,
        }}>
          {WL_COPY.footerNote}
        </div>
      </footer>
    </div>
  );
}

Object.assign(window, { WLVariantC, WLTicker, WLSticker });
