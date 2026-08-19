<script lang="ts">
  import TrendingUp from '@lucide/svelte/icons/trending-up';
  import Tag from '@lucide/svelte/icons/tag';
  import Clock from '@lucide/svelte/icons/clock';
  import Info from '@lucide/svelte/icons/info';
  import { tiv } from '$lib/i18n';

  let {
    alert,
  }: {
    alert: {
      sev: 'high' | 'med' | 'low';
      kind: 'price' | 'budget' | 'due' | 'info';
      text: string;
      detail?: string;
      when?: string;
      messageKey?: string;
      messageVars?: Record<string, string | number>;
    };
  } = $props();

  const palettes = {
    high: { bg: 'var(--mep-neg-soft)', icon: 'var(--mep-neg)', border: 'var(--mep-neg)', text: 'var(--mep-fg)', weight: 600, iconBox: 24, pad: '12px 14px', borderWidth: 3 },
    med:  { bg: 'var(--mep-warn-soft)', icon: 'var(--mep-warn)', border: 'transparent', text: 'var(--mep-fg)', weight: 500, iconBox: 20, pad: '9px 12px', borderWidth: 0 },
    low:  { bg: 'transparent', icon: 'var(--mep-info)', border: 'transparent', text: 'var(--mep-fg-2)', weight: 400, iconBox: 18, pad: '6px 4px', borderWidth: 0 },
  };

  const icons = { price: TrendingUp, budget: Tag, due: Clock, info: Info };

  const p = $derived(palettes[alert.sev]);
  const Icon = $derived(icons[alert.kind] ?? Info);
  const displayText = $derived(alert.messageKey ? $tiv(alert.messageKey, alert.messageVars ?? {}) : alert.text);
</script>

<div style="
  padding:{p.pad};border-radius:8px;background:{p.bg};display:flex;align-items:flex-start;gap:10px;
  border-left:{p.borderWidth}px solid {p.border};
">
  <div style="
    color:{p.icon};flex-shrink:0;width:{p.iconBox}px;height:{p.iconBox}px;border-radius:6px;
    display:flex;align-items:center;justify-content:center;
    background:{alert.sev === 'high' ? 'var(--mep-surface)' : 'transparent'};
  ">
    <Icon size={alert.sev === 'high' ? 15 : 13} />
  </div>
  <div style="min-width:0;flex:1;">
    <div style="font-size:{alert.sev === 'high' ? '13px' : '12.5px'};color:{p.text};font-weight:{p.weight};line-height:1.35;">{displayText}</div>
    {#if alert.detail}
      <div style="font-size:11.5px;color:var(--mep-fg-3);margin-top:3px;">{alert.detail}</div>
    {/if}
  </div>
  {#if alert.when}
    <div style="font-size:11px;color:var(--mep-fg-3);white-space:nowrap;margin-top:2px;">{alert.when}</div>
  {/if}
</div>
