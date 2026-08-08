<script lang="ts">
  import Info from '@lucide/svelte/icons/info';

  let { text, side = 'left' }: { text: string; side?: 'left' | 'right' } = $props();
</script>

<span class="info-tooltip" tabindex="0" role="button" aria-label={text}>
  <Info size={13} />
  <span class="info-tooltip-bubble" class:side-right={side === 'right'}>{text}</span>
</span>

<style>
  .info-tooltip {
    position: relative;
    display: inline-flex;
    align-items: center;
    color: var(--mep-fg-4);
    cursor: help;
    outline: none;
  }
  .info-tooltip:hover,
  .info-tooltip:focus-visible {
    color: var(--mep-fg-2);
  }
  .info-tooltip-bubble {
    position: absolute;
    bottom: calc(100% + 8px);
    left: 0;
    z-index: 20;
    width: max-content;
    max-width: 240px;
    padding: 7px 10px;
    border-radius: 6px;
    background: var(--mep-fg);
    color: var(--mep-bg);
    font-size: 11.5px;
    font-weight: 400;
    line-height: 1.45;
    text-transform: none;
    letter-spacing: normal;
    box-shadow: var(--mep-shadow-pop);
    opacity: 0;
    transform: translateY(3px);
    pointer-events: none;
    transition: opacity 120ms ease-out, transform 120ms ease-out;
  }
  .info-tooltip-bubble.side-right {
    left: auto;
    right: 0;
  }
  .info-tooltip:hover .info-tooltip-bubble,
  .info-tooltip:focus-visible .info-tooltip-bubble {
    opacity: 1;
    transform: translateY(0);
  }
</style>
