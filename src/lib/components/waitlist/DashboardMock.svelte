<script lang="ts">
  import { scrollReveal, stagger, revealAfter, easeOutCubic } from '$lib/waitlist/reveal';

  let {
    copy,
  }: {
    copy: {
      mockSpendLabel: string;
      mockCatMeat: string;
      mockCatFish: string;
      mockCatVeg: string;
      mockAlertTitle: string;
      mockReview: string;
    };
  } = $props();

  function fmtEUR(n: number): string {
    return n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
  }

  const rawWeeks = [
    { l: 'S15', a: 22, b: 18, c: 14, hi: false },
    { l: 'S16', a: 26, b: 16, c: 18, hi: false },
    { l: 'S17', a: 24, b: 20, c: 16, hi: false },
    { l: 'S18', a: 30, b: 22, c: 14, hi: false },
    { l: 'S19', a: 28, b: 24, c: 18, hi: false },
    { l: 'S20', a: 36, b: 22, c: 22, hi: false },
    { l: 'S21', a: 38, b: 28, c: 20, hi: true  },
  ];

  const CH = 130, CPT = 14, CPB = 22, CVW = 400, padL = 28;
  const CAW = CVW - padL - 10;
  const CCW = CAW / rawWeeks.length;
  const CBW = 22;
  const CMT = Math.max(...rawWeeks.map(w => w.a + w.b + w.c));

  const chartWeeks = rawWeeks.map((w, i) => {
    const cx = padL + CCW * i + CCW / 2 - CBW / 2;
    let sy = CPT + CH;
    const segs = [
      { v: w.a, fill: 'var(--mep-cat-carnes-y-derivados)' },
      { v: w.b, fill: 'var(--mep-cat-pescados-y-mariscos)' },
      { v: w.c, fill: 'var(--mep-cat-frutas-y-verduras)' },
    ].map(s => {
      const h = (s.v / CMT) * CH;
      sy -= h;
      return { x: cx, y: sy, w: CBW, h: Math.max(h, 0.5), fill: s.fill };
    });
    return { l: w.l, hi: w.hi, segs, lx: cx + CBW / 2, ly: CPT + CH + CPB - 8, topY: sy, total: w.a + w.b + w.c };
  });
  const svgH = CH + CPT + CPB;

  let progress = $state(0);
  const badgeP = $derived(revealAfter(progress, 0.7));
  const alertP = $derived(revealAfter(progress, 0.85));
</script>

<div class="card" style="padding:16px;display:flex;flex-direction:column;gap:12px;"
  use:scrollReveal={(p: number) => progress = p}>
  <div style="display:flex;align-items:center;justify-content:space-between;">
    <div>
      <div style="font-size:11.5px;color:var(--mep-fg-3);text-transform:uppercase;
                  letter-spacing:0.08em;font-weight:500;font-family:var(--mep-fs-mono);">
        {copy.mockSpendLabel}
      </div>
      <div style="display:flex;align-items:baseline;gap:6px;margin-top:4px;">
        <span style="font-size:24px;font-weight:700;color:var(--mep-fg);
                     letter-spacing:-0.4px;font-family:var(--mep-fs-mono);">
          {fmtEUR(3842.15 * easeOutCubic(progress))}
        </span>
        <span style="font-size:12px;color:var(--mep-pos);font-weight:600;
                     display:inline-flex;align-items:center;gap:2px;
                     opacity:{badgeP};transition:opacity 150ms linear;">
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M5 8V2M2 5l3-3 3 3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
          12,4 %
        </span>
      </div>
    </div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;">
      {#each [{ k:copy.mockCatMeat, c:'var(--mep-cat-carnes-y-derivados)' }, { k:copy.mockCatFish, c:'var(--mep-cat-pescados-y-mariscos)' }, { k:copy.mockCatVeg, c:'var(--mep-cat-frutas-y-verduras)' }] as cat}
        <div style="display:flex;align-items:center;gap:4px;">
          <span style="width:8px;height:8px;border-radius:2px;background:{cat.c};flex-shrink:0;"></span>
          <span style="font-size:11px;color:var(--mep-fg-3);">{cat.k}</span>
        </div>
      {/each}
    </div>
  </div>
  <svg viewBox="0 0 {CVW} {svgH}" width="100%" style="display:block;overflow:visible;">
    {#each [0, 0.5, 1] as p}
      <line x1={padL} x2={CVW - 10} y1={CPT + CH * (1 - p)} y2={CPT + CH * (1 - p)}
            stroke="var(--mep-divider)" stroke-width="1"/>
    {/each}
    {#each chartWeeks as wk, wi}
      {@const barP = stagger(progress, wi, chartWeeks.length)}
      <g style="opacity:{!wk.hi ? 0.45 : 1};">
        {#each wk.segs as seg}
          <rect x={seg.x} y={seg.y} width={seg.w} height={seg.h} fill={seg.fill}
                style="transform-box:fill-box;transform-origin:bottom;transform:scaleY({barP});
                       transition:transform 120ms linear;"/>
        {/each}
        <text x={wk.lx} y={wk.ly} text-anchor="middle" font-size="9.5"
              fill="var(--mep-fg-3)" font-family="var(--mep-fs-mono)">{wk.l}</text>
        {#if wk.hi}
          <text x={wk.lx} y={wk.topY - 4} text-anchor="middle" font-size="9.5"
                font-weight="700" fill="var(--mep-fg)" font-family="var(--mep-fs-mono)"
                style="opacity:{barP};transition:opacity 120ms linear;">
            {((wk.total / 10) + 0.86).toFixed(2).replace('.', ',')} k
          </text>
        {/if}
      </g>
    {/each}
  </svg>
  <div style="display:flex;align-items:center;gap:10px;padding:9px 12px;
              border-radius:8px;background:var(--mep-warn-soft);
              opacity:{alertP};transform:translateY({(1 - alertP) * 6}px);
              transition:opacity 150ms linear,transform 150ms linear;">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style="color:var(--mep-warn);flex-shrink:0;">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      <line x1="12" y1="9" x2="12" y2="13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      <line x1="12" y1="17" x2="12.01" y2="17" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    </svg>
    <div style="flex:1;min-width:0;">
      <div style="font-size:12.5px;color:var(--mep-fg);font-weight:600;">{copy.mockAlertTitle}</div>
      <div style="font-size:11.5px;color:var(--mep-fg-3);font-family:var(--mep-fs-mono);">
        Aceites Gómez Hermanos · 4,80 € → 5,19 € / L
      </div>
    </div>
    <span style="font-size:11px;font-weight:600;color:var(--mep-warn);
                 text-transform:uppercase;letter-spacing:0.06em;font-family:var(--mep-fs-mono);">
      {copy.mockReview}
    </span>
  </div>
</div>
