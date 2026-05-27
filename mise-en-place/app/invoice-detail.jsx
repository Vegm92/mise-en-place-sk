// Invoice detail / edit view.

const ID = window.MEP_DATA;
const { ChevronLeft, ChevronRight, Check, Eye, Download, Edit, DotsH,
  File: IFile } = window.MEPIcons;

function MEPInvoiceDetail() {
  const supplier = ID.supplierById.s1;
  const lineItems = [
    { desc: 'Solomillo de ternera ibérica', qty: 4.20, unit: 'kg', price: 28.40, total: 119.28 },
    { desc: 'Costillas de cerdo ibérico', qty: 3.50, unit: 'kg', price: 14.60, total: 51.10 },
    { desc: 'Carrillera de ternera',     qty: 2.80, unit: 'kg', price: 12.40, total: 34.72 },
    { desc: 'Chorizo cular ibérico',     qty: 1.20, unit: 'kg', price: 22.80, total: 27.36 },
    { desc: 'Lomo embuchado',            qty: 0.80, unit: 'kg', price: 36.50, total: 29.20 },
    { desc: 'Morcilla de Burgos',        qty: 1.50, unit: 'kg', price:  8.60, total: 12.90 },
    { desc: 'Panceta curada',            qty: 1.80, unit: 'kg', price: 15.40, total: 27.72 },
    { desc: 'Jamón serrano (loncheado)', qty: 2.20, unit: 'kg', price: 24.80, total: 54.56 },
    { desc: 'Pollo de corral entero',    qty: 6.80, unit: 'kg', price:  9.40, total: 63.92 },
    { desc: 'Cordero lechal (cuartos)',  qty: 2.40, unit: 'kg', price: 28.90, total: 69.36 },
  ];
  const subtotal = lineItems.reduce((s, l) => s + l.total, 0);
  const iva = subtotal * 0.10;
  const total = subtotal + iva;

  return (
    <main style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      {/* Detail header */}
      <div style={{ padding: '14px 24px', borderBottom: '1px solid var(--mep-divider)',
        display: 'flex', alignItems: 'center', gap: 12 }}>
        <button className="btn btn-ghost" style={{ width: 30, height: 30, padding: 0, justifyContent: 'center' }}>
          <ChevronLeft size={14} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--mep-fg-3)' }}>
            <span style={{ cursor: 'pointer' }}>Facturas</span>
            <ChevronRight size={11} />
            <span className="num">2026-A-0471</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginTop: 2 }}>
            <h1 style={{ margin: 0, fontSize: 19, fontWeight: 600, color: 'var(--mep-fg)', letterSpacing: -0.3 }}>
              Factura 2026-A-0471
            </h1>
            <span className="badge badge-confirmed">
              <Check size={10} /> Confirmada
            </span>
          </div>
        </div>
        <button className="btn btn-ghost">
          <Eye size={13} /> Vista previa
        </button>
        <button className="btn btn-ghost">
          <Download size={13} /> PDF
        </button>
        <button className="btn btn-secondary">
          <Edit size={13} /> Editar
        </button>
        <button className="btn btn-ghost" style={{ width: 32, padding: 0, justifyContent: 'center' }}>
          <DotsH size={14} />
        </button>
      </div>

      <div style={{ padding: '16px 24px 20px', display: 'grid',
        gridTemplateColumns: '0.85fr 1.15fr', gap: 14,
        flex: 1, minHeight: 0,
      }}>
        {/* Document panel */}
        <div className="card" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--mep-divider)',
            display: 'flex', alignItems: 'center', gap: 8 }}>
            <IFile size={13} style={{ color: 'var(--mep-fg-2)' }} />
            <div style={{ flex: 1, fontSize: 12, color: 'var(--mep-fg-2)' }}>
              2026-A-0471.pdf <span style={{ color: 'var(--mep-fg-3)' }}>· 1 página · 178 KB</span>
            </div>
            <button className="btn btn-ghost" style={{ width: 26, height: 26, padding: 0, justifyContent: 'center' }}>−</button>
            <span className="num" style={{ fontSize: 11.5, color: 'var(--mep-fg-3)' }}>100%</span>
            <button className="btn btn-ghost" style={{ width: 26, height: 26, padding: 0, justifyContent: 'center' }}>+</button>
          </div>
          <div style={{ flex: 1, overflow: 'hidden', position: 'relative',
            background: 'var(--mep-surface-2)', padding: 16,
            backgroundImage: 'radial-gradient(circle, var(--mep-divider) 1px, transparent 1px)',
            backgroundSize: '12px 12px',
          }}>
            <FauxCarnesInvoice />
          </div>
        </div>

        {/* Data + activity panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
          {/* Header info */}
          <div className="card" style={{ padding: '14px 16px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px 16px' }}>
              <SupplierLink supplier={supplier} />
              <ReadField label="N.º factura" value="2026-A-0471" mono />
              <ReadField label="Fecha emisión" value="19/05/2026" mono />
              <ReadField label="Vencimiento" value="08/06/2026" mono sub="en 20 días" />
              <ReadField label="Forma de pago" value="Transferencia" />
              <ReadField label="Total (IVA incluido)" value={ID.eur(total)} mono strong />
              <ReadField label="Categoría" value={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span className="swatch" style={{ background: supplier.color }} /> {supplier.cat}
              </span>} />
              <ReadField label="Estado" value={<span className="badge badge-confirmed">
                <Check size={10} /> Confirmada
              </span>} />
            </div>
          </div>

          {/* Line items */}
          <div className="card" style={{ padding: 0, overflow: 'hidden', flex: 1, display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div className="subtitle">Líneas <span style={{ color: 'var(--mep-fg-3)', fontWeight: 400 }} className="num">· 10</span></div>
              <div style={{ display: 'flex', gap: 6 }}>
                <span style={{ fontSize: 11.5, color: 'var(--mep-fg-3)' }}>
                  Coincide con suma calculada
                </span>
                <span style={{ color: 'var(--mep-pos)' }}>
                  <Check size={12} />
                </span>
              </div>
            </div>
            <div style={{ overflow: 'auto', flex: 1 }}>
              <table className="tbl" style={{ tableLayout: 'fixed' }}>
                <thead>
                  <tr>
                    <th style={{ width: '46%' }}>Descripción</th>
                    <th className="num" style={{ width: 70 }}>Cant.</th>
                    <th style={{ width: 56 }}>Unidad</th>
                    <th className="num" style={{ width: 90 }}>P. unit</th>
                    <th className="num" style={{ width: 100 }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map((l, i) => (
                    <tr key={i} className="row">
                      <td style={{ fontSize: 13, fontWeight: 500, color: 'var(--mep-fg)' }}>{l.desc}</td>
                      <td className="num">{l.qty.toFixed(2).replace('.', ',')}</td>
                      <td style={{ fontSize: 12, color: 'var(--mep-fg-2)' }}>{l.unit}</td>
                      <td className="num">{l.price.toFixed(2).replace('.', ',')} €</td>
                      <td className="num" style={{ fontWeight: 500 }}>{l.total.toFixed(2).replace('.', ',')} €</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ borderTop: '1px solid var(--mep-divider)', background: 'var(--mep-surface-2)',
              padding: '10px 16px', display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Total label="Base imponible" value={ID.eur(subtotal)} />
              <Total label="IVA (10%)" value={ID.eur(iva)} />
              <Total strong label="Total" value={ID.eur(total)} />
            </div>
          </div>

          {/* Activity timeline */}
          <div className="card" style={{ padding: '12px 16px' }}>
            <div className="subtitle" style={{ marginBottom: 8 }}>Historial</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {[
                { when: '19 may. 14:32', who: 'Lucía Marín', what: 'Confirmó la factura', kind: 'confirmed' },
                { when: '19 may. 14:30', who: 'Lucía Marín', what: 'Corrigió cantidad de “Cordero lechal” de 2,4 a 2,40 kg', kind: 'edit' },
                { when: '19 may. 14:28', who: 'IA · alta confianza', what: 'Extrajo 10 líneas y la cabecera del documento', kind: 'ai' },
                { when: '19 may. 14:27', who: 'Lucía Marín', what: 'Subió 2026-A-0471.pdf desde el escritorio', kind: 'upload' },
              ].map((e, i) => {
                const colors = {
                  confirmed: 'var(--mep-pos)',
                  edit: 'var(--mep-warn)',
                  ai: 'var(--mep-acc)',
                  upload: 'var(--mep-fg-3)',
                };
                return (
                  <div key={i} style={{ display: 'flex', gap: 10, padding: '4px 0' }}>
                    <span style={{ width: 6, height: 6, borderRadius: 3, background: colors[e.kind],
                      flexShrink: 0, marginTop: 7 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, color: 'var(--mep-fg)' }}>
                        <span style={{ fontWeight: 500 }}>{e.who}</span>
                        <span style={{ color: 'var(--mep-fg-2)' }}> · {e.what}</span>
                      </div>
                    </div>
                    <div className="num" style={{ fontSize: 11, color: 'var(--mep-fg-3)', whiteSpace: 'nowrap' }}>
                      {e.when}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

function ReadField({ label, value, mono, strong, sub }) {
  return (
    <div>
      <div style={{ fontSize: 10.5, color: 'var(--mep-fg-3)', textTransform: 'uppercase', letterSpacing: 0.04,
        fontWeight: 500, marginBottom: 4 }}>{label}</div>
      <div className={mono && typeof value === 'string' ? 'num' : ''}
        style={{ fontSize: strong ? 14 : 13, fontWeight: strong ? 600 : 500, color: 'var(--mep-fg)' }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 11, color: 'var(--mep-fg-3)', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function SupplierLink({ supplier }) {
  return (
    <div>
      <div style={{ fontSize: 10.5, color: 'var(--mep-fg-3)', textTransform: 'uppercase', letterSpacing: 0.04,
        fontWeight: 500, marginBottom: 4 }}>Proveedor</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span className="swatch" style={{ background: supplier.color }} />
        <a style={{ fontSize: 13, fontWeight: 500, color: 'var(--mep-acc)', cursor: 'pointer',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {supplier.name}
        </a>
      </div>
      <div className="num" style={{ fontSize: 11, color: 'var(--mep-fg-3)', marginTop: 2 }}>
        CIF {supplier.cif}
      </div>
    </div>
  );
}

function FauxCarnesInvoice() {
  return (
    <div style={{
      background: '#fff', color: '#16181b',
      width: '100%', maxWidth: 460, margin: '0 auto',
      padding: '22px 24px', boxShadow: '0 10px 30px rgba(0,0,0,0.10), 0 2px 6px rgba(0,0,0,0.06)',
      borderRadius: 4, fontFamily: 'var(--mep-font)', fontSize: 10,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '2px solid #7a5b3a', paddingBottom: 12, marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: -0.3, color: '#7a5b3a' }}>
            Cárnicas Ibérico Aranda
          </div>
          <div style={{ fontSize: 8.5, color: '#555', marginTop: 4, lineHeight: 1.5 }}>
            Pol. Ind. Las Peñas, nave 12<br/>
            09400 Aranda de Duero · Burgos<br/>
            CIF B81234567
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 8.5, color: '#7a5b3a', textTransform: 'uppercase', letterSpacing: 0.06, fontWeight: 600 }}>Factura</div>
          <div className="num" style={{ fontSize: 12, fontWeight: 700 }}>2026-A-0471</div>
          <div className="num" style={{ fontSize: 8.5, color: '#555', marginTop: 3 }}>19/05/2026</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12, fontSize: 8.5 }}>
        <div>
          <div style={{ color: '#888', textTransform: 'uppercase', letterSpacing: 0.06, marginBottom: 2 }}>Cliente</div>
          <div style={{ fontWeight: 600 }}>Casa Lúa S.L.</div>
          <div style={{ color: '#555' }}>C/ Almirante 12 · 28004 Madrid</div>
        </div>
        <div>
          <div style={{ color: '#888', textTransform: 'uppercase', letterSpacing: 0.06, marginBottom: 2 }}>Pago</div>
          <div>Transferencia · 30 d</div>
          <div style={{ color: '#555', marginTop: 3 }}>Vence: <span className="num">08/06/2026</span></div>
        </div>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 8.5 }}>
        <thead>
          <tr style={{ background: '#f3efe7' }}>
            <th style={{ textAlign: 'left', padding: '4px 5px', fontWeight: 500 }}>Descripción</th>
            <th style={{ textAlign: 'right', padding: '4px 5px', fontWeight: 500 }} className="num">Kg</th>
            <th style={{ textAlign: 'right', padding: '4px 5px', fontWeight: 500 }} className="num">€/Kg</th>
            <th style={{ textAlign: 'right', padding: '4px 5px', fontWeight: 500 }} className="num">Total</th>
          </tr>
        </thead>
        <tbody>
          {[
            ['Solomillo ternera ibérica', '4,20', '28,40', '119,28'],
            ['Costillas cerdo ibérico', '3,50', '14,60', '51,10'],
            ['Carrillera ternera', '2,80', '12,40', '34,72'],
            ['Chorizo cular ibérico', '1,20', '22,80', '27,36'],
            ['Lomo embuchado', '0,80', '36,50', '29,20'],
            ['Morcilla de Burgos', '1,50', '8,60', '12,90'],
            ['Panceta curada', '1,80', '15,40', '27,72'],
            ['Jamón serrano lonch.', '2,20', '24,80', '54,56'],
            ['Pollo de corral', '6,80', '9,40', '63,92'],
            ['Cordero lechal', '2,40', '28,90', '69,36'],
          ].map((r, i) => (
            <tr key={i} style={{ borderBottom: '1px solid #eee' }}>
              <td style={{ padding: '3px 5px' }}>{r[0]}</td>
              <td style={{ textAlign: 'right', padding: '3px 5px' }} className="num">{r[1]}</td>
              <td style={{ textAlign: 'right', padding: '3px 5px' }} className="num">{r[2]}</td>
              <td style={{ textAlign: 'right', padding: '3px 5px' }} className="num">{r[3]}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ borderTop: '1px solid #ccc', paddingTop: 6, marginTop: 6 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, marginBottom: 2 }}>
          <span>Base imponible</span><span className="num">490,12 €</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, marginBottom: 4 }}>
          <span>IVA (10%)</span><span className="num">49,01 €</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 700, paddingTop: 5, borderTop: '1.5px solid #7a5b3a' }}>
          <span>TOTAL</span><span className="num">539,13 €</span>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { MEPInvoiceDetail });
