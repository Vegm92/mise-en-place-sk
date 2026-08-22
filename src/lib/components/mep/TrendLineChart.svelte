<script lang="ts">
  type LineSeries = { key: string; label: string; color: string; values: number[] };

  const gid = `tlc${Math.random().toString(36).slice(2, 8)}`;

  let {
    xLabels,
    series,
    valueFormatter = (v: number) => String(v),
    emptyLabel = '—',
    height = 180,
  }: {
    xLabels: string[];
    series: LineSeries[];
    valueFormatter?: (v: number) => string;
    emptyLabel?: string;
    height?: number;
  } = $props();

  const PAD_TOP = 10;
  const PAD_BOTTOM = 20;
  const plotHeight = $derived(height - PAD_TOP - PAD_BOTTOM);

  const hasAnyData = $derived(series.some(s => s.values.some(v => v > 0)));
  const maxValue = $derived(Math.max(1, ...series.flatMap(s => s.values)));

  // Fills the card's full width (the plot line/area must occupy the space
  // the grid gives it, not float at a fixed narrow width) -- only widens
  // past the container, triggering horizontal scroll, once buckets would
  // otherwise be packed closer than MIN_STEP.
  const MIN_STEP = 28;
  let containerWidth = $state(400);
  const stepX = $derived(xLabels.length > 1 ? Math.max(MIN_STEP, (containerWidth - 24) / (xLabels.length - 1)) : containerWidth);
  const width = $derived(Math.max(containerWidth, (xLabels.length - 1) * stepX + 24));

  function yFor(v: number): number {
    return PAD_TOP + plotHeight - (v / maxValue) * plotHeight;
  }
  function xFor(i: number): number {
    return 12 + i * stepX;
  }
  function pointsFor(values: number[]): string {
    return values.map((v, i) => `${xFor(i).toFixed(1)},${yFor(v).toFixed(1)}`).join(' ');
  }
  function fillPointsFor(values: number[]): string {
    if (values.length === 0) return '';
    const base = yFor(0);
    return `${xFor(0).toFixed(1)},${base} ${pointsFor(values)} ${xFor(values.length - 1).toFixed(1)},${base}`;
  }

  let hovered = $state<number | null>(null);

  // Sparse x-axis labels so they don't collide when there are many buckets.
  const labelEvery = $derived(Math.max(1, Math.ceil((xLabels.length * 30) / width)));
</script>

{#if xLabels.length === 0}
  <div style="display:flex;align-items:center;justify-content:center;height:{height}px;">
    <span class="body" style="font-size:12px;color:var(--mep-fg-3);">{emptyLabel}</span>
  </div>
{:else}
  <div class="no-scrollbar" style="overflow-x:auto;position:relative;" bind:clientWidth={containerWidth}>
    <svg {width} {height} viewBox="0 0 {width} {height}" style="display:block;overflow:visible;">
      <defs>
        {#each series as s, i (s.key)}
          <linearGradient id="{gid}-{i}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color={s.color} stop-opacity="0.35" />
            <stop offset="100%" stop-color={s.color} stop-opacity="0.02" />
          </linearGradient>
        {/each}
      </defs>

      <!-- baseline -->
      <line x1="0" y1={yFor(0)} x2={width} y2={yFor(0)} stroke="var(--mep-divider)" stroke-width="1" />

      {#if hovered !== null}
        <line x1={xFor(hovered)} y1={PAD_TOP} x2={xFor(hovered)} y2={PAD_TOP + plotHeight}
          stroke="var(--mep-border-strong)" stroke-width="1" stroke-dasharray="2 2" />
      {/if}

      {#each series as s, i (s.key)}
        <polygon points={fillPointsFor(s.values)} fill="url(#{gid}-{i})" opacity={hasAnyData ? 1 : 0.35} />
      {/each}
      {#each series as s (s.key)}
        <polyline points={pointsFor(s.values)} fill="none" stroke={s.color} stroke-width="2"
          stroke-linecap="round" stroke-linejoin="round" opacity={hasAnyData ? 1 : 0.35} />
        {#each s.values as v, i}
          <circle cx={xFor(i)} cy={yFor(v)} r={hovered === i ? 3.5 : 2.5} fill={s.color} opacity={hasAnyData ? 1 : 0.35} />
        {/each}
      {/each}

      {#each xLabels as label, i}
        {#if i % labelEvery === 0}
          <text x={xFor(i)} y={height - 4} text-anchor="middle" font-size="9" fill="var(--mep-fg-3)">{label}</text>
        {/if}
      {/each}

      {#each xLabels as _, i}
        <rect x={xFor(i) - stepX / 2} y="0" width={stepX} {height} fill="transparent" pointer-events="all"
          onmouseenter={() => hovered = i} onmouseleave={() => hovered = null} role="presentation" />
      {/each}
    </svg>

    {#if hovered !== null}
      <div style="
        position:absolute; left:{xFor(hovered)}px; top:0; transform:translateX(-50%);
        background:var(--mep-overlay); border:1px solid var(--mep-border); border-radius:var(--mep-r-tag);
        box-shadow:var(--mep-shadow-pop); padding:6px 8px; font-size:11px; white-space:nowrap;
        pointer-events:none; z-index:1;
      ">
        <div style="font-weight:500;color:var(--mep-fg-3);margin-bottom:3px;">{xLabels[hovered]}</div>
        {#each series as s (s.key)}
          <div style="display:flex;align-items:center;gap:5px;">
            <span style="width:7px;height:7px;border-radius:2px;background:{s.color};flex-shrink:0;"></span>
            <span style="color:var(--mep-fg-2);">{s.label}:</span>
            <span class="num" style="color:var(--mep-fg);font-weight:500;">{valueFormatter(s.values[hovered])}</span>
          </div>
        {/each}
      </div>
    {/if}

    {#if !hasAnyData}
      <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;">
        <span class="body" style="font-size:12px;color:var(--mep-fg-3);background:var(--mep-surface);padding:2px 8px;border-radius:var(--mep-r-tag);">{emptyLabel}</span>
      </div>
    {/if}
  </div>
{/if}
