<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { browser } from '$app/environment';

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
    nextLabel = 'Entendido →',
  }: Props = $props();

  const PAD = 10;
  const TOOLTIP_W = 308;

  let top    = $state(0);
  let left   = $state(0);
  let width  = $state(0);
  let height = $state(0);
  let vw     = $state(0);
  let vh     = $state(0);
  let ready  = $state(false);

  function measure() {
    if (!browser) return;
    const el = document.querySelector(`[data-coach="${selector}"]`);
    if (!el) return;
    const r = el.getBoundingClientRect();
    vw = window.innerWidth;
    vh = window.innerHeight;
    top = r.top;
    left = r.left;
    width = r.width;
    height = r.height;
    ready = true;
  }

  onMount(() => {
    // Small delay so the page renders first
    setTimeout(measure, 80);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
  });

  onDestroy(() => {
    if (!browser) return;
    window.removeEventListener('resize', measure);
    window.removeEventListener('scroll', measure, true);
  });

  const spotTop    = $derived(top - PAD);
  const spotLeft   = $derived(left - PAD);
  const spotWidth  = $derived(width + PAD * 2);
  const spotHeight = $derived(height + PAD * 2);

  // Place tooltip below spotlight; flip above if too close to bottom
  const tipLeft  = $derived(Math.max(16, Math.min(spotLeft, vw - TOOLTIP_W - 16)));
  const spaceBelow = $derived(vh - (top + height + PAD));
  const tipBelow = $derived(spaceBelow >= 180);
  const tipTop   = $derived(
    tipBelow
      ? top + height + PAD + 10
      : top - PAD - 10 - 170  // approximate card height
  );

  function handleKey(e: KeyboardEvent) {
    if (e.key === 'Escape') onSkip();
  }
</script>

<svelte:window onkeydown={handleKey} />

{#if ready}
  <!-- Full-screen backdrop (click outside = skip) -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    style="position:fixed;inset:0;z-index:110;background:transparent;"
    role="presentation"
    onclick={onSkip}
  ></div>

  <!-- Spotlight ring (box-shadow punches the dark overlay) -->
  <div
    aria-hidden="true"
    style="
      position:fixed;
      top:{spotTop}px;
      left:{spotLeft}px;
      width:{spotWidth}px;
      height:{spotHeight}px;
      border-radius:12px;
      box-shadow:0 0 0 9999px rgba(0,0,0,0.52), 0 0 0 2.5px var(--mep-acc);
      z-index:111;
      pointer-events:none;
    "
  ></div>

  <!-- Tooltip card -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    style="
      position:fixed;
      top:{tipTop}px;
      left:{tipLeft}px;
      width:{TOOLTIP_W}px;
      z-index:112;
      background:var(--mep-bg);
      border:1px solid var(--mep-border-strong);
      border-radius:14px;
      padding:18px 18px 16px;
      box-shadow:0 8px 32px rgba(0,0,0,0.18);
    "
    role="dialog"
    aria-modal="true"
    aria-label={title}
    onclick={(e) => e.stopPropagation()}
    onkeydown={(e) => e.stopPropagation()}
  >
    <!-- Step counter -->
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
      <div style="display:flex;gap:5px;">
        {#each Array(totalSteps) as _, i}
          <div style="
            width:{i + 1 === stepNum ? 16 : 6}px;height:6px;border-radius:3px;
            background:{i + 1 === stepNum ? 'var(--mep-acc)' : 'var(--mep-divider)'};
            transition:width 200ms;
          "></div>
        {/each}
      </div>
      <button
        type="button"
        style="
          background:none;border:none;cursor:pointer;
          font-size:11.5px;color:var(--mep-fg-3);padding:2px 6px;
          border-radius:4px;line-height:1;
        "
        onclick={onSkip}
      >
        Saltar tour
      </button>
    </div>

    <!-- Content -->
    <div style="font-size:14px;font-weight:600;color:var(--mep-fg);margin-bottom:6px;line-height:1.3;">
      {title}
    </div>
    <p style="font-size:13px;color:var(--mep-fg-2);line-height:1.5;margin:0 0 16px;">
      {body}
    </p>

    <!-- CTA -->
    <button
      type="button"
      class="btn btn-primary"
      style="width:100%;height:36px;justify-content:center;font-size:13px;"
      onclick={onNext}
    >
      {nextLabel}
    </button>
  </div>
{/if}
