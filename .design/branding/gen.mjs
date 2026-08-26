import { palettes } from './palettes.mjs';
import { writeFileSync } from 'node:fs';
import { mobileFrameFactory } from './mobile.mjs';

const W = 1420, H = 972;

const ic = (paths, size = 16, sw = 2) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;">${paths}</svg>`;

const I = {
  dash: '<rect x="3" y="3" width="7" height="9" rx="1"></rect><rect x="14" y="3" width="7" height="5" rx="1"></rect><rect x="14" y="12" width="7" height="9" rx="1"></rect><rect x="3" y="16" width="7" height="5" rx="1"></rect>',
  file: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"></path><path d="M14 2v4a2 2 0 0 0 2 2h4"></path><path d="M8 13h8"></path><path d="M8 17h5"></path>',
  truck: '<path d="M10 17h4V5H2v12h3"></path><path d="M14 9h4l3 3v5h-2"></path><circle cx="7.5" cy="17.5" r="2"></circle><circle cx="17.5" cy="17.5" r="2"></circle>',
  pkg: '<path d="m7.5 4.3 9 5.2"></path><path d="M21 16V8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><path d="M3.3 7 12 12l8.7-5"></path><path d="M12 22V12"></path>',
  wallet: '<path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2"></path><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"></path>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"></path><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"></path>',
  trend: '<path d="M22 7 13.5 15.5 8.5 10.5 2 17"></path><path d="M16 7h6v6"></path>',
  spark: '<path d="M12 3 13.9 8.6 19.5 10.5 13.9 12.4 12 18 10.1 12.4 4.5 10.5 10.1 8.6Z"></path><path d="M19 15v4"></path><path d="M17 17h4"></path>',
  chevD: '<path d="m6 9 6 6 6-6"></path>',
  chevR: '<path d="m9 18 6-6-6-6"></path>',
  chevL: '<path d="m15 18-6-6 6-6"></path>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><path d="m17 8-5-5-5 5"></path><path d="M12 3v12"></path>',
  clock: '<circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3.5 2"></path>',
  updown: '<path d="m21 16-4 4-4-4"></path><path d="M17 20V4"></path><path d="m3 8 4-4 4 4"></path><path d="M7 4v16"></path>',
  fileCheck: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"></path><path d="M14 2v4a2 2 0 0 0 2 2h4"></path><path d="m9 15 2 2 4-4"></path>',
  settings: '<path d="M20 7h-9"></path><path d="M14 17H5"></path><circle cx="17" cy="17" r="3"></circle><circle cx="7" cy="7" r="3"></circle>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><path d="m16 17 5-5-5-5"></path><path d="M21 12H9"></path>',
  sun: '<circle cx="12" cy="12" r="4"></circle><path d="M12 2v2"></path><path d="M12 20v2"></path><path d="m4.9 4.9 1.4 1.4"></path><path d="m17.7 17.7 1.4 1.4"></path><path d="M2 12h2"></path><path d="M20 12h2"></path><path d="m6.3 17.7-1.4 1.4"></path><path d="m19.1 4.9-1.4 1.4"></path>',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"></path>',
  menu: '<path d="M4 6h16"></path><path d="M4 12h16"></path><path d="M4 18h16"></path>',
  alert: '<path d="m21.7 18-8-14a2 2 0 0 0-3.4 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3Z"></path><path d="M12 9v4"></path><path d="M12 17h.01"></path>',
  help: '<circle cx="12" cy="12" r="10"></circle><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3"></path><path d="M12 17h.01"></path>',
};

const navItem = (icon, label, { active = false, badge = null, t }) => `
        <div style="display:flex;align-items:center;gap:10px;height:32px;padding:7px 10px;border-radius:6px;background:${active ? t.accSoft : 'transparent'};color:${active ? t.acc : t.fg2};font-size:13.5px;font-weight:${active ? 500 : 400};">
          ${ic(icon)}
          <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${label}</span>
          ${badge ? `<span class="num" style="font-size:11px;font-weight:600;min-width:16px;height:16px;padding:0 5px;border-radius:8px;background:${active ? t.acc : t.warnSoft};color:${active ? t.accFg : t.warn};display:inline-flex;align-items:center;justify-content:center;">${badge}</span>` : ''}
        </div>`;

const sectionEyebrow = (label, t, pro = false) => `
        <div style="display:flex;align-items:center;gap:7px;height:24px;padding:0 10px;margin:10px 0 3px;">
          ${pro ? ic(I.spark, 11) : ''}
          <span style="font-size:10.5px;font-weight:500;letter-spacing:0.06em;text-transform:uppercase;color:${pro ? t.acc : t.fg4};">${label}</span>
        </div>`;

const bullet = (t, { value, target, max, color, width = 90, height = 11 }) => {
  const safeMax = max > 0 ? max : Math.max(value, target, 1);
  const w = (v) => Math.max(0, Math.min(1, v / safeMax)) * width;
  const over = value > target;
  return `<svg width="${width}" height="${height}" style="display:block;overflow:visible;" role="img" aria-label="progreso">
      <rect x="0" y="0" width="${width}" height="${height}" fill="${t.surface2}" rx="2"></rect>
      <rect x="0" y="0" width="${w(safeMax * 0.7)}" height="${height}" fill="${t.hover}"></rect>
      <rect x="0" y="${height * 0.25}" width="${w(Math.min(value, target))}" height="${height * 0.5}" fill="${color}" rx="1"></rect>
      ${over ? `<rect x="${w(target)}" y="${height * 0.25}" width="${w(value) - w(target)}" height="${height * 0.5}" fill="${t.neg}"></rect>` : ''}
      <line x1="${w(target)}" x2="${w(target)}" y1="-1" y2="${height + 1}" stroke="${t.fg}" stroke-width="2"></line>
    </svg>`;
};

const periodNav = (t, compact) => {
  const h = compact ? 28 : 34, bw = compact ? 24 : 28, isz = compact ? 11 : 13, fz = compact ? '11.5px' : '12px';
  return `<div style="display:flex;align-items:center;background:${t.surface2};border:1px solid ${t.borderStrong};border-radius:6px;overflow:hidden;height:${h}px;flex-shrink:0;">
      <span style="display:flex;align-items:center;justify-content:center;width:${bw}px;height:100%;color:${t.fg3};border-right:1px solid ${t.borderStrong};">${ic(I.chevL, isz)}</span>
      <span style="font-size:${fz};font-weight:500;color:${t.fg2};padding:0 ${compact ? 8 : 10}px;white-space:nowrap;">Agosto 2026</span>
      <span style="display:flex;align-items:center;justify-content:center;width:${bw}px;height:100%;color:${t.fg4};border-left:1px solid ${t.borderStrong};">${ic(I.chevR, isz)}</span>
    </div>`;
};

const chip = (t, { label, value, note, tone, wide = false, last = false, chart = '' }) => `
      <div style="display:flex;flex-direction:column;gap:4px;padding-right:20px;min-width:${wide ? 236 : 154}px;border-right:${last ? 'none' : `1px solid ${t.divider}`};">
        <span class="label">${label}</span>
        <div style="display:flex;align-items:center;gap:10px;">
          <span class="num title">${value}</span>
          ${chart}
        </div>
        <span class="num" style="font-size:11px;font-weight:500;color:${tone};">${note}</span>
      </div>`;

const workCard = (t, { icon, kind, urgency, title, why, eur, action, color, soft, primary }) => `
        <div class="card" style="padding:11px 16px;display:grid;grid-template-columns:34px 1fr auto;gap:14px;align-items:flex-start;border-color:${primary ? color : t.border};box-shadow:${primary ? `inset 3px 0 0 ${color}, ${SHADOW_CARD(t)}` : SHADOW_CARD(t)};">
          <div style="width:34px;height:34px;border-radius:6px;background:${soft};color:${color};display:flex;align-items:center;justify-content:center;">${ic(icon, 17)}</div>
          <div style="min-width:0;">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:2px;">
              <span class="label">${kind}</span>
              <span style="font-size:11px;color:${t.fg4};">·</span>
              <span style="font-size:11px;color:${t.fg3};">${urgency}</span>
            </div>
            <div class="subtitle" style="line-height:1.3;text-wrap:pretty;">${title}</div>
            <div class="body" style="margin-top:2px;">${why}</div>
          </div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;justify-content:flex-end;gap:6px;flex-shrink:0;min-height:66px;">
            <div style="text-align:right;">
              <div class="num" style="font-size:20px;font-weight:600;color:${t.fg};letter-spacing:-0.02em;line-height:1.1;">${eur}</div>
              <div class="label">en juego</div>
            </div>
            <div class="btn ${primary ? 'btn-primary' : 'btn-secondary'}" style="height:28px;">${action}</div>
          </div>
        </div>`;

const SHADOW_CARD = (t) => t.mode === 'dark'
  ? '0 1px 0 rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3)'
  : '0 1px 0 rgba(15,20,30,0.04), 0 1px 2px rgba(15,20,30,0.04)';

const swatch = (color, name, ink, chrome) => `
        <div style="display:flex;flex-direction:column;gap:5px;min-width:0;">
          <div style="height:34px;border-radius:6px;background:${color};border:1px solid ${ink.border};"></div>
          <span style="font-size:10px;letter-spacing:0.02em;color:${chrome.name};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${name}</span>
          <span class="num" style="font-size:9.5px;color:${chrome.hex};">${color.startsWith('#') ? color.toUpperCase() : '—'}</span>
        </div>`;

function tokens(p, mode) {
  return { ...p[mode], mode };
}

function styleBlock(t, isLight) {
  return `
    body { margin: 0; }
    a { color: ${t.acc}; text-decoration: none; }
    a:hover { color: ${t.acc}; }
    .mep-root {
      font-family: 'Mona Sans', system-ui, -apple-system, 'Segoe UI', sans-serif;
      -webkit-font-smoothing: antialiased;
      box-sizing: border-box;
      background: ${isLight ? '#eceae6' : '#0e0d10'};
      color: ${t.fg};
      display: flex; flex-direction: column;
    }
    .mep-root .num { font-variant-numeric: tabular-nums; font-feature-settings: 'tnum'; }
    .card { background: ${t.surface}; border: 1px solid ${t.border}; border-radius: 10px; box-shadow: ${SHADOW_CARD(t)}; }
    .label { font-size: 11px; font-weight: 500; letter-spacing: 0.02em; text-transform: uppercase; color: ${t.fg3}; }
    .body { font-size: 13px; color: ${t.fg2}; }
    .body-strong { font-size: 13px; color: ${t.fg}; font-weight: 500; }
    .subtitle { font-size: 16px; font-weight: 600; color: ${t.fg}; letter-spacing: -0.01em; }
    .title { font-size: 20px; font-weight: 600; color: ${t.fg}; letter-spacing: -0.015em; }
    .title-lg { font-size: 24px; font-weight: 600; color: ${t.fg}; letter-spacing: -0.02em; }
    .btn { font-size: 13px; font-weight: 500; border-radius: 6px; padding: 7px 12px; height: 32px; box-sizing: border-box;
           display: inline-flex; align-items: center; gap: 6px; border: 1px solid transparent; white-space: nowrap; }
    .btn-primary { background: ${t.acc}; color: ${t.accFg}; }
    .btn-secondary { background: ${t.surface}; color: ${t.fg}; border-color: ${t.borderStrong}; }
    .btn-ghost { background: transparent; color: ${t.fg2}; }
    .badge { font-size: 11px; font-weight: 500; padding: 2px 7px; border-radius: 4px; display: inline-flex; align-items: center; gap: 4px; line-height: 16px; }
    .period-track { display: inline-flex; align-items: center; gap: 2px; background: ${t.surface2}; border: 1px solid ${t.divider}; border-radius: 999px; padding: 3px; }
    .period-pill { font-size: 12px; line-height: 1; padding: 6px 13px; border-radius: 999px; color: ${t.fg3}; }
    .period-pill.active { background: ${t.surface}; color: ${t.fg}; font-weight: 500; box-shadow: ${SHADOW_CARD(t)}; }
  `;
}

const HEAD = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body>
<x-dc>`;

const TAIL = (w, h) => `</x-dc>
<script data-dc-script data-props='{"$preview":{"width":${w},"height":${h}}}'>
class Component extends DCLogic {}
</script>
</body>
</html>
`;

const FONT_LINKS = `  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Mona+Sans:wght@400;500;600;700&display=swap">`;

function desktopFrame(t, isLight) {
  const cats = [
    { name: 'Carnes y derivados', spent: '4.180 €', budget: '3.900 €', value: 4180, target: 3271, max: 4095, color: isLight ? '#8B3530' : '#d3756d', fc: '4.980 €', d: '+1.080 €', over: true },
    { name: 'Pescados y mariscos', spent: '2.040 €', budget: '2.600 €', value: 2040, target: 2181, max: 2730, color: isLight ? '#2C5F8A' : '#6195c3', fc: '2.430 €', d: '−170 €', over: false },
    { name: 'Frutas y verduras', spent: '1.905 €', budget: '2.100 €', value: 1905, target: 1761, max: 2205, color: isLight ? '#3B6B20' : '#619348', fc: '2.270 €', d: '+170 €', over: true },
  ].map((c) => `
            <div>
              <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:4px;gap:8px;">
                <span class="body-strong" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${c.name}</span>
                <span class="num" style="font-size:11px;color:${t.fg3};flex-shrink:0;">${c.spent} <span style="color:${t.fg4};">/ ${c.budget}</span></span>
              </div>
              ${bullet(t, { value: c.value, target: c.target, max: c.max, color: c.color, width: 342, height: 11 })}
              <div class="num" style="font-size:11px;margin-top:4px;color:${c.over ? t.neg : t.fg3};">cierra en ${c.fc} · ${c.d}</div>
            </div>`).join('');

  const payables = [
    ['28 ago', 'Pescadería Ría de Arosa', '1.860 €', '2 d', t.warn, t.warnSoft],
    ['31 ago', 'Cárnicas Beltrán', '3.240 €', '5 d', t.caution, t.cautionSoft],
    ['03 sep', 'Frutas Serrano', '980 €', '8 d', t.fg2, t.hover],
  ].map(([d, n, a, dd, col, soft], i, arr) => `
              <div style="display:flex;align-items:center;gap:11px;padding:6px 0;border-bottom:${i < arr.length - 1 ? `1px solid ${t.divider}` : 'none'};">
                <span class="num" style="width:46px;font-size:11px;color:${t.fg3};flex-shrink:0;">${d}</span>
                <span class="body" style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${n}</span>
                <span class="num body-strong" style="flex-shrink:0;">${a}</span>
                <span class="badge" style="background:${soft};color:${col};flex-shrink:0;">${dd}</span>
              </div>`).join('');
  return `  <div style="height:640px;flex-shrink:0;border-radius:12px;border:1px solid ${isLight ? 'rgba(15,20,30,0.14)' : 'rgba(255,255,255,0.10)'};overflow:hidden;display:flex;background:${t.bg};">

    <div style="width:232px;flex-shrink:0;background:${t.surface};border-right:1px solid ${t.divider};display:flex;flex-direction:column;padding:18px 10px 14px;">
      <div style="display:flex;align-items:center;gap:10px;padding:0 10px 18px;">
        <svg width="22" height="22" viewBox="0 0 24 24" style="color:${t.acc};flex-shrink:0;">
          <rect x="2.5" y="3.5" width="3" height="17" rx="1.5" fill="currentColor"></rect>
          <rect x="10.5" y="3.5" width="3" height="13" rx="1.5" fill="currentColor"></rect>
          <rect x="18.5" y="3.5" width="3" height="9" rx="1.5" fill="currentColor"></rect>
        </svg>
        <span style="font-size:15px;font-weight:600;letter-spacing:-0.2px;color:${t.fg};">Mise en Place</span>
      </div>

      <div style="padding:0 10px 14px;">
        <span style="display:block;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:${t.fg4};margin-bottom:5px;">Local</span>
        <div style="height:32px;border-radius:6px;border:1px solid ${t.borderStrong};background:${t.surface};color:${t.fg};padding:0 10px;display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:12.5px;">
          <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">Casa Marisol · Centro</span>
          <span style="color:${t.fg3};display:flex;">${ic(I.chevD, 13)}</span>
        </div>
      </div>

      ${sectionEyebrow('Gestión diaria', t)}
      ${navItem(I.dash, 'Resumen', { active: true, t })}
      ${navItem(I.file, 'Albaranes', { badge: '4', t })}
      ${navItem(I.truck, 'Proveedores', { t })}
      ${navItem(I.pkg, 'Productos', { t })}
      ${sectionEyebrow('Planificación', t)}
      ${navItem(I.wallet, 'Presupuestos', { t })}
      ${navItem(I.bell, 'Recordatorios', { t })}
      ${sectionEyebrow('Inteligencia', t, true)}
      ${navItem(I.trend, 'Análisis', { t })}

      <div style="flex:1;"></div>
      <div style="display:flex;align-items:center;gap:4px;padding:8px 6px 0;border-top:1px solid ${t.divider};color:${t.fg3};">
        <div style="width:32px;height:32px;display:flex;align-items:center;justify-content:center;">${ic(isLight ? I.moon : I.sun, 15)}</div>
        <div style="width:32px;height:32px;display:flex;align-items:center;justify-content:center;">${ic(I.settings, 15)}</div>
        <div style="width:32px;height:32px;display:flex;align-items:center;justify-content:center;">${ic(I.help, 15)}</div>
        <div style="flex:1;"></div>
        <div style="width:32px;height:32px;display:flex;align-items:center;justify-content:center;">${ic(I.logout, 15)}</div>
      </div>
    </div>

    <div style="flex:1;min-width:0;display:flex;flex-direction:column;background:${t.bg};">

      <div style="height:56px;flex-shrink:0;display:flex;align-items:center;padding:0 16px;gap:10px;border-bottom:1px solid ${t.divider};background:${t.bg};">
        <span style="flex:1;min-width:0;font-size:20px;font-weight:600;color:${t.fg};letter-spacing:-0.015em;">Resumen</span>
        <div class="btn btn-primary">${ic(I.upload, 14)} Subir albarán</div>
        <div style="width:32px;height:32px;display:flex;align-items:center;justify-content:center;color:${t.fg2};position:relative;">
          ${ic(I.bell, 17)}
          <span style="position:absolute;top:4px;right:5px;width:7px;height:7px;border-radius:50%;background:${t.neg};border:1.5px solid ${t.bg};"></span>
        </div>
      </div>

      <div style="flex:1;min-height:0;display:flex;flex-direction:column;gap:12px;padding:14px 16px 16px;overflow:hidden;">

        <div style="display:flex;align-items:center;gap:10px;flex-shrink:0;">
          ${periodNav(t, false)}
        </div>

        <div class="card" style="padding:10px 18px;display:flex;align-items:center;gap:20px;flex-shrink:0;">
          ${chip(t, { label: 'Ritmo del mes', value: '18.400 €', note: '+787 € vs. plan a día 26', tone: t.neg, wide: true, chart: bullet(t, { value: 18400, target: 17613, max: 21000, color: t.acc, width: 90, height: 11 }) })}
          ${chip(t, { label: 'Cierre previsto', value: '21.940 €', note: '+940 € sobre el tope', tone: t.neg })}
          ${chip(t, { label: 'Por revisar', value: '3.120 €', note: '4 albaranes sin confirmar', tone: t.caution })}
          ${chip(t, { label: 'Sale de caja · 7 d', value: '5.100 €', note: '2 pagos programados', tone: t.caution, last: true })}
          <div style="flex:1;min-width:12px;"></div>
          <div style="text-align:right;">
            <div class="label">Hoy hay en juego</div>
            <div class="num title-lg" style="line-height:1.15;">8.840 €</div>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 372px;gap:12px;align-items:start;min-height:0;">

          <div style="display:flex;flex-direction:column;gap:8px;min-width:0;">
            <div style="display:flex;align-items:baseline;justify-content:space-between;padding:0 2px;">
              <div>
                <span class="subtitle">Tu turno</span>
                <span class="body" style="margin-left:8px;">3 cosas, ordenadas por euros en juego</span>
              </div>
              <div class="btn btn-ghost" style="height:26px;">Ordenar por urgencia ${ic(I.updown, 12)}</div>
            </div>
            ${workCard(t, {
              icon: I.trend, kind: 'Precio', urgency: 'esta semana',
              title: 'El solomillo de Cárnicas Beltrán sube un 14 %',
              why: 'De 18,40 €/kg a 20,98 €/kg en tres albaranes seguidos.',
              eur: '3.860 €', action: 'Ver precios', color: t.neg, soft: t.negSoft, primary: true,
            })}
            ${workCard(t, {
              icon: I.fileCheck, kind: 'Revisión', urgency: 'desde hace 3 días',
              title: '4 albaranes esperan confirmación',
              why: 'Dos con líneas por debajo del umbral de confianza.',
              eur: '3.120 €', action: 'Revisar', color: t.caution, soft: t.cautionSoft, primary: false,
            })}
            ${workCard(t, {
              icon: I.clock, kind: 'Pago', urgency: 'vence en 2 días',
              title: 'Pescadería Ría de Arosa vence el 28 de agosto',
              why: 'Factura de julio, sin conciliar con el extracto.',
              eur: '1.860 €', action: 'Marcar pagada', color: t.warn, soft: t.warnSoft, primary: false,
            })}
          </div>

          <div style="display:flex;flex-direction:column;gap:10px;min-width:0;">
            <div class="card" style="padding:13px 14px 14px;">
              <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px;">
                <span class="body-strong">Categorías en riesgo</span>
                <span class="btn btn-ghost" style="height:22px;font-size:11px;padding:0 6px;">Ver todas</span>
              </div>
              <div style="display:flex;flex-direction:column;gap:10px;">${cats}</div>
            </div>

            <div class="card" style="padding:13px 14px 14px;">
              <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;">
                <span class="body-strong">Sale de caja</span>
                <span class="btn btn-ghost" style="height:22px;font-size:11px;padding:0 6px;">Ver todos ${ic(I.chevR, 11)}</span>
              </div>
              <div style="display:flex;flex-direction:column;">${payables}</div>
            </div>
          </div>

        </div>
      </div>
    </div>
  </div>`;
}

function artboard(p, mode) {
  const t = tokens(p, mode);
  const isLight = mode === 'light';
  const modeLabel = isLight ? 'Claro' : 'Oscuro';

  const swatches = [
    [t.bg, 'fondo'], [t.surface, 'superficie'], [t.fg, 'texto'], [t.acc, 'acción'],
    [t.pos, 'positivo'], [t.neg, 'negativo'], [t.warn, 'aviso'], [t.caution, 'atención'], [t.info, 'info'],
  ].map(([c, n]) => swatch(c, n, t, isLight
    ? { name: '#5d5d62', hex: '#63636a' }
    : { name: '#9d9da5', hex: '#8d8d94' })).join('');


  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Mona+Sans:wght@400;500;600;700&display=swap">
  <style>
    body { margin: 0; }
    a { color: ${t.acc}; text-decoration: none; }
    a:hover { color: ${t.acc}; }
    .mep-root {
      font-family: 'Mona Sans', system-ui, -apple-system, 'Segoe UI', sans-serif;
      -webkit-font-smoothing: antialiased;
      width: ${W}px; height: ${H}px; box-sizing: border-box;
      background: ${isLight ? '#eceae6' : '#0e0d10'};
      color: ${t.fg};
      padding: 26px 28px 24px;
      display: flex; flex-direction: column; gap: 16px;
    }
    .mep-root .num { font-variant-numeric: tabular-nums; font-feature-settings: 'tnum'; }
    .card { background: ${t.surface}; border: 1px solid ${t.border}; border-radius: 10px; box-shadow: ${SHADOW_CARD(t)}; }
    .label { font-size: 11px; font-weight: 500; letter-spacing: 0.02em; text-transform: uppercase; color: ${t.fg3}; }
    .body { font-size: 13px; color: ${t.fg2}; }
    .body-strong { font-size: 13px; color: ${t.fg}; font-weight: 500; }
    .subtitle { font-size: 16px; font-weight: 600; color: ${t.fg}; letter-spacing: -0.01em; }
    .title { font-size: 20px; font-weight: 600; color: ${t.fg}; letter-spacing: -0.015em; }
    .title-lg { font-size: 24px; font-weight: 600; color: ${t.fg}; letter-spacing: -0.02em; }
    .btn { font-size: 13px; font-weight: 500; border-radius: 6px; padding: 7px 12px; height: 32px; box-sizing: border-box;
           display: inline-flex; align-items: center; gap: 6px; border: 1px solid transparent; white-space: nowrap; }
    .btn-primary { background: ${t.acc}; color: ${t.accFg}; }
    .btn-secondary { background: ${t.surface}; color: ${t.fg}; border-color: ${t.borderStrong}; }
    .btn-ghost { background: transparent; color: ${t.fg2}; }
    .badge { font-size: 11px; font-weight: 500; padding: 2px 7px; border-radius: 4px; display: inline-flex; align-items: center; gap: 4px; line-height: 16px; }
    .period-track { display: inline-flex; align-items: center; gap: 2px; background: ${t.surface2}; border: 1px solid ${t.divider}; border-radius: 999px; padding: 3px; }
    .period-pill { font-size: 12px; line-height: 1; padding: 6px 13px; border-radius: 999px; color: ${t.fg3}; }
    .period-pill.active { background: ${t.surface}; color: ${t.fg}; font-weight: 500; box-shadow: ${SHADOW_CARD(t)}; }
  </style>
</helmet>

<div class="mep-root">

  <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:24px;flex-shrink:0;">
    <div style="display:flex;align-items:flex-start;gap:14px;min-width:0;">
      <div style="width:34px;height:34px;border-radius:8px;background:${t.acc};color:${t.accFg};display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:700;letter-spacing:-0.02em;flex-shrink:0;">${p.letter}</div>
      <div style="min-width:0;">
        <div style="display:flex;align-items:baseline;gap:10px;">
          <span style="font-size:19px;font-weight:600;letter-spacing:-0.02em;color:${isLight ? '#1a1a1a' : '#e8e8ea'};">${p.name}</span>
          <span style="font-size:12px;color:${isLight ? '#63636a' : '#8d8d94'};">${p.tag}</span>
        </div>
        <div style="font-size:12.5px;line-height:1.5;color:${isLight ? '#4d4d52' : '#a0a0a8'};max-width:78ch;margin-top:5px;text-wrap:pretty;">${p.why}</div>
        <div style="font-size:12.5px;line-height:1.5;color:${isLight ? '#63636a' : '#83838a'};max-width:78ch;margin-top:2px;text-wrap:pretty;"><span style="font-weight:600;">A cambio · </span>${p.cost}</div>
      </div>
    </div>
    <div style="display:flex;align-items:center;gap:7px;flex-shrink:0;padding-top:6px;color:${isLight ? '#63636a' : '#8d8d94'};">
      ${ic(isLight ? I.sun : I.moon, 14)}
      <span style="font-size:12px;font-weight:500;letter-spacing:0.06em;text-transform:uppercase;">${modeLabel}</span>
    </div>
  </div>

  ${desktopFrame(t, isLight)}

  <div style="flex-shrink:0;display:flex;flex-direction:column;gap:10px;padding:0 2px;">
    <div style="display:grid;grid-template-columns:repeat(9, minmax(0, 1fr));gap:10px;">
      ${swatches}
    </div>
    <div style="font-size:11px;line-height:1.45;color:${isLight ? '#5d5d62' : '#9d9da5'};">
      Los 17 colores de categoría (las barras de “Categorías en riesgo”) son una rampa aparte y no cambian entre direcciones — se re-tonarían después, sobre la elegida.
    </div>
  </div>

</div>
</x-dc>
<script data-dc-script data-props='{"$preview":{"width":${W},"height":${H}}}'>
class Component extends DCLogic {}
</script>
</body>
</html>
`;
}

const mobileFrame = mobileFrameFactory({ ic, I, periodNav, SHADOW_CARD });

const TINTA = palettes.find((p) => p.key === 'Tinta');

const SPEC = {
  light: [
    ['acento', '#17171A'], ['acento · texto', '#FFFFFF'], ['fondo', '#F1F0EE'],
    ['superficie', '#FFFFFF'], ['superficie-2', '#F8F7F5'], ['texto', '#17171A'],
    ['texto-2', '#46464A'], ['texto-3', '#5B5B60'], ['texto-4', '#6B6B70'],
  ],
  dark: [
    ['acento', '#EDECEA'], ['acento · texto', '#17171A'], ['fondo', '#131314'],
    ['superficie', '#1B1B1D'], ['superficie-2', '#222224'], ['texto', '#EDECEA'],
    ['texto-2', '#A5A5AA'], ['texto-3', '#8D8D93'], ['texto-4', '#78787E'],
  ],
};

const SEMANTIC = {
  light: [['positivo', '#14694A'], ['negativo', '#B03A3A'], ['aviso', '#A85300'], ['atención', '#7F6B00'], ['info', '#2A5FB5']],
  dark:  [['positivo', '#4CAE7D'], ['negativo', '#E16B6B'], ['aviso', '#E8934A'], ['atención', '#EFC233'], ['info', '#5F8EE0']],
};

function deliverable(mode, viewport) {
  const t = tokens(TINTA, mode);
  const isLight = mode === 'light';
  const isDesktop = viewport === 'desktop';
  const W = isDesktop ? 1420 : 500;
  const H = isDesktop ? 890 : 1210;
  const chrome = isLight ? { name: '#5d5d62', hex: '#63636a', fg: '#1a1a1a', sub: '#4d4d52' }
                         : { name: '#9d9da5', hex: '#8d8d94', fg: '#e8e8ea', sub: '#a0a0a8' };

  const ramp = [...SPEC[mode], ...SEMANTIC[mode]];
  const cols = isDesktop ? 14 : 5;
  const swatches = ramp.slice(0, isDesktop ? 14 : 10).map(([n, c]) => `
        <div style="display:flex;flex-direction:column;gap:5px;min-width:0;">
          <div style="height:${isDesktop ? 34 : 30}px;border-radius:6px;background:${c};border:1px solid ${t.borderStrong};"></div>
          <span style="font-size:10px;letter-spacing:0.02em;color:${chrome.name};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${n}</span>
          <span class="num" style="font-size:9.5px;color:${chrome.hex};">${c}</span>
        </div>`).join('');

  return `${HEAD}
<helmet>
${FONT_LINKS}
  <style>${styleBlock(t, isLight)}
    .mep-root { width: ${W}px; height: ${H}px; padding: 26px 28px 24px; gap: 16px; }
  </style>
</helmet>

<div class="mep-root">

  <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:24px;flex-shrink:0;">
    <div style="display:flex;align-items:flex-start;gap:14px;min-width:0;">
      <div style="width:34px;height:34px;border-radius:8px;background:${t.acc};color:${t.accFg};display:flex;align-items:center;justify-content:center;flex-shrink:0;">
        <svg width="19" height="19" viewBox="0 0 24 24">
          <rect x="2.5" y="3.5" width="3" height="17" rx="1.5" fill="currentColor"></rect>
          <rect x="10.5" y="3.5" width="3" height="13" rx="1.5" fill="currentColor"></rect>
          <rect x="18.5" y="3.5" width="3" height="9" rx="1.5" fill="currentColor"></rect>
        </svg>
      </div>
      <div style="min-width:0;">
        <div style="display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;">
          <span style="font-size:19px;font-weight:600;letter-spacing:-0.02em;color:${chrome.fg};">Tinta</span>
          <span style="font-size:12px;color:${chrome.name};">${isDesktop ? 'Escritorio · 1440' : 'Móvil · 390'}</span>
        </div>
        <div style="font-size:12.5px;line-height:1.5;color:${chrome.sub};max-width:${isDesktop ? '90ch' : '44ch'};margin-top:5px;text-wrap:pretty;">
          El acento es la tinta. Ningún tono es de marca, así que todo lo que tiene color en pantalla significa algo.
        </div>
      </div>
    </div>
    <div style="display:flex;align-items:center;gap:7px;flex-shrink:0;padding-top:6px;color:${chrome.name};">
      ${ic(isLight ? I.sun : I.moon, 14)}
      <span style="font-size:12px;font-weight:500;letter-spacing:0.06em;text-transform:uppercase;">${isLight ? 'Claro' : 'Oscuro'}</span>
    </div>
  </div>

  ${isDesktop ? desktopFrame(t, isLight) : `
  <div style="flex:1;min-height:0;display:flex;align-items:flex-start;justify-content:center;">
    <div style="border-radius:12px;border:1px solid ${isLight ? 'rgba(15,20,30,0.14)' : 'rgba(255,255,255,0.10)'};overflow:hidden;display:flex;">
      ${mobileFrame(t, isLight)}
    </div>
  </div>`}

  <div style="flex-shrink:0;display:flex;flex-direction:column;gap:10px;padding:0 2px;">
    <div style="display:grid;grid-template-columns:repeat(${cols}, minmax(0, 1fr));gap:${isDesktop ? 10 : 8}px;">
      ${swatches}
    </div>
    <div style="font-size:11px;line-height:1.45;color:${chrome.name};">
      ${isDesktop
        ? 'Los 17 colores de categoría y las 6 series de gráfico son rampas aparte, sin cambios. ADR-027.'
        : 'La pantalla continúa por debajo del recorte. ADR-027.'}
    </div>
  </div>

</div>
${TAIL(W, H)}`;
}

// --- emit -------------------------------------------------------------------
const GAP_X = 96, GAP_Y = 130;

const deliverables = [
  { file: 'Main.dc.html', title: 'Tinta · Escritorio · Claro', mode: 'light', viewport: 'desktop', x: 0, y: 0, w: 1420, h: 890 },
  { file: 'MovilClaro.dc.html', title: 'Tinta · Móvil · Claro', mode: 'light', viewport: 'mobile', x: 1420 + GAP_X, y: 0, w: 500, h: 1210 },
  { file: 'EscritorioOscuro.dc.html', title: 'Tinta · Escritorio · Oscuro', mode: 'dark', viewport: 'desktop', x: 0, y: 1210 + GAP_Y, w: 1420, h: 890 },
  { file: 'MovilOscuro.dc.html', title: 'Tinta · Móvil · Oscuro', mode: 'dark', viewport: 'mobile', x: 1420 + GAP_X, y: 1210 + GAP_Y, w: 500, h: 1210 },
];

const artboards = [];
for (const d of deliverables) {
  writeFileSync(new URL(d.file, import.meta.url), deliverable(d.mode, d.viewport));
  artboards.push({ file: d.file, title: d.title, x: d.x, y: d.y, w: d.w, h: d.h, page: 'page-1' });
}

// the four directions that were not chosen, kept as the record of the decision
const REJECTED = palettes.filter((p) => p.key !== 'Tinta');
REJECTED.forEach((p, i) => {
  ['light', 'dark'].forEach((mode, row) => {
    const file = `${p.key}${mode === 'light' ? 'Claro' : 'Oscuro'}.dc.html`;
    writeFileSync(new URL(file, import.meta.url), artboard(p, mode));
    artboards.push({
      file,
      title: `${p.letter} · ${p.name} · ${mode === 'light' ? 'Claro' : 'Oscuro'}`,
      x: i * (W + GAP_X),
      y: row * (H + GAP_Y),
      w: W, h: H,
      page: 'page-2',
    });
  });
});

const canvas = {
  artboards,
  pages: [
    { id: 'page-1', name: 'Tinta' },
    { id: 'page-2', name: 'Direcciones descartadas' },
  ],
  annotations: [
    {
      id: 'tinta-decision',
      page: 'page-1', x: 0, y: -300, w: 700,
      text: 'Tinta es la dirección elegida y ya está en el código: tokens de src/app.css, data-accent="tinta" en todas las rutas, chrome del PWA y plantillas de correo.\n\nEl acento es la tinta — negro sobre papel, blanco sobre tinta. Ningún tono lleva la marca, así que el color en pantalla siempre significa algo: severidad, categoría o serie.',
    },
    {
      id: 'tinta-coste',
      page: 'page-1', x: 760, y: -300, w: 620,
      text: 'Lo que cuesta, escrito en ADR-027:\n\n· El sistema pierde la salida de emergencia. Ya no hay un “ponlo del color de marca” para destacar algo sin significado; el énfasis tiene que salir del peso, el tamaño o la posición.\n· La app no tiene personalidad de color. La lleva Mona Sans, la densidad y el espaciado.\n· En oscuro el botón primario es un rectángulo blanco: es lo más brillante de la pantalla. Conviene tener pocos primarios por vista.',
    },
    {
      id: 'descartadas',
      page: 'page-2', x: 0, y: -300, w: 900,
      text: 'Las cuatro direcciones que no se eligieron, con el motivo y el coste que se les escribió en su momento. Se conservan como registro de la decisión — el argumento completo está en docs/06_decisions/experience/ADR-027-ink-is-the-accent.md.\n\nD · Azafrán no aparece: se retiró antes de la elección porque su fondo cálido y su acento marrón la hacían un segundo ajuste de B · Cocina, no una alternativa real.',
    },
  ],
  launch: { view: 'canvas', page: 'page-1' },
};
writeFileSync(new URL('canvas.json', import.meta.url), JSON.stringify(canvas, null, 2));
console.log('wrote', artboards.length, 'artboards');
