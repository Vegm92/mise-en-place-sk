<script lang="ts">
  const gid = `sg${Math.random().toString(36).slice(2, 7)}`;

  let {
    data,
    color = 'var(--mep-acc)',
    width = 64,
    height = 24,
  }: {
    data: number[];
    color?: string;
    width?: number;
    height?: number;
  } = $props();

  const points = $derived.by(() => {
    if (data.length < 2) return '';
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const xStep = width / (data.length - 1);
    return data
      .map((v, i) => {
        const x = i * xStep;
        const y = height - ((v - min) / range) * (height - 3) - 1.5;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  });

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
