<script lang="ts">
  const gid = `sg${Math.random().toString(36).slice(2, 7)}`;

  let {
    data,
    compareData,
    color = 'var(--mep-acc)',
    compareColor = 'var(--mep-acc-2)',
    width = 64,
    height = 24,
  }: {
    data: number[];
    /** Previous-period series, same length semantics — drawn behind, in compareColor, no fill. */
    compareData?: number[];
    color?: string;
    compareColor?: string;
    width?: number;
    height?: number;
  } = $props();

  const scale = $derived.by(() => {
    const all = compareData && compareData.length >= 2 ? [...data, ...compareData] : data;
    const min = Math.min(...all);
    const max = Math.max(...all);
    return { min, range: max - min || 1 };
  });

  function toPoints(series: number[]): string {
    if (series.length < 2) return '';
    const { min, range } = scale;
    const xStep = width / (series.length - 1);
    return series
      .map((v, i) => {
        const x = i * xStep;
        const y = height - ((v - min) / range) * (height - 3) - 1.5;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  }

  const points = $derived(toPoints(data));
  const comparePoints = $derived(compareData ? toPoints(compareData) : '');
  const fillPoints = $derived(points ? `${points} ${width},${height} 0,${height}` : '');
</script>

<svg {width} {height} viewBox="0 0 {width} {height}" fill="none" style="display:block;overflow:visible;">
  <defs>
    <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color={color} stop-opacity="0.18" />
      <stop offset="100%" stop-color={color} stop-opacity="0" />
    </linearGradient>
  </defs>
  {#if data.length >= 2}
    {#if comparePoints}
      <polyline
        points={comparePoints}
        stroke={compareColor}
        stroke-width="1.25"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-dasharray="2.5 2.5"
        opacity="0.85"
      />
    {/if}
    <polygon points={fillPoints} fill="url(#{gid})" />
    <polyline
      {points}
      stroke={color}
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  {/if}
</svg>
