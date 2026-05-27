// Invoice list — dense table view, with filters bar.

const IL = window.MEP_DATA;
const { Search, ChevronDown, ChevronLeft, ChevronRight, Download, Check, X,
  Trash, AlertTriangle, Sparkle, DotsH, Plus, Filter } = window.MEPIcons;

function MEPInvoiceList() {
  // Pad invoices to a fuller list
  const fullList = [
    ...IL.invoices,
    { id: 'i13', num: 'BS/26/038', supplier: 's3', date: '2026-05-08', due: '2026-06-07', items: 4, total: 384.20, status: 'exported' },
    { id: 'i14', num: 'AG-2026-115', supplier: 's6', date: '2026-05-07', due: '2026-06-06', items: 2, total: 318.40, status: 'exported' },
    { id: 'i15', num: 'MV/26/3225', supplier: 's2', date: '2026-05-06', due: '2026-05-20', items: 16, total: 248.90, status: 'overdue' },
    { id: 'i16', num: '2026-A-0461', supplier: 's1', date: '2026-05-05', due: '2026-06-04', items: 9, total: 312.50, status: 'exported' },
    { id: 'i17', num: 'PA-2026-0941', supplier: 's4', date: '2026-05-04', due: '2026-05-11', items: 8, total: 542.30, status: 'exported' },
  ];

  const statusLabel = {
    pending: 'Por revisar',
    confirmed: 'Confirmada',
    exported: 'Exportada',
    overdue: 'Vencida',
  };

  return (
    <main style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '20px 24px 0', display: 'flex', flexDirection: 'column', gap: 14, flex: 1, minHeight: 0 }}>

        {/* Filter bar */}
        <div className="card" style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {/* Search */}
          <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
            <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--mep-fg-3)' }}>
              <Search size={14} />
            </span>
            <input className="input" style={{ paddingLeft: 32, width: '100%' }}
              placeholder="Buscar por N.º, proveedor o producto…" />
          </div>

          {/* Date range chips */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {['Esta semana', 'Este mes', '90 d', 'Personalizado'].map((p, i) => (
              <button key={p} style={{
                border: 0, background: i === 1 ? 'var(--mep-acc-soft)' : 'transparent',
                color: i === 1 ? 'var(--mep-acc)' : 'var(--mep-fg-2)',
                fontSize: 12, fontWeight: i === 1 ? 500 : 400,
                padding: '6px 10px', borderRadius: 6, cursor: 'pointer',
                fontFamily: 'inherit',
              }}>{p}</button>
            ))}
          </div>

          <div style={{ width: 1, height: 22, background: 'var(--mep-divider)' }} />

          {/* Filter dropdowns */}
          <FilterChip label="Proveedor" value="Todos" />
          <FilterChip label="Estado" value="Todos" />
          <FilterChip label="Categoría" value="Todas" />

          <div style={{ flex: 1 }} />

          <button className="btn btn-secondary">
            <Download size={13} /> Exportar CSV
          </button>
        </div>

        {/* Bulk action bar (visible) */}
        <div className="card" style={{ padding: '8px 14px',
          background: 'var(--mep-acc-soft)', border: '1px solid var(--mep-acc-ring)',
          display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className="num" style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--mep-acc)' }}>
            3 seleccionadas
          </span>
          <span style={{ fontSize: 12, color: 'var(--mep-fg-2)' }}>· 909,06 €</span>
          <div style={{ flex: 1 }} />
          <button className="btn btn-ghost" style={{ height: 28, fontSize: 12 }}>
            <Check size={12} /> Confirmar
          </button>
          <button className="btn btn-ghost" style={{ height: 28, fontSize: 12 }}>
            <Download size={12} /> Exportar
          </button>
          <button className="btn btn-ghost" style={{ height: 28, fontSize: 12, color: 'var(--mep-neg)' }}>
            <Trash size={12} /> Eliminar
          </button>
          <button className="btn btn-ghost" style={{ width: 24, height: 24, padding: 0, justifyContent: 'center', color: 'var(--mep-acc)' }}>
            <X size={13} />
          </button>
        </div>

        {/* Table */}
        <div className="card" style={{ padding: 0, overflow: 'hidden', flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div style={{ overflow: 'auto', flex: 1 }}>
            <table className="tbl" style={{ tableLayout: 'fixed' }}>
              <thead>
                <tr>
                  <th style={{ width: 32 }}>
                    <CheckBox checked={false} indet />
                  </th>
                  <th style={{ width: '24%' }}>Proveedor</th>
                  <th style={{ width: 130 }}>N.º factura</th>
                  <th style={{ width: 90 }}>Fecha</th>
                  <th style={{ width: 90 }}>Vence</th>
                  <th className="num" style={{ width: 60 }}>Líneas</th>
                  <th className="num" style={{ width: 100 }}>Total</th>
                  <th style={{ width: 130 }}>Estado</th>
                  <th style={{ width: 60 }}></th>
                </tr>
              </thead>
              <tbody>
                {fullList.map((inv, idx) => {
                  const s = IL.supplierById[inv.supplier];
                  const checked = ['i01', 'i02', 'i03'].includes(inv.id);
                  const due = new Date(inv.due), today = new Date('2026-05-19');
                  const overdue = inv.status === 'overdue' || (inv.status !== 'exported' && inv.status !== 'confirmed' && due < today);
                  return (
                    <tr key={inv.id} className="row">
                      <td><CheckBox checked={checked} /></td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span className="swatch" style={{ background: s.color }} />
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--mep-fg)',
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 220 }}>
                              {s.name}
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--mep-fg-3)' }}>{s.cat}</div>
                          </div>
                        </div>
                      </td>
                      <td className="num" style={{ fontSize: 12.5, color: 'var(--mep-fg-2)' }}>{inv.num}</td>
                      <td className="num" style={{ fontSize: 12.5, color: 'var(--mep-fg-2)' }}>
                        {new Date(inv.date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}
                      </td>
                      <td className="num" style={{ fontSize: 12.5,
                        color: overdue ? 'var(--mep-neg)' : 'var(--mep-fg-2)',
                        fontWeight: overdue ? 600 : 400 }}>
                        {new Date(inv.due).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}
                      </td>
                      <td className="num" style={{ fontSize: 12.5, color: 'var(--mep-fg-2)' }}>{inv.items}</td>
                      <td className="num" style={{ fontWeight: 500 }}>{IL.eur(inv.total)}</td>
                      <td>
                        <span className={`badge badge-${inv.status === 'overdue' ? 'overdue' : inv.status === 'pending' ? 'pending' : inv.status === 'exported' ? 'exported' : 'confirmed'}`}>
                          {inv.status === 'confirmed' && <Check size={10} />}
                          {inv.status === 'pending' && <Sparkle size={10} />}
                          {inv.status === 'exported' && <Download size={10} />}
                          {inv.status === 'overdue' && <AlertTriangle size={10} />}
                          {statusLabel[inv.status]}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button className="btn btn-ghost" style={{ width: 24, height: 24, padding: 0, justifyContent: 'center' }}>
                          <DotsH size={13} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div style={{ padding: '10px 14px', borderTop: '1px solid var(--mep-divider)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div className="num" style={{ fontSize: 12, color: 'var(--mep-fg-3)' }}>
              Mostrando 1–17 de <span style={{ fontWeight: 500, color: 'var(--mep-fg-2)' }}>47</span> facturas
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <button className="btn btn-ghost" style={{ width: 28, height: 28, padding: 0, justifyContent: 'center' }}>
                <ChevronLeft size={13} />
              </button>
              {['1', '2', '3'].map(p => (
                <button key={p} style={{
                  border: 0, background: p === '1' ? 'var(--mep-acc-soft)' : 'transparent',
                  color: p === '1' ? 'var(--mep-acc)' : 'var(--mep-fg-2)',
                  fontWeight: p === '1' ? 600 : 400,
                  width: 28, height: 28, borderRadius: 6,
                  fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
                }} className="num">{p}</button>
              ))}
              <button className="btn btn-ghost" style={{ width: 28, height: 28, padding: 0, justifyContent: 'center' }}>
                <ChevronRight size={13} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

function FilterChip({ label, value }) {
  return (
    <button className="btn btn-secondary" style={{ height: 32, fontSize: 12.5 }}>
      <span style={{ color: 'var(--mep-fg-3)', fontWeight: 400 }}>{label}:</span>
      <span style={{ marginLeft: -2 }}>{value}</span>
      <ChevronDown size={12} />
    </button>
  );
}

function CheckBox({ checked, indet }) {
  return (
    <span style={{
      width: 16, height: 16, borderRadius: 4,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      background: checked ? 'var(--mep-acc)' : 'transparent',
      border: `1px solid ${checked ? 'var(--mep-acc)' : 'var(--mep-border-strong)'}`,
      color: 'var(--mep-acc-fg)',
    }}>
      {checked && <Check size={11} />}
      {indet && <span style={{ width: 8, height: 1.5, background: 'var(--mep-fg-3)' }} />}
    </span>
  );
}

Object.assign(window, { MEPInvoiceList });
