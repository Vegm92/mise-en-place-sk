// Waitlist — three variations. Each consumes WL_COPY + helpers from waitlist-shared.
// All run inside .mep[data-accent="amber"], in either light or dark theme.

const { WLEmailForm, WLIntegrations, WLBrandLockup, WLSpotCounter, WLMock, WL_COPY } = window;
const VL_ICONS = window.MEPIcons;

// ─────────────────────────────────────────────────────────────────────────
// Sub-components used by multiple variants
// ─────────────────────────────────────────────────────────────────────────

function WLLangToggle({ theme }) {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '4px 10px', borderRadius: 999,
      border: '1px solid var(--mep-border)',
      background: 'var(--mep-surface)',
      fontSize: 10.5, fontWeight: 600, letterSpacing: 0.12,
      color: 'var(--mep-fg-2)',
      fontFamily: 'var(--mep-fs-mono)',
      gap: 8,
    }}>
      <span style={{ color: 'var(--mep-fg)' }}>ES</span>
      <span style={{ color: 'var(--mep-fg-4)' }}>/</span>
      <span>EN</span>
    </div>
  );
}

function WLNav({ scheme = 'plain' }) {
  // Slim, marketing-page nav
  return (
    <nav style={{
      display: 'flex', alignItems: 'center', gap: 14,
      padding: scheme === 'editorial' ? '14px 32px' : '16px 32px',
      borderBottom: scheme === 'editorial'
        ? '1px solid var(--mep-fg)'
        : '1px solid var(--mep-divider)',
    }}>
      <WLBrandLockup small />
      <span style={{
        marginLeft: 8,
        fontSize: 10, fontWeight: 600, letterSpacing: 0.16,
        textTransform: 'uppercase',
        color: 'var(--mep-acc)',
        padding: '2px 7px', borderRadius: 4,
        background: 'var(--mep-acc-soft)',
        fontFamily: 'var(--mep-fs-mono)',
      }}>Beta privada</span>
      <div style={{ flex: 1 }} />
      <WLLangToggle />
      <a href="#join" style={{
        fontSize: 12.5, fontWeight: 500,
        color: 'var(--mep-fg-2)', textDecoration: 'none',
      }}>Entrar a la app</a>
      <a href="#join" className="btn btn-primary" style={{
        height: 32, padding: '0 14px', fontSize: 12, fontWeight: 600,
      }}>
        Apuntarme
      </a>
    </nav>
  );
}

function WLFounder({ tone = 'light' }) {
  return (
    <div style={{
      display: 'flex', gap: 24, alignItems: 'flex-start',
      padding: '32px 36px',
      borderRadius: 16,
      background: 'var(--mep-surface)',
      border: '1px solid var(--mep-divider)',
    }}>
      {/* Portrait placeholder */}
      <div style={{
        width: 92, height: 92, borderRadius: '50%', flexShrink: 0,
        background: 'linear-gradient(135deg, var(--mep-acc-soft) 0%, var(--mep-acc) 200%)',
        color: 'var(--mep-acc-fg)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 28, fontWeight: 700, fontFamily: 'var(--mep-fs-mono)',
        letterSpacing: -1,
        border: '1px solid var(--mep-border)',
      }}>VE</div>

      <div style={{ flex: 1 }}>
        <div style={{
          fontSize: 10.5, fontWeight: 600, letterSpacing: 0.14,
          textTransform: 'uppercase', color: 'var(--mep-acc)',
          fontFamily: 'var(--mep-fs-mono)', marginBottom: 10,
        }}>
          {WL_COPY.founderEyebrow}
        </div>
        <p style={{
          margin: 0, fontSize: 17, lineHeight: 1.55, color: 'var(--mep-fg)',
          fontWeight: 400, letterSpacing: -0.2,
        }}>
          &ldquo;{WL_COPY.founder.body}&rdquo;
        </p>
        <div style={{
          marginTop: 14,
          fontSize: 12, color: 'var(--mep-fg-2)',
        }}>
          <span style={{ fontWeight: 600, color: 'var(--mep-fg)' }}>{WL_COPY.founder.name}</span>
          {' · '}
          <span style={{ color: 'var(--mep-fg-3)' }}>{WL_COPY.founder.role}</span>
        </div>
      </div>
    </div>
  );
}

function WLFAQ({ tone = 'light' }) {
  const [open, setOpen] = React.useState(0);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {WL_COPY.faq.map((row, i) => {
        const isOpen = open === i;
        return (
          <div key={i} style={{
            borderTop: '1px solid var(--mep-divider)',
            ...(i === WL_COPY.faq.length - 1 ? { borderBottom: '1px solid var(--mep-divider)' } : {}),
          }}>
            <button
              onClick={() => setOpen(isOpen ? -1 : i)}
              style={{
                width: '100%',
                background: 'transparent', border: 0, cursor: 'pointer',
                padding: '18px 4px',
                display: 'flex', alignItems: 'center', gap: 16,
                fontFamily: 'inherit', textAlign: 'left',
              }}>
              <span style={{
                fontSize: 12, fontFamily: 'var(--mep-fs-mono)',
                color: 'var(--mep-acc)', fontWeight: 600,
                width: 30, flexShrink: 0,
              }}>0{i + 1}</span>
              <span style={{
                flex: 1, fontSize: 15, fontWeight: 500,
                color: 'var(--mep-fg)', letterSpacing: -0.2,
              }}>{row.q}</span>
              <span style={{
                width: 24, height: 24, borderRadius: '50%',
                border: '1px solid var(--mep-border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--mep-fg-2)',
                transform: isOpen ? 'rotate(45deg)' : 'rotate(0)',
                transition: 'transform 180ms',
                flexShrink: 0,
              }}>
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path d="M5 1v8M1 5h8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
              </span>
            </button>
            {isOpen && (
              <div style={{
                padding: '0 4px 18px 50px',
                fontSize: 13.5, lineHeight: 1.65,
                color: 'var(--mep-fg-2)',
              }}>
                {row.a}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// VARIANT A — REFINED  (centered hero, mostly light, classic structure)
// ═════════════════════════════════════════════════════════════════════════
function WLVariantA({ theme = 'light', headlineKey = 'brain', show = {} }) {
  const head = WL_COPY.headlines.find(h => h.key === headlineKey) || WL_COPY.headlines[0];
  return (
    <div className="mep" data-theme={theme} data-accent="amber"
      data-screen-label="01 Waitlist · Refined"
      style={{
        width: '100%', minHeight: '100%',
        background: 'var(--mep-bg)', color: 'var(--mep-fg)',
        borderTop: '4px solid var(--mep-acc)',
        fontFamily: 'var(--mep-font)',
      }}>
      <WLNav />

      {/* Hero — centered, classic */}
      <section style={{
        padding: '88px 64px 72px',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        textAlign: 'center',
      }}>
        <div style={{
          fontSize: 11, fontWeight: 600, letterSpacing: 0.22,
          textTransform: 'uppercase', color: 'var(--mep-acc)',
          fontFamily: 'var(--mep-fs-mono)', marginBottom: 24,
        }}>
          {WL_COPY.eyebrow}
        </div>

        <h1 style={{
          margin: 0, maxWidth: 900,
          fontSize: 64, fontWeight: 700,
          color: 'var(--mep-fg)',
          letterSpacing: -2, lineHeight: 1.05,
          textWrap: 'balance',
        }}>
          {head.text}
        </h1>

        <p style={{
          margin: '24px 0 0', maxWidth: 620,
          fontSize: 17, lineHeight: 1.6,
          color: 'var(--mep-fg-2)',
          textWrap: 'pretty',
        }}>
          {head.sub}
        </p>

        <div style={{ width: '100%', maxWidth: 480, marginTop: 36 }} id="join">
          <WLEmailForm size="lg" />
        </div>

        {show.spotCounter && (
          <div style={{ marginTop: 22, width: '100%', maxWidth: 480 }}>
            <WLSpotCounter inline />
          </div>
        )}
      </section>

      {/* Integrations */}
      <section style={{ padding: '0 64px 56px' }}>
        <div style={{ maxWidth: 1040, margin: '0 auto' }}>
          <WLIntegrations />
        </div>
      </section>

      {/* Pain — 3-column grid */}
      <section style={{ padding: '72px 64px', background: 'var(--mep-surface-2)',
        borderTop: '1px solid var(--mep-divider)', borderBottom: '1px solid var(--mep-divider)' }}>
        <div style={{ maxWidth: 1040, margin: '0 auto' }}>
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            textAlign: 'center', marginBottom: 48,
          }}>
            <div style={{
              fontSize: 11, fontWeight: 600, letterSpacing: 0.22,
              textTransform: 'uppercase', color: 'var(--mep-acc)',
              fontFamily: 'var(--mep-fs-mono)', marginBottom: 14,
            }}>
              {WL_COPY.painEyebrow}
            </div>
            <h2 style={{
              margin: 0, maxWidth: 720,
              fontSize: 38, fontWeight: 600,
              color: 'var(--mep-fg)',
              letterSpacing: -1, lineHeight: 1.15,
            }}>
              {WL_COPY.painHead}
            </h2>
            <p style={{
              margin: '14px 0 0', fontSize: 14.5, color: 'var(--mep-fg-2)',
              maxWidth: 540, lineHeight: 1.5,
            }}>
              {WL_COPY.painSub}
            </p>
          </div>

          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14,
          }}>
            {WL_COPY.pain.map((p, i) => (
              <div key={i} className="card" style={{
                padding: '28px 26px',
                display: 'flex', flexDirection: 'column', gap: 14,
                position: 'relative',
              }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span style={{
                    fontSize: 52, fontWeight: 700, color: 'var(--mep-acc)',
                    letterSpacing: -2, lineHeight: 0.95,
                    fontFamily: 'var(--mep-fs-mono)',
                  }}>
                    {p.stat}
                  </span>
                  <span style={{
                    fontSize: 11, fontWeight: 500, letterSpacing: 0.08,
                    textTransform: 'uppercase', color: 'var(--mep-fg-3)',
                    fontFamily: 'var(--mep-fs-mono)',
                  }}>
                    {p.label}
                  </span>
                </div>
                <div style={{
                  fontSize: 15, fontWeight: 600, color: 'var(--mep-fg)',
                  letterSpacing: -0.2, lineHeight: 1.3,
                }}>
                  {p.title}
                </div>
                <div style={{
                  fontSize: 13, color: 'var(--mep-fg-2)', lineHeight: 1.6,
                }}>
                  {p.body}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How — dark slab with alternating step rows */}
      <section style={{
        padding: '88px 64px', background: '#16151a', color: '#f0ece4',
        // Force-set fg variants for legibility inside this dark slab regardless of outer theme
        ['--mep-fg']: '#f0ece4',
        ['--mep-fg-2']: '#a8a39a',
        ['--mep-fg-3']: '#6f6a62',
        ['--mep-surface']: '#1e1d23',
        ['--mep-surface-2']: '#25242b',
        ['--mep-divider']: 'rgba(255,255,255,0.06)',
        ['--mep-border']: 'rgba(255,255,255,0.10)',
      }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            textAlign: 'center', marginBottom: 64,
          }}>
            <div style={{
              fontSize: 11, fontWeight: 600, letterSpacing: 0.22,
              textTransform: 'uppercase', color: 'var(--mep-acc)',
              fontFamily: 'var(--mep-fs-mono)', marginBottom: 14,
            }}>
              {WL_COPY.howEyebrow}
            </div>
            <h2 style={{
              margin: 0, maxWidth: 720,
              fontSize: 40, fontWeight: 600,
              color: '#f0ece4',
              letterSpacing: -1, lineHeight: 1.12,
            }}>
              {WL_COPY.howHead}
            </h2>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 80 }}>
            {WL_COPY.steps.map((s, i) => (
              <div key={i} style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr', gap: 56, alignItems: 'center',
              }}>
                {/* Copy */}
                <div style={{ order: i % 2 === 1 ? 2 : 1 }}>
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: 10,
                    fontSize: 11, fontWeight: 600, letterSpacing: 0.16,
                    textTransform: 'uppercase', color: 'var(--mep-acc)',
                    fontFamily: 'var(--mep-fs-mono)', marginBottom: 18,
                  }}>
                    <span style={{
                      width: 30, height: 22, borderRadius: 4,
                      background: 'var(--mep-acc-soft)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>{s.num}</span>
                    <span>{s.tag}</span>
                  </div>
                  <h3 style={{
                    margin: 0, fontSize: 28, fontWeight: 600,
                    color: '#f0ece4', letterSpacing: -0.6, lineHeight: 1.15,
                  }}>
                    {s.title}
                  </h3>
                  <p style={{
                    margin: '14px 0 0', fontSize: 15, lineHeight: 1.65,
                    color: '#a8a39a', maxWidth: 460,
                  }}>
                    {s.body}
                  </p>
                </div>

                {/* Product mock */}
                <div style={{ order: i % 2 === 1 ? 1 : 2 }}>
                  <div style={{
                    padding: 18, borderRadius: 16,
                    background: 'rgba(255,255,255,0.025)',
                    border: '1px solid rgba(255,255,255,0.06)',
                    boxShadow: '0 30px 60px rgba(0,0,0,0.4)',
                  }}>
                    <div className="mep" data-theme="light" data-accent="amber" style={{
                      borderRadius: 10, overflow: 'hidden',
                    }}>
                      <WLMock kind={s.mock} />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Founder note */}
      {show.founder && (
        <section style={{ padding: '72px 64px' }}>
          <div style={{ maxWidth: 880, margin: '0 auto' }}>
            <WLFounder />
          </div>
        </section>
      )}

      {/* Testimonials */}
      <section style={{ padding: '72px 64px',
        background: 'var(--mep-surface-2)',
        borderTop: '1px solid var(--mep-divider)',
        borderBottom: '1px solid var(--mep-divider)' }}>
        <div style={{ maxWidth: 1040, margin: '0 auto' }}>
          <div style={{
            fontSize: 11, fontWeight: 600, letterSpacing: 0.22,
            textTransform: 'uppercase', color: 'var(--mep-acc)',
            fontFamily: 'var(--mep-fs-mono)', textAlign: 'center', marginBottom: 40,
          }}>
            {WL_COPY.testimonialsEyebrow}
          </div>
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14,
          }}>
            {WL_COPY.testimonials.map((t, i) => (
              <div key={i} className="card" style={{
                padding: '28px 26px',
                display: 'flex', flexDirection: 'column', gap: 20,
              }}>
                <div style={{
                  fontSize: 64, lineHeight: 0.7, color: 'var(--mep-acc)',
                  fontFamily: 'Mona Sans', fontWeight: 700,
                  height: 22,
                }}>&ldquo;</div>
                <p style={{
                  margin: 0, fontSize: 14.5, lineHeight: 1.6,
                  color: 'var(--mep-fg)', flex: 1,
                }}>
                  {t.quote}
                </p>
                <div style={{
                  paddingTop: 16, borderTop: '1px solid var(--mep-divider)',
                  display: 'flex', alignItems: 'center', gap: 12,
                }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: '50%',
                    background: 'var(--mep-acc-soft)', color: 'var(--mep-acc)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, fontWeight: 600, flexShrink: 0,
                  }}>{t.initials}</div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--mep-fg)' }}>
                      {t.name}
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--mep-fg-3)' }}>
                      {t.role}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      {show.faq && (
        <section style={{ padding: '72px 64px' }}>
          <div style={{ maxWidth: 720, margin: '0 auto' }}>
            <div style={{
              fontSize: 11, fontWeight: 600, letterSpacing: 0.22,
              textTransform: 'uppercase', color: 'var(--mep-acc)',
              fontFamily: 'var(--mep-fs-mono)', marginBottom: 14,
            }}>
              {WL_COPY.faqEyebrow}
            </div>
            <h2 style={{
              margin: '0 0 32px', fontSize: 32, fontWeight: 600,
              color: 'var(--mep-fg)', letterSpacing: -0.8, lineHeight: 1.15,
            }}>
              Dudas frecuentes
            </h2>
            <WLFAQ />
          </div>
        </section>
      )}

      {/* Bottom CTA */}
      <section style={{
        padding: '100px 64px', textAlign: 'center',
        background: 'var(--mep-acc-soft)',
        borderTop: '1px solid var(--mep-divider)',
      }}>
        <div style={{ maxWidth: 640, margin: '0 auto' }}>
          <div style={{
            width: 48, height: 4, background: 'var(--mep-acc)',
            borderRadius: 2, margin: '0 auto 28px',
          }} />
          <h2 style={{
            margin: 0, fontSize: 42, fontWeight: 700,
            color: 'var(--mep-fg)', letterSpacing: -1.2, lineHeight: 1.12,
          }}>
            Sé de las primeras cocinas en probarlo.
          </h2>
          <p style={{
            margin: '16px 0 32px', fontSize: 15, color: 'var(--mep-fg-2)',
          }}>
            Abrimos plazas por orden de lista. Déjanos tu email.
          </p>
          <div style={{ maxWidth: 460, margin: '0 auto' }}>
            <WLEmailForm size="lg" />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer style={{
        padding: '24px 64px',
        borderTop: '1px solid var(--mep-divider)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
        fontSize: 11.5, color: 'var(--mep-fg-3)',
        fontFamily: 'var(--mep-fs-mono)',
      }}>
        <WLBrandLockup small />
        <span>{WL_COPY.footerNote}</span>
      </footer>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// VARIANT B — EDITORIAL  (asymmetric magazine layout, big display type)
// ═════════════════════════════════════════════════════════════════════════
function WLVariantB({ theme = 'light', headlineKey = 'craft', show = {} }) {
  const head = WL_COPY.headlines.find(h => h.key === headlineKey) || WL_COPY.headlines[2];
  return (
    <div className="mep" data-theme={theme} data-accent="amber"
      data-screen-label="02 Waitlist · Editorial"
      style={{
        width: '100%', minHeight: '100%',
        background: 'var(--mep-bg)', color: 'var(--mep-fg)',
        borderTop: '4px solid var(--mep-acc)',
        fontFamily: 'var(--mep-font)',
      }}>
      <WLNav scheme="editorial" />

      {/* Masthead bar */}
      <div style={{
        padding: '10px 32px',
        borderBottom: '1px solid var(--mep-divider)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        fontSize: 10.5, color: 'var(--mep-fg-3)',
        fontFamily: 'var(--mep-fs-mono)',
        letterSpacing: 0.06, textTransform: 'uppercase', fontWeight: 500,
      }}>
        <span>N.º 01 · Edición de fundadores</span>
        <span>Barcelona</span>
        <span>Mayo 2026</span>
      </div>

      {/* Hero — asymmetric editorial */}
      <section style={{ padding: '64px 32px 56px' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: '120px 1fr 280px',
          gap: 32, alignItems: 'flex-start',
          maxWidth: 1280, margin: '0 auto',
        }}>
          {/* Left rail — issue numbers */}
          <div style={{
            display: 'flex', flexDirection: 'column', gap: 28,
            paddingTop: 12,
          }}>
            <div>
              <div style={{
                fontSize: 9.5, color: 'var(--mep-fg-3)',
                fontFamily: 'var(--mep-fs-mono)',
                letterSpacing: 0.1, textTransform: 'uppercase', fontWeight: 500,
                marginBottom: 4,
              }}>Tirada</div>
              <div style={{
                fontSize: 22, fontWeight: 600, color: 'var(--mep-fg)',
                fontFamily: 'var(--mep-fs-mono)', letterSpacing: -0.4,
              }}>50</div>
              <div style={{ fontSize: 10.5, color: 'var(--mep-fg-3)' }}>cocinas</div>
            </div>
            <div>
              <div style={{
                fontSize: 9.5, color: 'var(--mep-fg-3)',
                fontFamily: 'var(--mep-fs-mono)',
                letterSpacing: 0.1, textTransform: 'uppercase', fontWeight: 500,
                marginBottom: 4,
              }}>Asignadas</div>
              <div style={{
                fontSize: 22, fontWeight: 600, color: 'var(--mep-acc)',
                fontFamily: 'var(--mep-fs-mono)', letterSpacing: -0.4,
              }}>43</div>
              <div style={{ fontSize: 10.5, color: 'var(--mep-fg-3)' }}>de 50</div>
            </div>
            <div>
              <div style={{
                fontSize: 9.5, color: 'var(--mep-fg-3)',
                fontFamily: 'var(--mep-fs-mono)',
                letterSpacing: 0.1, textTransform: 'uppercase', fontWeight: 500,
                marginBottom: 4,
              }}>Apertura</div>
              <div style={{
                fontSize: 22, fontWeight: 600, color: 'var(--mep-fg)',
                fontFamily: 'var(--mep-fs-mono)', letterSpacing: -0.4,
              }}>Jul</div>
              <div style={{ fontSize: 10.5, color: 'var(--mep-fg-3)' }}>2026</div>
            </div>
          </div>

          {/* Center — display headline */}
          <div>
            <div style={{
              fontSize: 11, fontWeight: 600, letterSpacing: 0.22,
              textTransform: 'uppercase', color: 'var(--mep-acc)',
              fontFamily: 'var(--mep-fs-mono)', marginBottom: 28,
              display: 'flex', alignItems: 'center', gap: 12,
            }}>
              <span style={{ width: 32, height: 1, background: 'var(--mep-acc)' }} />
              <span>Portada · Lista de espera</span>
            </div>

            <h1 style={{
              margin: 0,
              fontSize: 88, fontWeight: 700,
              color: 'var(--mep-fg)',
              letterSpacing: -3.5, lineHeight: 0.96,
              textWrap: 'balance',
              fontStretch: '90%',
            }}>
              {head.text.split('.')[0]}.
              <br />
              <span style={{
                fontStyle: 'italic', color: 'var(--mep-acc)',
                fontWeight: 500,
              }}>
                {head.text.split('.').slice(1).join('.').trim() || 'En segundos.'}
              </span>
            </h1>

            <div style={{
              marginTop: 32,
              display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32,
              borderTop: '1px solid var(--mep-fg)',
              paddingTop: 20,
            }}>
              <p style={{
                margin: 0, fontSize: 15, lineHeight: 1.55,
                color: 'var(--mep-fg-2)',
                columnCount: 1,
              }}>
                <span style={{
                  float: 'left',
                  fontSize: 44, fontWeight: 700,
                  lineHeight: 0.9, paddingRight: 6, paddingTop: 4,
                  color: 'var(--mep-acc)',
                  letterSpacing: -2,
                }}>{head.sub[0]}</span>
                {head.sub.slice(1)}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{
                  fontSize: 10.5, color: 'var(--mep-fg-3)',
                  fontFamily: 'var(--mep-fs-mono)',
                  letterSpacing: 0.1, textTransform: 'uppercase', fontWeight: 500,
                }}>Únete a la edición</div>
                <WLEmailForm size="md" accent={false} />
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  marginTop: 2,
                  fontSize: 11.5, color: 'var(--mep-acc)', fontWeight: 500,
                }}>
                  <VL_ICONS.Sparkle size={11} />
                  <span>{WL_COPY.incentive}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right column — sample document */}
          <div>
            <div style={{
              fontSize: 9.5, color: 'var(--mep-fg-3)',
              fontFamily: 'var(--mep-fs-mono)',
              letterSpacing: 0.1, textTransform: 'uppercase', fontWeight: 500,
              marginBottom: 10,
            }}>Inserto · Muestra</div>
            <div style={{
              background: 'var(--mep-surface)',
              border: '1px solid var(--mep-divider)',
              padding: 14,
              boxShadow: '0 14px 40px rgba(0,0,0,0.08)',
              transform: 'rotate(1.2deg)',
            }}>
              <WLMock kind="extract" />
            </div>
          </div>
        </div>
      </section>

      {/* Integrations strip — editorial style */}
      <div style={{
        padding: '14px 32px',
        borderTop: '1px solid var(--mep-fg)',
        borderBottom: '1px solid var(--mep-fg)',
        display: 'flex', alignItems: 'center', gap: 32,
        overflow: 'hidden',
      }}>
        <span style={{
          fontSize: 10, fontWeight: 600, letterSpacing: 0.18,
          textTransform: 'uppercase', color: 'var(--mep-fg-3)',
          fontFamily: 'var(--mep-fs-mono)', flexShrink: 0,
        }}>{WL_COPY.integrationsLabel} ·</span>
        <div style={{
          display: 'flex', gap: 28, alignItems: 'center',
          fontSize: 13, fontWeight: 600, color: 'var(--mep-fg)',
          fontStretch: '90%', letterSpacing: -0.2,
        }}>
          {WL_COPY.integrations.map((it, i) => (
            <React.Fragment key={i}>
              <span>{it.name}</span>
              {i < WL_COPY.integrations.length - 1 &&
                <span style={{ color: 'var(--mep-acc)', fontFamily: 'var(--mep-fs-mono)', fontSize: 14 }}>×</span>}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Pain — editorial 3-piece with byline */}
      <section style={{ padding: '88px 32px 56px' }}>
        <div style={{ maxWidth: 1280, margin: '0 auto' }}>
          <div style={{
            display: 'grid', gridTemplateColumns: '120px 1fr',
            gap: 32, marginBottom: 56,
          }}>
            <div style={{
              fontSize: 9.5, color: 'var(--mep-fg-3)',
              fontFamily: 'var(--mep-fs-mono)',
              letterSpacing: 0.1, textTransform: 'uppercase', fontWeight: 500,
            }}>
              I · El problema
            </div>
            <h2 style={{
              margin: 0,
              fontSize: 52, fontWeight: 600, color: 'var(--mep-fg)',
              letterSpacing: -1.5, lineHeight: 1.05, maxWidth: 880,
              textWrap: 'balance',
            }}>
              {WL_COPY.painHead.split(',')[0]},
              <br />
              <span style={{ color: 'var(--mep-acc)' }}>
                {WL_COPY.painHead.split(',').slice(1).join(',').trim()}
              </span>
            </h2>
          </div>

          <div style={{
            display: 'grid', gridTemplateColumns: '120px 1fr 1fr 1fr', gap: 32,
            paddingTop: 32, borderTop: '1px solid var(--mep-fg)',
          }}>
            <div style={{
              fontSize: 10.5, color: 'var(--mep-fg-3)',
              fontFamily: 'var(--mep-fs-mono)',
              letterSpacing: 0.06, textTransform: 'uppercase', fontWeight: 500,
            }}>
              Tres lecturas
            </div>

            {WL_COPY.pain.map((p, i) => (
              <div key={i} style={{
                display: 'flex', flexDirection: 'column', gap: 12,
                paddingRight: 16,
                borderRight: i < 2 ? '1px solid var(--mep-divider)' : 0,
              }}>
                <div style={{
                  fontSize: 10.5, color: 'var(--mep-acc)',
                  fontFamily: 'var(--mep-fs-mono)',
                  letterSpacing: 0.08, textTransform: 'uppercase', fontWeight: 600,
                }}>
                  Lectura · 0{i + 1}
                </div>
                <div style={{
                  display: 'flex', alignItems: 'baseline', gap: 6,
                  borderBottom: '1px solid var(--mep-divider)',
                  paddingBottom: 12,
                }}>
                  <span style={{
                    fontSize: 68, fontWeight: 700,
                    color: 'var(--mep-fg)',
                    letterSpacing: -3, lineHeight: 0.9,
                    fontFamily: 'var(--mep-fs-mono)',
                  }}>{p.stat}</span>
                  <span style={{
                    fontSize: 11, color: 'var(--mep-fg-3)',
                    letterSpacing: 0.06, textTransform: 'uppercase',
                    fontWeight: 500, fontFamily: 'var(--mep-fs-mono)',
                  }}>{p.label}</span>
                </div>
                <h3 style={{
                  margin: 0, fontSize: 18, fontWeight: 600,
                  color: 'var(--mep-fg)', letterSpacing: -0.3, lineHeight: 1.2,
                }}>
                  {p.title}
                </h3>
                <p style={{
                  margin: 0, fontSize: 13, lineHeight: 1.7,
                  color: 'var(--mep-fg-2)',
                }}>
                  {p.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How — editorial 3 chapters */}
      <section style={{ padding: '72px 32px',
        background: 'var(--mep-surface-2)',
        borderTop: '1px solid var(--mep-fg)',
        borderBottom: '1px solid var(--mep-fg)',
      }}>
        <div style={{ maxWidth: 1280, margin: '0 auto' }}>
          <div style={{
            display: 'grid', gridTemplateColumns: '120px 1fr',
            gap: 32, marginBottom: 48,
          }}>
            <div style={{
              fontSize: 9.5, color: 'var(--mep-fg-3)',
              fontFamily: 'var(--mep-fs-mono)',
              letterSpacing: 0.1, textTransform: 'uppercase', fontWeight: 500,
            }}>
              II · El método
            </div>
            <h2 style={{
              margin: 0, fontSize: 52, fontWeight: 600,
              color: 'var(--mep-fg)',
              letterSpacing: -1.5, lineHeight: 1.05,
              maxWidth: 720,
            }}>
              {WL_COPY.howHead}
            </h2>
          </div>

          {WL_COPY.steps.map((s, i) => (
            <div key={i} style={{
              display: 'grid',
              gridTemplateColumns: '120px 1fr 1fr',
              gap: 32, padding: '40px 0',
              borderTop: '1px solid var(--mep-divider)',
              alignItems: 'start',
            }}>
              <div>
                <div style={{
                  fontSize: 68, fontWeight: 700, color: 'var(--mep-acc)',
                  letterSpacing: -3, lineHeight: 0.9,
                  fontFamily: 'var(--mep-fs-mono)',
                }}>{s.num}</div>
                <div style={{
                  marginTop: 8,
                  fontSize: 11, color: 'var(--mep-fg-3)',
                  letterSpacing: 0.12, textTransform: 'uppercase',
                  fontWeight: 600, fontFamily: 'var(--mep-fs-mono)',
                }}>{s.tag}</div>
              </div>
              <div style={{ paddingTop: 8 }}>
                <h3 style={{
                  margin: 0, fontSize: 28, fontWeight: 600,
                  color: 'var(--mep-fg)', letterSpacing: -0.6, lineHeight: 1.15,
                }}>{s.title}</h3>
                <p style={{
                  margin: '16px 0 0', fontSize: 14.5, lineHeight: 1.7,
                  color: 'var(--mep-fg-2)', maxWidth: 360,
                }}>{s.body}</p>
              </div>
              <div>
                <WLMock kind={s.mock} />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Testimonials — pull quotes */}
      <section style={{ padding: '88px 32px' }}>
        <div style={{ maxWidth: 1280, margin: '0 auto' }}>
          <div style={{
            display: 'grid', gridTemplateColumns: '120px 1fr',
            gap: 32, marginBottom: 48,
          }}>
            <div style={{
              fontSize: 9.5, color: 'var(--mep-fg-3)',
              fontFamily: 'var(--mep-fs-mono)',
              letterSpacing: 0.1, textTransform: 'uppercase', fontWeight: 500,
            }}>
              III · Voces
            </div>
            <h2 style={{
              margin: 0, fontSize: 52, fontWeight: 600,
              color: 'var(--mep-fg)',
              letterSpacing: -1.5, lineHeight: 1.05,
              maxWidth: 720,
            }}>
              Conversaciones con quienes ya viven el problema.
            </h2>
          </div>

          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1,
            background: 'var(--mep-divider)',
            border: '1px solid var(--mep-divider)',
          }}>
            {WL_COPY.testimonials.map((t, i) => (
              <div key={i} style={{
                background: 'var(--mep-bg)',
                padding: '36px 32px',
                display: 'flex', flexDirection: 'column', gap: 20,
              }}>
                <span style={{
                  fontSize: 80, lineHeight: 0.6, color: 'var(--mep-acc)',
                  height: 30, fontWeight: 700, letterSpacing: -2,
                }}>&ldquo;</span>
                <p style={{
                  margin: 0, fontSize: 18, lineHeight: 1.45,
                  color: 'var(--mep-fg)', letterSpacing: -0.2,
                  fontWeight: 400, flex: 1,
                  fontStyle: 'italic',
                }}>{t.quote}</p>
                <div style={{
                  paddingTop: 16, borderTop: '1px solid var(--mep-divider)',
                  fontSize: 11.5, color: 'var(--mep-fg-2)',
                  fontFamily: 'var(--mep-fs-mono)',
                }}>
                  <span style={{ fontWeight: 600, color: 'var(--mep-fg)' }}>{t.name}</span>
                  <br />
                  <span style={{ color: 'var(--mep-fg-3)' }}>{t.role}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Founder + FAQ side by side */}
      {(show.founder || show.faq) && (
        <section style={{ padding: '72px 32px',
          background: 'var(--mep-surface-2)',
          borderTop: '1px solid var(--mep-fg)',
        }}>
          <div style={{
            maxWidth: 1280, margin: '0 auto',
            display: 'grid', gridTemplateColumns: show.founder && show.faq ? '1fr 1fr' : '1fr',
            gap: 48,
          }}>
            {show.founder && (
              <div>
                <div style={{
                  fontSize: 9.5, color: 'var(--mep-fg-3)',
                  fontFamily: 'var(--mep-fs-mono)',
                  letterSpacing: 0.1, textTransform: 'uppercase', fontWeight: 500,
                  marginBottom: 24,
                }}>IV · Carta del fundador</div>
                <p style={{
                  margin: 0, fontSize: 21, lineHeight: 1.55,
                  color: 'var(--mep-fg)', letterSpacing: -0.4,
                  fontWeight: 400, fontStyle: 'italic',
                }}>
                  &ldquo;{WL_COPY.founder.body}&rdquo;
                </p>
                <div style={{
                  marginTop: 28, paddingTop: 18,
                  borderTop: '1px solid var(--mep-fg)',
                  display: 'flex', alignItems: 'center', gap: 14,
                }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: '50%',
                    background: 'var(--mep-acc-soft)', color: 'var(--mep-acc)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 14, fontWeight: 700, fontFamily: 'var(--mep-fs-mono)',
                  }}>VE</div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--mep-fg)' }}>
                      {WL_COPY.founder.name}
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--mep-fg-3)', fontFamily: 'var(--mep-fs-mono)' }}>
                      {WL_COPY.founder.role}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {show.faq && (
              <div>
                <div style={{
                  fontSize: 9.5, color: 'var(--mep-fg-3)',
                  fontFamily: 'var(--mep-fs-mono)',
                  letterSpacing: 0.1, textTransform: 'uppercase', fontWeight: 500,
                  marginBottom: 24,
                }}>V · Preguntas y respuestas</div>
                <WLFAQ />
              </div>
            )}
          </div>
        </section>
      )}

      {/* Final CTA — front-page deadline style */}
      <section style={{ padding: '100px 32px',
        background: 'var(--mep-fg)', color: 'var(--mep-bg)',
        ['--mep-fg']: 'var(--mep-bg)',
        ['--mep-fg-2']: 'rgba(255,255,255,0.7)',
        ['--mep-fg-3']: 'rgba(255,255,255,0.5)',
        ['--mep-surface']: 'rgba(255,255,255,0.05)',
        ['--mep-border-strong']: 'rgba(255,255,255,0.2)',
        ['--mep-divider']: 'rgba(255,255,255,0.15)',
      }}>
        <div style={{ maxWidth: 1280, margin: '0 auto',
          display: 'grid', gridTemplateColumns: '120px 1fr 360px', gap: 32,
        }}>
          <div style={{
            fontSize: 9.5, color: 'rgba(255,255,255,0.5)',
            fontFamily: 'var(--mep-fs-mono)',
            letterSpacing: 0.1, textTransform: 'uppercase', fontWeight: 500,
          }}>VI · Fin de la edición</div>
          <h2 style={{
            margin: 0, fontSize: 64, fontWeight: 700,
            color: 'inherit',
            letterSpacing: -2, lineHeight: 0.98,
            textWrap: 'balance',
          }}>
            Una plaza, una cocina.
            <br />
            <span style={{ color: 'var(--mep-acc)', fontStyle: 'italic', fontWeight: 500 }}>
              Asegura la tuya.
            </span>
          </h2>
          <div>
            <WLEmailForm size="lg" accent={false} />
            <div style={{
              marginTop: 14, fontSize: 11, color: 'rgba(255,255,255,0.6)',
              fontFamily: 'var(--mep-fs-mono)',
            }}>
              {WL_COPY.privacy}
            </div>
          </div>
        </div>
      </section>

      <footer style={{
        padding: '20px 32px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        fontSize: 11, color: 'var(--mep-fg-3)',
        fontFamily: 'var(--mep-fs-mono)',
        letterSpacing: 0.06,
      }}>
        <span>Mise en Place · Barcelona · 2026</span>
        <span>Hecho en una cocina, no en una sala de juntas.</span>
      </footer>
    </div>
  );
}

// Export so variant C in another file can reuse helpers
Object.assign(window, {
  WLNav, WLLangToggle, WLFounder, WLFAQ,
  WLVariantA, WLVariantB,
});
