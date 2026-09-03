<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { on } from 'svelte/events';
  import { browser } from '$app/environment';
  import { t } from '$lib/i18n';

  interface Props {
    selector: string;
    title: string;
    body: string;
    stepNum: number;
    totalSteps: number;
    onNext: () => void;
    onSkip: () => void;
    nextLabel?: string;
  }

  let {
    selector,
    title,
    body,
    stepNum,
    totalSteps,
    onNext,
    onSkip,
    nextLabel,
  }: Props = $props();

  const PAD = 10;
  const TOOLTIP_W = 308;

  let top    = $state(0);
  let left   = $state(0);
  let width  = $state(0);
  let height = $state(0);
  let ready  = $state(false);

  const POLL_INTERVAL_MS = 100;
  const MAX_POLL_ATTEMPTS = 20;
  let pollTimer: ReturnType<typeof setTimeout> | undefined;

  function measure() {
    if (!browser) return;
    for (const el of document.querySelectorAll(`[data-coach="${selector}"]`)) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      top = r.top;
      left = r.left;
      width = r.width;
      height = r.height;
      ready = true;
      return;
    }
  }

  function pollUntilReady(attempt = 0) {
    measure();
    if (ready || attempt >= MAX_POLL_ATTEMPTS) return;
    pollTimer = setTimeout(() => pollUntilReady(attempt + 1), POLL_INTERVAL_MS);
  }

  onMount(() => {
    pollUntilReady();
    const offResize = on(window, 'resize', measure);
    const offScroll = on(window, 'scroll', measure, { capture: true });
    return () => {
      offResize();
      offScroll();
    };
  });

  onDestroy(() => {
    if (pollTimer) clearTimeout(pollTimer);
  });

  const spotTop    = $derived(top - PAD);
  const spotLeft   = $derived(left - PAD);
  const spotWidth  = $derived(width + PAD * 2);
  const spotHeight = $derived(height + PAD * 2);

  function handleKey(e: KeyboardEvent) {
    if (e.key === 'Escape') onSkip();
  }
</script>

<svelte:window onkeydown={handleKey} />

{#if ready}
  <div
    style="position:fixed;inset:0;z-index:110;background:transparent;pointer-events:none;"
    aria-hidden="true"
  ></div>

  <div
    aria-hidden="true"
    style="
      position:fixed;
      top:{spotTop}px;
      left:{spotLeft}px;
      width:{spotWidth}px;
      height:{spotHeight}px;
      border-radius:var(--mep-r-card);
      box-shadow:0 0 0 9999px var(--mep-scrim), 0 0 0 2px var(--mep-acc);
      z-index:111;
      pointer-events:none;
    "
  ></div>

  <div
    style="
      position:fixed;
      right:20px;
      bottom:20px;
      width:{TOOLTIP_W}px;
      max-width:calc(100vw - 32px);
      z-index:112;
      background:var(--mep-overlay);
      border:1px solid var(--mep-border-strong);
      border-radius:var(--mep-r-card);
      padding:18px 18px 16px;
      box-shadow:var(--mep-shadow-pop);
    "
    role="dialog"
    tabindex="-1"
    aria-modal="true"
    aria-label={title}
    onclick={(e) => e.stopPropagation()}
    onkeydown={(e) => e.stopPropagation()}
  >
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
      <div style="display:flex;gap:5px;">
        {#each Array(totalSteps) as _, i}
          <div style="
            width:{i + 1 === stepNum ? 16 : 6}px;height:6px;border-radius:var(--mep-r-pill);
            background:{i + 1 === stepNum ? 'var(--mep-acc)' : 'var(--mep-border-strong)'};
            transition:width 200ms;
          "></div>
        {/each}
      </div>
      <button
        type="button"
        style="
          background:none;border:none;cursor:pointer;
          font-size:11px;color:var(--mep-fg-3);padding:2px 6px;
          border-radius:var(--mep-r-tag);line-height:1;
        "
        onclick={onSkip}
      >
        {t('coach.skip')}
      </button>
    </div>

    <div class="subtitle" style="margin-bottom:6px;line-height:1.3;">
      {title}
    </div>
    <p class="body" style="line-height:1.5;margin:0 0 16px;">
      {body}
    </p>

    <button
      type="button"
      class="btn btn-primary"
      style="width:100%;height:36px;justify-content:center;font-size:13px;"
      onclick={onNext}
    >
      {nextLabel ?? t('coach.next')}
    </button>
  </div>
{/if}
