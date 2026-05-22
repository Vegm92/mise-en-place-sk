<script lang="ts">
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
</script>

<svg {width} {height} viewBox="0 0 {width} {height}" fill="none" style="display:block;overflow:visible;">
  {#if data.length >= 2}
    <polyline
      {points}
      stroke={color}
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  {/if}
</svg>
