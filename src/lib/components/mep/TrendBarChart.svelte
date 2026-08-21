<script lang="ts">
  type Bar = { label: string; value: number };

  let {
    bars,
    valueFormatter = (v: number) => String(v),
    emptyLabel = '—',
  }: {
    bars: Bar[];
    valueFormatter?: (v: number) => string;
    emptyLabel?: string;
  } = $props();

  const max = $derived(Math.max(1, ...bars.map(b => b.value)));
  let hovered = $state<number | null>(null);
</script>

{#if bars.length === 0}
  <div style="display:flex;align-items:center;justify-content:center;height:140px;">
    <span class="body" style="font-size:12px;color:var(--mep-fg-3);">{emptyLabel}</span>
  </div>
{:else}
  <div class="no-scrollbar" style="display:flex;align-items:flex-end;gap:4px;height:140px;overflow-x:auto;padding:20px 2px 0;">
    {#each bars as b, i}
      <div
        style="display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:4px;flex-shrink:0;min-width:16px;height:100%;position:relative;"
        role="img"
        aria-label="{b.label}: {valueFormatter(b.value)}"
        onmouseenter={() => hovered = i}
        onmouseleave={() => hovered = null}
      >
        {#if hovered === i}
          <span class="num" style="position:absolute;top:-18px;font-size:10px;font-weight:500;color:var(--mep-fg);white-space:nowrap;">
            {valueFormatter(b.value)}
          </span>
        {/if}
        <div style="
          width:14px;
          height:{Math.max(2, Math.round((b.value / max) * 96))}px;
          background:{hovered === i ? 'var(--mep-acc-hover)' : 'var(--mep-acc)'};
          border-radius:3px 3px 0 0;
          transition:background 120ms ease-out;
        "></div>
        <span style="font-size:9px;color:var(--mep-fg-3);white-space:nowrap;">{b.label}</span>
      </div>
    {/each}
  </div>
{/if}
