// Budgets page.

const BD = window.MEP_DATA;
const BI = window.MEPIcons;

function MEPBudgets() {
  // Use the budgets data, extended with bigger set
  const budgets = [
    ...BD.budgets,
    { cat: 'Pan', color: '#6a6660', limit: 700, spent: 612.80 },
    { cat: 'Limpieza', color: '#3a6a7a', limit: 600, spent: 384.10 },
    { cat: 'Bebidas no alcohólicas', color: '#6a4a6a', limit: 800, spent: 412.40 },
    { cat: 'Consumibles cocina', color: '#8a8275', limit: 400, spent: 218.30 },
  ];
  const totalLimit = budgets.reduce((s, b) => s + b.limit, 0);
  const totalSpent = budgets.reduce((s, b) => s + b.spent, 0);
  const totalPct = (totalSpent / totalLimit) * 100;

  const status = (pct) => pct < 80 ? 'pos' : (pct <= 100 ? 'warn' : 'neg');
  const semColor = {
    pos: 'var(--mep-pos)', warn: 'var(--mep-warn)', neg: 'var(--mep-neg)',
  };
  const semSoft = {
    pos: 'var(--mep-pos-soft)', warn: 'var(--mep-warn-soft)', neg: 'var(--mep-neg-soft)',
  };

  return (
    <main style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '20px 24px 0', display: 'flex', flexDirection: 'column', gap: 14, flex: 1, minHeight: 0 }}>

        {/* Top — overall progress */}
        <div className="card" style={{ padding: '18px 20px',
          display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 1fr', gap: 24, alignItems: 'center' }}>
          <div>
            <div className="label" style={{ marginBottom: 6 }}>Mayo 2026 · al día 19</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 10 }}>
              <div className="num" style={{ fontSize: 32, fontWeight: 600, color: 'var(--mep-fg)', letterSpacing: -0.7, lineHeight: 1 }}>
                {BD.eurc(totalSpent)}
              </div>
              <div style={{ fontSize: 13, color: 'var(--mep-fg-3)' }}>
                de <span className="num" style={{ color: 'var(--mep-fg-2)', fontWeight: 500 }}>{BD.eurc(totalLimit)}</span>
              </div>
            </div>
            {/* Full-width segmented bar */}
            <div style={{ height: 8, borderRadius: 4, background: 'var(--mep-surface-2)', overflow: 'hidden',
              display: 'flex', position: 'relative' }}>
              {budgets.map((b, i) => {
                const w = (b.spent / totalLimit) * 100;
                return <span key={i} style={{
                  width: `${w}%`, height: '100%', background: b.color,
                  borderRight: i < budgets.length - 1 ? '1px solid var(--mep-bg)' : 'none',
                }} />;
              })}
              <div style={{ position: 'absolute', left: `${(totalSpent / totalLimit) * 100}%`,
                top: -3, bottom: -3, width: 1.5, background: 'var(--mep-fg)' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: 'var(--mep-fg-3)', marginTop: 8 }}>
              <span><span className="num" style={{ color: semColor[status(totalPct)], fontWeight: 600 }}>
                {totalPct.toFixed(1).replace('.', ',')}%
              </span> usado · proyección {(totalPct * 31 / 19).toFixed(0)}% al cierre</span>
              <span className="num">{BD.eurc(totalLimit - totalSpent)} restante</span>
            </div>
          </div>

          <BudgetTopStat label="Categorías" value={budgets.length}
            sub={`${budgets.filter(b => (b.spent / b.limit) * 100 > 100).length} sobrepasan presupuesto`}
            tone="warn" />
          <BudgetTopStat label="Mejor categoría" value="Vinos"
            sub="77% usado · 4 días extra de margen"
            tone="pos" />
          <BudgetTopStat label="Alerta global" value="80%"
            sub="Avisarme cuando una categoría llegue a este %"
            editable />
        </div>

        {/* Budget table */}
        <div className="card" style={{ padding: 0, overflow: 'hidden', flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            borderBottom: '1px solid var(--mep-divider)' }}>
            <div>
              <div className="subtitle">Presupuesto por categoría</div>
              <div style={{ fontSize: 12, color: 'var(--mep-fg-3)', marginTop: 2 }}>
                Haz clic en una celda para editar
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <button className="btn btn-ghost" style={{ height: 30, fontSize: 12.5 }}>
                <BI.RefreshCw size={12} /> Copiar de abril
              </button>
              <button className="btn btn-secondary"><BI.Download size={13} /> Exportar</button>
            </div>
          </div>

          <div style={{ overflow: 'auto', flex: 1 }}>
            <table className="tbl" style={{ tableLayout: 'fixed' }}>
              <thead>
                <tr>
                  <th style={{ width: '22%' }}>Categoría</th>
                  <th className="num" style={{ width: 130 }}>Presupuesto</th>
                  <th className="num" style={{ width: 130 }}>Gastado</th>
                  <th className="num" style={{ width: 130 }}>Restante</th>
                  <th style={{ width: '100%' }}>Progreso</th>
                  <th className="num" style={{ width: 80 }}>%</th>
                  <th style={{ width: 90 }}>Proyección</th>
                  <th style={{ width: 36 }}></th>
                </tr>
              </thead>
              <tbody>
                {budgets.map(b => {
                  const pct = (b.spent / b.limit) * 100;
                  const st = status(pct);
                  const projected = pct * 31 / 19;
                  const projOver = projected > 100;
                  return (
                    <tr key={b.cat} className="row">
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ width: 14, height: 14, borderRadius: 3, background: b.color, flexShrink: 0 }} />
                          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--mep-fg)' }}>{b.cat}</span>
                        </div>
                      </td>
                      <td className="num">
                        <EditableCell value={BD.eurc(b.limit)} />
                      </td>
                      <td className="num" style={{ color: 'var(--mep-fg-2)' }}>{BD.eur(b.spent)}</td>
                      <td className="num" style={{ color: st === 'neg' ? 'var(--mep-neg)' : 'var(--mep-fg-2)', fontWeight: st === 'neg' ? 500 : 400 }}>
                        {(b.limit - b.spent).toFixed(2).replace('.', ',')} €
                      </td>
                      <td>
                        <div style={{ position: 'relative', height: 8, borderRadius: 4,
                          background: 'var(--mep-surface-2)', overflow: 'visible' }}>
                          <div style={{
                            width: `${Math.min(pct, 100)}%`, height: '100%', borderRadius: 4,
                            background: semColor[st],
                          }} />
                          {/* over-budget tail */}
                          {pct > 100 && (
                            <div style={{
                              position: 'absolute', left: '100%', top: 0, bottom: 0,
                              width: `${Math.min(pct - 100, 40)}%`,
                              background: 'repeating-linear-gradient(45deg, var(--mep-neg), var(--mep-neg) 4px, var(--mep-neg-soft) 4px, var(--mep-neg-soft) 8px)',
                              borderRadius: '0 4px 4px 0',
                            }} />
                          )}
                          {/* target marker */}
                          <div style={{ position: 'absolute', left: '80%', top: -3, bottom: -3, width: 1.5,
                            background: 'var(--mep-fg-3)', opacity: 0.4 }} />
                        </div>
                      </td>
                      <td className="num" style={{ color: semColor[st], fontWeight: 600 }}>
                        {pct.toFixed(0)}%
                      </td>
                      <td>
                        <span style={{
                          fontSize: 11, fontWeight: 500, padding: '2px 6px', borderRadius: 4,
                          background: projOver ? 'var(--mep-neg-soft)' : 'var(--mep-pos-soft)',
                          color: projOver ? 'var(--mep-neg)' : 'var(--mep-pos)',
                          display: 'inline-flex', alignItems: 'center', gap: 3,
                        }} className="num">
                          {projOver ? '↑' : '✓'} {projected.toFixed(0)}%
                        </span>
                      </td>
                      <td>
                        <button className="btn btn-ghost" style={{ width: 22, height: 22, padding: 0, justifyContent: 'center' }}>
                          <BI.DotsH size={13} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {/* Add row */}
                <tr>
                  <td colSpan={8} style={{ padding: '10px 12px',
                    background: 'var(--mep-surface-2)', cursor: 'pointer',
                    color: 'var(--mep-fg-3)', fontSize: 12.5, fontWeight: 500 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <BI.Plus size={12} /> Añadir categoría…
                    </span>
                  </td>
                </tr>
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={1} style={{ fontWeight: 600, color: 'var(--mep-fg)', fontSize: 13, padding: '12px' }}>Total</td>
                  <td className="num" style={{ fontWeight: 600, fontSize: 13 }}>{BD.eurc(totalLimit)}</td>
                  <td className="num" style={{ fontWeight: 600, fontSize: 13 }}>{BD.eurc(totalSpent)}</td>
                  <td className="num" style={{ fontWeight: 600, fontSize: 13, color: 'var(--mep-fg-2)' }}>{BD.eurc(totalLimit - totalSpent)}</td>
                  <td colSpan={2} className="num" style={{ fontWeight: 600, fontSize: 13, color: semColor[status(totalPct)] }}>
                    {totalPct.toFixed(1).replace('.', ',')}%
                  </td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* History toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0 4px 16px' }}>
          <span style={{ fontSize: 12, color: 'var(--mep-fg-3)' }}>Ver mes anterior:</span>
          {['Feb', 'Mar', 'Abr'].map(m => (
            <button key={m} className="btn btn-ghost" style={{ height: 28, fontSize: 12, padding: '0 10px' }}>
              {m} 2026
            </button>
          ))}
        </div>
      </div>
    </main>
  );
}

function BudgetTopStat({ label, value, sub, tone, editable }) {
  return (
    <div style={{ borderLeft: '1px solid var(--mep-divider)', paddingLeft: 18 }}>
      <div className="label" style={{ marginBottom: 6 }}>{label}</div>
      <div className="num" style={{ fontSize: 22, fontWeight: 600,
        color: tone === 'warn' ? 'var(--mep-warn)' : tone === 'pos' ? 'var(--mep-pos)' : 'var(--mep-fg)',
        letterSpacing: -0.4, lineHeight: 1.1,
        display: 'inline-flex', alignItems: 'center', gap: 4,
      }}>
        {value}
        {editable && <BI.Edit size={13} style={{ color: 'var(--mep-fg-3)' }} />}
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--mep-fg-3)', marginTop: 6 }}>{sub}</div>
    </div>
  );
}

function EditableCell({ value }) {
  return (
    <span style={{
      fontSize: 13, color: 'var(--mep-fg)', fontWeight: 500,
      padding: '3px 7px', borderRadius: 4, cursor: 'text',
      border: '1px dashed transparent',
      display: 'inline-block',
    }}>{value}</span>
  );
}

Object.assign(window, { MEPBudgets });
