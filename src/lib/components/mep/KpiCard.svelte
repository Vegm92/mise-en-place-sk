<script lang="ts">
  import Sparkline from './Sparkline.svelte';
  import Delta from './Delta.svelte';

  type Variant = 'default' | 'neg' | 'pos' | 'warn';

  let {
    label,
    value,
    sub,
    variant = 'default' as Variant,
    spark,
    delta,
    deltaCtx,
    invert = false,
  }: {
    label: string;
    value: string | number;
    sub?: string;
    variant?: Variant;
    spark?: number[];
    delta?: number;
    deltaCtx?: string;
    invert?: boolean;
  } = $props();

  const tintClass: Record<Variant, string> = {
    default: '',
    neg:  'bg-neg-soft  border-neg',
    pos:  'bg-pos-soft  border-pos',
    warn: 'bg-warn-soft border-warn',
  };
  const labelColor: Record<Variant, string> = {
    default: '',
    neg:  'text-neg',
    pos:  'text-pos',
    warn: 'text-warn',
  };
  const valueColor: Record<Variant, string> = {
    default: 'text-fg',
    neg:  'text-neg',
    pos:  'text-fg',
    warn: 'text-fg',
  };
</script>

<div class="card flex flex-col gap-1.5 p-4 {tintClass[variant]}">
  <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;">
    <span class="label {labelColor[variant]}">{label}</span>
    {#if spark && spark.length >= 2}
      <Sparkline data={spark} width={84} height={28} />
    {/if}
  </div>
  <span class="num {valueColor[variant]}" style="font-size:26px;font-weight:600;letter-spacing:-0.6px;line-height:1.1;">
    {value}
  </span>
  {#if delta !== undefined}
    <div style="display:flex;align-items:center;gap:6px;">
      <Delta value={delta} {invert} />
      {#if deltaCtx}
        <span class="body" style="font-size:11px;">{deltaCtx}</span>
      {/if}
    </div>
  {/if}
  {#if sub}
    <span class="body" style="font-size:11.5px;">{sub}</span>
  {/if}
</div>
