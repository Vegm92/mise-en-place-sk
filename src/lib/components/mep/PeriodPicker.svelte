<script lang="ts">
  import ChevronLeft from '@lucide/svelte/icons/chevron-left';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';

  let { prevUrl, nextUrl, canGoForward, label, compact = false }: {
    prevUrl: string;
    nextUrl: string;
    canGoForward: boolean;
    label: string;
    compact?: boolean;
  } = $props();

  const h      = $derived(compact ? 28 : 34);
  const btnW   = $derived(compact ? 24 : 28);
  const iconSz = $derived(compact ? 11 : 13);
  const fz     = $derived(compact ? '11.5px' : '12px');
</script>

<div style="display:flex;align-items:center;background:var(--mep-surface-2);border:1px solid var(--mep-border-strong);border-radius:6px;overflow:hidden;height:{h}px;flex-shrink:0;">
  <a href={prevUrl}
    style="display:flex;align-items:center;justify-content:center;width:{btnW}px;height:100%;color:var(--mep-fg-3);text-decoration:none;border-right:1px solid var(--mep-border-strong);"
    title="Mes anterior">
    <ChevronLeft size={iconSz} />
  </a>
  <span style="font-size:{fz};font-weight:500;color:var(--mep-fg-2);padding:0 {compact ? 8 : 10}px;white-space:nowrap;">{label}</span>
  <a href={canGoForward ? nextUrl : undefined}
    style="display:flex;align-items:center;justify-content:center;width:{btnW}px;height:100%;color:{canGoForward ? 'var(--mep-fg-3)' : 'var(--mep-fg-4)'};text-decoration:none;border-left:1px solid var(--mep-border-strong);pointer-events:{canGoForward ? 'auto' : 'none'};"
    title="Mes siguiente">
    <ChevronRight size={iconSz} />
  </a>
</div>
