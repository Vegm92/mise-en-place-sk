<script lang="ts">
  let {
    copy,
  }: {
    copy: {
      mockKpiSpend: string;
      mockKpiAvg: string;
      mockKpiPending: string;
      mockKpiBudget: string;
      mockKpiOf: string;
      mockKpiInvoicesShort: string;
      mockChartTitle: string;
    };
  } = $props();

  const kpis = $derived([
    { label: copy.mockKpiSpend, value: '3.842 €', delta: '-8 %', pos: true },
    { label: copy.mockKpiAvg, value: '480 €', delta: '+2 %', pos: false },
    { label: copy.mockKpiPending, value: '612 €', sub: '3 ' + copy.mockKpiInvoicesShort },
    { label: copy.mockKpiBudget, value: '68 %', sub: copy.mockKpiOf + ' 5.600 €' },
  ]);

  const miniChartBars = [26, 34, 30, 44, 40, 54, 68];
  const miniDonutR = 26;
  const miniDonutCirc = 2 * Math.PI * miniDonutR;
  const miniDonutRaw = [
    { label: 'Carnes y Derivados', color: '#8B3530', pct: 0.42 },
    { label: 'Pescados y Mariscos', color: '#2C5F8A', pct: 0.30 },
    { label: 'Lácteos', color: '#C9A227', pct: 0.28 },
  ];
  const miniDonut = (() => {
    let cursor = 0;
    return miniDonutRaw.map(s => {
      const dash = s.pct * miniDonutCirc;
      const seg = { ...s, dash, offset: cursor };
      cursor += dash;
      return seg;
    });
  })();
  const miniSuppliers = [
    { name: 'Cárnicas Aranda', color: '#8B3530', pct: 82, amount: '1.612 €' },
    { name: 'Pescados Turró', color: '#2C5F8A', pct: 58, amount: '1.140 €' },
    { name: 'Lácteos Vega', color: '#C9A227', pct: 34, amount: '660 €' },
  ];
</script>

<div style="position:relative;border-radius:14px;overflow:hidden;border:1px solid var(--mep-divider);
            box-shadow:0 30px 70px -20px rgba(0,0,0,0.35),0 10px 24px -8px rgba(0,0,0,0.16);
            background:var(--mep-surface);">
  <div style="padding:18px;display:flex;flex-direction:column;gap:10px;background:var(--mep-bg);">
    <div class="app-kpis">
      {#each kpis as kpi}
        <div class="card" style="padding:10px;display:flex;flex-direction:column;gap:5px;">
          <span style="font-size:9px;font-weight:500;letter-spacing:0.02em;text-transform:uppercase;color:var(--mep-fg-3);">
            {kpi.label}
          </span>
          <span style="font-size:17.5px;font-weight:600;letter-spacing:-0.3px;color:var(--mep-fg);">
            {kpi.value}
          </span>
          {#if kpi.delta}
            <span style="font-size:10.5px;font-weight:600;color:{kpi.pos ? 'var(--mep-pos)' : 'var(--mep-neg)'};">
              {kpi.delta}
            </span>
          {:else}
            <span style="font-size:10.5px;color:var(--mep-fg-3);">{kpi.sub}</span>
          {/if}
        </div>
      {/each}
    </div>

    <div class="app-main">
      <div class="card" style="padding:12px;">
        <div style="font-size:11px;font-weight:500;color:var(--mep-fg-3);margin-bottom:8px;">
          {copy.mockChartTitle}
        </div>
        <svg viewBox="0 0 260 90" width="100%" style="display:block;overflow:visible;">
          {#each miniChartBars as b, bi}
            <rect x={bi * 36 + 6} y={90 - b} width="22" height={b} rx="3"
              fill={bi === miniChartBars.length - 1 ? 'var(--mep-acc)' : 'var(--mep-acc-soft)'} />
          {/each}
        </svg>
      </div>
      <div class="card" style="padding:12px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;">
        <svg width="64" height="64" viewBox="0 0 64 64" style="transform:rotate(-90deg);flex-shrink:0;">
          {#each miniDonut as seg}
            <circle cx="32" cy="32" r={miniDonutR} fill="none" stroke={seg.color} stroke-width="9"
              stroke-dasharray="{seg.dash} {miniDonutCirc - seg.dash}" stroke-dashoffset={-seg.offset} />
          {/each}
        </svg>
        <div style="display:flex;flex-direction:column;gap:3px;width:100%;">
          {#each miniDonut as seg}
            <div style="display:flex;align-items:center;gap:5px;">
              <span style="width:6px;height:6px;border-radius:2px;background:{seg.color};flex-shrink:0;"></span>
              <span style="font-size:9px;color:var(--mep-fg-3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                {seg.label}
              </span>
            </div>
          {/each}
        </div>
      </div>
    </div>

    <div class="card" style="padding:10px 12px;display:flex;flex-direction:column;gap:7px;">
      {#each miniSuppliers as s}
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="width:6px;height:6px;border-radius:2px;background:{s.color};flex-shrink:0;"></span>
          <span style="font-size:10.5px;color:var(--mep-fg-2);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
            {s.name}
          </span>
          <div style="width:70px;height:4px;border-radius:2px;background:var(--mep-divider);overflow:hidden;flex-shrink:0;">
            <div style="width:{s.pct}%;height:100%;background:{s.color};"></div>
          </div>
          <span style="font-size:10px;color:var(--mep-fg-3);width:44px;text-align:right;flex-shrink:0;">
            {s.amount}
          </span>
        </div>
      {/each}
    </div>
  </div>
</div>

<style>
  .app-kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
  .app-main { display: grid; grid-template-columns: 2fr 1fr; gap: 8px; }

  @media (max-width: 480px) {
    .app-kpis { grid-template-columns: repeat(2, 1fr); }
    .app-main { grid-template-columns: 1fr; }
  }
</style>
