<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    label,
    value,
    unit,
    sub,
    valueColor = 'var(--mep-fg)',
    pill,
  }: {
    label: string;
    value: string | number;
    unit?: string;
    sub?: string;
    valueColor?: string;
    pill?: Snippet;
  } = $props();
</script>

<div class="card" style="padding:14px 16px;display:flex;flex-direction:column;gap:6px;min-width:0;">
  <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
    <div class="label">{label}</div>
    {#if pill}{@render pill()}{/if}
  </div>
  <div style="display:flex;align-items:baseline;gap:5px;">
    <div class="num" style="font-size:26px;font-weight:600;color:{valueColor};letter-spacing:-0.6px;line-height:1.05;">
      {value}
    </div>
    {#if unit}
      <div style="font-size:12px;font-weight:500;color:var(--mep-fg-3);">{unit}</div>
    {/if}
  </div>
  {#if sub}
    <div style="font-size:11.5px;color:var(--mep-fg-3);margin-top:1px;">{sub}</div>
  {/if}
</div>
