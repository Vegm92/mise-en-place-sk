<script lang="ts">
  let {
    value,
    suffix = '%',
    invert = false,
  }: {
    value: number;
    suffix?: string;
    invert?: boolean;
  } = $props();

  const isPos = $derived(invert ? value < 0 : value > 0);
  const isNeg = $derived(invert ? value > 0 : value < 0);
  const color = $derived(
    isPos ? 'var(--mep-pos)' : isNeg ? 'var(--mep-neg)' : 'var(--mep-fg-3)'
  );
  const arrow = $derived(value > 0 ? '↑' : value < 0 ? '↓' : '→');
  const absVal = $derived(Math.abs(value));
</script>

<span
  class="num"
  style="font-size:11.5px;font-weight:500;color:{color};display:inline-flex;align-items:center;gap:2px;"
>
  <span style="font-style:normal;">{arrow}</span>
  <span>{absVal}{suffix}</span>
</span>
