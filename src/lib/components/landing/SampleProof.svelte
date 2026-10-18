<script lang="ts">
  import TrendingUp from '@lucide/svelte/icons/trending-up';
  import { getLocale, getT, getTi } from '$lib/i18n-context';
  import { fmtDateShort, fmtEur } from '$lib/formatters';
  import { formatPct } from '$lib/savings-calculator';
  import { SAMPLE_ALERT_THRESHOLD, SAMPLE_DELIVERIES, sampleChart, type SampleAlert } from '$lib/landing-sample';

  let { alert }: { alert: SampleAlert | null } = $props();

  const locale = getLocale();
  const t = getT();
  const ti = getTi();

  const chart = sampleChart(SAMPLE_DELIVERIES, 'A');
  const supplierName = (id: 'A' | 'B') => t(`waitlist.proof.supplier${id}`);
  const eur = (n: number) => fmtEur(n, locale.current);
  const lastOf = (id: 'A' | 'B') => chart.points.filter((p) => p.delivery.supplier === id).at(-1);
  const endA = lastOf('A');
  const endB = lastOf('B');

  const summary = $derived(alert
    ? ti('waitlist.proof.chartSummary', {
        supplierA: supplierName('A'),
        supplierB: supplierName('B'),
        from: eur(alert.referencePrice),
        to: eur(alert.latestPrice),
        date: fmtDateShort(alert.lastDate, locale.current),
        alt: eur(alert.alternative?.price ?? alert.latestPrice),
      })
    : t('waitlist.proof.chartTitle'));
</script>

<div class="card flex flex-col gap-4 p-4 sm:p-5">
  <div class="flex flex-wrap items-center justify-between gap-2">
    <span class="rounded-tag border border-dashed border-border-strong px-2 py-0.5 text-[11.5px] font-semibold uppercase tracking-[0.06em] text-fg-2 font-mono">{t('waitlist.proof.badge')}</span>
    <span class="text-[12.5px] text-fg-3">{ti('waitlist.proof.threshold', { pct: formatPct(SAMPLE_ALERT_THRESHOLD, locale.current) })}</span>
  </div>

  {#if alert}
    <div class="rounded-card border border-neg bg-surface p-4">
      <div class="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-neg font-mono">
        <TrendingUp size={14} aria-hidden="true" />
        <span>{t('waitlist.proof.alertTag')} · {formatPct(alert.deviationPct / 100, locale.current)}</span>
      </div>
      <div class="mt-2 text-[17px] font-semibold tracking-[-0.01em] text-fg">{t('waitlist.proof.product')}</div>
      <p class="m-0 mt-1 text-sm leading-[1.5] text-fg-2">
        {ti('waitlist.proof.alertBody', { supplier: supplierName(alert.supplier), from: eur(alert.referencePrice), to: eur(alert.latestPrice) })}
      </p>
      <div class="mt-3 flex items-baseline justify-between gap-3 border-t border-divider pt-3">
        <span class="text-[13px] text-fg-2">{t('waitlist.proof.extraPaid')}</span>
        <span class="num text-xl font-semibold text-fg">{eur(alert.extraPaid)}</span>
      </div>
      {#if alert.alternative}
        <p class="m-0 mt-2 text-[13px] leading-[1.5] text-fg-2">
          {ti('waitlist.proof.alternative', {
            supplier: supplierName(alert.alternative.supplier),
            price: eur(alert.alternative.price),
            date: fmtDateShort(alert.alternative.asOf, locale.current),
          })}
        </p>
      {/if}
    </div>
  {/if}

  <figure class="m-0">
    <figcaption class="mb-2 text-[13px] font-semibold text-fg">{t('waitlist.proof.chartTitle')}</figcaption>
    <svg viewBox="0 0 {chart.box.width} {chart.box.height}" class="block h-auto w-full" role="img" aria-label={summary}>
      {#each chart.ticks as tick}
        <line x1={chart.box.left} x2={chart.box.width - chart.box.right} y1={tick.y} y2={tick.y} class="grid-line" />
        <text x={chart.box.left - 6} y={tick.y + 4} text-anchor="end" class="axis">{eur(tick.value)}</text>
      {/each}
      <text x={chart.points[0]?.x} y={chart.baseline + 18} class="axis">{fmtDateShort(chart.points[0]?.delivery.date, locale.current)}</text>
      <text x={endA?.x} y={chart.baseline + 18} text-anchor="end" class="axis">{fmtDateShort(endA?.delivery.date, locale.current)}</text>
      <path d={chart.stepPath} class="line-a" />
      {#each chart.points as p}
        <circle cx={p.x} cy={p.y} r="4.5" class={p.delivery.supplier === 'A' ? 'dot-a' : 'dot-b'}>
          <title>{supplierName(p.delivery.supplier)} · {fmtDateShort(p.delivery.date, locale.current)} · {eur(p.delivery.pricePerLitre)}</title>
        </circle>
      {/each}
      {#if endA}<text x={endA.x + 8} y={endA.y + 4} class="label">{eur(endA.delivery.pricePerLitre)}</text>{/if}
      {#if endB}<text x={endB.x} y={endB.y - 10} text-anchor="middle" class="label">{eur(endB.delivery.pricePerLitre)}</text>{/if}
    </svg>
    <div class="mt-2 flex flex-wrap gap-4 text-[12.5px] text-fg-2" aria-hidden="true">
      <span class="inline-flex items-center gap-1.5"><span class="swatch-a"></span>{supplierName('A')}</span>
      <span class="inline-flex items-center gap-1.5"><span class="swatch-b"></span>{supplierName('B')}</span>
    </div>
    <table class="mep-visually-hidden">
      <caption>{t('waitlist.proof.tableCaption')}</caption>
      <thead><tr><th scope="col">{t('waitlist.proof.colSupplier')}</th><th scope="col">{t('waitlist.proof.colDate')}</th><th scope="col">{t('waitlist.proof.colPrice')}</th></tr></thead>
      <tbody>
        {#each chart.points as p}
          <tr><td>{supplierName(p.delivery.supplier)}</td><td>{fmtDateShort(p.delivery.date, locale.current)}</td><td>{eur(p.delivery.pricePerLitre)}</td></tr>
        {/each}
      </tbody>
    </table>
  </figure>

  <p class="m-0 text-[12.5px] leading-[1.5] text-fg-3">{t('waitlist.proof.note')}</p>
</div>

<style>
  .grid-line { stroke: var(--mep-divider); stroke-width: 1; }
  .axis { fill: var(--mep-fg-3); font-size: 11px; font-family: var(--mep-fs-mono); }
  .label { fill: var(--mep-fg); font-size: 11.5px; font-weight: 600; font-family: var(--mep-fs-mono); }
  .line-a { fill: none; stroke: var(--mep-series-1); stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }
  .dot-a, .dot-b { stroke: var(--mep-surface); stroke-width: 2; }
  .dot-a { fill: var(--mep-series-1); }
  .dot-b { fill: var(--mep-series-2); }
  .swatch-a, .swatch-b { display: inline-block; width: 10px; height: 10px; border-radius: 50%; }
  .swatch-a { background: var(--mep-series-1); }
  .swatch-b { background: var(--mep-series-2); }
</style>
