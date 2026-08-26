<script lang="ts">
  import type { PacePoint } from '$lib/dashboard-turno';

  let {
    points,
    budget,
    todayDay,
    budgetLabel,
    forecastLabel,
    forecastValueLabel,
    ariaLabel,
    width = 344,
    height = 148,
  }: {
    points: PacePoint[];
    budget: number;
    todayDay: number;
    budgetLabel: string;
    forecastLabel: string;
    forecastValueLabel: string;
    ariaLabel: string;
    width?: number;
    height?: number;
  } = $props();

  const padL = 40, padR = 72, padT = 12, padB = 20;
  const iw = $derived(Math.max(1, width - padL - padR));
  const ih = $derived(Math.max(1, height - padT - padB));
  const days = $derived(Math.max(points.length, 2));

  const maxY = $derived.by(() => {
    const vals = points.flatMap((p) => [p.actual, p.plan, p.forecast].filter((v): v is number => v != null));
    return Math.max(budget * 1.06, ...vals.map((v) => v * 1.06), 1);
  });

  const x = $derived((d: number) => padL + ((d - 1) / (days - 1)) * iw);
  const y = $derived((v: number) => padT + ih - (v / maxY) * ih);

  function path(pts: Array<[number, number]>): string {
    return pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  }

  const actualPath = $derived(path(points.filter((p) => p.actual != null).map((p) => [x(p.day), y(p.actual!)])));
  const planPath = $derived(path(points.filter((p) => p.plan != null).map((p) => [x(p.day), y(p.plan!)])));
  const forecastPath = $derived(path(points.filter((p) => p.forecast != null).map((p) => [x(p.day), y(p.forecast!)])));

  const lastActual = $derived(points.filter((p) => p.actual != null).at(-1) ?? null);
  const lastForecast = $derived(points.filter((p) => p.forecast != null).at(-1) ?? null);
  const yBudget = $derived(y(budget));
  const ticks = $derived([1, Math.round(days / 4), Math.round(days / 2), Math.round((days * 3) / 4), days]);
</script>

<svg {width} {height} style="display:block;overflow:visible;" role="img" aria-label={ariaLabel}>
  {#each [0, 0.5, 1] as f}
    <line x1={padL} x2={padL + iw} y1={padT + ih * (1 - f)} y2={padT + ih * (1 - f)} stroke="var(--mep-divider)" stroke-width="1" />
    <text x={padL - 6} y={padT + ih * (1 - f) + 3.5} text-anchor="end" font-size="9.5" fill="var(--mep-fg-3)" class="num">
      {Math.round((maxY * f) / 1000)}k
    </text>
  {/each}

  {#each ticks as d}
    <text x={x(d)} y={height - 5} text-anchor="middle" font-size="9.5" fill="var(--mep-fg-3)" class="num">{d}</text>
  {/each}

  {#if budget > 0}
    <line x1={padL} x2={padL + iw} y1={yBudget} y2={yBudget} stroke="var(--mep-neg)" stroke-width="1.25" stroke-dasharray="2 3" opacity="0.85" />
    <text x={padL + 3} y={yBudget - 5} font-size="9.5" fill="var(--mep-neg)" class="num">{budgetLabel}</text>
    <path d={planPath} fill="none" stroke="var(--mep-fg-3)" stroke-width="1.25" stroke-dasharray="4 3" />
  {/if}

  {#if forecastPath}
    <path d={forecastPath} fill="none" stroke="var(--mep-acc)" stroke-width="1.6" stroke-dasharray="5 3" opacity="0.85" />
  {/if}

  <path d={actualPath} fill="none" stroke="var(--mep-acc)" stroke-width="2.1" stroke-linejoin="round" />

  {#if lastForecast?.forecast != null}
    <text x={padL + iw + 6} y={y(lastForecast.forecast) - 3} font-size="10" fill="var(--mep-acc)" class="num" style="font-weight:600;">
      {forecastValueLabel}
    </text>
    <text x={padL + iw + 6} y={y(lastForecast.forecast) + 9} font-size="9.5" fill="var(--mep-fg-3)">{forecastLabel}</text>
  {/if}

  {#if lastActual?.actual != null}
    <line x1={x(todayDay)} x2={x(todayDay)} y1={padT} y2={padT + ih} stroke="var(--mep-border-strong)" stroke-width="1" />
    <circle cx={x(todayDay)} cy={y(lastActual.actual)} r="3.2" fill="var(--mep-acc)" stroke="var(--mep-surface)" stroke-width="1.5" />
  {/if}
</svg>
