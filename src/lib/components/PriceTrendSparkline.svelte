<script lang="ts">
  import { t } from '$lib/i18n';

  let {
    values,
    width = 80,
    height = 24,
  }: {
    values: number[];
    width?: number;
    height?: number;
  } = $props();

  const pad = 2;

  const points = $derived.by(() => {
    if (values.length < 2) return '';
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    return values
      .map((v, i) => {
        const x = (i / (values.length - 1)) * (width - pad * 2) + pad;
        const y = height - pad - ((v - min) / range) * (height - pad * 2);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  });

  const lastPoint = $derived.by(() => {
    if (values.length < 2) return null;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const i = values.length - 1;
    return {
      x: (i / (values.length - 1)) * (width - pad * 2) + pad,
      y: height - pad - ((values[i]! - min) / range) * (height - pad * 2),
    };
  });

  const color = $derived.by(() => {
    if (values.length < 2) return 'var(--mep-fg-3)';
    const diff = values[values.length - 1]! - values[0]!;
    if (diff > 0) return '#22c55e';
    if (diff < 0) return '#ef4444';
    return 'var(--mep-fg-3)';
  });

  const risingStreak = $derived.by(() => {
    if (values.length < 3) return 0;
    let streak = 0;
    for (let i = values.length - 1; i > 0; i--) {
      if (values[i]! > values[i - 1]!) streak++;
      else break;
    }
    return streak;
  });
</script>

{#if points && lastPoint}
  <svg
    {width}
    {height}
    viewBox="0 0 {width} {height}"
    style="display:block;overflow:visible;flex-shrink:0;"
  >
    {#if risingStreak >= 3}
      <title>{$t('spark.risingTrend')}</title>
    {/if}
    <polyline
      fill="none"
      stroke={color}
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
      {points}
    />
    <circle cx={lastPoint.x} cy={lastPoint.y} r="2" fill={color} />
  </svg>
{/if}
