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
    { label: 'Carnes y Derivados', color: 'var(--mep-cat-carnes-y-derivados)', pct: 0.42 },
    { label: 'Pescados y Mariscos', color: 'var(--mep-cat-pescados-y-mariscos)', pct: 0.30 },
    { label: 'Lácteos', color: 'var(--mep-cat-lacteos)', pct: 0.28 },
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
    { name: 'Cárnicas Aranda', color: 'var(--mep-cat-carnes-y-derivados)', pct: 82, amount: '1.612 €' },
    { name: 'Pescados Turró', color: 'var(--mep-cat-pescados-y-mariscos)', pct: 58, amount: '1.140 €' },
    { name: 'Lácteos Vega', color: 'var(--mep-cat-lacteos)', pct: 34, amount: '660 €' },
  ];
</script>

<div class="relative rounded-[14px] overflow-hidden border border-divider bg-surface"
     style="box-shadow:0 30px 70px -20px rgba(0,0,0,0.35),0 10px 24px -8px rgba(0,0,0,0.16);">
  <div class="p-[18px] flex flex-col gap-2.5 bg-bg">
    <div class="app-kpis">
      {#each kpis as kpi}
        <div class="card p-[10px] flex flex-col gap-[5px]">
          <span class="text-[9px] font-medium tracking-[0.02em] uppercase text-fg-3">
            {kpi.label}
          </span>
          <span class="text-[17.5px] font-semibold tracking-[-0.3px] text-fg">
            {kpi.value}
          </span>
          {#if kpi.delta}
            <span class="text-[10.5px] font-semibold" class:text-pos={kpi.pos} class:text-neg={!kpi.pos}>
              {kpi.delta}
            </span>
          {:else}
            <span class="text-[10.5px] text-fg-3">{kpi.sub}</span>
          {/if}
        </div>
      {/each}
    </div>

    <div class="app-main">
      <div class="card p-3">
        <div class="text-[11px] font-medium text-fg-3 mb-2">
          {copy.mockChartTitle}
        </div>
        <svg viewBox="0 0 260 90" width="100%" style="display:block;overflow:visible;">
          {#each miniChartBars as b, bi}
            <rect x={bi * 36 + 6} y={90 - b} width="22" height={b} rx="3"
              fill={bi === miniChartBars.length - 1 ? 'var(--mep-acc)' : 'var(--mep-acc-soft)'} />
          {/each}
        </svg>
      </div>
      <div class="card p-3 flex flex-col items-center justify-center gap-2">
        <svg width="64" height="64" viewBox="0 0 64 64" style="transform:rotate(-90deg);flex-shrink:0;">
          {#each miniDonut as seg}
            <circle cx="32" cy="32" r={miniDonutR} fill="none" stroke={seg.color} stroke-width="9"
              stroke-dasharray="{seg.dash} {miniDonutCirc - seg.dash}" stroke-dashoffset={-seg.offset} />
          {/each}
        </svg>
        <div class="flex flex-col gap-[3px] w-full">
          {#each miniDonut as seg}
            <div class="flex items-center gap-[5px]">
              <span class="w-1.5 h-1.5 rounded-sm shrink-0" style="background:{seg.color};"></span>
              <span class="text-[9px] text-fg-3 overflow-hidden text-ellipsis whitespace-nowrap">
                {seg.label}
              </span>
            </div>
          {/each}
        </div>
      </div>
    </div>

    <div class="card px-3 py-[10px] flex flex-col gap-[7px]">
      {#each miniSuppliers as s}
        <div class="flex items-center gap-2">
          <span class="w-1.5 h-1.5 rounded-sm shrink-0" style="background:{s.color};"></span>
          <span class="text-[10.5px] text-fg-2 flex-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
            {s.name}
          </span>
          <div class="w-[70px] h-1 rounded-sm bg-divider overflow-hidden shrink-0">
            <div style="width:{s.pct}%;height:100%;background:{s.color};"></div>
          </div>
          <span class="text-[10px] text-fg-3 w-11 text-right shrink-0">
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
