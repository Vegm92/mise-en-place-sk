export function mobileFrameFactory({ ic, I, periodNav, SHADOW_CARD }) {
  const sparkline = (t, data, color, width, height) => {
    const min = Math.min(...data), max = Math.max(...data), range = (max - min) || 1;
    const xStep = width / (data.length - 1);
    const pts = data.map((v, i) => `${(i * xStep).toFixed(1)},${(height - ((v - min) / range) * (height - 3) - 1.5).toFixed(1)}`).join(' ');
    const gid = `sg${width}${height}`;
    return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none" style="display:block;overflow:visible;">
        <defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${color}" stop-opacity="0.18"></stop>
          <stop offset="100%" stop-color="${color}" stop-opacity="0"></stop>
        </linearGradient></defs>
        <polygon points="${pts} ${width},${height} 0,${height}" fill="url(#${gid})"></polygon>
        <polyline points="${pts}" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></polyline>
      </svg>`;
  };

  const delta = (t, value, suffix = '%') => {
    const color = value > 0 ? t.pos : value < 0 ? t.neg : t.fg3;
    const arrow = value > 0 ? '↑' : value < 0 ? '↓' : '→';
    return `<span class="num" style="font-size:11.5px;font-weight:500;color:${color};display:inline-flex;align-items:center;gap:2px;">
        <span style="font-style:normal;">${arrow}</span><span>${Math.abs(value)}${suffix}</span></span>`;
  };

  const SPARK = [720, 980, 640, 1180, 860, 1420, 1050, 1310, 990, 1560, 1240, 1680];

  const suppliers = (t, isLight) => [
    ['Cárnicas Beltrán', 'Carnes y derivados · 6 facturas', '4.180 €', 12, isLight ? '#8B3530' : '#d3756d'],
    ['Pescadería Ría de Arosa', 'Pescados y mariscos · 4 facturas', '2.040 €', -8, isLight ? '#2C5F8A' : '#6195c3'],
    ['Frutas Serrano', 'Frutas y verduras · 7 facturas', '1.905 €', 3, isLight ? '#3B6B20' : '#619348'],
    ['Lácteos del Valle', 'Lácteos · 3 facturas', '1.120 €', -2, isLight ? '#C9A227' : '#c9a227'],
  ].map(([name, sub, amount, d, color], i, arr) => `
          <div style="display:flex;align-items:center;gap:12px;padding:8px 0;border-bottom:${i < arr.length - 1 ? `1px solid ${t.divider}` : 'none'};">
            <span style="background:${color};width:8px;height:26px;border-radius:2px;flex-shrink:0;"></span>
            <div style="flex:1;min-width:0;">
              <div style="font-size:13px;font-weight:500;color:${t.fg};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${name}</div>
              <div style="font-size:11px;color:${t.fg3};">${sub}</div>
            </div>
            <div style="text-align:right;flex-shrink:0;">
              <div class="num" style="font-size:13px;font-weight:500;color:${t.fg};">${amount}</div>
              ${delta(t, d)}
            </div>
          </div>`).join('');

  return function mobileFrame(t, isLight) {
    return `
      <div style="width:390px;height:844px;flex-shrink:0;overflow:hidden;display:flex;flex-direction:column;background:${t.bg};">

        <div style="height:56px;flex-shrink:0;display:flex;align-items:center;padding:0 12px;gap:6px;border-bottom:1px solid ${t.divider};background:${t.bg};">
          <div style="width:34px;height:34px;display:flex;align-items:center;justify-content:center;color:${t.fg2};">${ic(I.menu, 18)}</div>
          <span style="flex:1;min-width:0;font-size:16px;font-weight:600;color:${t.fg};letter-spacing:-0.015em;">Resumen</span>
          <div style="width:34px;height:34px;display:flex;align-items:center;justify-content:center;color:${t.fg2};position:relative;">
            ${ic(I.bell, 17)}
            <span style="position:absolute;top:5px;right:6px;width:7px;height:7px;border-radius:50%;background:${t.neg};border:1.5px solid ${t.bg};"></span>
          </div>
          <div class="btn btn-primary" style="height:34px;padding:0 12px;">${ic(I.upload, 14)}</div>
        </div>

        <div style="flex:1;min-height:0;overflow:hidden;padding:14px 18px 18px;display:flex;flex-direction:column;gap:14px;">

          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
            <div style="font-size:13px;color:${t.fg3};min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">Buenos días · miércoles, 26 de agosto</div>
            ${periodNav(t, true)}
          </div>

          <div class="card" style="padding:16px;">
            <div class="label" style="margin-bottom:6px;">Gasto del mes</div>
            <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:4px;">
              <div class="num" style="font-size:32px;font-weight:600;color:${t.fg};letter-spacing:-0.8px;line-height:1;">18.400 €</div>
              ${delta(t, 12)}
            </div>
            <div style="font-size:11.5px;color:${t.fg3};">24 albaranes · cierre previsto <span class="num" style="color:${t.fg2};font-weight:500;">21.940 €</span></div>
            <div style="margin-top:14px;height:50px;">${sparkline(t, SPARK, t.acc, 322, 50)}</div>
            <div style="margin-top:14px;">
              <div style="display:flex;justify-content:space-between;font-size:11.5px;margin-bottom:6px;">
                <span style="color:${t.fg3};">Presupuesto del mes</span>
                <span class="num" style="color:${t.fg};font-weight:500;"><span style="color:${t.warn};">88%</span> de 21.000 €</span>
              </div>
              <div style="height:6px;border-radius:3px;background:${t.surface2};overflow:hidden;">
                <div style="width:88%;height:100%;background:${t.warn};"></div>
              </div>
              <div style="display:flex;justify-content:flex-end;margin-top:6px;font-size:11px;color:${t.fg3};">
                <span class="num" style="color:${t.fg2};font-weight:500;margin-right:3px;">18.400 €</span>gastados
              </div>
            </div>
          </div>

          <div style="padding:12px 14px;border-radius:10px;background:${t.negSoft};display:flex;align-items:flex-start;gap:12px;">
            <div style="color:${t.neg};margin-top:2px;flex-shrink:0;">${ic(I.alert, 18)}</div>
            <div style="flex:1;min-width:0;">
              <div style="font-size:11px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;color:${t.neg};margin-bottom:2px;">3 alertas graves</div>
              <div style="font-size:13.5px;font-weight:500;color:${t.fg};line-height:1.4;">El solomillo sube un 14 % en tres albaranes</div>
              <div style="font-size:12px;color:${t.fg2};margin-top:3px;">Revisa los márgenes de carta</div>
            </div>
            <div style="display:flex;align-items:center;gap:2px;flex-shrink:0;margin-top:2px;font-size:13px;font-weight:500;color:${t.acc};">Ver todas ${ic(I.chevR, 14)}</div>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
            <div class="card" style="padding:12px;">
              <div class="label" style="margin-bottom:5px;">Pendiente de pago</div>
              <div class="num" style="font-size:19px;font-weight:600;letter-spacing:-0.3px;line-height:1;color:${t.warn};">5.100 €</div>
              <div style="margin-top:6px;font-size:11px;color:${t.fg3};">2 facturas</div>
            </div>
            <div class="card" style="padding:12px;">
              <div class="label" style="margin-bottom:5px;">Pendiente</div>
              <div class="num" style="font-size:19px;font-weight:600;letter-spacing:-0.3px;line-height:1;color:${t.warn};">4</div>
              <div style="margin-top:6px;font-size:11px;color:${t.fg3};">albaranes extraídos</div>
            </div>
          </div>

          <div class="card" style="padding:14px 14px 6px;">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
              <div class="subtitle" style="font-size:15px;">Proveedores</div>
              <span style="color:${t.fg3};display:flex;">${ic(I.chevR, 14)}</span>
            </div>
            ${suppliers(t, isLight)}
          </div>

        </div>
      </div>`;
  };
}
