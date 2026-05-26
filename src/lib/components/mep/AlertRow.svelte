<script lang="ts">
  import { TrendingUp, Tag, Clock, Info } from 'lucide-svelte';

  let {
    alert,
  }: {
    alert: {
      sev: 'high' | 'med' | 'low';
      kind: 'price' | 'budget' | 'due' | 'info';
      text: string;
      detail?: string;
      when?: string;
    };
  } = $props();

  const palettes = {
    high: { bg: 'var(--mep-neg-soft)', icon: 'var(--mep-neg)' },
    med:  { bg: 'var(--mep-warn-soft)', icon: 'var(--mep-warn)' },
    low:  { bg: 'var(--mep-info-soft)', icon: 'var(--mep-info)' },
  };

  const icons = { price: TrendingUp, budget: Tag, due: Clock, info: Info };

  const p = $derived(palettes[alert.sev]);
  const Icon = $derived(icons[alert.kind] ?? Info);
</script>

<div style="padding:10px 12px;border-radius:8px;background:{p.bg};display:flex;align-items:flex-start;gap:10px;">
  <div style="color:{p.icon};margin-top:1px;flex-shrink:0;">
    <Icon size={15} />
  </div>
  <div style="min-width:0;flex:1;">
    <div style="font-size:12.5px;color:var(--mep-fg);font-weight:500;line-height:1.35;">{alert.text}</div>
    {#if alert.detail}
      <div style="font-size:11.5px;color:var(--mep-fg-2);margin-top:3px;">{alert.detail}</div>
    {/if}
  </div>
  {#if alert.when}
    <div style="font-size:11px;color:var(--mep-fg-3);white-space:nowrap;margin-top:2px;">{alert.when}</div>
  {/if}
</div>
