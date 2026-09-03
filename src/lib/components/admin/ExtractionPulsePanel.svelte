<script lang="ts">
  import { t } from '$lib/i18n';
  import { tweened } from 'svelte/motion';
  import { cubicOut } from 'svelte/easing';
  import { sparkPath, windowAvg, delta, statusTier, type StatusTier } from '$lib/pulse-math';

  let {
    points,
    summary,
    fuzzyOutcomes,
    confirmedAliases,
  }: {
    points: { date: string; documents: number; avgConfidence: number | null; mismatchRate: number | null }[];
    summary: { totalCorrections: number; correctionRate: number | null };
    fuzzyOutcomes: { pending: number; accuracyRate: number | null };
    confirmedAliases: number;
  } = $props();

  const CONFIDENCE_GOOD = 0.85;
  const CONFIDENCE_WARN = 0.70;
  const MISMATCH_WARN = 0.10;
  const MISMATCH_BAD = 0.25;
  const WINDOW = 7;

  const confidenceSeries = $derived(points.map(p => p.avgConfidence));
  const mismatchSeries = $derived(points.map(p => p.mismatchRate));
  const volumeSeries = $derived(points.map(p => p.documents));
  const maxDocs = $derived(Math.max(1, ...volumeSeries));
  const totalVolume = $derived(volumeSeries.reduce((a, b) => a + b, 0));

  const confNow = $derived(windowAvg(confidenceSeries, 0, WINDOW));
  const confPrev = $derived(windowAvg(confidenceSeries, WINDOW, WINDOW));
  const mismatchNow = $derived(windowAvg(mismatchSeries, 0, WINDOW));
  const mismatchPrev = $derived(windowAvg(mismatchSeries, WINDOW, WINDOW));

  const confPath = $derived(sparkPath(confidenceSeries));
  const mismatchPath = $derived(sparkPath(mismatchSeries));

  const confDelta = $derived(delta(confNow, confPrev));
  const mismatchDelta = $derived(delta(mismatchNow, mismatchPrev));

  const confTier = $derived(statusTier(confNow, CONFIDENCE_GOOD, CONFIDENCE_WARN, true));
  const mismatchTier = $derived(statusTier(mismatchNow, MISMATCH_WARN, MISMATCH_BAD, false));

  const TIER_VAR: Record<StatusTier, string> = { good: 'var(--hud-good)', warn: 'var(--hud-warn)', bad: 'var(--hud-bad)' };
  const tierColor = (tier: StatusTier | null) => tier ? TIER_VAR[tier] : 'var(--hud-fg-dim)';

  const formatPct = (n: number) => `${(n * 100).toFixed(1)}%`;

  const confDisplay = tweened(0, { duration: 700, easing: cubicOut });
  const mismatchDisplay = tweened(0, { duration: 700, easing: cubicOut });
  const volumeDisplay = tweened(0, { duration: 700, easing: cubicOut });

  $effect(() => { confDisplay.set(confNow ?? 0); });
  $effect(() => { mismatchDisplay.set(mismatchNow ?? 0); });
  $effect(() => { volumeDisplay.set(totalVolume); });
</script>

<div class="hud">
  <div class="hud-header">
    <span class="hud-dot" style="--dot: {tierColor(confTier)};"></span>
    <span class="hud-title">{$t('admin.learning.pulse.title')}</span>
    <span class="hud-live">{$t('admin.learning.pulse.window')}</span>
  </div>

  <div class="hud-row">
    <div class="hud-cell">
      <div class="hud-cell-top">
        <span class="hud-label">{$t('admin.learning.pulse.confidence')}</span>
        {#if confDelta}
          <span class="hud-delta" style="color:{confDelta.up ? 'var(--hud-good)' : 'var(--hud-bad)'};">{confDelta.up ? '▲' : '▼'} {Math.abs(confDelta.pp).toFixed(1)}pp</span>
        {/if}
      </div>
      <div class="hud-number" style="color:{tierColor(confTier)};">{confNow === null ? '—' : formatPct($confDisplay)}</div>
      {#if confPath}
        <svg viewBox="0 0 100 28" class="hud-spark" preserveAspectRatio="none">
          <path d={confPath} pathLength="100" style="stroke:{tierColor(confTier)};" />
        </svg>
      {/if}
      <span class="hud-caption">{$t('admin.learning.pulse.confidenceTarget')}</span>
    </div>

    <div class="hud-cell">
      <div class="hud-cell-top">
        <span class="hud-label">{$t('admin.learning.pulse.mismatch')}</span>
        {#if mismatchDelta}
          <span class="hud-delta" style="color:{mismatchDelta.up ? 'var(--hud-bad)' : 'var(--hud-good)'};">{mismatchDelta.up ? '▲' : '▼'} {Math.abs(mismatchDelta.pp).toFixed(1)}pp</span>
        {/if}
      </div>
      <div class="hud-number" style="color:{tierColor(mismatchTier)};">{mismatchNow === null ? '—' : formatPct($mismatchDisplay)}</div>
      {#if mismatchPath}
        <svg viewBox="0 0 100 28" class="hud-spark" preserveAspectRatio="none">
          <path d={mismatchPath} pathLength="100" style="stroke:{tierColor(mismatchTier)};" />
        </svg>
      {/if}
      <span class="hud-caption">{$t('admin.learning.pulse.mismatchTarget')}</span>
    </div>

    <div class="hud-cell">
      <div class="hud-cell-top">
        <span class="hud-label">{$t('admin.learning.pulse.volume')}</span>
      </div>
      <div class="hud-number hud-number-acc">{Math.round($volumeDisplay).toLocaleString('en-US')}</div>
      <div class="hud-bars">
        {#each points as p (p.date)}
          <div class="hud-bar" style="height:{Math.max(6, (p.documents / maxDocs) * 100)}%;" title="{p.date}: {p.documents}"></div>
        {/each}
      </div>
      <span class="hud-caption">{$t('admin.learning.pulse.volumeSub')}</span>
    </div>
  </div>

  <div class="hud-row hud-row-sub">
    <div class="hud-cell hud-cell-sm">
      <span class="hud-label">{$t('admin.learning.kpiCorrections')}</span>
      <div class="hud-number-sm">{summary.totalCorrections.toLocaleString('en-US')}</div>
    </div>
    <div class="hud-cell hud-cell-sm">
      <span class="hud-label">{$t('admin.learning.kpiRate')}</span>
      <div class="hud-number-sm">{summary.correctionRate === null ? '—' : formatPct(summary.correctionRate)}</div>
    </div>
    <div class="hud-cell hud-cell-sm">
      <span class="hud-label">{$t('admin.learning.kpiPendingFuzzy')}</span>
      <div class="hud-number-sm" style="color:{fuzzyOutcomes.pending > 0 ? 'var(--hud-warn)' : 'var(--hud-fg)'};">{fuzzyOutcomes.pending.toLocaleString('en-US')}</div>
    </div>
    <div class="hud-cell hud-cell-sm">
      <span class="hud-label">{$t('admin.learning.kpiAccuracy')}</span>
      <div class="hud-number-sm">{fuzzyOutcomes.accuracyRate === null ? '—' : formatPct(fuzzyOutcomes.accuracyRate)}</div>
    </div>
    <div class="hud-cell hud-cell-sm">
      <span class="hud-label">{$t('admin.learning.kpiConfirmedAliases')}</span>
      <div class="hud-number-sm">{confirmedAliases.toLocaleString('en-US')}</div>
    </div>
  </div>
</div>

<style>
  .hud {
    position: relative;
    background: #0a0c11;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 10px;
    overflow: hidden;
    --hud-fg: #e7edf5;
    --hud-fg-dim: #5b6472;
    --hud-good: #34d399;
    --hud-warn: #fbbf24;
    --hud-bad: #f87171;
    --hud-acc: #38bdf8;
    font-variant-numeric: tabular-nums;
  }

  .hud-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 12px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }

  .hud-dot {
    width: 7px;
    height: 7px;
    border-radius: 999px;
    flex-shrink: 0;
    background: var(--dot);
    box-shadow: 0 0 6px var(--dot);
    animation: hud-dot-pulse 2s ease-in-out infinite;
  }
  @keyframes hud-dot-pulse {
    0%, 100% { opacity: 1;    transform: scale(1); }
    50%      { opacity: 0.55; transform: scale(0.85); }
  }

  .hud-title {
    font: 600 10.5px/1 ui-monospace, monospace;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--hud-fg);
  }

  .hud-live {
    margin-left: auto;
    font: 500 10px/1 ui-monospace, monospace;
    letter-spacing: 0.05em;
    color: var(--hud-fg-dim);
  }

  .hud-row {
    display: flex;
  }

  .hud-cell {
    flex: 1 1 0;
    min-width: 0;
    padding: 9px 12px 10px;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .hud-cell + .hud-cell {
    border-left: 1px solid rgba(255, 255, 255, 0.08);
  }

  .hud-row-sub {
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(255, 255, 255, 0.015);
  }
  .hud-cell-sm {
    padding: 7px 12px 8px;
    gap: 2px;
  }
  .hud-number-sm {
    font: 700 15px/1.1 ui-monospace, monospace;
    color: var(--hud-fg);
  }

  .hud-cell-top {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 6px;
  }

  .hud-label {
    font: 600 9.5px/1 ui-monospace, monospace;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--hud-fg-dim);
  }

  .hud-delta {
    font: 600 10px/1 ui-monospace, monospace;
    white-space: nowrap;
  }

  .hud-number {
    font: 700 21px/1.1 ui-monospace, monospace;
    color: var(--hud-fg);
  }
  .hud-number-acc { color: var(--hud-acc); }

  .hud-spark {
    width: 100%;
    height: 16px;
    overflow: visible;
  }
  .hud-spark path {
    fill: none;
    stroke-width: 1.6;
    vector-effect: non-scaling-stroke;
    stroke-dasharray: 100;
    stroke-dashoffset: 100;
    animation: hud-draw 0.9s ease-out forwards;
  }
  @keyframes hud-draw {
    to { stroke-dashoffset: 0; }
  }

  .hud-bars {
    display: flex;
    align-items: flex-end;
    gap: 1px;
    height: 16px;
  }
  .hud-bar {
    flex: 1;
    min-width: 1px;
    background: var(--hud-acc);
    opacity: 0.55;
    border-radius: 1px;
    transform-origin: bottom;
    animation: hud-grow 0.5s ease-out backwards;
  }
  @keyframes hud-grow {
    from { transform: scaleY(0); }
    to   { transform: scaleY(1); }
  }

  .hud-caption {
    font: 500 9px/1.3 ui-monospace, monospace;
    color: var(--hud-fg-dim);
  }
</style>
