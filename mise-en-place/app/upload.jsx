// Invoice upload flow — 3 steps: drop, extracting, review.

const UD = window.MEP_DATA;
const { Upload: IUpload, X, Mail, Sparkle, Clock, Check, AlertTriangle,
  ChevronLeft, ChevronRight, ChevronDown, RefreshCw, Plus, Trash } = window.MEPIcons;

// ── Step 1: drop zone ─────────────────────────────────────────────────────
function MEPUploadDrop() {
  const queued = [
    { name: 'factura_carnicas_arand.pdf', size: '248 KB', kind: 'pdf' },
    { name: 'IMG_4421.HEIC',              size: '3,2 MB', kind: 'img' },
    { name: 'PA-2026-0982.pdf',           size: '192 KB', kind: 'pdf' },
  ];

  return (
    <main style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
      <div style={{ flex: 1, padding: '24px 32px 32px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Steps indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
          {['Subir', 'Extraer', 'Revisar y guardar'].map((s, i) => (
            <React.Fragment key={s}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{
                  width: 22, height: 22, borderRadius: 11,
                  background: i === 0 ? 'var(--mep-acc)' : 'var(--mep-surface-2)',
                  color: i === 0 ? 'var(--mep-acc-fg)' : 'var(--mep-fg-3)',
                  fontSize: 11, fontWeight: 600,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  border: i === 0 ? 'none' : '1px solid var(--mep-divider)',
                }} className="num">{i + 1}</span>
                <span style={{ fontSize: 13, fontWeight: i === 0 ? 600 : 400,
                  color: i === 0 ? 'var(--mep-fg)' : 'var(--mep-fg-3)' }}>{s}</span>
              </div>
              {i < 2 && <div style={{ width: 28, height: 1, background: 'var(--mep-divider)' }} />}
            </React.Fragment>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 16, flex: 1, minHeight: 0 }}>
          {/* Drop zone */}
          <div className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column' }}>
            <div style={{
              flex: 1, border: '1.5px dashed var(--mep-border-strong)', borderRadius: 10,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              padding: 24, background: 'var(--mep-surface-2)',
              position: 'relative',
            }}>
              <div style={{
                width: 56, height: 56, borderRadius: 28,
                background: 'var(--mep-acc-soft)', color: 'var(--mep-acc)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginBottom: 16,
              }}>
                <IUpload size={24} />
              </div>
              <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--mep-fg)', letterSpacing: -0.2, marginBottom: 6 }}>
                Suelta tus facturas aquí
              </div>
              <div style={{ fontSize: 13, color: 'var(--mep-fg-2)', marginBottom: 14, textAlign: 'center', maxWidth: 360 }}>
                O <span style={{ color: 'var(--mep-acc)', fontWeight: 500, cursor: 'pointer' }}>elige archivos</span> · acepta PDF, JPG, PNG, HEIC · hasta 25 MB por archivo
              </div>
              <button className="btn btn-primary" style={{ height: 36, padding: '0 14px' }}>
                Examinar archivos
              </button>

              <div style={{ marginTop: 28, paddingTop: 20, borderTop: '1px solid var(--mep-divider)',
                width: '100%', maxWidth: 460, display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 18, flexShrink: 0,
                  background: 'var(--mep-surface)', border: '1px solid var(--mep-divider)',
                  color: 'var(--mep-fg-2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Mail size={16} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--mep-fg)' }}>O reenvía por email</div>
                  <div className="num" style={{ fontSize: 11.5, color: 'var(--mep-fg-3)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    casa-lua-4f8a@inbox.miseenplace.es
                  </div>
                </div>
                <button className="btn btn-ghost" style={{ height: 28, fontSize: 11.5, padding: '0 8px' }}>Copiar</button>
              </div>
            </div>
          </div>

          {/* Queue */}
          <div className="card" style={{ padding: '16px 16px 12px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <div className="subtitle">Cola de subida</div>
              <span style={{
                fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 999,
                background: 'var(--mep-acc-soft)', color: 'var(--mep-acc)',
              }} className="num">{queued.length}</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--mep-fg-3)', marginBottom: 12 }}>
              Aún no se ha empezado la extracción
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
              {queued.map((q, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 10px', borderRadius: 8,
                  border: '1px solid var(--mep-divider)',
                  background: 'var(--mep-surface)',
                }}>
                  <div style={{
                    width: 32, height: 40, borderRadius: 4, flexShrink: 0,
                    background: q.kind === 'pdf' ? '#c14a4a' : '#6a8a6a',
                    color: '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 9, fontWeight: 700, letterSpacing: 0.04,
                  }}>{q.kind === 'pdf' ? 'PDF' : 'IMG'}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--mep-fg)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {q.name}
                    </div>
                    <div className="num" style={{ fontSize: 11, color: 'var(--mep-fg-3)' }}>
                      {q.size}
                    </div>
                  </div>
                  <button className="btn btn-ghost" style={{ width: 24, height: 24, padding: 0, justifyContent: 'center' }}>
                    <X size={13} />
                  </button>
                </div>
              ))}
            </div>

            <div style={{ paddingTop: 12, borderTop: '1px solid var(--mep-divider)', marginTop: 12 }}>
              <button className="btn btn-primary" style={{ width: '100%', height: 38, justifyContent: 'center', fontWeight: 500 }}>
                <Sparkle size={14} />
                Extraer datos de {queued.length} facturas
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

// ── Step 2: extracting ────────────────────────────────────────────────────
function MEPUploadExtracting() {
  return (
    <main style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
      <div style={{ flex: 1, padding: '24px 32px 32px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Steps indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
          {[
            { label: 'Subir', state: 'done' },
            { label: 'Extraer', state: 'active' },
            { label: 'Revisar y guardar', state: 'pending' },
          ].map((s, i) => (
            <React.Fragment key={s.label}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{
                  width: 22, height: 22, borderRadius: 11,
                  background: s.state === 'active' ? 'var(--mep-acc)' :
                    s.state === 'done' ? 'var(--mep-pos)' : 'var(--mep-surface-2)',
                  color: s.state === 'pending' ? 'var(--mep-fg-3)' : '#fff',
                  fontSize: 11, fontWeight: 600,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  border: s.state === 'pending' ? '1px solid var(--mep-divider)' : 'none',
                }} className="num">
                  {s.state === 'done' ? <Check size={12} /> : i + 1}
                </span>
                <span style={{ fontSize: 13, fontWeight: s.state === 'active' ? 600 : 400,
                  color: s.state === 'pending' ? 'var(--mep-fg-3)' : 'var(--mep-fg)' }}>{s.label}</span>
              </div>
              {i < 2 && <div style={{ width: 28, height: 1, background: 'var(--mep-divider)' }} />}
            </React.Fragment>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 16, flex: 1, minHeight: 0 }}>
          {/* Queue with statuses */}
          <div className="card" style={{ padding: '16px 0 12px', display: 'flex', flexDirection: 'column' }}>
            <div className="subtitle" style={{ padding: '0 16px', marginBottom: 12 }}>3 facturas</div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {[
                { name: 'factura_carnicas_arand.pdf', kind: 'pdf', state: 'done',
                  detail: 'Cárnicas Ibérico Aranda · 14 líneas extraídas' },
                { name: 'PA-2026-0982.pdf', kind: 'pdf', state: 'active',
                  detail: 'Extrayendo líneas de pedido…' },
                { name: 'IMG_4421.HEIC', kind: 'img', state: 'pending',
                  detail: 'En cola' },
              ].map((q, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 16px',
                  borderTop: '1px solid var(--mep-divider)',
                  background: q.state === 'active' ? 'var(--mep-acc-soft)' : 'transparent',
                }}>
                  <div style={{
                    width: 32, height: 40, borderRadius: 4, flexShrink: 0,
                    background: q.kind === 'pdf' ? '#c14a4a' : '#6a8a6a',
                    color: '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 9, fontWeight: 700, letterSpacing: 0.04,
                  }}>{q.kind === 'pdf' ? 'PDF' : 'IMG'}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--mep-fg)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {q.name}
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--mep-fg-2)' }}>{q.detail}</div>
                  </div>
                  <div style={{ flexShrink: 0 }}>
                    {q.state === 'done' && (
                      <div style={{ width: 22, height: 22, borderRadius: 11, background: 'var(--mep-pos-soft)',
                        color: 'var(--mep-pos)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Check size={13} />
                      </div>
                    )}
                    {q.state === 'active' && <ExtractingSpinner />}
                    {q.state === 'pending' && (
                      <div style={{ width: 22, height: 22, borderRadius: 11, border: '1px dashed var(--mep-border)',
                        color: 'var(--mep-fg-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10 }}>
                        <Clock size={12} />
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Active extraction panel */}
          <div className="card" style={{ padding: '20px 20px 16px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
              <div style={{
                width: 40, height: 50, borderRadius: 4, background: '#c14a4a', color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 10, fontWeight: 700,
              }}>PDF</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--mep-fg)' }}>PA-2026-0982.pdf</div>
                <div className="num" style={{ fontSize: 12, color: 'var(--mep-fg-3)' }}>192 KB · 2 páginas</div>
              </div>
              <span className="badge badge-pending">
                <Sparkle size={11} /> Procesando
              </span>
            </div>

            {/* Stages */}
            <div style={{ marginBottom: 12 }}>
              {[
                { label: 'Leyendo documento', state: 'done', meta: '0,4 s' },
                { label: 'Identificando proveedor', state: 'done', meta: 'Pescados Atlántico Vigo' },
                { label: 'Extrayendo cabecera', state: 'done', meta: '6 campos' },
                { label: 'Extrayendo líneas de pedido', state: 'active', meta: '7 de ≈ 9' },
                { label: 'Verificando totales', state: 'pending', meta: '' },
              ].map((s, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0',
                  borderBottom: '1px solid var(--mep-divider)' }}>
                  <div style={{
                    width: 18, height: 18, flexShrink: 0,
                  }}>
                    {s.state === 'done' && (
                      <div style={{ width: 18, height: 18, borderRadius: 9, background: 'var(--mep-pos-soft)',
                        color: 'var(--mep-pos)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Check size={11} />
                      </div>
                    )}
                    {s.state === 'active' && (
                      <div style={{ width: 18, height: 18, borderRadius: 9, background: 'var(--mep-acc-soft)',
                        color: 'var(--mep-acc)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <ExtractingSpinner size={10} />
                      </div>
                    )}
                    {s.state === 'pending' && (
                      <div style={{ width: 18, height: 18, borderRadius: 9, border: '1px dashed var(--mep-border)' }} />
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 500,
                    color: s.state === 'pending' ? 'var(--mep-fg-3)' : 'var(--mep-fg)' }}>
                    {s.label}
                  </div>
                  <div className="num" style={{ fontSize: 11.5, color: 'var(--mep-fg-3)' }}>{s.meta}</div>
                </div>
              ))}
            </div>

            {/* Live extracted preview */}
            <div style={{ marginTop: 'auto', padding: '12px 14px', background: 'var(--mep-surface-2)',
              borderRadius: 8, border: '1px solid var(--mep-divider)' }}>
              <div className="label" style={{ marginBottom: 8 }}>Campos extraídos hasta ahora</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px' }}>
                <ExtField label="Proveedor" value="Pescados Atlántico Vigo" />
                <ExtField label="N.º factura" value="PA-2026-0982" mono />
                <ExtField label="Fecha" value="19/05/2026" mono />
                <ExtField label="Vencimiento" value="26/05/2026" mono />
                <ExtField label="Base imponible" value="442,90 €" mono />
                <ExtField label="IVA (10%)" value="44,29 €" mono dim />
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

function ExtractingSpinner({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" style={{ animation: 'mepspin 1.1s linear infinite' }}>
      <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeOpacity="0.2" strokeWidth="2" />
      <path d="M14 8a6 6 0 00-6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function ExtField({ label, value, mono, dim }) {
  return (
    <div>
      <div style={{ fontSize: 10.5, color: 'var(--mep-fg-3)', textTransform: 'uppercase', letterSpacing: 0.04, marginBottom: 2 }}>{label}</div>
      <div className={mono ? 'num' : ''} style={{ fontSize: 13, fontWeight: 500,
        color: dim ? 'var(--mep-fg-2)' : 'var(--mep-fg)' }}>{value}</div>
    </div>
  );
}

// ── Step 3: review extracted data ─────────────────────────────────────────
function MEPUploadReview() {
  const { lineItems, subtotal, iva, ivaPct } = UD;
  return (
    <main style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
      <div style={{ flex: 1, padding: '20px 24px 20px', display: 'flex', flexDirection: 'column', gap: 14, minHeight: 0 }}>

        {/* Header bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-ghost" style={{ width: 32, height: 32, padding: 0, justifyContent: 'center' }}>
            <ChevronLeft size={15} />
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11.5, color: 'var(--mep-fg-3)' }}>Factura 2 de 3</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--mep-fg)' }}>
              Revisar PA-2026-0982 · Pescados Atlántico Vigo
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="badge" style={{ background: 'var(--mep-acc-soft)', color: 'var(--mep-acc)' }}>
              <Sparkle size={11} /> Extraído por IA · alta confianza
            </span>
          </div>
          <button className="btn btn-ghost"><RefreshCw size={13}/> Reextraer</button>
          <button className="btn btn-secondary">Descartar</button>
          <button className="btn btn-primary">
            <Check size={14} /> Confirmar y guardar
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '0.85fr 1.15fr', gap: 14, flex: 1, minHeight: 0 }}>
          {/* Document preview */}
          <div className="card" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--mep-divider)',
              display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ flex: 1, fontSize: 12, color: 'var(--mep-fg-2)', fontWeight: 500 }}>
                PA-2026-0982.pdf <span style={{ color: 'var(--mep-fg-3)', fontWeight: 400 }}>· página 1 de 2</span>
              </div>
              <button className="btn btn-ghost" style={{ width: 26, height: 26, padding: 0, justifyContent: 'center' }}>−</button>
              <span className="num" style={{ fontSize: 11.5, color: 'var(--mep-fg-3)' }}>100%</span>
              <button className="btn btn-ghost" style={{ width: 26, height: 26, padding: 0, justifyContent: 'center' }}>+</button>
            </div>
            <div style={{ flex: 1, overflow: 'hidden', position: 'relative',
              background: 'var(--mep-surface-2)',
              backgroundImage: 'radial-gradient(circle, var(--mep-divider) 1px, transparent 1px)',
              backgroundSize: '12px 12px',
              padding: 18,
            }}>
              <FauxInvoice />
            </div>
          </div>

          {/* Data panel */}
          <div className="card" style={{ padding: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Header fields */}
            <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--mep-divider)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div className="subtitle">Cabecera</div>
                <span style={{ fontSize: 11, color: 'var(--mep-fg-3)' }}>Tab para navegar entre campos</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 14px' }}>
                <Field label="Proveedor" value="Pescados Atlántico Vigo" hint="Coincide con proveedor existente" />
                <Field label="N.º factura" value="PA-2026-0982" mono />
                <Field label="Fecha factura" value="19/05/2026" mono />
                <Field label="Vencimiento" value="26/05/2026" mono />
                <Field label="Moneda" value="EUR" />
                <Field label="Total" value="487,19 €" mono strong flagged
                  hint="No coincide con suma calculada (493,54 €). Revisar." />
              </div>
            </div>

            {/* Line items */}
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <div style={{ padding: '12px 16px 6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div className="subtitle">Líneas <span style={{ color: 'var(--mep-fg-3)', fontWeight: 400 }} className="num">· 9</span></div>
                <button className="btn btn-ghost" style={{ height: 26, fontSize: 12, padding: '0 8px' }}>
                  <Plus size={12} /> Añadir línea
                </button>
              </div>
              <div style={{ overflow: 'auto' }}>
                <table className="tbl" style={{ tableLayout: 'fixed' }}>
                  <thead>
                    <tr>
                      <th style={{ width: '40%' }}>Descripción</th>
                      <th className="num" style={{ width: 70 }}>Cant.</th>
                      <th style={{ width: 56 }}>Unidad</th>
                      <th className="num" style={{ width: 90 }}>P. unitario</th>
                      <th className="num" style={{ width: 90 }}>Total</th>
                      <th style={{ width: 28 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {lineItems.map((l, i) => (
                      <tr key={i} className="row" style={{
                        background: l.flagged ? 'var(--mep-warn-soft)' : undefined,
                      }}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--mep-fg)' }}>{l.desc}</span>
                            {l.flagged && (
                              <span style={{ color: 'var(--mep-warn)', display: 'inline-flex' }} title="Confianza baja">
                                <AlertTriangle size={11} />
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="num">{l.qty.toFixed(2).replace('.', ',')}</td>
                        <td style={{ fontSize: 12, color: 'var(--mep-fg-2)' }}>{l.unit}</td>
                        <td className="num">{l.price.toFixed(2).replace('.', ',')} €</td>
                        <td className="num" style={{ fontWeight: 500 }}>{l.total.toFixed(2).replace('.', ',')} €</td>
                        <td>
                          <button className="btn btn-ghost" style={{ width: 22, height: 22, padding: 0, justifyContent: 'center' }}>
                            <Trash size={11} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Totals */}
            <div style={{
              padding: '12px 16px',
              borderTop: '1px solid var(--mep-divider)',
              background: 'var(--mep-surface-2)',
              display: 'grid', gridTemplateColumns: '1fr 1fr',
              gap: 16,
            }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--mep-warn)', fontWeight: 500 }}>
                  <AlertTriangle size={12} />
                  Discrepancia · 6,35 €
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--mep-fg-2)', marginTop: 4, lineHeight: 1.4 }}>
                  El total extraído no cuadra con la suma de las líneas + IVA. Revisa antes de confirmar.
                </div>
              </div>
              <div>
                <Total row label="Base imponible" value={subtotal.toFixed(2).replace('.', ',') + ' €'} />
                <Total row label={`IVA (${ivaPct}%)`} value={iva.toFixed(2).replace('.', ',') + ' €'} />
                <Total row strong label="Total calculado" value={(subtotal + iva).toFixed(2).replace('.', ',') + ' €'} />
                <Total row dim strikethrough label="Total extraído" value="487,19 €" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

function Field({ label, value, hint, mono, strong, flagged }) {
  return (
    <div>
      <div style={{ fontSize: 10.5, color: 'var(--mep-fg-3)', textTransform: 'uppercase',
        letterSpacing: 0.04, fontWeight: 500, marginBottom: 4 }}>{label}</div>
      <div className={mono ? 'num' : ''} style={{
        fontSize: 13.5, fontWeight: strong ? 600 : 500, color: 'var(--mep-fg)',
        padding: '5px 8px', borderRadius: 5,
        background: 'var(--mep-surface-2)',
        border: `1px solid ${flagged ? 'var(--mep-warn)' : 'transparent'}`,
        borderBottom: flagged ? `2px solid var(--mep-warn)` : '1px solid var(--mep-divider)',
      }}>{value}</div>
      {hint && (
        <div style={{ fontSize: 11, color: flagged ? 'var(--mep-warn)' : 'var(--mep-fg-3)', marginTop: 4,
          display: 'flex', alignItems: 'center', gap: 4 }}>
          {flagged && <AlertTriangle size={10} />}
          {hint}
        </div>
      )}
    </div>
  );
}

function Total({ label, value, strong, dim, strikethrough }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
      <span style={{ fontSize: 12.5, color: dim ? 'var(--mep-fg-3)' : 'var(--mep-fg-2)' }}>{label}</span>
      <span className="num" style={{
        fontSize: strong ? 14 : 12.5,
        fontWeight: strong ? 600 : 500,
        color: dim ? 'var(--mep-fg-3)' : 'var(--mep-fg)',
        textDecoration: strikethrough ? 'line-through' : 'none',
      }}>{value}</span>
    </div>
  );
}

// Faux invoice — looks like a real Spanish invoice rendering inside the doc viewer
function FauxInvoice() {
  return (
    <div style={{
      background: '#fff', color: '#16181b',
      width: '100%', maxWidth: 480, margin: '0 auto',
      padding: '24px 28px', boxShadow: '0 10px 30px rgba(0,0,0,0.10), 0 2px 6px rgba(0,0,0,0.06)',
      borderRadius: 4, fontFamily: 'var(--mep-font)',
      fontSize: 10,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '2px solid #16181b', paddingBottom: 14, marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: -0.4 }}>Pescados Atlántico Vigo, S.L.</div>
          <div style={{ fontSize: 9, color: '#555', marginTop: 4, lineHeight: 1.5 }}>
            Avda. del Puerto Pesquero, 14<br/>
            36202 Vigo · Pontevedra<br/>
            CIF B36789432
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 9, color: '#555', textTransform: 'uppercase', letterSpacing: 0.06 }}>Factura</div>
          <div className="num" style={{ fontSize: 13, fontWeight: 600 }}>PA-2026-0982</div>
          <div className="num" style={{ fontSize: 9, color: '#555', marginTop: 4 }}>19/05/2026</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14, fontSize: 9 }}>
        <div>
          <div style={{ color: '#888', textTransform: 'uppercase', letterSpacing: 0.06, marginBottom: 2 }}>Cliente</div>
          <div style={{ fontWeight: 600 }}>Casa Lúa S.L.</div>
          <div style={{ color: '#555' }}>C/ Almirante 12 · 28004 Madrid</div>
          <div style={{ color: '#555' }} className="num">CIF B45219723</div>
        </div>
        <div>
          <div style={{ color: '#888', textTransform: 'uppercase', letterSpacing: 0.06, marginBottom: 2 }}>Forma de pago</div>
          <div>Transferencia</div>
          <div style={{ color: '#555', marginTop: 4 }}>Vencimiento: <span className="num">26/05/2026</span></div>
        </div>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 9 }}>
        <thead>
          <tr style={{ background: '#f3f1ec' }}>
            <th style={{ textAlign: 'left', padding: '5px 6px', fontWeight: 500 }}>Descripción</th>
            <th style={{ textAlign: 'right', padding: '5px 6px', fontWeight: 500 }} className="num">Cant.</th>
            <th style={{ textAlign: 'left', padding: '5px 6px', fontWeight: 500 }}>Ud.</th>
            <th style={{ textAlign: 'right', padding: '5px 6px', fontWeight: 500 }} className="num">P. Unit.</th>
            <th style={{ textAlign: 'right', padding: '5px 6px', fontWeight: 500 }} className="num">Total</th>
          </tr>
        </thead>
        <tbody>
          {UD.lineItems.slice(0, 7).map((l, i) => (
            <tr key={i} style={{ borderBottom: '1px solid #eee' }}>
              <td style={{ padding: '4px 6px' }}>{l.desc}</td>
              <td style={{ textAlign: 'right', padding: '4px 6px' }} className="num">{l.qty.toFixed(2).replace('.', ',')}</td>
              <td style={{ padding: '4px 6px', color: '#555' }}>{l.unit}</td>
              <td style={{ textAlign: 'right', padding: '4px 6px' }} className="num">{l.price.toFixed(2).replace('.', ',')}</td>
              <td style={{ textAlign: 'right', padding: '4px 6px' }} className="num">{l.total.toFixed(2).replace('.', ',')}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ textAlign: 'center', fontSize: 8, color: '#888', padding: '8px 0', fontStyle: 'italic' }}>
        … continúa en la página 2
      </div>

      <div style={{ borderTop: '1px solid #ccc', paddingTop: 8, marginTop: 4 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, marginBottom: 2 }}>
          <span>Base imponible</span><span className="num">442,90 €</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, marginBottom: 4 }}>
          <span>IVA (10%)</span><span className="num">44,29 €</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 600, paddingTop: 6, borderTop: '1px solid #16181b' }}>
          <span>TOTAL</span><span className="num">487,19 €</span>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, {
  MEPUploadDrop, MEPUploadExtracting, MEPUploadReview,
});
